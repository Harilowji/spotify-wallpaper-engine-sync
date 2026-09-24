/**
 * Spotify x Wallpaper Engine Sync Server
 * Developed & Re-engineered by Harilowji (https://github.com/Harilowji)
 * Version: 2.0.0
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
    exec('tasklist /fi "IMAGENAME eq wallpaper32.exe" /fi "IMAGENAME eq wallpaper64.exe" /fi "IMAGENAME eq ui32.exe"', (err, stdout) => {
        if (!err && stdout) {
            isWeRunningCache = stdout.toLowerCase().includes("wallpaper32.exe") ||
                               stdout.toLowerCase().includes("wallpaper64.exe") ||
                               stdout.toLowerCase().includes("ui32.exe");
        } else {
            isWeRunningCache = false;
        }
    });
}
setInterval(checkWeRunning, 8000);
checkWeRunning();

// Track ongoing transcoding jobs to prevent duplicate FFmpeg spawns
const transcodingJobs = new Map();

let cachedWeConfigPath = null;
let cachedWindowsWallpaper = null;

// Periodically check and cache default Windows Desktop Wallpaper
function updateWindowsWallpaper() {
    exec('reg query "HKCU\\Control Panel\\Desktop" /v Wallpaper', (err, stdout) => {
        if (!err && stdout) {
            const match = stdout.match(/Wallpaper\s+REG_SZ\s+(.+)/i);
            if (match && match[1]) {
                const wpPath = match[1].trim();
                if (fs.existsSync(wpPath)) {
                    cachedWindowsWallpaper = wpPath;
                    return;
                }
            }
        }
        
        // Fallback: Check Windows TranscodedWallpaper in AppData
        const transcoded = path.join(process.env.APPDATA || "", "Microsoft\\Windows\\Themes\\TranscodedWallpaper");
        if (fs.existsSync(transcoded)) {
            cachedWindowsWallpaper = transcoded;
        }
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

    // Default fallback
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

        // Dynamically find user profile block (e.g., config.admin, config.user, etc.)
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
 * This fixes the #1 flaw of the original project where scenes would fail to display!
 */
function resolveMediaFile(rawPath) {
    if (!rawPath || !fs.existsSync(rawPath)) return "";

    const ext = path.extname(rawPath).toLowerCase();
    const dir = path.dirname(rawPath);

    // If it's already a direct video or image file
    if (ext.match(/\.(mp4|webm|mkv|avi|mov|jpg|jpeg|png|bmp|webp|gif)$/)) {
        return rawPath;
    }

    // If it's a scene (.pkg, .html, .exe) - look for preview image/gif
    if (ext === '.pkg' || ext === '.html' || ext === '.exe') {
        // 1. Check project.json in same folder
        const projectJsonPath = path.join(dir, "project.json");
        if (fs.existsSync(projectJsonPath)) {
            try {
                const proj = JSON.parse(fs.readFileSync(projectJsonPath, "utf-8"));
                if (proj && proj.preview) {
                    const previewPath = path.join(dir, proj.preview);
                    if (fs.existsSync(previewPath)) {
                        return previewPath;
                    }
                }
            } catch (err) {}
        }

        // 2. Direct checks for preview files
        const candidatePreviews = [
            path.join(dir, "preview.gif"),
            path.join(dir, "preview.jpg"),
            path.join(dir, "preview.png"),
            path.join(dir, "preview.jpeg"),
            path.join(dir, "preview.webp")
        ];

        for (const candidate of candidatePreviews) {
            if (fs.existsSync(candidate)) {
                return candidate;
            }
        }
    }

    // If still unresolved, fallback to Windows Desktop Wallpaper
    if (cachedWindowsWallpaper && fs.existsSync(cachedWindowsWallpaper)) {
        return cachedWindowsWallpaper;
    }

    return rawPath;
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
        console.log(`[FFmpeg] Transcoding ${path.basename(wp)} to optimized WebM...`);
        const ffmpegExe = process.env.FFMPEG_PATH || "ffmpeg";

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
                    console.log(`[FFmpeg] Transcoding complete: ${hash}.webm`);
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
 * Create HTTP Server
 */
const server = http.createServer(async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET");
    res.setHeader("Access-Control-Allow-Headers", "Range, Accept");
    res.setHeader("Access-Control-Expose-Headers", "Content-Range, Accept-Ranges, Content-Length, Content-Type");

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

        // Smart resolution for scenes & packages
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

        const ext = path.extname(wp).toLowerCase();

        // 1. Direct Image Delivery
        if (ext.match(/\.(jpg|jpeg|png|bmp|webp|gif)$/)) {
            try {
                const stat = fs.statSync(wp);
                let mimeType = "image/jpeg";
                if (ext === '.png') mimeType = "image/png";
                else if (ext === '.gif') mimeType = "image/gif";
                else if (ext === '.webp') mimeType = "image/webp";
                else if (ext === '.bmp') mimeType = "image/bmp";

                res.writeHead(200, {
                    "Content-Type": mimeType,
                    "Content-Length": stat.size
                });
                fs.createReadStream(wp).pipe(res);
            } catch (e) {
                if (!res.headersSent) {
                    res.writeHead(500);
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
                res.writeHead(500);
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
                fs.createReadStream(cachedWebm, { start, end }).pipe(res);
            } else {
                res.writeHead(200, { "Content-Length": stat.size });
                fs.createReadStream(cachedWebm).pipe(res);
            }
        } catch (e) {
            console.error("[Video Streaming] Error:", e.message);
            if (!res.headersSent) {
                res.writeHead(500);
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
            version: "2.0.0",
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
    console.log(`🚀 Spotify x Wallpaper Engine Sync Server v2.0.0`);
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
