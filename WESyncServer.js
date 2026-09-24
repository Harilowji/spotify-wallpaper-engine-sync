/**
 * Spotify x Wallpaper Engine Sync Server
 * Developed & Re-engineered by Harilowji (https://github.com/Harilowji)
 * Version: 2.0.1
 * 
 * Local background daemon that bridges Wallpaper Engine / Windows Desktop
 * wallpapers directly to the Spicetify Spotify client.
 */

const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execSync, exec, spawn } = require("child_process");
const crypto = require("crypto");

const PORT = 8989;
const HOST = "127.0.0.1";

// Track if Wallpaper Engine is currently active
let isWeRunningCache = false;

function checkWeRunning() {
    exec('tasklist', { maxBuffer: 1024 * 1024 * 4 }, (err, stdout) => {
        if (!err && stdout) {
            isWeRunningCache = /wallpaper32\.exe|wallpaper64\.exe|ui32\.exe/i.test(stdout);
        } else {
            isWeRunningCache = false;
        }
    });
}
setInterval(checkWeRunning, 5000);
checkWeRunning();

// Track ongoing transcoding jobs to prevent duplicate FFmpeg spawns
const transcodingJobs = new Map();

let cachedWeConfigPath = null;
let cachedWindowsWallpaper = null;

/**
 * Periodically check and cache default Windows Desktop Wallpaper
 * Inspects multiple registry keys & filesystem paths to guarantee a valid image
 */
function updateWindowsWallpaper() {
    // 1. Check Windows Explorer Wallpapers history & backup path (most reliable on Win 10/11)
    exec('reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Wallpapers"', (err, stdout) => {
        if (!err && stdout) {
            const backedUp = stdout.match(/BackedUpWallpaperPath\s+REG_SZ\s+(.+)/i);
            if (backedUp && backedUp[1]) {
                const bPath = backedUp[1].trim();
                if (fs.existsSync(bPath) && fs.statSync(bPath).size > 0) {
                    cachedWindowsWallpaper = bPath;
                    return;
                }
            }

            const hist0 = stdout.match(/BackgroundHistoryPath0\s+REG_SZ\s+(.+)/i);
            if (hist0 && hist0[1]) {
                const hPath = hist0[1].trim();
                if (fs.existsSync(hPath) && fs.statSync(hPath).size > 0) {
                    cachedWindowsWallpaper = hPath;
                    return;
                }
            }
        }

        // 2. Check Classic Desktop Wallpaper registry
        exec('reg query "HKCU\\Control Panel\\Desktop" /v Wallpaper', (err2, stdout2) => {
            if (!err2 && stdout2) {
                const match = stdout2.match(/Wallpaper\s+REG_SZ\s+(.+)/i);
                if (match && match[1]) {
                    const wpPath = match[1].trim();
                    if (fs.existsSync(wpPath) && fs.statSync(wpPath).size > 0) {
                        cachedWindowsWallpaper = wpPath;
                        return;
                    }
                }
            }

            // 3. Check Windows TranscodedWallpaper in AppData (only if non-empty)
            const transcoded = path.join(process.env.APPDATA || "", "Microsoft\\Windows\\Themes\\TranscodedWallpaper");
            if (fs.existsSync(transcoded) && fs.statSync(transcoded).size > 0) {
                cachedWindowsWallpaper = transcoded;
                return;
            }

            // 4. Default Windows system wallpaper
            const defaultWin = "C:\\Windows\\Web\\Wallpaper\\Windows\\img0.jpg";
            if (fs.existsSync(defaultWin)) {
                cachedWindowsWallpaper = defaultWin;
            }
        });
    });
}
setInterval(updateWindowsWallpaper, 10000);
updateWindowsWallpaper();

/**
 * Intelligent discovery of Wallpaper Engine config.json across multiple storage locations
 */
function getWEConfigPath() {
    if (cachedWeConfigPath && fs.existsSync(cachedWeConfigPath)) {
        return cachedWeConfigPath;
    }

    const candidateBases = [];

    // 1. Check Steam App Registry
    try {
        const out = execSync('reg query "HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Steam App 431960" /v InstallLocation', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] });
        const match = out.match(/InstallLocation\s+REG_SZ\s+(.+)/i);
        if (match && match[1] && fs.existsSync(match[1].trim())) {
            candidateBases.push(match[1].trim());
        }
    } catch (e) {}

    // 2. Check Valve Steam Registry
    try {
        const out = execSync('reg query "HKCU\\Software\\Valve\\Steam" /v SteamPath', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] });
        const match = out.match(/SteamPath\s+REG_SZ\s+(.+)/i);
        if (match && match[1]) {
            const sPath = match[1].trim().replace(/\//g, "\\");
            candidateBases.push(path.join(sPath, "steamapps\\common\\wallpaper_engine"));
        }
    } catch (e) {}

    // 3. Common drive locations
    candidateBases.push(
        "D:\\Steam\\steamapps\\common\\wallpaper_engine",
        "D:\\New folder\\steamapps\\common\\wallpaper_engine",
        "C:\\Program Files (x86)\\Steam\\steamapps\\common\\wallpaper_engine",
        "C:\\Program Files\\Steam\\steamapps\\common\\wallpaper_engine",
        "D:\\SteamLibrary\\steamapps\\common\\wallpaper_engine",
        "E:\\SteamLibrary\\steamapps\\common\\wallpaper_engine",
        "E:\\Steam\\steamapps\\common\\wallpaper_engine"
    );

    for (const base of candidateBases) {
        const cfg = path.join(base, "config.json");
        if (fs.existsSync(cfg)) {
            cachedWeConfigPath = cfg;
            return cachedWeConfigPath;
        }
    }

    cachedWeConfigPath = "C:\\Program Files (x86)\\Steam\\steamapps\\common\\wallpaper_engine\\config.json";
    return cachedWeConfigPath;
}

/**
 * Reads active wallpaper file path from Wallpaper Engine config.json
 */
function getCurrentWallpaper() {
    try {
        const configPath = getWEConfigPath();
        if (!fs.existsSync(configPath)) return "";

        const raw = fs.readFileSync(configPath, "utf-8");
        const config = JSON.parse(raw);

        for (const key in config) {
            if (config[key] && config[key].general && config[key].general.wallpaperconfig) {
                const wallpapers = config[key].general.wallpaperconfig.selectedwallpapers;
                if (!wallpapers || typeof wallpapers !== 'object') continue;

                const monitorKey = Object.keys(wallpapers)[0] || 'Monitor0';
                if (wallpapers[monitorKey] && wallpapers[monitorKey].file) {
                    return wallpapers[monitorKey].file.replace(/\//g, "\\");
                }
            }
        }
        return "";
    } catch (e) {
        return "";
    }
}

/**
 * Resolves Wallpaper Engine scenes (.pkg, .html) into high-res preview image/gif
 */
function resolveMediaFile(rawPath) {
    if (!rawPath) return cachedWindowsWallpaper || "";
    const cleanPath = rawPath.replace(/\//g, "\\");

    if (!fs.existsSync(cleanPath)) {
        return cachedWindowsWallpaper || "";
    }

    const ext = path.extname(cleanPath).toLowerCase();
    const dir = path.dirname(cleanPath);

    // Direct video or image format
    if (ext.match(/\.(mp4|webm|mkv|avi|mov|jpg|jpeg|png|bmp|webp|gif)$/)) {
        return cleanPath;
    }

    // Wallpaper Engine Scene packages (.pkg, .html, .exe)
    if (ext === '.pkg' || ext === '.html' || ext === '.exe') {
        // 1. Check project.json in same workshop directory
        const projectJsonPath = path.join(dir, "project.json");
        if (fs.existsSync(projectJsonPath)) {
            try {
                const proj = JSON.parse(fs.readFileSync(projectJsonPath, "utf-8"));
                if (proj && proj.preview) {
                    const previewPath = path.join(dir, proj.preview);
                    if (fs.existsSync(previewPath) && fs.statSync(previewPath).size > 0) {
                        return previewPath;
                    }
                }
            } catch (err) {}
        }

        // 2. Scan directly for candidate previews in same directory
        const candidatePreviews = [
            path.join(dir, "preview.gif"),
            path.join(dir, "preview.jpg"),
            path.join(dir, "preview.png"),
            path.join(dir, "preview.jpeg"),
            path.join(dir, "preview.webp")
        ];

        for (const candidate of candidatePreviews) {
            if (fs.existsSync(candidate) && fs.statSync(candidate).size > 0) {
                return candidate;
            }
        }
    }

    // TranscodedWallpaper without extension
    if (!ext && fs.existsSync(cleanPath) && fs.statSync(cleanPath).size > 0) {
        return cleanPath;
    }

    return cachedWindowsWallpaper || cleanPath;
}

/**
 * Finds absolute path to ffmpeg.exe
 */
function getFFmpegPath() {
    if (process.env.FFMPEG_PATH && fs.existsSync(process.env.FFMPEG_PATH)) {
        return process.env.FFMPEG_PATH;
    }

    // Try where ffmpeg
    try {
        const out = execSync("where ffmpeg", { encoding: "utf-8", stdio: ["pipe", "pipe", "ignore"] });
        const first = out.split(/\r?\n/)[0]?.trim();
        if (first && fs.existsSync(first)) return first;
    } catch (e) {}

    // Check WinGet default installation folder
    const wingetDir = path.join(process.env.LOCALAPPDATA || "", "Microsoft\\WinGet\\Packages");
    if (fs.existsSync(wingetDir)) {
        const scan = (d) => {
            try {
                const items = fs.readdirSync(d, { withFileTypes: true });
                for (const item of items) {
                    const p = path.join(d, item.name);
                    if (item.isDirectory()) {
                        const found = scan(p);
                        if (found) return found;
                    } else if (item.name.toLowerCase() === "ffmpeg.exe") {
                        return p;
                    }
                }
            } catch (e) {}
            return null;
        };
        const found = scan(wingetDir);
        if (found) return found;
    }

    return "ffmpeg";
}

/**
 * Manages the video cache directory and prunes older videos (keeps newest 10)
 */
function ensureCacheDir() {
    const tempDir = path.join(os.tmpdir(), 'spotify_we_cache');
    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
    } else {
        try {
            const files = fs.readdirSync(tempDir)
                .filter(f => f.endsWith('.webm'))
                .map(f => {
                    const full = path.join(tempDir, f);
                    return { name: f, time: fs.statSync(full).mtime.getTime() };
                })
                .sort((a, b) => b.time - a.time);

            if (files.length > 10) {
                for (let i = 10; i < files.length; i++) {
                    try {
                        fs.unlinkSync(path.join(tempDir, files[i].name));
                    } catch (e) {}
                }
            }
        } catch (e) {
            console.error("[Cache Cleanup] Error:", e.message);
        }
    }
    return tempDir;
}

/**
 * Transcodes high-res video wallpaper into lightweight WebM VP8/Vorbis on the fly
 */
function transcodeVideo(wp, cacheDir) {
    const hash = crypto.createHash('md5').update(wp).digest('hex');
    const cachedWebm = path.join(cacheDir, `${hash}.webm`);
    const tmpWebm = path.join(cacheDir, `${hash}.webm.tmp`);

    if (fs.existsSync(cachedWebm)) {
        const stat = fs.statSync(cachedWebm);
        if (stat.size > 0) {
            return Promise.resolve(cachedWebm);
        }
        try { fs.unlinkSync(cachedWebm); } catch (e) {}
    }

    if (transcodingJobs.has(hash)) {
        return transcodingJobs.get(hash);
    }

    const job = new Promise((resolve, reject) => {
        console.log(`[FFmpeg] Chuyển mã ${path.basename(wp)} sang WebM...`);
        const ffmpegExe = getFFmpegPath();

        const args = [
            "-y", "-i", wp,
            "-t", "60",
            "-vf", "scale=-1:'min(1080,ih)'",
            "-r", "30",
            "-c:v", "libvpx", "-b:v", "8M", "-crf", "12", "-cpu-used", "5", "-threads", "8",
            "-c:a", "libvorbis",
            "-f", "webm",
            tmpWebm
        ];

        const ffmpeg = spawn(ffmpegExe, args, { windowsHide: true });

        ffmpeg.on('close', (code) => {
            transcodingJobs.delete(hash);
            if (code !== 0) {
                if (fs.existsSync(tmpWebm)) {
                    try { fs.unlinkSync(tmpWebm); } catch (e) {}
                }
                reject(new Error(`FFmpeg exited with code ${code}`));
            } else {
                try {
                    if (fs.existsSync(tmpWebm)) {
                        fs.renameSync(tmpWebm, cachedWebm);
                    }
                    console.log(`[FFmpeg] Chuyển mã hoàn tất: ${hash}.webm`);
                    resolve(cachedWebm);
                } catch (e) {
                    reject(e);
                }
            }
        });

        ffmpeg.on('error', (err) => {
            transcodingJobs.delete(hash);
            if (fs.existsSync(tmpWebm)) {
                try { fs.unlinkSync(tmpWebm); } catch (e) {}
            }
            reject(err);
        });
    });

    transcodingJobs.set(hash, job);
    return job;
}

/**
 * Determine if a file is an image by extension or magic bytes
 */
function isImageFile(filePath) {
    if (!filePath || !fs.existsSync(filePath)) return false;
    const ext = path.extname(filePath).toLowerCase();
    if (ext.match(/\.(jpg|jpeg|png|bmp|webp|gif)$/)) return true;

    // Check magic bytes for extensionless files (like TranscodedWallpaper)
    try {
        const fd = fs.openSync(filePath, "r");
        const buf = Buffer.alloc(8);
        fs.readSync(fd, buf, 0, 8, 0);
        fs.closeSync(fd);

        // JPEG: FF D8 FF
        if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return true;
        // PNG: 89 50 4E 47
        if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return true;
        // GIF: 47 49 46 38
        if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) return true;
    } catch (e) {}

    return false;
}

/**
 * Get MIME type of image
 */
function getImageMime(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.png') return "image/png";
    if (ext === '.gif') return "image/gif";
    if (ext === '.webp') return "image/webp";
    if (ext === '.bmp') return "image/bmp";
    return "image/jpeg";
}

/**
 * Create HTTP Server
 */
const server = http.createServer(async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Range, Accept");
    res.setHeader("Access-Control-Expose-Headers", "Content-Range, Accept-Ranges, Content-Length, Content-Type");

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    // Endpoint: /path - Returns current active media path
    if (req.url.startsWith("/path")) {
        let wp = "";
        if (isWeRunningCache) {
            wp = getCurrentWallpaper();
        }
        if (!wp || !fs.existsSync(wp)) {
            if (cachedWindowsWallpaper && fs.existsSync(cachedWindowsWallpaper)) {
                wp = cachedWindowsWallpaper;
            }
        }

        wp = resolveMediaFile(wp);

        res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
        res.end(wp);
        return;
    }

    // Endpoint: /media or /video - Streams or sends current media
    if (req.url.startsWith("/media") || req.url.startsWith("/video")) {
        let wp = "";
        if (isWeRunningCache) {
            wp = getCurrentWallpaper();
        }
        if (!wp || !fs.existsSync(wp)) {
            if (cachedWindowsWallpaper && fs.existsSync(cachedWindowsWallpaper)) {
                wp = cachedWindowsWallpaper;
            }
        }

        wp = resolveMediaFile(wp);

        if (!wp || !fs.existsSync(wp)) {
            res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
            res.end("Không tìm thấy hình nền phù hợp");
            return;
        }

        // 1. Direct Image Delivery
        if (isImageFile(wp)) {
            try {
                const stat = fs.statSync(wp);
                const mimeType = getImageMime(wp);

                res.writeHead(200, {
                    "Content-Type": mimeType,
                    "Content-Length": stat.size,
                    "Cache-Control": "no-cache"
                });

                if (req.method === 'HEAD') {
                    res.end();
                    return;
                }

                fs.createReadStream(wp).pipe(res);
            } catch (e) {
                if (!res.headersSent) {
                    res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
                    res.end("Không thể đọc file hình ảnh");
                }
            }
            return;
        }

        // 2. Video Transcoding & Chunked Byte-Range Streaming
        try {
            const cacheDir = ensureCacheDir();
            const cachedWebm = await transcodeVideo(wp, cacheDir);
            const stat = fs.statSync(cachedWebm);

            if (stat.size === 0) {
                try { fs.unlinkSync(cachedWebm); } catch (e) {}
                res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
                res.end("File cache video bị lỗi, vui lòng thử lại");
                return;
            }

            res.setHeader("Content-Type", "video/webm");
            res.setHeader("Accept-Ranges", "bytes");

            const range = req.headers.range;
            if (range) {
                const parts = range.replace(/bytes=/, "").split("-");
                const start = parseInt(parts[0], 10);
                const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
                const chunkSize = end - start + 1;

                res.writeHead(206, {
                    "Content-Range": `bytes ${start}-${end}/${stat.size}`,
                    "Content-Length": chunkSize
                });

                if (req.method === 'HEAD') {
                    res.end();
                    return;
                }

                fs.createReadStream(cachedWebm, { start, end }).pipe(res);
            } else {
                res.writeHead(200, { "Content-Length": stat.size });
                if (req.method === 'HEAD') {
                    res.end();
                    return;
                }
                fs.createReadStream(cachedWebm).pipe(res);
            }
        } catch (e) {
            console.error("[Video Streaming] Error:", e.message);

            // Fallback: If video transcoding fails, try serving fallback image instead of 500
            if (cachedWindowsWallpaper && fs.existsSync(cachedWindowsWallpaper)) {
                try {
                    const fStat = fs.statSync(cachedWindowsWallpaper);
                    res.writeHead(200, {
                        "Content-Type": getImageMime(cachedWindowsWallpaper),
                        "Content-Length": fStat.size
                    });
                    fs.createReadStream(cachedWindowsWallpaper).pipe(res);
                    return;
                } catch (err2) {}
            }

            if (!res.headersSent) {
                res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
                res.end("Lỗi chuyển mã video qua FFmpeg");
            }
        }
        return;
    }

    // Endpoint: /status - Health check
    if (req.url.startsWith("/status")) {
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({
            status: "online",
            version: "2.0.1",
            author: "Harilowji",
            wallpaperEngineRunning: isWeRunningCache,
            currentWallpaper: resolveMediaFile(getCurrentWallpaper() || cachedWindowsWallpaper)
        }, null, 2));
        return;
    }

    res.writeHead(404);
    res.end();
});

// Self-healing port retry handler
let retryCount = 0;
const MAX_RETRIES = 5;

server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        retryCount++;
        if (retryCount > MAX_RETRIES) {
            console.error(`[Server] Port ${PORT} vẫn đang bận sau ${MAX_RETRIES} lần thử. Đang khởi động lại tiến trình...`);
            process.exit(1);
        }
        console.error(`[Server] Cổng ${PORT} đang được sử dụng. Thử lại lần ${retryCount}/${MAX_RETRIES} sau 15 giây...`);
        setTimeout(() => {
            try { server.close(); } catch (e) {}
            server.listen(PORT, HOST);
        }, 15000);
    } else {
        console.error('[Server Error]:', err);
    }
});

server.listen(PORT, HOST, () => {
    retryCount = 0;
    console.log(`====================================================`);
    console.log(`🚀 Spotify x Wallpaper Engine Sync Server v2.0.1`);
    console.log(`👤 Tác giả: Harilowji (https://github.com/Harilowji)`);
    console.log(`📡 Máy chủ đang lắng nghe tại: http://${HOST}:${PORT}`);
    console.log(`====================================================`);
});

process.on('uncaughtException', (err) => {
    console.error('[Uncaught Exception]:', err);
});

process.on('unhandledRejection', (reason) => {
    console.error('[Unhandled Rejection]:', reason);
});
