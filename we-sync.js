/**
 * Spotify Wallpaper Engine Sync - Spicetify Extension
 * Version: v2.8.2 (Ultra-Clear Spatial Refinement & Now-Playing-View Optimization)
 * Repository: https://github.com/Harilowji/spotify-wallpaper-engine-sync
 */
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
    const oldToast = document.getElementById("we-sync-toast");
    if (oldToast) oldToast.remove();

    // =========================================================================
    // 1. QUẢN LÝ CHẾ ĐỘ TRONG SUỐT (PURE TRANSPARENT / CONTRAST / FROSTED GLASS)
    // =========================================================================
    const TRANSPARENCY_MODES = {
        pure: {
            name: "Pure Transparent (100% Trong Suốt)",
            overlayColor: "rgba(0, 0, 0, 0.10)",
            bodyClass: "we-mode-pure"
        },
        contrast: {
            name: "Crystal Contrast (Tăng Tương Phản)",
            overlayColor: "rgba(0, 0, 0, 0.38)",
            bodyClass: "we-mode-contrast"
        },
        frosted: {
            name: "Frosted Glass (Kính Mờ Phân Lớp)",
            overlayColor: "rgba(0, 0, 0, 0.22)",
            bodyClass: "we-mode-frosted"
        }
    };

    let currentModeKey = localStorage.getItem("we-sync-transparency-mode") || "pure";
    if (!TRANSPARENCY_MODES[currentModeKey]) currentModeKey = "pure";

    let toastTimeout = null;
    function showToast(msg) {
        let toast = document.getElementById("we-sync-toast");
        if (!toast) {
            toast = document.createElement("div");
            toast.id = "we-sync-toast";
            document.body.appendChild(toast);
        }
        toast.innerText = msg;
        toast.classList.add("we-toast-show");
        if (toastTimeout) clearTimeout(toastTimeout);
        toastTimeout = setTimeout(() => {
            toast.classList.remove("we-toast-show");
        }, 2500);

        if (window.Spicetify?.showNotification) {
            try {
                window.Spicetify.showNotification(msg);
            } catch (e) {}
        }
    }

    function applyTransparencyMode(modeKey, triggerToast = false) {
        if (!TRANSPARENCY_MODES[modeKey]) modeKey = "pure";
        currentModeKey = modeKey;
        localStorage.setItem("we-sync-transparency-mode", modeKey);

        const mode = TRANSPARENCY_MODES[modeKey];
        const overlay = ensureOverlay();
        if (overlay) {
            overlay.style.backgroundColor = mode.overlayColor;
        }

        document.body.classList.remove("we-mode-pure", "we-mode-contrast", "we-mode-frosted");
        document.body.classList.add(mode.bodyClass);

        if (triggerToast) {
            showToast(`✨ Chế độ hiển thị: ${mode.name}`);
        }
    }

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
            const mode = TRANSPARENCY_MODES[currentModeKey] || TRANSPARENCY_MODES.pure;
            overlay.style.backgroundColor = mode.overlayColor;
            overlay.style.transition = "background-color 0.3s ease";
            document.body.prepend(overlay);
        }
        return overlay;
    }

    const debugText = document.createElement("div");
    debugText.id = "we-sync-debug";
    debugText.style.position = "fixed";
    debugText.style.bottom = "24px";
    debugText.style.left = "24px";
    debugText.style.pointerEvents = "none";
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

    // =========================================================================
    // 2. PHÍM TẮT ALT + T: CHUYỂN NHANH CHẾ ĐỘ TRONG SUỐT
    // =========================================================================
    window.addEventListener("keydown", function(e) {
        if (e.altKey && (e.key === "t" || e.key === "T" || e.code === "KeyT")) {
            e.preventDefault();
            const order = ["pure", "contrast", "frosted"];
            const nextIdx = (order.indexOf(currentModeKey) + 1) % order.length;
            applyTransparencyMode(order[nextIdx], true);
        }
    });

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

        let pollDelay = 5000;
        if (document.hidden) {
            pollDelay = 12000;
        } else if (retryCount > 3) {
            pollDelay = 10000;
        }
        setTimeout(checkBg, pollDelay);
    }

    // =========================================================================
    // 3. ENFORCE FULL TRANSPARENCY (TRIỆT TIÊU KHỐI NỀN ĐEN PLAYLIST, TOPBAR & LYRICS)
    // =========================================================================
    function clearElementBg(el) {
        if (!el || !el.style) return;
        if (el.style.getPropertyValue("background-color") !== "transparent") {
            el.style.setProperty("background", "transparent", "important");
            el.style.setProperty("background-color", "transparent", "important");
            el.style.setProperty("background-image", "none", "important");
            el.style.setProperty("box-shadow", "none", "important");
        }
        if (el.style.getPropertyValue("--lyrics-color-background") && el.style.getPropertyValue("--lyrics-color-background") !== "transparent") {
            el.style.setProperty("--lyrics-color-background", "transparent", "important");
        }
    }

    function enforceFullTransparency() {
        try {
            // Các selector trọng tâm của Spotify trang Playlist, Album, Home, Topbar và Lyrics
            const targetSelectors = [
                'header',
                'header > div',
                '[data-testid="topbar"]',
                '[data-testid="topbar"] > div',
                '.main-topBar-container',
                '.main-topBar-background',
                '.main-topBar-overlay',
                '.main-trackList-trackListHeader',
                '.main-trackList-trackListHeaderStuck',
                '[data-testid="tracklist-header"]',
                '[data-testid="lyrics-page"]',
                '[data-testid="lyrics-page"] > div',
                '[data-testid="fullscreen-lyric"]',
                '[data-testid="lyrics-cinema"]',
                '.Root__lyrics-cinema',
                '.main-lyricsCinema-container',
                '.main-lyricsCinema-container > div',
                '.lyrics-lyrics-background',
                '.lyrics-lyrics-container',
                '.lyrics-lyrics-contentContainer',
                'section[data-testid="playlist-page"]',
                'section[data-testid="playlist-page"] > div',
                '[data-testid="playlist-tracklist"]',
                '[data-testid="playlist-tracklist"] > div',
                '[data-testid="action-bar-row"]',
                '[data-testid="action-bar"]',
                '.main-actionBar-ActionBar',
                '.main-actionBarBackground-background',
                '.main-entityHeader-backgroundColor',
                '.main-entityHeader-background',
                '.main-entityHeader-overlay',
                '[data-testid="overscroll-background"]',
                '[data-seamless-gradient]',
                '#Desktop_LeftSidebar_Id',
                '#Desktop_LeftSidebar_Id nav',
                '#Desktop_LeftSidebar_Id nav > div',
                '.YourLibraryX',
                '[class*="YourLibrary"]',
                '.Root__right-sidebar aside'
            ];

            const elements = document.querySelectorAll(targetSelectors.join(', '));
            elements.forEach(el => clearElementBg(el));

            // Quét các thẻ div mang inline background-color, linear-gradient hoặc --lyrics-color được gán động
            const styledDivs = document.querySelectorAll(`
                .main-view-container__scroll-node-child div[style*="background"],
                section[data-testid] div[style*="background"],
                header div[style*="background"],
                [data-testid="topbar"] div[style*="background"],
                [data-testid="lyrics-page"] div[style*="background"],
                .main-lyricsCinema-container div[style*="background"],
                .Root__right-sidebar div[style*="background"],
                aside div[style*="background"],
                [data-encore-id="card"] div[style*="background"],
                [data-testid="browse-card"] div[style*="background"],
                div[style*="--lyrics-color"]
            `);

            styledDivs.forEach(el => {
                // 1. Bảo vệ các phần tử media, chú mèo, thông báo
                if (
                    el.tagName === 'IMG' ||
                    el.id === 'we-sync-overlay' ||
                    el.id === 'we-sync-video' ||
                    el.id === 'we-sync-img' ||
                    el.id === 'we-sync-toast' ||
                    el.id === 'we-sync-debug' ||
                    el.id === 'catjam-webm' ||
                    el.closest('#catjam-webm')
                ) {
                    return;
                }

                // 2. Bảo vệ ảnh bìa (backgroundImage dạng url(...) như "About the artist" / Header banner)
                const bgImg = el.style.backgroundImage || '';
                if (bgImg.includes('url(')) {
                    return;
                }

                // 3. Bảo vệ thanh tiến trình nhạc và thanh âm lượng
                if (
                    el.closest('.playback-bar') ||
                    el.closest('.volume-bar') ||
                    el.closest('[data-testid*="progress"]') ||
                    el.closest('[role="progressbar"]') ||
                    el.classList.contains('x-progressBar-progressBarBg') ||
                    el.classList.contains('x-progressBar-fillColor')
                ) {
                    return;
                }

                // 4. Bảo vệ nút bấm Encore chính (Play/Pause xanh lá/trắng, Close button)
                if (
                    el.closest('[data-testid="play-button"]') ||
                    el.closest('[data-testid="control-button-playpause"]') ||
                    el.classList.contains('main-playButton-PlayButton') ||
                    el.closest('.main-playButton-PlayButton') ||
                    el.closest('.encore-bright-accent-set') ||
                    el.closest('.encore-inverted-light-set') ||
                    el.getAttribute('data-encore-id') === 'buttonPrimary' ||
                    el.closest('button[data-encore-id="buttonPrimary"]') ||
                    el.closest('button[aria-label="Close"]') ||
                    el.closest('.main-playlistEditDetailsModal-closeBtn')
                ) {
                    return;
                }

                // 5. Bảo vệ Context Menu, Popup, Dialog, Tooltip, Modals & Portals
                if (
                    el.closest('[role="dialog"]') ||
                    el.closest('[role="menu"]') ||
                    el.closest('[data-tippy-root]') ||
                    el.closest('.main-contextMenu-menu') ||
                    el.closest('.GenericModal__overlay') ||
                    el.closest('.GenericModal') ||
                    el.closest('.ReactModalPortal')
                ) {
                    return;
                }

                // 6. Bảo vệ cover-art hoặc card image
                const dt = el.getAttribute('data-testid');
                if (dt === 'background-image' || dt === 'cover-art-image' || dt === 'card-image') {
                    return;
                }

                clearElementBg(el);
            });

            // 7. Đảm bảo Cover Art trong Now Playing View không bị Canvas rỗng làm ẩn
            const npvCover = document.querySelector('.main-nowPlayingView-coverArtContainer > div:first-child');
            if (npvCover) {
                const canvasVideo = document.querySelector('.canvasVideoContainerNPV video');
                if (!canvasVideo && npvCover.style.visibility !== 'visible') {
                    npvCover.style.setProperty('visibility', 'visible', 'important');
                    npvCover.style.setProperty('opacity', '1', 'important');
                }
            }
        } catch (e) {
            console.warn('[WESync] enforceFullTransparency error:', e);
        }
    }

    // =========================================================================
    // 4. HỖ TRỢ BỐ CỤC SPOTIFY & THANH ĐIỀU KHIỂN (CAT-JAM, COVER ART, TIẾN TRÌNH)
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

            // Đảm bảo chú mèo nhảy nhảy (Cat Jam) luôn được gắn vào thanh điều khiển nhạc
            if (right && !document.getElementById('catjam-webm')) {
                try {
                    const cat = document.createElement('video');
                    cat.id = 'catjam-webm';
                    cat.setAttribute('loop', 'true');
                    cat.setAttribute('autoplay', 'true');
                    cat.setAttribute('muted', 'true');
                    cat.setAttribute('style', 'width: 36px; height: 36px;');
                    let catSrc = 'http://127.0.0.1:8989/catjam.webm';
                    try {
                        const storedLink = JSON.parse(localStorage.getItem('catjam-settings.catjam-webm-link') || '{}')?.value;
                        if (storedLink) catSrc = storedLink;
                    } catch(e) {}
                    cat.src = catSrc;
                    cat.onerror = () => {
                        // Fallback sang CDN jsdelivr nếu server local chưa kịp khởi động
                        if (cat.src !== 'https://cdn.jsdelivr.net/gh/BlafKing/spicetify-cat-jam-synced@main/src/resources/catjam.webm') {
                            cat.src = 'https://cdn.jsdelivr.net/gh/BlafKing/spicetify-cat-jam-synced@main/src/resources/catjam.webm';
                        }
                    };
                    if (right.firstChild && right.firstChild !== cat) {
                        right.insertBefore(cat, right.firstChild);
                    } else if (!right.contains(cat)) {
                        right.appendChild(cat);
                    }
                    let isPlaying = false;
                    try { isPlaying = Boolean(window.Spicetify?.Player?.isPlaying && window.Spicetify.Player.isPlaying()); } catch(e) {}
                    if (isPlaying) {
                        cat.play().catch(() => {});
                    }
                } catch(catErr) {
                    console.warn('[we-sync] Cat-jam insert error:', catErr);
                }
            }
        }

        // Đảm bảo toàn bộ thanh cuộn ảo (OverlayScrollbars) và WebKit scrollbar bị ẩn triệt để 100%
        function ensureZeroScrollbarStyle() {
            if (!document.getElementById('we-sync-zero-scrollbar')) {
                const st = document.createElement('style');
                st.id = 'we-sync-zero-scrollbar';
                st.textContent = `
                    ::-webkit-scrollbar, *::-webkit-scrollbar {
                        display: none !important;
                        width: 0 !important;
                        height: 0 !important;
                        background: transparent !important;
                    }
                    ::-webkit-scrollbar-thumb, *::-webkit-scrollbar-thumb,
                    ::-webkit-scrollbar-track, *::-webkit-scrollbar-track,
                    ::-webkit-scrollbar-corner, *::-webkit-scrollbar-corner {
                        display: none !important;
                        background: transparent !important;
                    }
                    html, body, #main, .Root, .Root__top-container, .Root__main-view,
                    .main-view-container, .main-view-container__scroll-node,
                    .main-view-container__scroll-node-child, .os-host, .os-padding,
                    .os-viewport, .os-content, [data-overlayscrollbars-viewport],
                    nav, aside, section, div, * {
                        scrollbar-width: none !important;
                        -ms-overflow-style: none !important;
                    }
                    .os-scrollbar, .os-scrollbar-track, .os-scrollbar-handle,
                    .os-scrollbar-corner, .os-scrollbar-cornerless,
                    .os-scrollbar-horizontal, .os-scrollbar-vertical,
                    .os-theme-spotify, [class*="os-scrollbar"],
                    [data-overlayscrollbars] > .os-scrollbar,
                    [data-overlayscrollbars-viewport]::-webkit-scrollbar {
                        display: none !important;
                        opacity: 0 !important;
                        visibility: hidden !important;
                        pointer-events: none !important;
                        width: 0 !important;
                        height: 0 !important;
                    }
                    html, body, #main, .Root, .Root__top-container, .Root__main-view,
                    .main-view-container, .main-view-container__scroll-node,
                    .main-view-container__scroll-node-child {
                        overflow-x: hidden !important;
                    }
                `;
                (document.head || document.documentElement).appendChild(st);
            }
        }

        // Lắng nghe sự kiện scroll trên toàn bộ cây DOM (window capture) để xóa tức thì màu nền khi cuộn
        let scrollDebounce = null;
        function onAnyScroll() {
            if (scrollDebounce) return;
            scrollDebounce = setTimeout(() => {
                scrollDebounce = null;
                enforceFullTransparency();
            }, 50);
        }

        function attachScrollListener() {
            if (!window._weScrollAttached) {
                window._weScrollAttached = true;
                window.addEventListener('scroll', onAnyScroll, { capture: true, passive: true });
            }
            const scrollNode = document.querySelector('.main-view-container__scroll-node') || document.querySelector('.os-viewport');
            if (scrollNode && !scrollNode.dataset.weScrollAttached) {
                scrollNode.dataset.weScrollAttached = "1";
                scrollNode.addEventListener('scroll', onAnyScroll, { passive: true });
            }
        }

        try {
            ensureZeroScrollbarStyle();
            patchBar();
            enforceFullTransparency();
            attachScrollListener();
        } catch(e) {}

        // MutationObserver hợp nhất duy nhất, debounce 180ms, không bắt attributes để đạt 0% CPU
        let bridgeDebounce = null;
        const obs = new MutationObserver(() => {
            if (bridgeDebounce) return;
            bridgeDebounce = setTimeout(() => {
                bridgeDebounce = null;
                try {
                    ensureZeroScrollbarStyle();
                    patchBar();
                    enforceFullTransparency();
                    attachScrollListener();
                } catch(e) {}
            }, 180);
        });
        obs.observe(document.body, { childList: true, subtree: true });

        // Đồng bộ play/pause chú mèo khi người dùng bật/dừng nhạc
        if (window.Spicetify?.Player) {
            window.Spicetify.Player.addEventListener('onplaypause', () => {
                const cat = document.getElementById('catjam-webm');
                if (!cat) return;
                let isPlaying = false;
                try { isPlaying = Boolean(window.Spicetify?.Player?.isPlaying && window.Spicetify.Player.isPlaying()); } catch(e) {}
                if (isPlaying) {
                    cat.play().catch(() => {});
                } else {
                    cat.pause();
                }
            });
        }
    }

    // Khởi tạo chế độ trong suốt đã lưu
    applyTransparencyMode(currentModeKey, false);

    initSpotifyLayoutBridge();
    checkBg();
})();
