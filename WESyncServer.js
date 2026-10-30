/**
 * Spotify x Wallpaper Engine Sync - WESyncServer.js (v3.1.0)
 * Developed & Re-engineered by Harilowji (https://github.com/Harilowji)
 * Features:
 * - Multi-drive Steam & Wallpaper Engine auto-discovery (Registry + libraryfolders.vdf + drive scan)
 * - Zero-dependency native RFC 6455 WebSocket Server on port 8989
 * - Debounced real-time file watcher (300ms) on config.json with fallback polling
 * - Direct native MP4/WebM video streaming with HTTP 206 Range headers (No CPU transcoding needed)
 * - Automatic PKG texture extraction for Scene wallpapers
 * - CORS-enabled JSON status endpoint (/status)
 * - Spotify Auto-Healer & anti-update protection
 */

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { exec, execSync, spawn } = require("child_process");

const PORT = 8989;

// ==========================================
// 1. Kiểm tra trạng thái Wallpaper Engine
// ==========================================
let isWeRunningCache = false;

function checkWeRunning() {
    exec('tasklist | findstr /i "wallpaper32.exe wallpaper64.exe ui32.exe"', (err, stdout) => {
        isWeRunningCache = !err && !!stdout && stdout.trim().length > 0;
    });
}

try {
    const out = execSync('tasklist | findstr /i "wallpaper32.exe wallpaper64.exe ui32.exe"', { encoding: 'utf-8', windowsHide: true });
    isWeRunningCache = !!out && out.trim().length > 0;
} catch (e) {
    isWeRunningCache = false;
}
setInterval(checkWeRunning, 5000);

// ==========================================
// 2. Theo dõi hình nền Windows Desktop (Fallback)
// ==========================================
let cachedWindowsWallpaper = null;

function updateWindowsWallpaper() {
    exec('reg query "HKCU\\Control Panel\\Desktop" /v Wallpaper', (err, stdout) => {
        if (!err && stdout) {
            const match = stdout.match(/Wallpaper\s+REG_SZ\s+(.+)/i);
            if (match && match[1]) {
                const wpPath = match[1].trim();
                if (fs.existsSync(wpPath)) {
                    cachedWindowsWallpaper = wpPath;
                }
            }
        }
    });
}
updateWindowsWallpaper();
setInterval(updateWindowsWallpaper, 10000);

// ==========================================
// 3. Tự động dò tìm Wallpaper Engine config.json (Đa phân vùng ổ đĩa)
// ==========================================
let cachedWeConfigPath = null;

function getWEConfigPath() {
    if (cachedWeConfigPath && fs.existsSync(cachedWeConfigPath)) {
        return cachedWeConfigPath;
    }

    const candidateBases = new Set();

    // Cách 1: Registry Steam App 431960 (Wallpaper Engine)
    try {
        const out = execSync('reg query "HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Steam App 431960" /v InstallLocation', {
            encoding: 'utf-8',
            stdio: ['pipe', 'pipe', 'ignore'],
            windowsHide: true
        });
        const match = out.match(/InstallLocation\s+REG_SZ\s+(.+)/i);
        if (match && match[1] && fs.existsSync(match[1].trim())) {
            candidateBases.add(match[1].trim());
        }
    } catch (e) {}

    // Cách 2: Registry Steam Path & Phân tích libraryfolders.vdf
    try {
        const out = execSync('reg query "HKCU\\Software\\Valve\\Steam" /v SteamPath', {
            encoding: 'utf-8',
            stdio: ['pipe', 'pipe', 'ignore'],
            windowsHide: true
        });
        const match = out.match(/SteamPath\s+REG_SZ\s+(.+)/i);
        if (match && match[1]) {
            const sPath = match[1].trim().replace(/\//g, "\\");
            candidateBases.add(path.join(sPath, "steamapps\\common\\wallpaper_engine"));

            const vdfPath = path.join(sPath, "steamapps", "libraryfolders.vdf");
            if (fs.existsSync(vdfPath)) {
                try {
                    const vdfContent = fs.readFileSync(vdfPath, "utf-8");
                    const pathMatches = vdfContent.matchAll(/"path"\s+"([^"]+)"/g);
                    for (const m of pathMatches) {
                        const libPath = m[1].replace(/\\\\/g, "\\");
                        candidateBases.add(path.join(libPath, "steamapps\\common\\wallpaper_engine"));
                    }
                } catch (ve) {}
            }
        }
    } catch (e) {}

    // Cách 3: Quét trực tiếp các phân vùng đĩa phổ biến từ C đến H
    const drives = ["C", "D", "E", "F", "G", "H"];
    for (const d of drives) {
        candidateBases.add(`${d}:\\Steam\\steamapps\\common\\wallpaper_engine`);
        candidateBases.add(`${d}:\\SteamLibrary\\steamapps\\common\\wallpaper_engine`);
        candidateBases.add(`${d}:\\Program Files (x86)\\Steam\\steamapps\\common\\wallpaper_engine`);
        candidateBases.add(`${d}:\\Program Files\\Steam\\steamapps\\common\\wallpaper_engine`);
    }

    for (const base of candidateBases) {
        const cfg = path.join(base, "config.json");
        if (fs.existsSync(cfg)) {
            cachedWeConfigPath = cfg;
            return cachedWeConfigPath;
        }
    }

    return path.join("C:\\Program Files (x86)\\Steam\\steamapps\\common\\wallpaper_engine", "config.json");
}

// ==========================================
// 4. Lấy hình nền Wallpaper Engine đang hoạt động
// ==========================================
let cachedCfgMtime = 0;
let cachedCurrentWallpaper = "";

function getCurrentWallpaper() {
    try {
        const cfgPath = getWEConfigPath();
        if (!fs.existsSync(cfgPath)) return "";

        const stat = fs.statSync(cfgPath);
        if (stat.mtimeMs === cachedCfgMtime && cachedCurrentWallpaper) {
            return cachedCurrentWallpaper;
        }

        const raw = fs.readFileSync(cfgPath, "utf-8");
        const config = JSON.parse(raw);

        // Duyệt tìm profile người dùng trong config
        for (const key in config) {
            if (config[key] && config[key].general && config[key].general.wallpaperconfig) {
                const wallpapers = config[key].general.wallpaperconfig.selectedwallpapers;
                if (!wallpapers || typeof wallpapers !== 'object') continue;

                const monitorKeys = Object.keys(wallpapers);
                if (monitorKeys.length > 0) {
                    const wpObj = wallpapers[monitorKeys[0]];
                    if (wpObj && wpObj.file) {
                        cachedCfgMtime = stat.mtimeMs;
                        cachedCurrentWallpaper = wpObj.file.replace(/\//g, "\\");
                        return cachedCurrentWallpaper;
                    }
                }
            }
        }
    } catch (e) {}
    return cachedCurrentWallpaper;
}

// ==========================================
// 5. Trích xuất Texture từ Scene .pkg
// ==========================================
function extractPkgTexture(pkgPath, outputDir) {
    try {
        if (!fs.existsSync(pkgPath)) return "";
        const stat = fs.statSync(pkgPath);
        if (stat.size < 16) return "";

        // Băm MD5 dựa trên đường dẫn tuyệt đối và thời gian sửa đổi (mtime)
        // để tạo cache độc lập cho từng hình nền riêng biệt (tránh xung đột khi mọi file đều tên scene.pkg)
        const hash = crypto.createHash("md5").update(pkgPath + stat.mtimeMs).digest("hex").slice(0, 12);
        const folderId = path.basename(path.dirname(pkgPath));
        const cachePrefix = `scene_${folderId}_${hash}`;

        const cachedPng = path.join(outputDir, `${cachePrefix}.png`);
        if (fs.existsSync(cachedPng) && fs.statSync(cachedPng).size > 0) return cachedPng;
        const cachedJpg = path.join(outputDir, `${cachePrefix}.jpg`);
        if (fs.existsSync(cachedJpg) && fs.statSync(cachedJpg).size > 0) return cachedJpg;

        const buffer = fs.readFileSync(pkgPath);
        const pngMagic = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
        const jpgMagic = Buffer.from([0xFF, 0xD8, 0xFF]);

        let bestCandidate = null;
        let maxCandidateSize = 0;

        for (let i = 0; i < buffer.length - 8; i++) {
            if (buffer.subarray(i, i + 8).equals(pngMagic)) {
                let end = -1;
                for (let j = i + 8; j < Math.min(buffer.length - 4, i + 25000000); j++) {
                    if (buffer[j] === 0x49 && buffer[j+1] === 0x45 && buffer[j+2] === 0x4E && buffer[j+3] === 0x44) {
                        end = j + 8;
                        break;
                    }
                }
                if (end > i) {
                    const sz = end - i;
                    if (sz > maxCandidateSize) {
                        maxCandidateSize = sz;
                        bestCandidate = { start: i, end: end, ext: ".png" };
                    }
                    i = end;
                }
            } else if (buffer.subarray(i, i + 3).equals(jpgMagic)) {
                let end = -1;
                for (let j = i + 3; j < Math.min(buffer.length - 2, i + 25000000); j++) {
                    if (buffer[j] === 0xFF && buffer[j+1] === 0xD9) {
                        end = j + 2;
                        break;
                    }
                }
                if (end > i) {
                    const sz = end - i;
                    if (sz > maxCandidateSize) {
                        maxCandidateSize = sz;
                        bestCandidate = { start: i, end: end, ext: ".jpg" };
                    }
                    i = end;
                }
            }
        }

        if (bestCandidate && maxCandidateSize > 30000) {
            const outPath = path.join(outputDir, `${cachePrefix}${bestCandidate.ext}`);
            fs.writeFileSync(outPath, buffer.subarray(bestCandidate.start, bestCandidate.end));
            return outPath;
        }
    } catch (e) {
        console.error("[PKG Extractor] Lỗi trích xuất texture:", e.message);
    }
    return "";
}

// ==========================================
// 6. Phân giải tệp Media (Video / Hình ảnh)
// ==========================================
let cachedResolvedRaw = "";
let cachedResolvedResult = "";

function resolveMediaFile(rawPath) {
    if (!rawPath || !fs.existsSync(rawPath)) return "";
    if (rawPath === cachedResolvedRaw && cachedResolvedResult && fs.existsSync(cachedResolvedResult)) {
        return cachedResolvedResult;
    }

    const result = _doResolveMediaFile(rawPath);
    cachedResolvedRaw = rawPath;
    cachedResolvedResult = result;
    return result;
}

function _doResolveMediaFile(rawPath) {
    const ext = path.extname(rawPath).toLowerCase();

    // File video hoặc ảnh trực tiếp
    if (ext.match(/\.(mp4|webm|avi|mkv|mov|jpg|jpeg|png|bmp|webp|gif)$/)) {
        return rawPath;
    }

    // Scene Wallpaper Engine (.pkg)
    if (ext === ".pkg") {
        const cacheDir = ensureCacheDir();
        const hdImage = extractPkgTexture(rawPath, cacheDir);
        if (hdImage && fs.existsSync(hdImage) && fs.statSync(hdImage).size > 0) {
            return hdImage;
        }
    }

    const dir = path.dirname(rawPath);

    if (ext !== ".pkg") {
        const pkgCandidates = [
            path.join(dir, "scene.pkg"),
            path.join(dir, "gifscene.pkg")
        ];
        for (const pkg of pkgCandidates) {
            if (fs.existsSync(pkg)) {
                const cacheDir = ensureCacheDir();
                const hdImage = extractPkgTexture(pkg, cacheDir);
                if (hdImage && fs.existsSync(hdImage) && fs.statSync(hdImage).size > 0) {
                    return hdImage;
                }
            }
        }
    }

    // project.json -> general.properties hoặc preview image
    const projectJson = path.join(dir, "project.json");
    if (fs.existsSync(projectJson)) {
        try {
            const pData = JSON.parse(fs.readFileSync(projectJson, "utf-8"));
            if (pData.file) {
                const directFile = path.join(dir, pData.file);
                const dExt = path.extname(directFile).toLowerCase();
                if (dExt.match(/\.(mp4|webm|avi|mkv|mov|jpg|jpeg|png|bmp|webp|gif)$/) && fs.existsSync(directFile)) {
                    return directFile;
                }
                if (dExt === ".pkg" && fs.existsSync(directFile)) {
                    const cacheDir = ensureCacheDir();
                    const hd = extractPkgTexture(directFile, cacheDir);
                    if (hd && fs.existsSync(hd) && fs.statSync(hd).size > 0) return hd;
                }
            }
            if (pData.preview) {
                const previewImg = path.join(dir, pData.preview);
                if (fs.existsSync(previewImg)) return previewImg;
            }
        } catch (e) {}
    }

    const imageFallbacks = ["preview.gif", "preview.jpg", "preview.png", "scene.jpg", "scene.png"];
    for (const img of imageFallbacks) {
        const imgPath = path.join(dir, img);
        if (fs.existsSync(imgPath)) return imgPath;
    }

    return rawPath;
}

// ==========================================
// 7. Thư mục Cache & Hỗ trợ Chuyển mã Fallback
// ==========================================
function ensureCacheDir() {
    const cacheDir = path.join(process.env.TEMP || "C:\\Windows\\Temp", "spotify_we_cache");
    if (!fs.existsSync(cacheDir)) {
        fs.mkdirSync(cacheDir, { recursive: true });
    }
    return cacheDir;
}

function cleanupOldCache(dir, keepFile) {
    try {
        if (!fs.existsSync(dir)) return;
        const files = fs.readdirSync(dir);
        for (const file of files) {
            const fullPath = path.join(dir, file);
            if (fullPath !== keepFile) {
                try { fs.unlinkSync(fullPath); } catch (e) {}
            }
        }
    } catch (e) {}
}

let cachedFfmpegPath = null;
function getFFmpegPath() {
    if (cachedFfmpegPath) return cachedFfmpegPath;
    if (process.env.FFMPEG_PATH && fs.existsSync(process.env.FFMPEG_PATH)) {
        cachedFfmpegPath = process.env.FFMPEG_PATH;
        return cachedFfmpegPath;
    }
    try {
        const out = execSync("where ffmpeg", { encoding: "utf-8", stdio: ["pipe", "pipe", "ignore"], windowsHide: true });
        if (out) {
            cachedFfmpegPath = out.trim().split(/\r?\n/)[0];
            return cachedFfmpegPath;
        }
    } catch (e) {}
    return "ffmpeg";
}

const transcodingJobs = new Map();

function transcodeVideo(inputPath, outputDir) {
    if (transcodingJobs.has(inputPath)) {
        return transcodingJobs.get(inputPath);
    }

    const promise = new Promise((resolve, reject) => {
        try {
            const stat = fs.statSync(inputPath);
            const hash = crypto.createHash("md5").update(inputPath + stat.mtimeMs).digest("hex").slice(0, 12);
            const outputPath = path.join(outputDir, `we_${hash}.webm`);

            if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 1024) {
                cleanupOldCache(outputDir, outputPath);
                return resolve(outputPath);
            }

            const ffmpeg = getFFmpegPath();
            const tempOutput = outputPath + ".tmp.webm";

            const args = [
                "-y",
                "-hwaccel", "auto",
                "-i", inputPath,
                "-c:v", "libvpx-vp9",
                "-b:v", "2M",
                "-crf", "30",
                "-an",
                "-speed", "8",
                "-deadline", "realtime",
                tempOutput
            ];

            const proc = spawn(ffmpeg, args, { windowsHide: true });
            proc.on("close", (code) => {
                if (code === 0 && fs.existsSync(tempOutput) && fs.statSync(tempOutput).size > 1024) {
                    try {
                        if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
                        fs.renameSync(tempOutput, outputPath);
                        cleanupOldCache(outputDir, outputPath);
                        resolve(outputPath);
                    } catch (err) {
                        reject(err);
                    }
                } else {
                    try { if (fs.existsSync(tempOutput)) fs.unlinkSync(tempOutput); } catch (e) {}
                    reject(new Error(`FFmpeg exited with code ${code}`));
                }
            });

            proc.on("error", (err) => {
                try { if (fs.existsSync(tempOutput)) fs.unlinkSync(tempOutput); } catch (e) {}
                reject(err);
            });
        } catch (err) {
            reject(err);
        }
    }).finally(() => {
        transcodingJobs.delete(inputPath);
    });

    transcodingJobs.set(inputPath, promise);
    return promise;
}

function isImageFile(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    return [".jpg", ".jpeg", ".png", ".bmp", ".webp", ".gif"].includes(ext);
}

function getImageMime(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    switch (ext) {
        case ".jpg":
        case ".jpeg":
            return "image/jpeg";
        case ".png":
            return "image/png";
        case ".gif":
            return "image/gif";
        case ".webp":
            return "image/webp";
        case ".bmp":
            return "image/bmp";
        default:
            return "application/octet-stream";
    }
}

// ==========================================
// 8. Tự động bảo vệ & Khôi phục phiên bản Spotify (Auto-Healer)
// ==========================================
let isHealing = false;

function getExeProductVersion(filePath) {
    if (!fs.existsSync(filePath)) return null;
    try {
        const cmd = `(Get-Item '${filePath.replace(/'/g, "''")}').VersionInfo.ProductVersion`;
        const out = execSync(`powershell -NoProfile -Command "${cmd}"`, {
            encoding: "utf-8",
            timeout: 5000,
            stdio: ["pipe", "pipe", "ignore"],
            windowsHide: true
        });
        return out ? out.trim() : null;
    } catch (e) {
        return null;
    }
}

function versionMatches(v1, v2) {
    if (!v1 || !v2) return false;
    const clean1 = v1.replace(/[^0-9.]/g, '').split('.').slice(0, 3).join('.');
    const clean2 = v2.replace(/[^0-9.]/g, '').split('.').slice(0, 3).join('.');
    return clean1 === clean2;
}

function checkAndHealSpotifyUpdate(isManual = false, forceRestore = false) {
    if (isHealing) return { status: "running", message: "Tiến trình khôi phục đang diễn ra." };
    isHealing = true;

    try {
        const appData = process.env.APPDATA || "";
        const localAppData = process.env.LOCALAPPDATA || "";
        const currentExe = path.join(appData, "Spotify", "Spotify.exe");
        const backupExe = path.join(localAppData, "SpotifyBackup", "Spotify.exe");

        if (!fs.existsSync(backupExe)) {
            isHealing = false;
            return { status: "no_backup", message: "Chưa có bản sao lưu chuẩn 1.2.53." };
        }

        const currentVer = getExeProductVersion(currentExe);
        const backupVer = getExeProductVersion(backupExe) || "1.2.53.440";

        const isUpdated = !versionMatches(currentVer, backupVer);

        if (!isUpdated && !forceRestore) {
            isHealing = false;
            return { status: "ok", version: currentVer, message: "Spotify đang ở phiên bản chuẩn." };
        }

        console.log(`[Auto-Healer] Phát hiện phiên bản Spotify (${currentVer}) khác bản chuẩn (${backupVer}). Đang tự động hạ cấp...`);

        try {
            const taskOut = execSync('tasklist /fi "imagename eq spotify.exe"', { encoding: "utf-8", timeout: 5000, windowsHide: true });
            if (taskOut && taskOut.toLowerCase().includes("spotify.exe")) {
                console.log("[Auto-Healer] Đang đóng tiến trình Spotify...");
                execSync("taskkill /f /im spotify.exe", { timeout: 5000, windowsHide: true });
            }
        } catch (e) {}

        const backupDir = path.join(localAppData, "SpotifyBackup");
        const spotifyDir = path.join(appData, "Spotify");

        console.log("[Auto-Healer] Đang áp dụng lại cấu hình Spicetify...");
        try {
            execSync("spicetify restore", { timeout: 15000, windowsHide: true });
            execSync("spicetify clear", { timeout: 15000, windowsHide: true });
            execSync("spicetify backup apply -n", { timeout: 25000, windowsHide: true });
        } catch (e) {
            console.warn("[Auto-Healer] Cảnh báo khi cấu hình Spicetify:", e.message);
        }

        console.log("[Auto-Healer] Khôi phục phiên bản Spotify hoàn tất thành công!");
        isHealing = false;

        if (isManual) {
            try {
                execSync('cmd.exe /c start spotify:', { timeout: 5000, windowsHide: true });
            } catch (e) {}
        }

        return {
            status: "healed",
            oldVersion: currentVer,
            newVersion: backupVer,
            message: "Đã tự động khôi phục Spotify về phiên bản chuẩn và kích hoạt khiên chống cập nhật!"
        };
    } catch (err) {
        isHealing = false;
        console.error("[Auto-Healer] Lỗi trong quá trình kiểm tra:", err.message);
        return { status: "error", message: err.message };
    }
}

// ==========================================
// 9. Bộ khung WebSocket RFC 6455 Zero-Dependency
// ==========================================
const wsClients = new Set();

function createWsTextFrame(payload) {
    const data = Buffer.from(payload, "utf-8");
    const len = data.length;
    let header;
    if (len < 126) {
        header = Buffer.from([0x81, len]);
    } else if (len < 65536) {
        header = Buffer.alloc(4);
        header[0] = 0x81;
        header[1] = 126;
        header.writeUInt16BE(len, 2);
    } else {
        header = Buffer.alloc(10);
        header[0] = 0x81;
        header[1] = 127;
        header.writeBigUInt64BE(BigInt(len), 2);
    }
    return Buffer.concat([header, data]);
}

function broadcastWallpaper(payload) {
    if (wsClients.size === 0) return;
    const frame = createWsTextFrame(JSON.stringify(payload));
    for (const client of wsClients) {
        try {
            client.write(frame);
        } catch (e) {
            wsClients.delete(client);
        }
    }
}

function findPreviewImage(wp, resolved) {
    if (resolved && isImageFile(resolved)) return resolved;
    if (!wp) return "";
    try {
        const dir = fs.existsSync(wp) && fs.statSync(wp).isDirectory() ? wp : path.dirname(wp);
        const candidates = [
            path.join(dir, "preview.jpg"),
            path.join(dir, "preview.png"),
            path.join(dir, "preview.gif"),
            path.join(dir, "preview.webp"),
            path.join(dir, "scene.jpg"),
            path.join(dir, "scene.png")
        ];
        for (const c of candidates) {
            if (fs.existsSync(c) && fs.statSync(c).size > 0) return c;
        }
        const projectJson = path.join(dir, "project.json");
        if (fs.existsSync(projectJson)) {
            try {
                const p = JSON.parse(fs.readFileSync(projectJson, "utf-8"));
                if (p.preview) {
                    const prev = path.join(dir, p.preview.replace(/\//g, "\\"));
                    if (fs.existsSync(prev) && fs.statSync(prev).size > 0) return prev;
                }
            } catch (e) {}
        }
    } catch (e) {}
    return (resolved && isImageFile(resolved)) ? resolved : "";
}

function getActiveWallpaperPayload() {
    let wp = "";
    const weWp = getCurrentWallpaper();

    if (isWeRunningCache && weWp && fs.existsSync(weWp)) {
        wp = weWp;
    } else if (weWp && fs.existsSync(weWp)) {
        wp = weWp;
    }

    if (!wp || !fs.existsSync(wp)) {
        if (cachedWindowsWallpaper && fs.existsSync(cachedWindowsWallpaper)) {
            wp = cachedWindowsWallpaper;
        }
    }

    const resolved = resolveMediaFile(wp);
    const resolvedExt = resolved ? path.extname(resolved).toLowerCase() : "";
    const rawExt = wp ? path.extname(wp).toLowerCase() : "";

    // Phân loại định dạng đa phương tiện: video, image, scene (.pkg), web (.html)
    let mediaType = "none";
    let isVid = false;

    if (resolvedExt.match(/\.(mp4|webm|avi|mkv|mov)$/)) {
        mediaType = "video";
        isVid = true;
    } else if (rawExt === ".pkg" || wp.toLowerCase().includes("scene.pkg")) {
        mediaType = "scene";
    } else if (rawExt === ".html" || wp.toLowerCase().includes("index.html")) {
        mediaType = "web";
    } else if (path.basename(wp).toLowerCase() === "project.json") {
        try {
            const pData = JSON.parse(fs.readFileSync(wp, "utf-8"));
            const pType = (pData.type || "").toLowerCase();
            if (pType === "scene") mediaType = "scene";
            else if (pType === "web") mediaType = "web";
            else if (pType === "video") {
                mediaType = "video";
                isVid = true;
            } else {
                mediaType = resolved ? "image" : "none";
            }
        } catch (e) {
            mediaType = resolved ? "image" : "none";
        }
    } else if (resolved) {
        mediaType = "image";
    }

    // Hash định danh media độc nhất để Client phân biệt được thay đổi hình nền ngay cả khi cùng endpoint
    const mediaHash = resolved && fs.existsSync(resolved)
        ? crypto.createHash("md5").update(resolved + fs.statSync(resolved).mtimeMs).digest("hex").slice(0, 10)
        : (wp ? crypto.createHash("md5").update(wp).digest("hex").slice(0, 10) : Date.now().toString(16));

    // Tạo previewUrl ảnh xem trước cho video thumbnail hoặc Scene/Web fallback
    const previewFile = findPreviewImage(wp, resolved);
    const previewUrl = previewFile 
        ? `http://127.0.0.1:${PORT}/preview/${mediaHash}?t=${Date.now()}` 
        : (resolved && !isVid ? `http://127.0.0.1:${PORT}/image/${mediaHash}?t=${Date.now()}` : "");

    const mediaUrl = isVid 
        ? `http://127.0.0.1:${PORT}/video/${mediaHash}?t=${Date.now()}` 
        : (mediaType !== "none" ? `http://127.0.0.1:${PORT}/image/${mediaHash}?t=${Date.now()}` : "");

    return {
        type: mediaType,
        url: mediaUrl,
        previewUrl: previewUrl || mediaUrl,
        wallpaper: wp,
        resolvedMedia: resolved,
        weRunning: isWeRunningCache
    };
}

// File Watcher trên config.json
let configWatcher = null;
let lastBroadcastWallpaper = "";
let watcherDebounce = null;

function initConfigWatcher() {
    const cfgPath = getWEConfigPath();
    if (!cfgPath || !fs.existsSync(cfgPath)) return;

    if (configWatcher) {
        try { configWatcher.close(); } catch (e) {}
    }

    try {
        configWatcher = fs.watch(cfgPath, () => {
            if (watcherDebounce) clearTimeout(watcherDebounce);
            watcherDebounce = setTimeout(() => {
                const wp = getCurrentWallpaper();
                if (wp && wp !== lastBroadcastWallpaper) {
                    lastBroadcastWallpaper = wp;
                    console.log("[WE-Sync Watcher] Hình nền thay đổi:", wp);
                    broadcastWallpaper(getActiveWallpaperPayload());
                }
            }, 300);
        });
    } catch (e) {
        console.error("[Watcher] Lỗi khi theo dõi config.json:", e.message);
    }
}

// Safety-net Polling mỗi 3 giây
setInterval(() => {
    const wp = getCurrentWallpaper();
    if (wp && wp !== lastBroadcastWallpaper) {
        lastBroadcastWallpaper = wp;
        console.log("[WE-Sync Poller] Hình nền cập nhật qua polling:", wp);
        broadcastWallpaper(getActiveWallpaperPayload());
    }
}, 3000);

// ==========================================
// 10. Khởi tạo HTTP Web Server
// ==========================================
const server = http.createServer(async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Range, Accept");
    res.setHeader("Access-Control-Expose-Headers", "Content-Range, Accept-Ranges, Content-Length, Content-Type");

    if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
    }

    // Endpoint: /status - Trả về JSON trạng thái hệ thống, Wallpaper Engine và client kết nối
    if (req.url.startsWith("/status")) {
        try {
            const payload = getActiveWallpaperPayload();
            res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
            res.end(JSON.stringify({
                version: "3.1.1",
                status: "ok",
                weRunning: payload.weRunning,
                wallpaper: payload.wallpaper,
                resolvedMedia: payload.resolvedMedia,
                mediaType: payload.type,
                mediaUrl: payload.url,
                previewUrl: payload.previewUrl,
                clients: wsClients.size
            }, null, 2));
        } catch (e) {
            res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
            res.end(JSON.stringify({ status: "error", message: e.message }));
        }
        return;
    }

    // Endpoint: /preview hoặc /pkg_preview - Phục vụ ảnh thumbnail xem trước (Fallback khi video lỗi hoặc Scene)
    if (req.url.startsWith("/preview") || req.url.startsWith("/pkg_preview")) {
        let wp = "";
        const weWp = getCurrentWallpaper();
        if (isWeRunningCache && weWp && fs.existsSync(weWp)) {
            wp = weWp;
        } else if (weWp && fs.existsSync(weWp)) {
            wp = weWp;
        }
        if (!wp || !fs.existsSync(wp)) {
            if (cachedWindowsWallpaper && fs.existsSync(cachedWindowsWallpaper)) {
                wp = cachedWindowsWallpaper;
            }
        }
        const resolved = resolveMediaFile(wp);
        let previewFile = findPreviewImage(wp, resolved);
        if (!previewFile || !fs.existsSync(previewFile)) {
            previewFile = resolved;
        }

        if (!previewFile || !fs.existsSync(previewFile) || !isImageFile(previewFile)) {
            res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
            res.end("Không tìm thấy ảnh xem trước (preview thumbnail)");
            return;
        }

        try {
            const stat = fs.statSync(previewFile);
            const mimeType = getImageMime(previewFile);
            res.writeHead(200, {
                "Content-Type": mimeType,
                "Content-Length": stat.size,
                "Cache-Control": "no-cache"
            });
            if (req.method === "HEAD") {
                res.end();
                return;
            }
            fs.createReadStream(previewFile).pipe(res);
        } catch (e) {
            if (!res.headersSent) {
                res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
                res.end("Không thể đọc file preview: " + e.message);
            }
        }
        return;
    }

    // Endpoint: /image - Phục vụ ảnh trực tiếp
    if (req.url.startsWith("/image")) {
        let wp = "";
        const weWp = getCurrentWallpaper();
        if (isWeRunningCache && weWp && fs.existsSync(weWp)) {
            wp = weWp;
        } else if (weWp && fs.existsSync(weWp)) {
            wp = weWp;
        }
        if (!wp || !fs.existsSync(wp)) {
            if (cachedWindowsWallpaper && fs.existsSync(cachedWindowsWallpaper)) {
                wp = cachedWindowsWallpaper;
            }
        }
        const rawWp = wp;
        wp = resolveMediaFile(wp);
        if (!wp || !fs.existsSync(wp) || !isImageFile(wp)) {
            const previewFallback = findPreviewImage(rawWp, wp);
            if (previewFallback && fs.existsSync(previewFallback) && isImageFile(previewFallback)) {
                wp = previewFallback;
            }
        }
        if (!wp || !fs.existsSync(wp)) {
            res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
            res.end("Không tìm thấy hình nền phù hợp");
            return;
        }

        try {
            const stat = fs.statSync(wp);
            const mimeType = getImageMime(wp);
            res.writeHead(200, {
                "Content-Type": mimeType,
                "Content-Length": stat.size,
                "Cache-Control": "no-cache"
            });
            if (req.method === "HEAD") {
                res.end();
                return;
            }
            fs.createReadStream(wp).pipe(res);
        } catch (e) {
            if (!res.headersSent) {
                res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
                res.end("Không thể đọc file ảnh: " + e.message);
            }
        }
        return;
    }

    // Endpoint: /catjam.webm - Phục vụ video chú mèo Cat Jam
    if (req.url.startsWith("/catjam.webm")) {
        const catPath = path.join(__dirname, "catjam.webm");
        if (fs.existsSync(catPath)) {
            const stat = fs.statSync(catPath);
            res.writeHead(200, {
                "Content-Type": "video/webm",
                "Content-Length": stat.size,
                "Cache-Control": "public, max-age=31536000"
            });
            fs.createReadStream(catPath).pipe(res);
            return;
        }
    }

    // Endpoint: /path - Trả về đường dẫn hình nền hiện tại
    if (req.url.startsWith("/path")) {
        let wp = "";
        const weWp = getCurrentWallpaper();
        if (isWeRunningCache && weWp && fs.existsSync(weWp)) {
            wp = weWp;
        } else if (weWp && fs.existsSync(weWp)) {
            wp = weWp;
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

    // Endpoint: /media hoặc /video - Phục vụ file ảnh hoặc video
    if (req.url.startsWith("/media") || req.url.startsWith("/video")) {
        let wp = "";
        const weWp = getCurrentWallpaper();
        if (isWeRunningCache && weWp && fs.existsSync(weWp)) {
            wp = weWp;
        } else if (weWp && fs.existsSync(weWp)) {
            wp = weWp;
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

        // 1. Phục vụ ảnh trực tiếp
        if (isImageFile(wp)) {
            try {
                const stat = fs.statSync(wp);
                const mimeType = getImageMime(wp);
                res.writeHead(200, {
                    "Content-Type": mimeType,
                    "Content-Length": stat.size,
                    "Cache-Control": "no-cache"
                });
                if (req.method === "HEAD") {
                    res.end();
                    return;
                }
                fs.createReadStream(wp).pipe(res);
            } catch (e) {
                if (!res.headersSent) {
                    res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
                    res.end("Không thể đọc file ảnh: " + e.message);
                }
            }
            return;
        }

        // 2. Phục vụ video WebM truyền trực tiếp với Range Headers (HTTP 206)
        // Lưu ý: Spotify CEF không có sẵn bộ giải mã H.264 (avc1), chỉ hỗ trợ WebM (VP8/VP9).
        // Do đó chỉ file .webm mới truyền trực tiếp; file .mp4 sẽ được chuyển mã tự động sang WebM VP9 bên dưới.
        const vExt = path.extname(wp).toLowerCase();
        if (vExt === ".webm") {
            try {
                const stat = fs.statSync(wp);
                const range = req.headers.range;
                const contentType = "video/webm";

                if (req.method === "HEAD") {
                    res.writeHead(200, {
                        "Content-Length": stat.size,
                        "Content-Type": contentType,
                        "Accept-Ranges": "bytes"
                    });
                    res.end();
                    return;
                }

                if (range) {
                    const parts = range.replace(/bytes=/, "").split("-");
                    const start = parseInt(parts[0], 10);
                    const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
                    const chunkSize = (end - start) + 1;

                    res.writeHead(206, {
                        "Content-Range": `bytes ${start}-${end}/${stat.size}`,
                        "Accept-Ranges": "bytes",
                        "Content-Length": chunkSize,
                        "Content-Type": contentType
                    });
                    fs.createReadStream(wp, { start, end }).pipe(res);
                } else {
                    res.writeHead(200, {
                        "Content-Length": stat.size,
                        "Content-Type": contentType,
                        "Accept-Ranges": "bytes"
                    });
                    fs.createReadStream(wp).pipe(res);
                }
            } catch (e) {
                console.error("[Server] Lỗi phát video gốc:", e.message);
                if (!res.headersSent) {
                    res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
                    res.end("Lỗi đọc file video: " + e.message);
                }
            }
            return;
        }

        // 3. Định dạng video khác (AVI, MKV, MOV): Chuyển mã sang WebM
        try {
            const cacheDir = ensureCacheDir();
            const cachedWebm = await transcodeVideo(wp, cacheDir);
            const stat = fs.statSync(cachedWebm);
            const range = req.headers.range;

            if (req.method === "HEAD") {
                res.writeHead(200, {
                    "Content-Length": stat.size,
                    "Content-Type": "video/webm",
                    "Accept-Ranges": "bytes"
                });
                res.end();
                return;
            }

            if (range) {
                const parts = range.replace(/bytes=/, "").split("-");
                const start = parseInt(parts[0], 10);
                const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
                const chunkSize = (end - start) + 1;

                res.writeHead(206, {
                    "Content-Range": `bytes ${start}-${end}/${stat.size}`,
                    "Accept-Ranges": "bytes",
                    "Content-Length": chunkSize,
                    "Content-Type": "video/webm"
                });
                fs.createReadStream(cachedWebm, { start, end }).pipe(res);
            } else {
                res.writeHead(200, {
                    "Content-Length": stat.size,
                    "Content-Type": "video/webm",
                    "Accept-Ranges": "bytes"
                });
                fs.createReadStream(cachedWebm).pipe(res);
            }
        } catch (e) {
            console.error("[Server] Lỗi phát video transcode:", e.message);
            if (!res.headersSent) {
                res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
                res.end("Lỗi chuyển mã video FFmpeg: " + e.message);
            }
        }
        return;
    }

    // Endpoint: /check-update
    if (req.url.startsWith("/check-update")) {
        const isForce = req.url.includes("force=true") || req.url.includes("force=1");
        const result = checkAndHealSpotifyUpdate(true, isForce);
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify(result, null, 2));
        return;
    }

    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Endpoint không tồn tại");
});

// ==========================================
// 11. WebSocket Upgrade Handshake (RFC 6455)
// ==========================================
server.on("upgrade", (req, socket, head) => {
    const key = req.headers["sec-websocket-key"];
    if (!key) {
        socket.destroy();
        return;
    }
    const GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
    const accept = crypto.createHash("sha1").update(key + GUID).digest("base64");
    const headers = [
        "HTTP/1.1 101 Switching Protocols",
        "Upgrade: websocket",
        "Connection: Upgrade",
        `Sec-WebSocket-Accept: ${accept}`
    ];
    socket.write(headers.join("\r\n") + "\r\n\r\n");
    wsClients.add(socket);
    console.log(`[WS] Client đã kết nối (Tổng client: ${wsClients.size})`);

    socket.on("data", (buffer) => {
        if (buffer.length > 0) {
            const opcode = buffer[0] & 0x0f;
            if (opcode === 0x8) {
                socket.end();
                wsClients.delete(socket);
            } else if (opcode === 0x9) {
                socket.write(Buffer.from([0x8a, 0x00]));
            }
        }
    });

    socket.on("close", () => {
        wsClients.delete(socket);
        console.log(`[WS] Client ngắt kết nối (Còn lại: ${wsClients.size})`);
    });

    socket.on("error", () => {
        wsClients.delete(socket);
    });

    // Gửi ngay trạng thái hình nền hiện tại cho client vừa kết nối
    try {
        const payload = getActiveWallpaperPayload();
        socket.write(createWsTextFrame(JSON.stringify(payload)));
    } catch (err) {
        console.error("[WS] Lỗi khi gửi payload khởi tạo:", err.message);
    }
});

// ==========================================
// 12. Quản lý vòng đời Server & Khởi động
// ==========================================
let retryCount = 0;
const MAX_RETRIES = 5;

server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
        retryCount++;
        if (retryCount > MAX_RETRIES) {
            console.error(`[Cổng ${PORT}] Vẫn đang bận sau ${MAX_RETRIES} lần thử lại. Thoát.`);
            process.exit(1);
        }
        console.error(`[Cổng ${PORT}] Đang bận. Thử lại lần ${retryCount}/${MAX_RETRIES} sau 15 giây...`);
        setTimeout(() => {
            try { server.close(); } catch (e) {}
            server.listen(PORT, "127.0.0.1");
        }, 15000);
    } else {
        console.error("[Server] Lỗi:", err);
    }
});

server.listen(PORT, "127.0.0.1", () => {
    retryCount = 0;
    console.log(`[WESync Server] Đang chạy tại http://127.0.0.1:${PORT}`);

    // Khởi tạo watcher
    initConfigWatcher();

    // Khởi chạy bộ kiểm tra phiên bản tự động (sau 10 giây và lặp lại mỗi 15 phút)
    setTimeout(() => {
        try { checkAndHealSpotifyUpdate(false); } catch (e) {}
    }, 10000);

    setInterval(() => {
        try { checkAndHealSpotifyUpdate(false); } catch (e) {}
    }, 15 * 60 * 1000);
});

process.on("uncaughtException", (err) => {
    console.error("[Uncaught Exception]:", err.message);
});

process.on("unhandledRejection", (reason) => {
    console.error("[Unhandled Rejection]:", reason);
});
