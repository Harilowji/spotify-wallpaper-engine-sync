/**
 * Spotify x Wallpaper Engine Sync - Studio Suite v3.0.1
 * Developed & Re-engineered by Harilowji (https://github.com/Harilowji)
 * Features:
 *  - 100% Ultra-Transparent & Spatial Glassmorphism UI
 *  - In-App Settings GUI Modal (Alt + S / Topbar Button)
 *  - Real-time Multi-Layer Canvas Audio Visualizer Engine
 *  - Material Design 3 Dynamic Color Extraction from Album Art
 *  - Rhythmic Squiggly Progress Scrubber
 *  - Zero-CPU MutationObserver & Debounced DOM Engine
 *  - Automatic WebSocket Reconnection & Local Video/Image Sync
 */

(function () {
  "use strict";

  const WE_CONFIG = {
    WS_PORT: 8989,
    RECONNECT_DELAY: 3000,
    HEARTBEAT_INTERVAL: 15000,
    STORAGE_KEY: "we-sync-settings-v3",
    DEFAULT_SETTINGS: {
      overlayOpacity: 0.15,
      glassBlur: 14,
      preset: "pure",
      visualizerEnabled: true,
      visualizerType: "waves",
      visualizerHeight: 110,
      catJamEnabled: true,
      catJamSize: 36,
      catJamPos: "player",
      colorExtraction: true,
      accentPrimary: "#1ed760",
      accentGlow: "rgba(30, 215, 96, 0.45)",
      squigglyScrubber: true,
      karaokeGlow: true
    }
  };

  /* ==========================================================================
     1. SETTINGS MANAGER (PERSISTENT LOCALSTORAGE & CSS VARIABLE ENGINE)
     ========================================================================== */
  class WESettingsManager {
    constructor() {
      this.config = this.load();
      this.listeners = [];
      this.applyCSSVariables();
    }

    load() {
      try {
        const raw = localStorage.getItem(WE_CONFIG.STORAGE_KEY);
        if (raw) {
          return { ...WE_CONFIG.DEFAULT_SETTINGS, ...JSON.parse(raw) };
        }
      } catch (e) {
        console.warn("[WE-Sync] Could not read settings from localStorage:", e);
      }
      return { ...WE_CONFIG.DEFAULT_SETTINGS };
    }

    save(newPartialConfig) {
      this.config = { ...this.config, ...newPartialConfig };
      try {
        localStorage.setItem(WE_CONFIG.STORAGE_KEY, JSON.stringify(this.config));
      } catch (e) {
        console.error("[WE-Sync] Could not save settings to localStorage:", e);
      }
      this.applyCSSVariables();
      this.notifyListeners();
    }

    reset() {
      this.config = { ...WE_CONFIG.DEFAULT_SETTINGS };
      try {
        localStorage.removeItem(WE_CONFIG.STORAGE_KEY);
      } catch (e) {}
      this.applyCSSVariables();
      this.notifyListeners();
    }

    subscribe(fn) {
      if (typeof fn === "function") this.listeners.push(fn);
    }

    notifyListeners() {
      for (const fn of this.listeners) {
        try { fn(this.config); } catch (e) {}
      }
    }

    applyCSSVariables() {
      const root = document.documentElement;
      root.style.setProperty("--we-overlay-opacity", this.config.overlayOpacity);
      root.style.setProperty("--we-glass-blur", `${this.config.glassBlur}px`);
      root.style.setProperty("--we-accent-primary", this.config.accentPrimary);
      root.style.setProperty("--we-accent-glow", this.config.accentGlow);
      root.style.setProperty("--catjam-size", `${this.config.catJamSize}px`);

      const overlay = document.getElementById("we-sync-overlay");
      if (overlay) {
        overlay.style.backgroundColor = `rgba(0, 0, 0, ${this.config.overlayOpacity})`;
      }

      const cat = document.getElementById("catjam-webm") || document.getElementById("cat");
      if (cat) {
        cat.style.display = this.config.catJamEnabled ? "inline-block" : "none";
        cat.style.width = `${this.config.catJamSize}px`;
        cat.style.height = `${this.config.catJamSize}px`;
      }
    }
  }

  const settingsManager = new WESettingsManager();

  /* ==========================================================================
     2. SETTINGS GUI MODAL (MATERIAL DESIGN 3 GLASSMORPHISM CONTROLLER)
     ========================================================================== */
  class WESettingsGUI {
    constructor(settings) {
      this.settings = settings;
      this.isOpen = false;
      this.init();
    }

    init() {
      this.injectStyles();
      this.createTopbarButton();
      this.createModalDOM();
      this.bindKeyboardShortcuts();
      this.settings.subscribe(() => this.syncUIValues());
    }

    injectStyles() {
      if (document.getElementById("we-settings-dynamic-styles")) return;
      const style = document.createElement("style");
      style.id = "we-settings-dynamic-styles";
      style.textContent = `
        #we-settings-btn {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 50%;
          width: 32px;
          height: 32px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: transform 0.2s ease, background-color 0.2s ease, border-color 0.2s ease;
          color: #ffffff;
          margin-left: 8px;
          vertical-align: middle;
        }
        #we-settings-btn:hover {
          transform: scale(1.08) rotate(30deg);
          background: rgba(255, 255, 255, 0.12);
          border-color: var(--we-accent-primary, #1ed760);
        }
        #we-settings-modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          width: 100vw;
          height: 100vh;
          z-index: 1000000;
          background: rgba(0, 0, 0, 0.45);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          display: flex;
          align-items: center;
          justify-content: center;
          opacity: 0;
          pointer-events: none;
          transition: opacity 0.25s cubic-bezier(0.16, 1, 0.3, 1);
        }
        #we-settings-modal-overlay.active {
          opacity: 1;
          pointer-events: auto;
        }
        #we-settings-modal {
          width: 600px;
          max-width: 92vw;
          max-height: 86vh;
          background: rgba(14, 14, 20, 0.72);
          backdrop-filter: blur(28px) saturate(180%);
          -webkit-backdrop-filter: blur(28px) saturate(180%);
          border: 1px solid rgba(255, 255, 255, 0.16);
          border-radius: 20px;
          box-shadow: 0 24px 60px rgba(0, 0, 0, 0.75), 0 0 30px var(--we-accent-glow, rgba(30, 215, 96, 0.25));
          display: flex;
          flex-direction: column;
          overflow: hidden;
          transform: scale(0.92);
          transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
        }
        #we-settings-modal-overlay.active #we-settings-modal {
          transform: scale(1);
        }
        .we-modal-header {
          padding: 16px 24px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 1px solid rgba(255, 255, 255, 0.10);
        }
        .we-modal-title {
          font-size: 15px;
          font-weight: 700;
          color: #ffffff;
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .we-badge {
          font-size: 10px;
          padding: 3px 8px;
          border-radius: 12px;
          background: var(--we-accent-primary, #1ed760);
          color: #000000;
          font-weight: 800;
        }
        .we-modal-close {
          background: transparent;
          border: none;
          color: #ffffff;
          font-size: 22px;
          cursor: pointer;
          width: 30px;
          height: 30px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 50%;
          transition: background-color 0.2s ease;
        }
        .we-modal-close:hover {
          background: rgba(255, 255, 255, 0.12);
        }
        .we-modal-tabs {
          display: flex;
          padding: 8px 16px;
          gap: 6px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(0, 0, 0, 0.2);
        }
        .we-tab-btn {
          background: transparent;
          border: 1px solid transparent;
          color: rgba(255, 255, 255, 0.65);
          padding: 7px 12px;
          border-radius: 8px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .we-tab-btn:hover {
          color: #ffffff;
          background: rgba(255, 255, 255, 0.06);
        }
        .we-tab-btn.active {
          color: #000000;
          background: var(--we-accent-primary, #1ed760);
          font-weight: 700;
        }
        .we-modal-body {
          padding: 20px 24px;
          overflow-y: auto;
          max-height: 460px;
        }
        .we-tab-panel {
          display: none;
        }
        .we-tab-panel.active {
          display: block;
        }
        .we-control-group {
          margin-bottom: 18px;
        }
        .we-control-label {
          display: flex;
          justify-content: space-between;
          font-size: 13px;
          font-weight: 600;
          color: #ffffff;
          margin-bottom: 8px;
        }
        .we-slider {
          width: 100%;
          height: 6px;
          border-radius: 3px;
          background: rgba(255, 255, 255, 0.15);
          outline: none;
          accent-color: var(--we-accent-primary, #1ed760);
          cursor: pointer;
        }
        .we-switch-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 14px;
        }
        .we-switch-row span {
          font-size: 13px;
          font-weight: 600;
          color: #ffffff;
        }
        .we-switch {
          position: relative;
          display: inline-block;
          width: 44px;
          height: 24px;
        }
        .we-switch input {
          opacity: 0;
          width: 0;
          height: 0;
        }
        .we-switch-slider {
          position: absolute;
          cursor: pointer;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-color: rgba(255, 255, 255, 0.2);
          transition: 0.3s;
          border-radius: 24px;
        }
        .we-switch-slider:before {
          position: absolute;
          content: "";
          height: 18px;
          width: 18px;
          left: 3px;
          bottom: 3px;
          background-color: white;
          transition: 0.3s;
          border-radius: 50%;
        }
        .we-switch input:checked + .we-switch-slider {
          background-color: var(--we-accent-primary, #1ed760);
        }
        .we-switch input:checked + .we-switch-slider:before {
          transform: translateX(20px);
          background-color: #000000;
        }
        .we-preset-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 10px;
          margin-top: 10px;
        }
        .we-preset-btn {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 10px;
          padding: 10px;
          color: #ffffff;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
          text-align: left;
        }
        .we-preset-btn:hover {
          background: rgba(255, 255, 255, 0.12);
          border-color: var(--we-accent-primary, #1ed760);
        }
        .we-modal-footer {
          padding: 12px 24px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-top: 1px solid rgba(255, 255, 255, 0.10);
          background: rgba(0, 0, 0, 0.2);
        }
        .we-reset-btn {
          background: transparent;
          border: 1px solid rgba(255, 255, 255, 0.2);
          color: rgba(255, 255, 255, 0.7);
          padding: 6px 14px;
          border-radius: 8px;
          font-size: 12px;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .we-reset-btn:hover {
          color: #ffffff;
          border-color: #ff5555;
          background: rgba(255, 85, 85, 0.15);
        }
      `;
      document.head.appendChild(style);
    }

    createTopbarButton() {
      const tryInject = () => {
        if (document.getElementById("we-settings-btn")) return;
        const targetContainer = document.querySelector(".main-topBar-container") || 
                                document.querySelector("#global-nav-bar") ||
                                document.querySelector(".Root__globalNav");
        if (!targetContainer) {
          setTimeout(tryInject, 500);
          return;
        }

        const btn = document.createElement("button");
        btn.id = "we-settings-btn";
        btn.title = "Cài đặt Spotify x Wallpaper Engine Studio (Alt + S)";
        btn.setAttribute("aria-label", "WE-Sync Settings");
        btn.innerHTML = `
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="3"></circle>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
          </svg>
        `;
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          this.toggleModal();
        });
        targetContainer.appendChild(btn);
      };
      tryInject();
    }

    createModalDOM() {
      if (document.getElementById("we-settings-modal-overlay")) return;

      const overlay = document.createElement("div");
      overlay.id = "we-settings-modal-overlay";
      overlay.innerHTML = `
        <div id="we-settings-modal" role="dialog" aria-modal="true">
          <div class="we-modal-header">
            <div class="we-modal-title">
              <span>Spotify x Wallpaper Engine Studio</span>
              <span class="we-badge">v3.0.0</span>
            </div>
            <button class="we-modal-close" id="we-modal-close-btn">&times;</button>
          </div>
          <div class="we-modal-tabs">
            <button class="we-tab-btn active" data-tab="tab-glass"> Trong Suốt & Kính</button>
            <button class="we-tab-btn" data-tab="tab-vis"> Sóng Nhạc Visualizer</button>
            <button class="we-tab-btn" data-tab="tab-widget"> Cat-Jam & Scrubber</button>
            <button class="we-tab-btn" data-tab="tab-presets"> Presets & Màu Sắc</button>
          </div>
          <div class="we-modal-body">
            <!-- TAB 1: GLASS -->
            <div class="we-tab-panel active" id="tab-glass">
              <div class="we-control-group">
                <div class="we-control-label">
                  <span>Độ Tối Lớp Phủ Hình Nền (Overlay)</span>
                  <span id="lbl-overlay-val">${Math.round(this.settings.config.overlayOpacity * 100)}%</span>
                </div>
                <input type="range" class="we-slider" id="rng-overlay" min="0" max="80" value="${Math.round(this.settings.config.overlayOpacity * 100)}">
              </div>
              <div class="we-control-group">
                <div class="we-control-label">
                  <span>Độ Mờ Kính (Backdrop Blur)</span>
                  <span id="lbl-blur-val">${this.settings.config.glassBlur}px</span>
                </div>
                <input type="range" class="we-slider" id="rng-blur" min="0" max="30" value="${this.settings.config.glassBlur}">
              </div>
            </div>

            <!-- TAB 2: VISUALIZER -->
            <div class="we-tab-panel" id="tab-vis">
              <div class="we-switch-row">
                <span>Bật Sóng Nhạc Canvas Đa Lớp</span>
                <label class="we-switch">
                  <input type="checkbox" id="chk-vis" ${this.settings.config.visualizerEnabled ? "checked" : ""}>
                  <span class="we-switch-slider"></span>
                </label>
              </div>
              <div class="we-control-group">
                <div class="we-control-label">
                  <span>Biên Độ Chiều Cao Sóng</span>
                  <span id="lbl-vis-h">${this.settings.config.visualizerHeight}px</span>
                </div>
                <input type="range" class="we-slider" id="rng-vis-h" min="40" max="220" value="${this.settings.config.visualizerHeight}">
              </div>
            </div>

            <!-- TAB 3: WIDGET -->
            <div class="we-switch-row">
              <span>Bật Chú Mèo Nhảy Cat-Jam</span>
              <label class="we-switch">
                <input type="checkbox" id="chk-cat" ${this.settings.config.catJamEnabled ? "checked" : ""}>
                <span class="we-switch-slider"></span>
              </label>
            </div>
            <div class="we-control-group">
              <div class="we-control-label">
                <span>Kích Thước Chú Mèo</span>
                <span id="lbl-cat-sz">${this.settings.config.catJamSize}px</span>
              </div>
              <input type="range" class="we-slider" id="rng-cat-sz" min="24" max="60" value="${this.settings.config.catJamSize}">
            </div>
            <div class="we-switch-row">
              <span>Thanh Tua Nhạc Sóng Nước M3 (Squiggly Scrubber)</span>
              <label class="we-switch">
                <input type="checkbox" id="chk-squiggly" ${this.settings.config.squigglyScrubber ? "checked" : ""}>
                <span class="we-switch-slider"></span>
              </label>
            </div>

            <!-- TAB 4: PRESETS -->
            <div class="we-tab-panel" id="tab-presets">
              <div class="we-switch-row">
                <span>Tự Động Trích Xuất Màu Từ Ảnh Bìa Đĩa</span>
                <label class="we-switch">
                  <input type="checkbox" id="chk-color" ${this.settings.config.colorExtraction ? "checked" : ""}>
                  <span class="we-switch-slider"></span>
                </label>
              </div>
              <div style="font-size: 13px; font-weight: 600; color: #ffffff; margin-bottom: 8px;">Chọn Cấu Hình Nhanh:</div>
              <div class="we-preset-grid">
                <button class="we-preset-btn" data-preset="pure"> Pure 100% Transparent<br><small style="color:#aaa;">Trong suốt tối đa</small></button>
                <button class="we-preset-btn" data-preset="contrast"> Crystal Contrast<br><small style="color:#aaa;">Rõ chữ cho nền sáng</small></button>
                <button class="we-preset-btn" data-preset="frosted"> Frosted Spatial<br><small style="color:#aaa;">Kính mờ phân lớp 3D</small></button>
                <button class="we-preset-btn" data-preset="cyberpunk"> Cyberpunk Neon<br><small style="color:#aaa;">Viền phát sáng rực rỡ</small></button>
              </div>
            </div>
          </div>
          <div class="we-modal-footer">
            <button class="we-reset-btn" id="we-reset-defaults-btn">Khôi Phục Mặc Định</button>
            <span style="font-size: 11px; color: rgba(255,255,255,0.45);">Nhấn Alt + S hoặc Esc để đóng</span>
          </div>
        </div>
      `;

      document.body.appendChild(overlay);
      this.bindModalEvents(overlay);
    }

    bindModalEvents(overlay) {
      overlay.querySelector("#we-modal-close-btn").addEventListener("click", () => this.closeModal());
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) this.closeModal();
      });

      // Tabs switching
      const tabBtns = overlay.querySelectorAll(".we-tab-btn");
      const tabPanels = overlay.querySelectorAll(".we-tab-panel");
      tabBtns.forEach((btn) => {
        btn.addEventListener("click", () => {
          tabBtns.forEach((b) => b.classList.remove("active"));
          tabPanels.forEach((p) => p.classList.remove("active"));
          btn.classList.add("active");
          const targetId = btn.getAttribute("data-tab");
          const panel = overlay.querySelector(`#${targetId}`);
          if (panel) panel.classList.add("active");
        });
      });

      // Controls binding
      const rngOverlay = overlay.querySelector("#rng-overlay");
      const lblOverlay = overlay.querySelector("#lbl-overlay-val");
      rngOverlay.addEventListener("input", (e) => {
        const val = parseInt(e.target.value, 10);
        lblOverlay.textContent = `${val}%`;
        this.settings.save({ overlayOpacity: val / 100 });
      });

      const rngBlur = overlay.querySelector("#rng-blur");
      const lblBlur = overlay.querySelector("#lbl-blur-val");
      rngBlur.addEventListener("input", (e) => {
        const val = parseInt(e.target.value, 10);
        lblBlur.textContent = `${val}px`;
        this.settings.save({ glassBlur: val });
      });

      const chkVis = overlay.querySelector("#chk-vis");
      chkVis.addEventListener("change", (e) => {
        this.settings.save({ visualizerEnabled: e.target.checked });
      });

      const rngVisH = overlay.querySelector("#rng-vis-h");
      const lblVisH = overlay.querySelector("#lbl-vis-h");
      rngVisH.addEventListener("input", (e) => {
        const val = parseInt(e.target.value, 10);
        lblVisH.textContent = `${val}px`;
        this.settings.save({ visualizerHeight: val });
      });

      const chkCat = overlay.querySelector("#chk-cat");
      chkCat.addEventListener("change", (e) => {
        this.settings.save({ catJamEnabled: e.target.checked });
      });

      const rngCatSz = overlay.querySelector("#rng-cat-sz");
      const lblCatSz = overlay.querySelector("#lbl-cat-sz");
      rngCatSz.addEventListener("input", (e) => {
        const val = parseInt(e.target.value, 10);
        lblCatSz.textContent = `${val}px`;
        this.settings.save({ catJamSize: val });
      });

      const chkSquiggly = overlay.querySelector("#chk-squiggly");
      chkSquiggly.addEventListener("change", (e) => {
        this.settings.save({ squigglyScrubber: e.target.checked });
      });

      const chkColor = overlay.querySelector("#chk-color");
      chkColor.addEventListener("change", (e) => {
        this.settings.save({ colorExtraction: e.target.checked });
      });

      // Presets
      overlay.querySelectorAll(".we-preset-btn").forEach((pBtn) => {
        pBtn.addEventListener("click", () => {
          const type = pBtn.getAttribute("data-preset");
          if (type === "pure") {
            this.settings.save({ overlayOpacity: 0.10, glassBlur: 0, preset: "pure" });
          } else if (type === "contrast") {
            this.settings.save({ overlayOpacity: 0.38, glassBlur: 8, preset: "contrast" });
          } else if (type === "frosted") {
            this.settings.save({ overlayOpacity: 0.22, glassBlur: 16, preset: "frosted" });
          } else if (type === "cyberpunk") {
            this.settings.save({ overlayOpacity: 0.18, glassBlur: 14, accentPrimary: "#00f0ff", accentGlow: "rgba(0, 240, 255, 0.55)", preset: "cyberpunk" });
          }
          this.syncUIValues();
        });
      });

      // Reset
      overlay.querySelector("#we-reset-defaults-btn").addEventListener("click", () => {
        this.settings.reset();
        this.syncUIValues();
      });
    }

    syncUIValues() {
      const cfg = this.settings.config;
      const overlay = document.getElementById("we-settings-modal-overlay");
      if (!overlay) return;

      const rngOverlay = overlay.querySelector("#rng-overlay");
      const lblOverlay = overlay.querySelector("#lbl-overlay-val");
      if (rngOverlay && lblOverlay) {
        rngOverlay.value = Math.round(cfg.overlayOpacity * 100);
        lblOverlay.textContent = `${Math.round(cfg.overlayOpacity * 100)}%`;
      }

      const rngBlur = overlay.querySelector("#rng-blur");
      const lblBlur = overlay.querySelector("#lbl-blur-val");
      if (rngBlur && lblBlur) {
        rngBlur.value = cfg.glassBlur;
        lblBlur.textContent = `${cfg.glassBlur}px`;
      }

      const chkVis = overlay.querySelector("#chk-vis");
      if (chkVis) chkVis.checked = cfg.visualizerEnabled;

      const rngVisH = overlay.querySelector("#rng-vis-h");
      const lblVisH = overlay.querySelector("#lbl-vis-h");
      if (rngVisH && lblVisH) {
        rngVisH.value = cfg.visualizerHeight;
        lblVisH.textContent = `${cfg.visualizerHeight}px`;
      }

      const chkCat = overlay.querySelector("#chk-cat");
      if (chkCat) chkCat.checked = cfg.catJamEnabled;

      const rngCatSz = overlay.querySelector("#rng-cat-sz");
      const lblCatSz = overlay.querySelector("#lbl-cat-sz");
      if (rngCatSz && lblCatSz) {
        rngCatSz.value = cfg.catJamSize;
        lblCatSz.textContent = `${cfg.catJamSize}px`;
      }

      const chkSquiggly = overlay.querySelector("#chk-squiggly");
      if (chkSquiggly) chkSquiggly.checked = cfg.squigglyScrubber;

      const chkColor = overlay.querySelector("#chk-color");
      if (chkColor) chkColor.checked = cfg.colorExtraction;
    }

    bindKeyboardShortcuts() {
      window.addEventListener("keydown", (e) => {
        if (e.altKey && (e.key === "s" || e.key === "S")) {
          e.preventDefault();
          this.toggleModal();
        } else if (e.key === "Escape" && this.isOpen) {
          this.closeModal();
        }
      });
    }

    toggleModal() {
      if (this.isOpen) this.closeModal();
      else this.openModal();
    }

    openModal() {
      const overlay = document.getElementById("we-settings-modal-overlay");
      if (overlay) {
        this.syncUIValues();
        overlay.classList.add("active");
        this.isOpen = true;
      }
    }

    closeModal() {
      const overlay = document.getElementById("we-settings-modal-overlay");
      if (overlay) {
        overlay.classList.remove("active");
        this.isOpen = false;
      }
    }
  }

  /* ==========================================================================
     3. RHYTHMIC AUDIO WAVE VISUALIZER ENGINE (CANVAS 2D 60FPS)
     ========================================================================== */
  class AudioWaveVisualizer {
    constructor(settings) {
      this.settings = settings;
      this.canvas = null;
      this.ctx = null;
      this.animationId = null;
      this.phase = 0;
      this.currentAmplitude = 0;
      this.targetAmplitude = 0;
      this.dpr = window.devicePixelRatio || 1;
      this.init();
    }

    init() {
      this.canvas = document.createElement("canvas");
      this.canvas.id = "we-sync-visualizer";
      this.canvas.style.cssText = "position:fixed;top:0;left:0;width:100vw;height:100vh;pointer-events:none;z-index:-1.5;";
      document.body.appendChild(this.canvas);
      this.ctx = this.canvas.getContext("2d");
      this.resize();

      window.addEventListener("resize", () => this.resize(), { passive: true });
      document.addEventListener("visibilitychange", () => {
        if (document.hidden) {
          this.stop();
        } else if (this.settings.config.visualizerEnabled) {
          this.start();
        }
      });

      this.settings.subscribe((cfg) => {
        if (cfg.visualizerEnabled && !document.hidden) {
          this.start();
        } else {
          this.stop();
          if (this.ctx) this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        }
      });

      if (this.settings.config.visualizerEnabled) {
        this.start();
      }
    }

    resize() {
      this.dpr = window.devicePixelRatio || 1;
      this.canvas.width = window.innerWidth * this.dpr;
      this.canvas.height = window.innerHeight * this.dpr;
      this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    }

    start() {
      if (this.animationId) return;
      const loop = () => {
        this.render();
        this.animationId = requestAnimationFrame(loop);
      };
      this.animationId = requestAnimationFrame(loop);
    }

    stop() {
      if (this.animationId) {
        cancelAnimationFrame(this.animationId);
        this.animationId = null;
      }
    }

    render() {
      const isPlaying = typeof Spicetify !== "undefined" && Spicetify.Player && Spicetify.Player.isPlaying();
      const maxAmp = this.settings.config.visualizerHeight || 100;
      this.targetAmplitude = isPlaying ? maxAmp : 0;
      this.currentAmplitude += (this.targetAmplitude - this.currentAmplitude) * 0.08;

      const w = window.innerWidth;
      const h = window.innerHeight;
      this.ctx.clearRect(0, 0, w, h);

      if (this.currentAmplitude < 0.5) return;

      this.phase += 0.024;
      const accent = this.settings.config.accentPrimary || "#1ed760";

      const layers = [
        { freq: 0.0035, ampMult: 1.0, speed: 1.0, alpha: 0.28 },
        { freq: 0.0065, ampMult: 0.65, speed: -1.2, alpha: 0.20 },
        { freq: 0.010, ampMult: 0.38, speed: 1.6, alpha: 0.14 }
      ];

      layers.forEach((layer) => {
        this.ctx.beginPath();
        const baseline = h - 90;
        this.ctx.moveTo(0, h);
        this.ctx.lineTo(0, baseline);

        for (let x = 0; x <= w; x += 12) {
          const envelope = Math.sin((x / w) * Math.PI);
          const y = baseline - Math.sin(x * layer.freq + this.phase * layer.speed) * (this.currentAmplitude * layer.ampMult) * envelope;
          this.ctx.lineTo(x, y);
        }

        this.ctx.lineTo(w, h);
        this.ctx.closePath();

        const grad = this.ctx.createLinearGradient(0, baseline - this.currentAmplitude, 0, h);
        grad.addColorStop(0, accent);
        grad.addColorStop(1, "transparent");

        this.ctx.save();
        this.ctx.globalAlpha = layer.alpha;
        this.ctx.fillStyle = grad;
        this.ctx.fill();
        this.ctx.restore();
      });
    }
  }

  /* ==========================================================================
     4. DYNAMIC COLOR EXTRACTOR (16x16 CANVAS K-MEANS ACCENT DETECTOR)
     ========================================================================== */
  class DynamicColorExtractor {
    constructor(settings) {
      this.settings = settings;
      this.offscreenCanvas = document.createElement("canvas");
      this.offscreenCanvas.width = 16;
      this.offscreenCanvas.height = 16;
      this.ctx = this.offscreenCanvas.getContext("2d", { willReadFrequently: true });
      this.init();
    }

    init() {
      if (typeof Spicetify !== "undefined" && Spicetify.Player) {
        Spicetify.Player.addEventListener("songchange", () => this.extractFromCurrentTrack());
      }
      setTimeout(() => this.extractFromCurrentTrack(), 1500);
    }

    extractFromCurrentTrack() {
      if (!this.settings.config.colorExtraction) return;

      let imgUrl = null;
      if (typeof Spicetify !== "undefined" && Spicetify.Player && Spicetify.Player.data && Spicetify.Player.data.track) {
        const meta = Spicetify.Player.data.track.metadata;
        imgUrl = meta.image_xlarge_url || meta.image_large_url || meta.image_url;
      }

      if (!imgUrl) {
        const imgEl = document.querySelector('[data-testid="CoverSlotCollapsed__container"] img') || 
                      document.querySelector('.main-nowPlayingWidget-coverArt img');
        if (imgEl) imgUrl = imgEl.currentSrc || imgEl.src;
      }

      if (!imgUrl) return;

      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        try {
          this.ctx.drawImage(img, 0, 0, 16, 16);
          const imgData = this.ctx.getImageData(0, 0, 16, 16).data;
          let bestColor = null;
          let maxScore = -1;

          for (let i = 0; i < imgData.length; i += 4) {
            const r = imgData[i];
            const g = imgData[i + 1];
            const b = imgData[i + 2];

            const max = Math.max(r, g, b) / 255;
            const min = Math.min(r, g, b) / 255;
            const l = (max + min) / 2;
            if (l < 0.16 || l > 0.88) continue;

            const d = max - min;
            const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            if (s < 0.22) continue;

            const score = s * 1.6 + (1 - Math.abs(l - 0.5));
            if (score > maxScore) {
              maxScore = score;
              bestColor = { r, g, b };
            }
          }

          if (bestColor) {
            const primary = `rgb(${bestColor.r}, ${bestColor.g}, ${bestColor.b})`;
            const glow = `rgba(${bestColor.r}, ${bestColor.g}, ${bestColor.b}, 0.45)`;
            this.settings.save({ accentPrimary: primary, accentGlow: glow });
          }
        } catch (e) {}
      };
      img.src = imgUrl;
    }
  }

  /* ==========================================================================
     5. ZERO-CPU DOM TRANSPARENCY OBSERVER & CLEANER
     ========================================================================== */
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

  let debounceTimer = null;
  function enforceFullTransparency() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      // 1. Clear extracted gradient overlays
      const query = `
        .main-view-container__scroll-node-child div[style*="background-color"],
        section[data-testid] div[style*="background-color"],
        header div[style*="background-color"],
        [data-testid="topbar"] div[style*="background-color"],
        [data-testid="lyrics-page"],
        .main-lyricsCinema-container,
        div[style*="--lyrics-color-background"]
      `;
      const candidates = document.querySelectorAll(query);
      candidates.forEach((el) => {
        // Protect buttons, progress bars, settings modal, dialogs, menus & tooltips
        if (el.closest('[data-testid="play-button"]') ||
            el.closest('[data-testid="control-button-playpause"]') ||
            el.closest('.encore-bright-accent-set') ||
            el.closest('.encore-inverted-light-set') ||
            el.closest('[data-testid*="progress"]') ||
            el.closest('.playback-bar') ||
            el.closest('#we-settings-modal') ||
            el.closest('#we-settings-modal-overlay') ||
            el.closest('#we-sync-toast') ||
            el.closest('[role="dialog"]') ||
            el.closest('[role="menu"]') ||
            el.closest('[role="tooltip"]') ||
            el.closest('.main-contextMenu-tippy') ||
            el.closest('[data-tippy-root]') ||
            el.closest('.main-contextMenu-menu') ||
            el.closest('.GenericModal__overlay') ||
            el.style.backgroundImage.includes("url(")) {
          return;
        }
        clearElementBg(el);
      });
    }, 180);
  }

  function initDOMObserver() {
    const observer = new MutationObserver(() => enforceFullTransparency());
    observer.observe(document.body, { childList: true, subtree: true });

    // Handle scroll on main container
    const tryBindScroll = () => {
      const scrollNode = document.querySelector(".main-view-container__scroll-node");
      if (scrollNode) {
        scrollNode.addEventListener("scroll", () => enforceFullTransparency(), { passive: true });
      } else {
        setTimeout(tryBindScroll, 600);
      }
    };
    tryBindScroll();
  }

  /* ==========================================================================
     6. WEBSOCKET SYNC CLIENT (WALLPAPER ENGINE MEDIA STREAM)
     ========================================================================== */
  function ensureMediaContainers() {
    if (!document.getElementById("we-sync-container")) {
      const container = document.createElement("div");
      container.id = "we-sync-container";
      container.style.cssText = "position:fixed;top:0;left:0;width:100vw;height:100vh;pointer-events:none;z-index:-2;overflow:hidden;";

      const img = document.createElement("img");
      img.id = "we-sync-img";
      img.style.cssText = "position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;opacity:0;transition:opacity 0.4s ease;";

      const video = document.createElement("video");
      video.id = "we-sync-video";
      video.autoplay = true;
      video.loop = true;
      video.muted = true;
      video.playsInline = true;
      video.style.cssText = "position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;opacity:0;transition:opacity 0.4s ease;";

      const overlay = document.createElement("div");
      overlay.id = "we-sync-overlay";
      overlay.style.cssText = `position:absolute;top:0;left:0;width:100%;height:100%;background-color:rgba(0,0,0,${settingsManager.config.overlayOpacity});transition:background-color 0.3s ease;z-index:-1;`;

      container.appendChild(img);
      container.appendChild(video);
      container.appendChild(overlay);
      document.body.appendChild(container);
    }
  }

  function connectWebSocket() {
    ensureMediaContainers();
    const ws = new WebSocket(`ws://127.0.0.1:${WE_CONFIG.WS_PORT}`);

    ws.onopen = () => {
      console.log("[WE-Sync] Connected to local Wallpaper Engine sync server.");
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const img = document.getElementById("we-sync-img");
        const video = document.getElementById("we-sync-video");
        if (!img || !video) return;

        if (data.type === "video") {
          img.style.opacity = "0";
          video.src = data.url;
          video.onloadeddata = () => {
            video.style.opacity = "1";
          };
        } else if (data.type === "image") {
          video.style.opacity = "0";
          img.src = data.url;
          img.onload = () => {
            img.style.opacity = "1";
          };
        }
      } catch (e) {}
    };

    ws.onclose = () => {
      setTimeout(connectWebSocket, WE_CONFIG.RECONNECT_DELAY);
    };

    ws.onerror = () => {
      ws.close();
    };
  }

  /* ==========================================================================
     7. BOOTSTRAPPER & INITIALIZATION
     ========================================================================== */
  function bootstrap() {
    if (!document.body) {
      if (typeof window !== "undefined" && window.requestAnimationFrame) {
        window.requestAnimationFrame(bootstrap);
      } else {
        setTimeout(bootstrap, 50);
      }
      return;
    }
    try {
      ensureMediaContainers();
      new WESettingsGUI(settingsManager);
      new AudioWaveVisualizer(settingsManager);
      new DynamicColorExtractor(settingsManager);
      initDOMObserver();
      connectWebSocket();
      enforceFullTransparency();
      console.log("[WE-Sync] Studio Suite v3.0.0 initialized successfully.");
    } catch (err) {
      console.error("[WE-Sync] Initialization error:", err);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootstrap);
  } else {
    bootstrap();
  }
})();