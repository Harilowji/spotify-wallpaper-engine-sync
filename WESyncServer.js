/**
 * Spotify x Wallpaper Engine Sync - Background Daemon Server
 * Developed & Re-engineered by Harilowji (https://github.com/Harilowji)
 * Original Template Concept by bobo
 * 
 * Tính năng chính:
 * 1. Tự động phát hiện Wallpaper Engine đang chạy hay tắt.
 * 2. Đọc file config.json của Wallpaper Engine để lấy hình nền hiện tại.
 * 3. Hỗ trợ tự động tìm kiếm đường dẫn Steam / Wallpaper Engine trên tất cả các ổ đĩa.
 * 4. Tự động chuyển đổi hình nền Scene (.pkg / project.json) sang ảnh preview chất lượng cao.
 * 5. Tự động chuyển mã video sang WebM (VP8/Vorbis) tối ưu cho Spotify bằng FFmpeg.
 * 6. Tự động dọn dẹp bộ nhớ đệm (Cache) chỉ giữ lại 10 hình nền gần nhất.
 * 7. Cơ chế Fallback thông minh: Dùng hình nền Windows nếu Wallpaper Engine tắt.
 */

const http = require("http");
const fs = require("fs");
const path = require("path");
const { execSync, exec, spawn } = require("child_process");
const crypto = require("crypto");
const os = require("os");

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

// Kiểm tra đồng bộ ngay lúc khởi động để không bị trễ khi máy tính vừa mở
try {
    const out = execSync('tasklist | findstr /i "wallpaper32.exe wallpaper64.exe ui32.exe"', { encoding: 'utf-8', windowsHide: true });
    isWeRunningCache = !!out && out.trim().length > 0;
} catch (e) {
    isWeRunningCache = false;
}
setInterval(checkWeRunning, 5000);


// Quản lý các tiến trình FFmpeg đang chuyển mã để tránh trùng lặp
const transcodingJobs = new Map();

let cachedWeConfigPath = null;
let cachedWindowsWallpaper = null;

// ==========================================
// 2. Theo dõi hình nền Windows Desktop (Fallback)
// ==========================================
function updateWindowsWallpaper() {
    exec('reg query "HKCU\\Control Panel\\Desktop" /v Wallpaper', (err, stdout) => {
        if (!err && stdout) {
            const match = stdout.match(/Wallpaper\s+REG_SZ\s+(.+)/i);
            if (match && match[1]) {
                const wpPath = match[1].trim();
                if (fs.existsSync(wpPath) && fs.statSync(wpPath).size > 0) {
                    cachedWindowsWallpaper = wpPath;
                    return;
                }
            }
        }

        // Fallback kiểm tra file TranscodedWallpaper của Windows
        const transcoded = path.join(process.env.APPDATA || "", "Microsoft\\Windows\\Themes\\TranscodedWallpaper");
        if (fs.existsSync(transcoded) && fs.statSync(transcoded).size > 0) {
            cachedWindowsWallpaper = transcoded;
            return;
        }

        // Fallback cuối cùng: Hình nền mặc định Windows
        const defaultWin = "C:\\Windows\\Web\\Wallpaper\\Windows\\img0.jpg";
        if (fs.existsSync(defaultWin)) {
            cachedWindowsWallpaper = defaultWin;
        }
    });
}
setInterval(updateWindowsWallpaper, 10000);
updateWindowsWallpaper();

// ==========================================
// 3. Tự động dò tìm Wallpaper Engine config.json
// ==========================================
function getWEConfigPath() {
    if (cachedWeConfigPath && fs.existsSync(cachedWeConfigPath)) {
        return cachedWeConfigPath;
    }

    const candidateBases = [];

    // Cách 1: Tìm qua Registry Steam App 431960
    try {
        const out = execSync('reg query "HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Steam App 431960" /v InstallLocation', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] });
        const match = out.match(/InstallLocation\s+REG_SZ\s+(.+)/i);
        if (match && match[1] && fs.existsSync(match[1].trim())) {
            candidateBases.push(match[1].trim());
        }
    } catch (e) {}

    // Cách 2: Tìm qua Registry Steam Path
    try {
        const out = execSync('reg query "HKCU\\Software\\Valve\\Steam" /v SteamPath', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] });
        const match = out.match(/SteamPath\s+REG_SZ\s+(.+)/i);
        if (match && match[1]) {
            const sPath = match[1].trim().replace(/\//g, "\\");
            candidateBases.push(path.join(sPath, "steamapps\\common\\wallpaper_engine"));
        }
    } catch (e) {}

    // Cách 3: Các đường dẫn phổ biến trên các phân vùng đĩa
    candidateBases.push(
        "D:\\Steam\\steamapps\\common\\wallpaper_engine",
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

    return path.join("C:\\Program Files (x86)\\Steam\\steamapps\\common\\wallpaper_engine", "config.json");
}

// ==========================================
// 4. Lấy hình nền Wallpaper Engine đang hoạt động (Tối ưu Cache I/O)
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
        return "";
    } catch (e) {
        return "";
    }
}

// ==========================================
// 5. Trích xuất Texture gốc HD/4K từ Wallpaper Engine Scene (.pkg)
// ==========================================
function extractPkgTexture(pkgPath, cacheDir) {
    try {
        const hash = crypto.createHash("md5").update(pkgPath).digest("hex");
        const cachedPng = path.join(cacheDir, `${hash}_hd.png`);
        const cachedJpg = path.join(cacheDir, `${hash}_hd.jpg`);

        if (fs.existsSync(cachedPng) && fs.statSync(cachedPng).size > 0) return cachedPng;
        if (fs.existsSync(cachedJpg) && fs.statSync(cachedJpg).size > 0) return cachedJpg;

        const fd = fs.openSync(pkgPath, "r");
        const headerLenBuf = Buffer.alloc(4);
        fs.readSync(fd, headerLenBuf, 0, 4, 0);
        const magicLen = headerLenBuf.readUInt32LE(0);

        if (magicLen <= 0 || magicLen > 32) {
            fs.closeSync(fd);
            return null;
        }

        const magicBuf = Buffer.alloc(magicLen);
        fs.readSync(fd, magicBuf, 0, magicLen, 4);
        const magic = magicBuf.toString("utf-8");

        if (!magic.startsWith("PKGV")) {
            fs.closeSync(fd);
            return null;
        }

        const countBuf = Buffer.alloc(4);
        fs.readSync(fd, countBuf, 0, 4, 4 + magicLen);
        const fileCount = countBuf.readUInt32LE(0);

        let curPos = 4 + magicLen + 4;
        let largestTex = null;

        for (let i = 0; i < fileCount; i++) {
            const nlBuf = Buffer.alloc(4);
            fs.readSync(fd, nlBuf, 0, 4, curPos);
            const nameLen = nlBuf.readUInt32LE(0);
            curPos += 4;

            const nameBuf = Buffer.alloc(nameLen);
            fs.readSync(fd, nameBuf, 0, nameLen, curPos);
            const name = nameBuf.toString("utf-8");
            curPos += nameLen;

            const metaBuf = Buffer.alloc(8);
            fs.readSync(fd, metaBuf, 0, 8, curPos);
            const offset = metaBuf.readUInt32LE(0);
            const size = metaBuf.readUInt32LE(4);
            curPos += 8;

            if (name.endsWith(".tex") || name.endsWith(".png") || name.endsWith(".jpg")) {
                if (!largestTex || size > largestTex.size) {
                    largestTex = { name, offset, size };
                }
            }
        }

        const headerEnd = curPos;

        if (!largestTex) {
            fs.closeSync(fd);
            return null;
        }

        // Đọc texture lớn nhất (ảnh nền chính của scene)
        const texOffset = headerEnd + largestTex.offset;
        const texBuf = Buffer.alloc(largestTex.size);
        fs.readSync(fd, texBuf, 0, largestTex.size, texOffset);
        fs.closeSync(fd);

        // Tìm kiếm cấu trúc ảnh PNG gốc
        const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
        const pngIdx = texBuf.indexOf(pngHeader);
        if (pngIdx !== -1) {
            const iend = texBuf.indexOf(Buffer.from([0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]), pngIdx);
            if (iend !== -1) {
                const pngData = texBuf.slice(pngIdx, iend + 8);
                fs.writeFileSync(cachedPng, pngData);
                cleanupOldCache(cacheDir);
                return cachedPng;
            }
        }

        // Tìm kiếm cấu trúc ảnh JPEG gốc
        const jpgHeader = Buffer.from([0xff, 0xd8, 0xff]);
        const jpgIdx = texBuf.indexOf(jpgHeader);
        if (jpgIdx !== -1) {
            const eoi = texBuf.indexOf(Buffer.from([0xff, 0xd9]), jpgIdx);
            if (eoi !== -1) {
                const jpgData = texBuf.slice(jpgIdx, eoi + 2);
                fs.writeFileSync(cachedJpg, jpgData);
                cleanupOldCache(cacheDir);
                return cachedJpg;
            }
        }

        return null;
    } catch (e) {
        console.error("[PKG Extractor] Lỗi trích xuất:", e.message);
        return null;
    }
}

// ==========================================
// 6. Phân giải file media (Hỗ trợ Scene HD/4K, Video & Ảnh - Có Cache)
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

    // Nếu là file video hoặc ảnh trực tiếp
    if (ext.match(/\.(mp4|webm|avi|mkv|mov|jpg|jpeg|png|bmp|webp|gif)$/)) {
        return rawPath;
    }

    // Nếu là Scene Wallpaper Engine (.pkg)
    if (ext === ".pkg") {
        const cacheDir = ensureCacheDir();
        const hdImage = extractPkgTexture(rawPath, cacheDir);
        if (hdImage && fs.existsSync(hdImage) && fs.statSync(hdImage).size > 0) {
            return hdImage;
        }
    }

    const dir = path.dirname(rawPath);

    // Nếu rawPath không phải đuôi .pkg nhưng trong thư mục có file .pkg (ví dụ scene.json, gifscene.json)
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

    // Nếu không trích xuất được HD từ .pkg hoặc là Web Wallpaper (.html)
    // Tự động tìm ảnh preview trong thư mục workshop
    const candidates = [
        path.join(dir, "preview.jpg"),
        path.join(dir, "preview.png"),
        path.join(dir, "preview.gif"),
        path.join(dir, "preview.webp")
    ];

    for (const c of candidates) {
        if (fs.existsSync(c) && fs.statSync(c).size > 0) {
            return c;
        }
    }

    // Kiểm tra project.json để tìm ảnh preview hoặc background
    const projectJson = path.join(dir, "project.json");
    if (fs.existsSync(projectJson)) {
        try {
            const data = JSON.parse(fs.readFileSync(projectJson, "utf-8"));
            if (data.preview) {
                const prev = path.join(dir, data.preview.replace(/\//g, "\\"));
                if (fs.existsSync(prev) && fs.statSync(prev).size > 0) return prev;
            }
            if (data.general && data.general.properties && data.general.properties.file) {
                const subFile = path.join(dir, data.general.properties.file.value || "");
                if (fs.existsSync(subFile) && fs.statSync(subFile).size > 0) return subFile;
            }
        } catch (e) {}
    }

    // Kiểm tra nếu rawPath là file media hợp lệ
    const finalExt = path.extname(rawPath).toLowerCase();
    if (finalExt.match(/\.(mp4|webm|avi|mkv|mov|jpg|jpeg|png|bmp|webp|gif)$/)) {
        return rawPath;
    }

    // Nếu hoàn toàn không tìm thấy media hợp lệ từ Wallpaper Engine
    // Fallback thông minh về hình nền mặc định Windows chất lượng cao
    if (cachedWindowsWallpaper && fs.existsSync(cachedWindowsWallpaper)) {
        return cachedWindowsWallpaper;
    }

    return rawPath;
}

// ==========================================
// 7. Quản lý thư mục Cache và Tự động Dọn dẹp (Tối ưu I/O)
// ==========================================
function ensureCacheDir() {
    const tempDir = path.join(os.tmpdir(), "spotify_we_cache");
    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
    }
    return tempDir;
}

function cleanupOldCache(tempDir) {
    try {
        const files = fs.readdirSync(tempDir)
            .filter(f => f.endsWith(".webm") || f.endsWith(".png") || f.endsWith(".jpg"))
            .map(f => ({
                name: f,
                time: fs.statSync(path.join(tempDir, f)).mtime.getTime()
            }))
            .sort((a, b) => b.time - a.time);

        if (files.length > 15) {
            for (let i = 15; i < files.length; i++) {
                try {
                    fs.unlinkSync(path.join(tempDir, files[i].name));
                } catch (e) {}
            }
        }
    } catch (e) {}
}

// Tìm đường dẫn FFmpeg thực tế
function getFFmpegPath() {
    if (process.env.FFMPEG_PATH && fs.existsSync(process.env.FFMPEG_PATH)) {
        return process.env.FFMPEG_PATH;
    }
    const wingetFFmpeg = path.join(process.env.LOCALAPPDATA || "", "Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe");
    if (fs.existsSync(wingetFFmpeg)) {
        try {
            const dirs = fs.readdirSync(wingetFFmpeg);
            for (const d of dirs) {
                const bin = path.join(wingetFFmpeg, d, "bin\\ffmpeg.exe");
                if (fs.existsSync(bin)) return bin;
            }
        } catch (e) {}
    }
    return "ffmpeg";
}

// ==========================================
// 8. Chuyển mã Video sang WebM bằng FFmpeg (Tối ưu Real-time CPU & Không nén tiếng thừa)
// ==========================================
function transcodeVideo(wp, cacheDir) {
    if (wp.toLowerCase().endsWith(".webm")) {
        return Promise.resolve(wp);
    }

    const hash = crypto.createHash("md5").update(wp).digest("hex");
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
        console.log(`[FFmpeg] Đang chuyển mã tối ưu video ${path.basename(wp)} sang WebM...`);
        const ffmpegExe = getFFmpegPath();

        const args = [
            "-y", "-i", wp,
            "-t", "30",
            "-vf", "scale=-1:'min(1080,ih)'",
            "-r", "30",
            "-c:v", "libvpx", "-b:v", "4M", "-crf", "26", "-deadline", "realtime", "-cpu-used", "8", "-threads", "4",
            "-an",
            "-f", "webm",
            tmpWebm
        ];

        const ffmpeg = spawn(ffmpegExe, args, { windowsHide: true });

        ffmpeg.on("close", (code) => {
            transcodingJobs.delete(hash);
            if (code !== 0) {
                if (fs.existsSync(tmpWebm)) {
                    try { fs.unlinkSync(tmpWebm); } catch (e) {}
                }
                reject(new Error(`FFmpeg kết thúc với mã lỗi ${code}`));
            } else {
                try {
                    if (fs.existsSync(tmpWebm)) {
                        fs.renameSync(tmpWebm, cachedWebm);
                        cleanupOldCache(cacheDir);
                    }
                    console.log(`[FFmpeg] Chuyển mã hoàn tất: ${hash}.webm`);
                    resolve(cachedWebm);
                } catch (e) {
                    reject(e);
                }
            }
        });

        ffmpeg.on("error", (err) => {
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

// Kiểm tra loại file ảnh
function isImageFile(filePath) {
    if (!filePath || !fs.existsSync(filePath)) return false;
    const ext = path.extname(filePath).toLowerCase();
    if (ext.match(/\.(jpg|jpeg|png|bmp|webp|gif)$/)) return true;

    // Kiểm tra magic bytes phòng trường hợp file không có đuôi
    try {
        const fd = fs.openSync(filePath, "r");
        const buf = Buffer.alloc(8);
        fs.readSync(fd, buf, 0, 8, 0);
        fs.closeSync(fd);

        if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return true; // JPEG
        if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return true; // PNG
        if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) return true; // GIF
    } catch (e) {}

    return false;
}

function getImageMime(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === ".png") return "image/png";
    if (ext === ".gif") return "image/gif";
    if (ext === ".webp") return "image/webp";
    if (ext === ".bmp") return "image/bmp";
    return "image/jpeg";
}

// ==========================================
// 8. Bộ tự động kiểm tra phiên bản & Khôi phục Mod Spotify (Auto-Healer Sentinel)
// ==========================================
let isHealing = false;

function checkAndHealSpotifyUpdate(isManual = false, isForce = false) {
    if (isHealing) return { status: "busy", message: "Đang trong tiến trình khôi phục mod..." };

    const spotifyExe = path.join(process.env.APPDATA || "", "Spotify", "Spotify.exe");
    const configIni = path.join(process.env.APPDATA || "", "spicetify", "config-xpui.ini");
    const stateFile = path.join(process.env.APPDATA || "", "WESync", "spotify_version_state.json");
    const xpuiDir = path.join(process.env.APPDATA || "", "Spotify", "Apps", "xpui");

    if (!fs.existsSync(spotifyExe) || !fs.existsSync(configIni)) {
        return { status: "not_found", message: "Không tìm thấy file cài đặt Spotify hoặc Spicetify trên máy" };
    }

    try {
        const stat = fs.statSync(spotifyExe);
        const currentMtime = stat.mtimeMs;
        const currentSize = stat.size;

        let savedState = null;
        if (fs.existsSync(stateFile)) {
            try { savedState = JSON.parse(fs.readFileSync(stateFile, "utf-8")); } catch (e) {}
        }

        // Nếu kiểm tra tự động và mtime/size chưa đổi, thư mục xpui vẫn còn -> Đang hoạt động bình thường
        if (!isManual && !isForce && savedState && savedState.mtime === currentMtime && savedState.size === currentSize && fs.existsSync(xpuiDir)) {
            return { status: "up_to_date", message: "Spotify vẫn ở phiên bản hiện tại, mod hoạt động bình thường." };
        }

        // Đọc phiên bản ProductVersion hiện tại của Spotify.exe
        let currentProductVersion = "";
        try {
            const out = execSync(`powershell -NoProfile -Command "(Get-Item '${spotifyExe}').VersionInfo.ProductVersion"`, { encoding: "utf-8", timeout: 6000, windowsHide: true });
            if (out) currentProductVersion = out.trim();
        } catch (e) {}

        // Đọc phiên bản đã backup trong config-xpui.ini của Spicetify
        let backupVersion = "";
        try {
            const iniText = fs.readFileSync(configIni, "utf-8");
            const m = iniText.match(/\[Backup\][\s\S]*?version\s*=\s*([^\r\n]+)/i);
            if (m) backupVersion = m[1].trim();
        } catch (e) {}

        // Nếu phiên bản khớp nhau và thư mục xpui vẫn tồn tại -> Cập nhật trạng thái và trả về kết quả ngay lập tức
        if (!isForce && currentProductVersion && backupVersion.startsWith(currentProductVersion) && fs.existsSync(xpuiDir)) {
            fs.writeFileSync(stateFile, JSON.stringify({ mtime: currentMtime, size: currentSize, version: currentProductVersion, lastChecked: Date.now() }, null, 2));
            return {
                status: "up_to_date",
                message: "Spotify đang ở phiên bản mới nhất và mod đang hoạt động hoàn hảo!",
                currentVersion: currentProductVersion,
                backupVersion: backupVersion
            };
        }

        // PHÁT HIỆN SPOTIFY VỪA CẬP NHẬT HOẶC MẤT MOD!
        isHealing = true;
        console.log(`[Auto-Healer] 🚨 Phát hiện Spotify vừa cập nhật (Hiện tại: ${currentProductVersion || "Mới"}, Backup cũ: ${backupVersion})!`);
        console.log("[Auto-Healer] 🛠️ Đang tự động dọn dẹp và khôi phục mod cho phiên bản mới...");

        // Kiểm tra xem Spotify có đang chạy không
        let wasRunning = false;
        try {
            const taskOut = execSync('tasklist /fi "imagename eq spotify.exe"', { encoding: "utf-8", windowsHide: true });
            if (taskOut.toLowerCase().includes("spotify.exe")) {
                wasRunning = true;
                execSync("taskkill /f /im spotify.exe", { windowsHide: true });
                execSync('powershell -NoProfile -Command "Start-Sleep -Seconds 2"', { windowsHide: true });
            }
        } catch (e) {}

        // Thực hiện chu kỳ khôi phục và nạp lại Spicetify
        try {
            execSync("spicetify restore", { windowsHide: true });
            execSync("spicetify clear", { windowsHide: true });
            execSync("spicetify backup apply -n", { windowsHide: true });
        } catch (err) {
            console.error("[Auto-Healer] Lỗi khi chạy lệnh spicetify:", err.message);
        }

        // Ghi lại trạng thái mới
        fs.writeFileSync(stateFile, JSON.stringify({
            mtime: currentMtime,
            size: currentSize,
            version: currentProductVersion,
            lastChecked: Date.now(),
            lastHealed: Date.now()
        }, null, 2));

        console.log("[Auto-Healer] ✅ Đã tự động cập nhật và khôi phục mod thành công!");

        // Khởi động lại Spotify nếu trước đó đang mở
        if (wasRunning) {
            try {
                execSync('powershell -NoProfile -Command "Start-Process \'cmd.exe\' -ArgumentList \'/c start spotify:\'"', { windowsHide: true });
            } catch (e) {}
        }

        isHealing = false;
        return {
            status: "healed",
            message: "Đã tự động nhận diện bản cập nhật và nạp lại mod thành công!",
            currentVersion: currentProductVersion,
            backupVersion: backupVersion
        };
    } catch (err) {
        isHealing = false;
        console.error("[Auto-Healer] Lỗi trong quá trình kiểm tra:", err.message);
        return { status: "error", message: err.message };
    }
}

// ==========================================
// 9. Khởi tạo HTTP Web Server
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

    // Endpoint: /check-update - Kích hoạt kiểm tra và tự động khôi phục phiên bản Spotify
    if (req.url.startsWith("/check-update")) {
        const isForce = req.url.includes("force=true") || req.url.includes("force=1");
        const result = checkAndHealSpotifyUpdate(true, isForce);
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify(result, null, 2));
        return;
    }

    // Endpoint: /path - Trả về đường dẫn hình nền hiện tại
    if (req.url.startsWith("/path")) {
        let wp = "";
        const weWp = getCurrentWallpaper();

        if (isWeRunningCache && weWp && fs.existsSync(weWp)) {
            wp = weWp;
        } else if (weWp && fs.existsSync(weWp)) {
            // Kiểm tra tức thời phòng trường hợp Wallpaper Engine vừa khởi động cùng Windows
            try {
                const out = execSync('tasklist | findstr /i "wallpaper32.exe wallpaper64.exe ui32.exe"', { encoding: 'utf-8', windowsHide: true });
                if (out && out.trim().length > 0) {
                    isWeRunningCache = true;
                    wp = weWp;
                }
            } catch (e) {}
        }

        // Fallback sang hình nền Windows nếu Wallpaper Engine không hoạt động
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
            try {
                const out = execSync('tasklist | findstr /i "wallpaper32.exe wallpaper64.exe ui32.exe"', { encoding: 'utf-8', windowsHide: true });
                if (out && out.trim().length > 0) {
                    isWeRunningCache = true;
                    wp = weWp;
                }
            } catch (e) {}
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

        // 2. Chuyển mã và truyền video WebM
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
            console.error("[Server] Lỗi phát video:", e.message);
            if (!res.headersSent) {
                res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
                res.end("Lỗi chuyển mã video FFmpeg: " + e.message);
            }
        }
        return;
    }

    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Endpoint không tồn tại");
});

// Xử lý cổng đang bận, thử lại tối đa 5 lần
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

    // Khởi chạy bộ kiểm tra phiên bản tự động (sau khi khởi động 10 giây và lặp lại mỗi 15 phút)
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
