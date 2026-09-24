/**
 * Spotify x Wallpaper Engine Sync Server
 * Developed & Re-engineered by Harilowji (https://github.com/Harilowji)
 * Version: 2.1.0
 * 
 * Local background daemon that bridges Wallpaper Engine / Windows Desktop
 * wallpapers directly to the Spicetify Spotify client.
 * Features built-in 4K PKG scene texture extraction for Wallpaper Engine.
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
 * Manages the cache directory and prunes older files (keeps newest 15)
 */
function ensureCacheDir() {
    const tempDir = path.join(os.tmpdir(), 'spotify_we_cache');
    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
    } else {
        try {
            const files = fs.readdirSync(tempDir)
                .filter(f => f.endsWith('.webm') || f.endsWith('_hires.png') || f.endsWith('_hires.jpg'))
                .map(f => {
                    const full = path.join(tempDir, f);
                    return { name: f, time: fs.statSync(full).mtime.getTime() };
                })
                .sort((a, b) => b.time - a.time);

            if (files.length > 15) {
                for (let i = 15; i < files.length; i++) {
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
 * Periodically check and cache default Windows Desktop Wallpaper
 */
function updateWindowsWallpaper() {
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

            const transcoded = path.join(process.env.APPDATA || "", "Microsoft\\Windows\\Themes\\TranscodedWallpaper");
            if (fs.existsSync(transcoded) && fs.statSync(transcoded).size > 0) {
                cachedWindowsWallpaper = transcoded;
                return;
            }

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
 * Intelligent discovery of Wallpaper Engine config.json
 */
function getWEConfigPath() {
    if (cachedWeConfigPath && fs.existsSync(cachedWeConfigPath)) {
        return cachedWeConfigPath;
    }

    const candidateBases = [];

    try {
        const out = execSync('reg query "HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Steam App 431960" /v InstallLocation', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] });
        const match = out.match(/InstallLocation\s+REG_SZ\s+(.+)/i);
        if (match && match[1] && fs.existsSync(match[1].trim())) {
            candidateBases.push(match[1].trim());
        }
    } catch (e) {}

    try {
        const out = execSync('reg query "HKCU\\Software\\Valve\\Steam" /v SteamPath', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] });
        const match = out.match(/SteamPath\s+REG_SZ\s+(.+)/i);
        if (match && match[1]) {
            const sPath = match[1].trim().replace(/\//g, "\\");
            candidateBases.push(path.join(sPath, "steamapps\\common\\wallpaper_engine"));
        }
    } catch (e) {}

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
 * Extracts true Full-HD / 4K PNG or JPEG wallpaper from Wallpaper Engine scene.pkg
 */
function extractHighResFromPkg(pkgPath) {
    try {
        const hash = crypto.createHash('md5').update(pkgPath).digest('hex');
        const cacheDir = ensureCacheDir();
        const cachedHighResPng = path.join(cacheDir, `${hash}_hires.png`);
        const cachedHighResJpg = path.join(cacheDir, `${hash}_hires.jpg`);

        if (fs.existsSync(cachedHighResPng) && fs.statSync(cachedHighResPng).size > 100000) {
            return cachedHighResPng;
        }
        if (fs.existsSync(cachedHighResJpg) && fs.statSync(cachedHighResJpg).size > 100000) {
            return cachedHighResJpg;
        }

        const fd = fs.openSync(pkgPath, 'r');
        const hBuf = Buffer.alloc(16);
        fs.readSync(fd, hBuf, 0, 16, 0);
        const magicLen = hBuf.readUInt32LE(0);
        let pos = 4 + magicLen;
        const countBuf = Buffer.alloc(4);
        fs.readSync(fd, countBuf, 0, 4, pos);
        const fileCount = countBuf.readUInt32LE(0);
        pos += 4;

        let bestEntry = null;
        let largestSize = 0;

        for (let i = 0; i < fileCount; i++) {
            const lenBuf = Buffer.alloc(4);
            fs.readSync(fd, lenBuf, 0, 4, pos);
            const nLen = lenBuf.readUInt32LE(0);
            pos += 4;
            const nameBuf = Buffer.alloc(nLen);
            fs.readSync(fd, nameBuf, 0, nLen, pos);
            const name = nameBuf.toString('utf8');
            pos += nLen;
            const offBuf = Buffer.alloc(8);
            fs.readSync(fd, offBuf, 0, 8, pos);
            const fOff = offBuf.readUInt32LE(0);
            const fSize = offBuf.readUInt32LE(4);
            pos += 8;

            if (name.endsWith('.tex') || name.match(/\.(png|jpg|jpeg)$/i)) {
                if (fSize > largestSize) {
                    largestSize = fSize;
                    bestEntry = { name, fOff, fSize };
                }
            }
        }

        const dataStart = pos;
        if (!bestEntry || bestEntry.fSize < 10000) {
            fs.closeSync(fd);
            return null;
        }

        const fileData = Buffer.alloc(bestEntry.fSize);
        fs.readSync(fd, fileData, 0, bestEntry.fSize, dataStart + bestEntry.fOff);
        fs.closeSync(fd);

        // Check for direct embedded PNG
        const pngIdx = fileData.indexOf(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
        if (pngIdx !== -1) {
            const iend = fileData.indexOf(Buffer.from([0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]), pngIdx);
            const imgData = iend !== -1 ? fileData.slice(pngIdx, iend + 8) : fileData.slice(pngIdx);
            fs.writeFileSync(cachedHighResPng, imgData);
            return cachedHighResPng;
        }

        // Check for direct embedded JPEG
        const jpgIdx = fileData.indexOf(Buffer.from([0xff, 0xd8, 0xff]));
        if (jpgIdx !== -1) {
            const eoi = fileData.indexOf(Buffer.from([0xff, 0xd9]), jpgIdx);
            const imgData = eoi !== -1 ? fileData.slice(jpgIdx, eoi + 2) : fileData.slice(jpgIdx);
            fs.writeFileSync(cachedHighResJpg, imgData);
            return cachedHighResJpg;
        }

        return null;
    } catch (e) {
        console.error("[PKG Extraction] Error:", e.message);
        return null;
    }
}

/**
 * Resolves Wallpaper Engine scenes (.pkg, .html) into true high-res artwork or fallback
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

    // Wallpaper Engine Scene packages (.pkg) - Extract true high-res 4K image!
    if (ext === '.pkg') {
        const highRes = extractHighResFromPkg(cleanPath);
        if (highRes && fs.existsSync(highRes)) {
            return highRes;
        }
    }

    // Secondary checks for previews
    if (ext === '.pkg' || ext === '.html' || ext === '.exe') {
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

        const candidatePreviews = [
            path.join(dir, "preview.jpg"),
            path.join(dir, "preview.png"),
            path.join(dir, "preview.jpeg"),
            path.join(dir, "preview.gif"),
            path.join(dir, "preview.webp")
        ];

        for (const candidate of candidatePreviews) {
            if (fs.existsSync(candidate) && fs.statSync(candidate).size > 0) {
                return candidate;
            }
        }
    }

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

    try {
        const out = execSync("where ffmpeg", { encoding: "utf-8", stdio: ["pipe", "pipe", "ignore"] });
        const first = out.split(/\r?\n/)[0]?.trim();
        if (first && fs.existsSync(first)) return first;
    } catch (e) {}

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

    try {
        const fd = fs.openSync(filePath, "r");
        const buf = Buffer.alloc(8);
        fs.readSync(fd, buf, 0, 8, 0);
        fs.closeSync(fd);

        if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return true;
        if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return true;
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
            version: "2.1.0",
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
    console.log(`🚀 Spotify x Wallpaper Engine Sync Server v2.1.0`);
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
