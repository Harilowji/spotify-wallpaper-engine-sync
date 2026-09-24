/**
 * Spotify x Wallpaper Engine Sync - Spicetify Extension
 * Developed & Re-engineered by Harilowji (https://github.com/Harilowji)
 * Version: 2.1.0
 * 
 * Injects dynamic background and real-time sync into Spotify desktop client.
 */

(function WESync() {
    let currentBg = "";
    let mediaEl = null;
    let isTranscoding = false;
    let retryCount = 0;

    // Clear stale elements on hot reload
    const staleIds = ["we-sync-debug", "we-sync-video", "we-sync-img", "we-sync-prompt"];
    staleIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.remove();
    });

    // Create stylish status pill badge
    const debugText = document.createElement("div");
    debugText.id = "we-sync-debug";
    debugText.style.position = "fixed";
    debugText.style.bottom = "24px";
    debugText.style.left = "24px";
    debugText.style.color = "rgba(255, 255, 255, 0.95)";
    debugText.style.fontSize = "13px";
    debugText.style.fontWeight = "600";
    debugText.style.zIndex = "99999";
    debugText.style.background = "rgba(18, 18, 18, 0.85)";
    debugText.style.padding = "10px 18px";
    debugText.style.borderRadius = "20px";
    debugText.style.boxShadow = "0 8px 30px rgba(0, 0, 0, 0.7)";
    debugText.style.border = "1px solid rgba(255, 255, 255, 0.12)";
    debugText.style.fontFamily = "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    debugText.style.backdropFilter = "blur(16px)";
    debugText.style.transition = "opacity 0.6s cubic-bezier(0.4, 0, 0.2, 1), transform 0.3s ease";
    debugText.style.opacity = "1";
    debugText.innerText = "🔌 Đang khởi tạo kết nối Wallpaper Sync...";
    document.body.appendChild(debugText);

    // Apply resolved background media to DOM
    function applyBackground(bgFile, isImage, isVideo) {
        currentBg = bgFile;

        if (mediaEl) {
            mediaEl.remove();
            mediaEl = null;
        }
        document.body.style.backgroundImage = "none";

        if (isImage) {
            mediaEl = document.createElement("img");
            mediaEl.id = "we-sync-img";
            mediaEl.style.position = "fixed";
            mediaEl.style.top = "0";
            mediaEl.style.left = "0";
            mediaEl.style.width = "100vw";
            mediaEl.style.height = "100vh";
            mediaEl.style.objectFit = "cover";
            mediaEl.style.zIndex = "0";
            mediaEl.style.pointerEvents = "none";
            mediaEl.style.filter = "brightness(0.42)";
            mediaEl.style.transition = "opacity 0.6s ease";

            mediaEl.onload = () => {
                debugText.style.opacity = "1";
                debugText.innerText = "✅ Đã đồng bộ với hình nền!";
                setTimeout(() => { debugText.style.opacity = "0"; }, 2500);
            };
            mediaEl.onerror = () => {
                debugText.style.opacity = "1";
                debugText.innerText = "⚠️ Không thể tải hình ảnh";
                currentBg = "";
            };

            debugText.style.opacity = "1";
            debugText.innerText = "⏳ Đang tải hình nền...";

            mediaEl.src = "http://127.0.0.1:8989/media?t=" + Date.now();
            document.body.prepend(mediaEl);
        } else if (isVideo) {
            mediaEl = document.createElement("video");
            mediaEl.id = "we-sync-video";
            mediaEl.autoplay = true;
            mediaEl.loop = true;
            mediaEl.muted = true;
            mediaEl.playsInline = true;
            mediaEl.style.position = "fixed";
            mediaEl.style.top = "0";
            mediaEl.style.left = "0";
            mediaEl.style.width = "100vw";
            mediaEl.style.height = "100vh";
            mediaEl.style.objectFit = "cover";
            mediaEl.style.zIndex = "0";
            mediaEl.style.pointerEvents = "none";
            mediaEl.style.filter = "brightness(0.42)";

            mediaEl.addEventListener("error", function() {
                debugText.style.opacity = "1";
                const err = mediaEl.error;
                const code = err ? err.code : "N/A";
                const msg = err ? err.message : "";
                debugText.innerText = `⚠️ Lỗi phát video (${code} - ${msg})`;
                currentBg = "";
                isTranscoding = false;
            });

            mediaEl.addEventListener("playing", function() {
                isTranscoding = false;
                debugText.style.opacity = "1";
                debugText.innerText = "✅ Đã đồng bộ với hình nền!";
                setTimeout(() => { debugText.style.opacity = "0"; }, 2500);
            });

            debugText.style.opacity = "1";
            debugText.innerText = "⏳ Đang tối ưu chuyển mã video hình nền (mất ~5-10s)...";
            isTranscoding = true;

            mediaEl.src = "http://127.0.0.1:8989/media?t=" + Date.now();
            document.body.prepend(mediaEl);
            mediaEl.load();
            mediaEl.play().catch(function(err) {
                debugText.style.opacity = "1";
                debugText.innerText = "⚠️ Trình duyệt chặn tự động phát (" + err.message + ")";
                isTranscoding = false;
                currentBg = "";
            });
        }
    }

    // Poll the local server for active wallpaper changes
    async function checkBg() {
        try {
            if (isTranscoding) {
                setTimeout(checkBg, 4000);
                return;
            }

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 4000);

            const res = await fetch("http://127.0.0.1:8989/path", { signal: controller.signal });
            clearTimeout(timeoutId);

            if (!res.ok) {
                setTimeout(checkBg, 4000);
                return;
            }

            const bgFile = await res.text();
            if (!bgFile) {
                setTimeout(checkBg, 4000);
                return;
            }

            retryCount = 0;

            const isVideo = !!bgFile.toLowerCase().match(/\.(mp4|webm|avi|mkv|mov)$/);
            const isImage = !!bgFile.toLowerCase().match(/\.(jpg|jpeg|png|bmp|webp|gif)$/) || !bgFile.includes('.');

            if (!isVideo && !isImage) {
                debugText.style.opacity = "1";
                debugText.innerText = "⚠️ Định dạng hình nền hiện tại chưa được hỗ trợ.";
                document.body.style.backgroundImage = "none";
                if (mediaEl) {
                    mediaEl.remove();
                    mediaEl = null;
                }
                currentBg = "";
                setTimeout(checkBg, 4000);
                return;
            }

            if (bgFile !== currentBg) {
                applyBackground(bgFile, isImage, isVideo);
            }
        } catch (e) {
            retryCount++;
            debugText.style.opacity = "1";
            if (retryCount <= 3) {
                debugText.innerText = `⏳ Đang chờ máy chủ khởi động... (${retryCount}/3)`;
            } else {
                debugText.innerText = "🔌 Máy chủ đồng bộ chưa chạy (kiểm tra WESyncServer)";
            }
        }
        setTimeout(checkBg, retryCount > 3 ? 8000 : 3000);
    }

    checkBg();
})();
