(function WESync() {
    let currentBg = "";
    let ignoredBg = "";
    let mediaEl = null;
    let isTranscoding = false;

    // Xóa các phần tử cũ nếu có (tránh trùng lặp khi nạp lại)
    const oldDebug = document.getElementById("we-sync-debug");
    if (oldDebug) oldDebug.remove();
    const oldVideo = document.getElementById("we-sync-video");
    if (oldVideo) oldVideo.remove();
    const oldImg = document.getElementById("we-sync-img");
    if (oldImg) oldImg.remove();
    const oldOverlay = document.getElementById("we-sync-overlay");
    if (oldOverlay) oldOverlay.remove();
    const oldPrompt = document.getElementById("we-sync-prompt");
    if (oldPrompt) oldPrompt.remove();

    // Lớp phủ bán trong suốt tĩnh tối ưu GPU (thay thế CSS brightness shader)
    function ensureOverlay() {
        let overlay = document.getElementById("we-sync-overlay");
        if (!overlay) {
            overlay = document.createElement("div");
            overlay.id = "we-sync-overlay";
            overlay.style.position = "fixed";
            overlay.style.top = "0";
            overlay.style.left = "0";
            overlay.style.width = "100vw";
            overlay.style.height = "100vh";
            overlay.style.zIndex = "-1";
            overlay.style.pointerEvents = "none";
            overlay.style.backgroundColor = "rgba(0, 0, 0, 0.58)";
            document.body.prepend(overlay);
        }
        return overlay;
    }

    const debugText = document.createElement("div");
    debugText.id = "we-sync-debug";
    debugText.style.position = "fixed";
    debugText.style.bottom = "24px";
    debugText.style.left = "24px";
    debugText.style.color = "rgba(255, 255, 255, 0.9)";
    debugText.style.fontSize = "13px";
    debugText.style.fontWeight = "500";
    debugText.style.zIndex = "99999";
    debugText.style.background = "rgba(18, 18, 18, 0.75)";
    debugText.style.padding = "10px 16px";
    debugText.style.borderRadius = "12px";
    debugText.style.boxShadow = "0 8px 24px rgba(0, 0, 0, 0.6)";
    debugText.style.border = "1px solid rgba(255, 255, 255, 0.1)";
    debugText.style.fontFamily = "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    debugText.style.backdropFilter = "blur(12px)";
    debugText.style.transition = "opacity 0.8s cubic-bezier(0.4, 0, 0.2, 1)";
    debugText.style.opacity = "1";
    debugText.innerText = "🔌 Đang khởi tạo module đồng bộ...";
    document.body.appendChild(debugText);

    let retryCount = 0;

    function showUpdatePrompt(newBg, isImage, isVideo) {
        if (document.getElementById("we-sync-prompt")) return;

        const prompt = document.createElement("div");
        prompt.id = "we-sync-prompt";
        prompt.style.position = "fixed";
        prompt.style.top = "24px";
        prompt.style.right = "24px";
        prompt.style.zIndex = "99999";
        prompt.style.background = "rgba(18, 18, 18, 0.95)";
        prompt.style.padding = "20px";
        prompt.style.borderRadius = "12px";
        prompt.style.boxShadow = "0 8px 32px rgba(0, 0, 0, 0.8)";
        prompt.style.border = "1px solid rgba(255, 255, 255, 0.2)";
        prompt.style.color = "white";
        prompt.style.fontFamily = "system-ui, -apple-system, sans-serif";
        
        prompt.innerHTML = `
            <div style="font-size: 15px; font-weight: bold; margin-bottom: 8px;">🌟 Phát hiện hình nền mới</div>
            <div style="font-size: 13px; color: #b3b3b3; margin-bottom: 20px;">Hình nền máy tính của bạn đã thay đổi. Bạn có muốn đồng bộ hình nền Spotify không?</div>
            <div style="display: flex; gap: 10px; justify-content: flex-end;">
                <button id="we-sync-btn-no" style="padding: 8px 16px; border-radius: 20px; border: 1px solid #727272; background: transparent; color: white; cursor: pointer; font-size: 12px; font-weight: bold; transition: background 0.2s;">Giữ nguyên</button>
                <button id="we-sync-btn-yes" style="padding: 8px 16px; border-radius: 20px; border: none; background: #1ed760; color: black; cursor: pointer; font-size: 12px; font-weight: bold; transition: transform 0.1s;">Đồng bộ ngay</button>
            </div>
        `;
        document.body.appendChild(prompt);

        document.getElementById("we-sync-btn-no").onmouseover = function() { this.style.background = "rgba(255,255,255,0.1)"; };
        document.getElementById("we-sync-btn-no").onmouseout = function() { this.style.background = "transparent"; };
        document.getElementById("we-sync-btn-yes").onmouseover = function() { this.style.transform = "scale(1.05)"; };
        document.getElementById("we-sync-btn-yes").onmouseout = function() { this.style.transform = "scale(1)"; };

        document.getElementById("we-sync-btn-yes").onclick = () => {
            prompt.remove();
            applyBackground(newBg, isImage, isVideo);
        };
        document.getElementById("we-sync-btn-no").onclick = () => {
            prompt.remove();
            ignoredBg = newBg;
        };
    }

    function applyBackground(bgFile, isImage, isVideo) {
        currentBg = bgFile;
        ignoredBg = "";
        
        if (mediaEl) { mediaEl.remove(); mediaEl = null; }
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
            mediaEl.style.zIndex = "-2";
            mediaEl.style.pointerEvents = "none";
            
            mediaEl.onload = () => {
                debugText.innerText = "✅ Đã đồng bộ với hình nền!";
                setTimeout(() => { debugText.style.opacity = "0"; }, 2500);
            };
            mediaEl.onerror = () => {
                debugText.style.opacity = "1";
                debugText.innerText = `⚠️ Không thể tải hình ảnh`;
                currentBg = "";
            };

            debugText.style.opacity = "1";
            debugText.innerText = "⏳ Đang tải hình nền tĩnh...";
            
            mediaEl.src = "http://127.0.0.1:8989/media?t=" + Date.now();
            document.body.prepend(mediaEl);
            ensureOverlay();
        } 
        else if (isVideo) {
            mediaEl = document.createElement("video");
            mediaEl.id = "we-sync-video";
            mediaEl.autoplay = true;
            mediaEl.loop = true;
            mediaEl.muted = true;
            mediaEl.setAttribute("muted", "");
            mediaEl.setAttribute("playsinline", "");
            mediaEl.playsInline = true;
            mediaEl.style.position = "fixed";
            mediaEl.style.top = "0";
            mediaEl.style.left = "0";
            mediaEl.style.width = "100vw";
            mediaEl.style.height = "100vh";
            mediaEl.style.objectFit = "cover";
            mediaEl.style.zIndex = "-2";
            mediaEl.style.pointerEvents = "none";

            mediaEl.addEventListener("error", function(e) {
                debugText.style.opacity = "1";
                const err = mediaEl.error;
                const code = err ? err.code : "Unknown";
                const msg = err ? err.message : "";
                debugText.innerText = `⚠️ Lỗi phát video (${code} - ${msg})`;
                currentBg = "";
                isTranscoding = false;
            });

            const onPlayingSuccess = function() {
                isTranscoding = false;
                debugText.innerText = "✅ Đã đồng bộ với hình nền!";
                setTimeout(() => {
                    if (debugText.innerText.includes("Đã đồng bộ")) {
                        debugText.style.opacity = "0";
                    }
                }, 2500);
            };

            mediaEl.addEventListener("playing", onPlayingSuccess);

            mediaEl.addEventListener("canplay", function() {
                isTranscoding = false;
                mediaEl.play().then(onPlayingSuccess).catch(function(err) {
                    if (err.name !== "AbortError") {
                        debugText.style.opacity = "1";
                        debugText.innerText = "⚠️ Trình duyệt chặn tự động phát (" + err.message + ")";
                    }
                });
            }, { once: true });

            debugText.style.opacity = "1";
            debugText.innerText = "⏳ Đang tối ưu chuyển mã video hình nền...";
            isTranscoding = true;
            
            mediaEl.src = "http://127.0.0.1:8989/media?t=" + Date.now();
            document.body.prepend(mediaEl);
            ensureOverlay();

            mediaEl.play().then(onPlayingSuccess).catch(function(err) {
                if (err.name !== "AbortError") {
                    console.log("Play pending canplay event:", err.message);
                }
            });
        }
    }

    // Cơ chế Smart Pause & Đảm bảo luôn phát mượt mà khi cửa sổ hiển thị
    function ensureVideoPlaying() {
        if (mediaEl && mediaEl.tagName === "VIDEO" && mediaEl.paused && !document.hidden) {
            mediaEl.play().catch(function() {});
        }
    }

    document.addEventListener("visibilitychange", function() {
        if (mediaEl && mediaEl.tagName === "VIDEO") {
            if (document.hidden) {
                mediaEl.pause();
            } else {
                mediaEl.play().catch(function() {});
            }
        }
        if (!document.hidden && !isTranscoding) {
            checkBg();
        }
    });

    window.addEventListener("focus", ensureVideoPlaying);
    document.addEventListener("click", ensureVideoPlaying);
    setInterval(ensureVideoPlaying, 3000);

    async function checkBg() {
        try {
            if (isTranscoding) {
                setTimeout(checkBg, 5000);
                return;
            }

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);

            const res = await fetch("http://127.0.0.1:8989/path", { signal: controller.signal });
            clearTimeout(timeoutId);

            if (!res.ok) {
                setTimeout(checkBg, 5000);
                return;
            }

            const bgFile = await res.text();
            if (!bgFile) {
                setTimeout(checkBg, 5000);
                return;
            }

            retryCount = 0;

            const isVideo = !!bgFile.toLowerCase().match(/\.(mp4|webm|avi|mkv|mov)$/);
            const isImage = !!bgFile.toLowerCase().match(/\.(jpg|jpeg|png|bmp|webp|gif)$/);

            if (!isVideo && !isImage) {
                debugText.style.opacity = "1";
                debugText.innerText = "⚠️ Hình nền hiện tại không thuộc định dạng video/ảnh được hỗ trợ.";
                document.body.style.backgroundImage = "none";
                if (mediaEl) { mediaEl.remove(); mediaEl = null; }
                currentBg = ""; 
                setTimeout(checkBg, 5000);
                return;
            }

            function isWindowsFallback(pathStr) {
                if (!pathStr) return false;
                const lower = pathStr.toLowerCase();
                return lower.includes("windows\\web\\wallpaper") || lower.includes("transcodedwallpaper") || lower.includes("img0.jpg");
            }

            if (bgFile !== currentBg && bgFile !== ignoredBg) {
                // Tự động chuyển ngay sang Wallpaper Engine nếu trước đó chỉ tạm nạp hình nền mặc định Windows lúc khởi động
                if (currentBg === "" || isWindowsFallback(currentBg)) {
                    applyBackground(bgFile, isImage, isVideo);
                } else {
                    showUpdatePrompt(bgFile, isImage, isVideo);
                }
            }
        } catch (e) {
            retryCount++;
            debugText.style.opacity = "1";
            if (retryCount <= 3) {
                debugText.innerText = "⏳ Đang chờ máy chủ khởi động... (" + retryCount + "/3)";
            } else {
                debugText.innerText = "🔌 Máy chủ chưa khởi động (vui lòng kiểm tra tiến trình nền)";
            }
        }

        // Tần số thích ứng: 5 giây khi hiển thị, 12 giây khi thu nhỏ/ẩn
        let pollDelay = 5000;
        if (document.hidden) {
            pollDelay = 12000;
        } else if (retryCount > 3) {
            pollDelay = 10000;
        }
        setTimeout(checkBg, pollDelay);
    }

    // =========================================================================
    // HỖ TRỢ TƯƠNG THÍCH SPOTIFY v1.3.4+ & CÁC EXTENSION (CAT-JAM, CONTROLS)
    // =========================================================================
    function initSpotifyLayoutBridge() {
        function patchBar() {
            // Đảm bảo không bị các container trung gian của Spotify v1.3.4+ phủ nền đen
            const root = document.querySelector('.Root');
            if (root) {
                const darkWrappers = root.querySelectorAll('.bokji1jrN2MBe7RA0384, .L5dM7nzQpMJtRkvZZBZL, [class*="bokji"]');
                darkWrappers.forEach(el => {
                    if (el.style.backgroundColor !== 'transparent') {
                        el.style.setProperty('background', 'transparent', 'important');
                        el.style.setProperty('background-color', 'transparent', 'important');
                    }
                });
            }

            const bar = document.querySelector('[data-testid="now-playing-bar"]');
            if (!bar) return;

            bar.classList.add('main-nowPlayingBar-container');

            const row = bar.firstElementChild;
            if (!row || row.children.length < 3) return;

            row.classList.add('main-nowPlayingBar-nowPlayingBar');

            const left = row.children[0];
            const center = row.children[1];
            const right = row.children[2];
            // extraControls là thẻ div chứa các nút điều khiển, loại trừ video cat
            const extraControls = right ? Array.from(right.children).find(el => el.tagName === 'DIV') : null;

            if (left && !left.classList.contains('main-nowPlayingBar-left')) {
                left.classList.add('main-nowPlayingBar-left');
            }
            if (center && !center.classList.contains('main-nowPlayingBar-center')) {
                center.classList.add('main-nowPlayingBar-center');
            }
            if (right && !right.classList.contains('main-nowPlayingBar-right')) {
                right.classList.add('main-nowPlayingBar-right');
            }
            if (extraControls && !extraControls.classList.contains('main-nowPlayingBar-extraControls')) {
                extraControls.classList.add('main-nowPlayingBar-extraControls');
            }

            // Dọn dẹp video cat trùng lặp nếu có
            const allCats = document.querySelectorAll('#catjam-webm');
            if (allCats.length > 1) {
                for (let i = 1; i < allCats.length; i++) allCats[i].remove();
            }
            if (allCats.length > 0) {
                allCats[0].classList.remove('main-nowPlayingBar-extraControls');
            }

            // Đảm bảo chú mèo Cat-Jam luôn được gắn vào thanh bên phải nếu extension cat-jam đang hoạt động
            const isCatjamEnabled = localStorage.getItem('catjam-settings.catjam-webm-position') !== null ||
                                    document.querySelector('script[src*="cat-jam"]') !== null;
            if (isCatjamEnabled && right && !document.getElementById('catjam-webm')) {
                const cat = document.createElement('video');
                cat.id = 'catjam-webm';
                cat.setAttribute('loop', 'true');
                cat.setAttribute('autoplay', 'true');
                cat.setAttribute('muted', 'true');
                cat.setAttribute('style', 'width: 65px; height: 65px;');
                let catSrc = 'https://github.com/BlafKing/spicetify-cat-jam-synced/raw/main/src/resources/catjam.webm';
                try {
                    const storedLink = JSON.parse(localStorage.getItem('catjam-settings.catjam-webm-link') || '{}')?.value;
                    if (storedLink) catSrc = storedLink;
                } catch(e) {}
                cat.src = catSrc;
                right.firstChild ? right.insertBefore(cat, right.firstChild) : right.appendChild(cat);
                if (window.Spicetify?.Player?.isPlaying()) {
                    cat.play().catch(() => {});
                }
            }
        }

        patchBar();
        const obs = new MutationObserver(() => {
            patchBar();
        });
        obs.observe(document.body, { childList: true, subtree: true });

        // Đồng bộ play/pause chú mèo khi người dùng bật/dừng nhạc
        if (window.Spicetify?.Player) {
            window.Spicetify.Player.addEventListener('onplaypause', () => {
                const cat = document.getElementById('catjam-webm');
                if (!cat) return;
                if (window.Spicetify.Player.isPlaying()) {
                    cat.play().catch(() => {});
                } else {
                    cat.pause();
                }
            });
        }
    }

    initSpotifyLayoutBridge();
    checkBg();
})();
