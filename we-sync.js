/**
 * Spotify x Wallpaper Engine Sync - Studio Suite v3.0.1 (Comprehensive Bugfix)
 * Developed & Re-engineered by Harilowji (https://github.com/Harilowji)
 * Fixes:
 *  - Safe Spicetify Player Loader with Retries (Prevents unhandled runtime errors)
 *  - Safe TopBar Button Insertion via Spicetify.Topbar.Button (Prevents React DOM crash)
 *  - Standard Integer Z-Index (-2) for Canvas Visualizer
 *  - Guarded DOM Ready Lifecycle in Bootstrap
 *  - Full 100% Transparency preservation with Non-Destructive Observer
 */

(function () {
  "use strict";

  const WE_CONFIG = {
    WS_PORT: 8989,
    RECONNECT_DELAY: 3000,
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
      accentGlow: "rgba(30, 215, 96, 0.45)"
    }
  };

  /* ==========================================================================
     1. SETTINGS MANAGER (PERSISTENT LOCALSTORAGE & CSS ENGINE)
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
     2. SETTINGS GUI MODAL (SETTINGS BUTTON & GLASS CONTROLLER)
     ========================================================================== */
  class WESettingsGUI {
    constructor(settings) {
      this.settings = settings;
      this.isOpen = false;
      this.init();
    }

    init() {
      this.createTopbarButton();
      this.createModalDOM();
      this.bindKeyboardShortcuts();
      this.settings.subscribe(() => this.syncUIValues());
    }

    createTopbarButton() {
      const tryInject = () => {
        if (document.getElementById("we-settings-btn")) return;

        if (typeof Spicetify !== "undefined" && Spicetify.Topbar && Spicetify.Topbar.Button) {
          try {
            new Spicetify.Topbar.Button(
              "Spotify x Wallpaper Engine Studio (Alt + S)",
              `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>`,
              () => this.toggleModal()
            );
            return;
          } catch (e) {}
        }

        const targetContainer = document.querySelector(".main-topBar-container") || 
                                document.querySelector("#global-nav-bar") ||
                                document.querySelector(".Root__globalNav");
        if (!targetContainer) {
          setTimeout(tryInject, 600);
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
              <span class="we-badge">v3.0.1</span>
            </div>
            <button class="we-modal-close" id="we-modal-close-btn">&times;</button>
          </div>
          <div class="we-modal-tabs">
            <button class="we-tab-btn active" data-tab="tab-glass">🎨 Trong Suốt & Kính</button>
            <button class="we-tab-btn" data-tab="tab-vis">🌊 Sóng Nhạc Visualizer</button>
            <button class="we-tab-btn" data-tab="tab-widget">🐱 Cat-Jam & Scrubber</button>
            <button class="we-tab-btn" data-tab="tab-presets"> Presets & Màu Sắc</button>
          </div>
          <div class="we-modal-body">
          <!-- WE-SYNC CONNECTION STATUS BAR -->
          <div class="we-conn-bar" style="display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; margin-bottom: 14px; background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 8px; font-size: 13px;">
            <div id="we-conn-status" style="display: flex; align-items: center; gap: 8px;">
              <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #ff5555; box-shadow: 0 0 6px #ff5555;"></span>
              <span style="color: #ff5555; font-weight: 600;">Chưa kết nối máy chủ (Cổng 8989)</span>
            </div>
            <button id="we-btn-reconnect" class="we-btn secondary" style="padding: 4px 12px; font-size: 12px; font-weight: 500; cursor: pointer; border-radius: 6px; border: 1px solid rgba(255, 255, 255, 0.2); background: rgba(255, 255, 255, 0.1); color: #fff; transition: all 0.2s ease;">Thử Kết Nối Lại</button>
          </div>
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
              <div class="we-control-group" style="margin-top: 16px; padding-top: 14px; border-top: 1px solid rgba(255,255,255,0.08); display: flex; align-items: center; justify-content: space-between;">
                <div>
                  <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #888; margin-bottom: 4px;">Trạng Thái Đồng Bộ:</div>
                  <div id="we-conn-status">
                    <span style="color: #ff5555; font-weight: 600; display: inline-flex; align-items: center; gap: 6px;"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#ff5555;"></span> Đang kết nối...</span>
                  </div>
                </div>
                <button class="we-btn-sm" id="we-btn-reconnect" style="background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15); color: #fff; padding: 6px 14px; border-radius: 8px; font-size: 12px; cursor: pointer; transition: all 0.2s ease;">Thử Kết Nối Lại</button>
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
                <button class="we-preset-btn" data-preset="contrast">🌟 Crystal Contrast<br><small style="color:#aaa;">Rõ chữ cho nền sáng</small></button>
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

      const btnReconnect = overlay.querySelector("#we-btn-reconnect");
      if (btnReconnect) {
        btnReconnect.addEventListener("click", () => {
          const statusEl = document.getElementById("we-conn-status");
          if (statusEl) {
            statusEl.innerHTML = '<span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #e0b020;"></span><span style="color: #e0b020; font-weight: 600;">Đang kết nối lại...</span>';
          }
          connectWebSocket(true);
        });
      }
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) this.closeModal();
      });

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

      const chkColor = overlay.querySelector("#chk-color");
      chkColor.addEventListener("change", (e) => {
        this.settings.save({ colorExtraction: e.target.checked });
      });

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
        if (typeof updateConnectionStatus === "function") {
          updateConnectionStatus(activeWs && activeWs.readyState === WebSocket.OPEN);
        }
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
     3. RHYTHMIC AUDIO WAVE VISUALIZER (CANVAS 2D 60FPS WITH INTEGER Z-INDEX)
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
      this.canvas.style.cssText = "position:fixed;top:0;left:0;width:100vw;height:100vh;pointer-events:none;z-index:-2;";
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
     4. DYNAMIC COLOR EXTRACTOR (WITH SAFE SPICETIFY POLLING)
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
      const bindSongChange = () => {
        if (typeof Spicetify !== "undefined" && Spicetify.Player && Spicetify.Player.addEventListener) {
          Spicetify.Player.addEventListener("songchange", () => this.extractFromCurrentTrack());
          this.extractFromCurrentTrack();
        } else {
          setTimeout(bindSongChange, 500);
        }
      };
      bindSongChange();
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
      const query = `
        .main-view-container__scroll-node-child div[style*="background-color"],
        section[data-testid] div[style*="background-color"],
        header div[style*="background-color"],
        [data-testid="topbar"] div[style*="background-color"],
        .Root__right-sidebar div[style*="background-color"],
        aside.NowPlayingView div[style*="background-color"],
        [data-testid="RightSidebar"] div[style*="background-color"],
        #Desktop_LeftSidebar_Id div[style*="background-color"],
        [data-testid="lyrics-page"],
        .main-lyricsCinema-container,
        div[style*="--lyrics-color-background"]
      `;
      const candidates = document.querySelectorAll(query);
      candidates.forEach((el) => {
        // Protect buttons, progress bars, tooltips, menus and modal elements
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
      container.style.cssText = "position:fixed;top:0;left:0;width:100vw;height:100vh;pointer-events:none;z-index:-3;overflow:hidden;";

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

  let currentWsHost = "127.0.0.1";
  let activeWs = null;
  let reconnectTimer = null;

  function updateConnectionStatus(isConnected) {
    const statusEl = document.getElementById("we-conn-status");
    if (statusEl) {
      if (isConnected) {
        statusEl.innerHTML = `<span style="color: #1ed760; font-weight: 600; display: inline-flex; align-items: center; gap: 6px;"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#1ed760;box-shadow:0 0 8px #1ed760;"></span> Đã kết nối Wallpaper Engine</span>`;
      } else {
        statusEl.innerHTML = `<span style="color: #ff5555; font-weight: 600; display: inline-flex; align-items: center; gap: 6px;"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#ff5555;"></span> Chưa kết nối máy chủ (Cổng 8989)</span>`;
      }
    }
  }

  function applyWallpaperMedia(data) {
    if (!data || !data.type || !data.url) return;
    const img = document.getElementById("we-sync-img");
    const video = document.getElementById("we-sync-video");
    if (!img || !video) return;

    if (data.type === "video") {
      img.style.opacity = "0";
      if (video.src !== data.url) {
        video.src = data.url;
        video.onloadeddata = () => {
          video.style.opacity = "1";
        };
      } else {
        video.style.opacity = "1";
      }
    } else if (data.type === "image") {
      video.style.opacity = "0";
      if (img.src !== data.url) {
        img.src = data.url;
        img.onload = () => {
          img.style.opacity = "1";
        };
      } else {
        img.style.opacity = "1";
      }
    }
  }

  function fetchInitialWallpaper() {
    const url = `http://${currentWsHost}:${WE_CONFIG.WS_PORT}/status?t=${Date.now()}`;
    fetch(url)
      .then((res) => res.json())
      .then((data) => {
        if (data && data.mediaType && data.mediaType !== "none" && data.mediaUrl) {
          applyWallpaperMedia({ type: data.mediaType, url: data.mediaUrl });
        }
      })
      .catch(() => {});
  }

  function connectWebSocket(forceReconnect = false) {
    ensureMediaContainers();
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }

    if (activeWs) {
      try {
        activeWs.onclose = null;
        activeWs.onerror = null;
        activeWs.close();
      } catch (e) {}
      activeWs = null;
    }

    fetchInitialWallpaper();

    try {
      const ws = new WebSocket(`ws://${currentWsHost}:${WE_CONFIG.WS_PORT}`);
      activeWs = ws;

      ws.onopen = () => {
        console.log(`[WE-Sync] Đã kết nối Wallpaper Engine qua ws://${currentWsHost}:${WE_CONFIG.WS_PORT}`);
        updateConnectionStatus(true);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          applyWallpaperMedia(data);
        } catch (e) {}
      };

      ws.onclose = () => {
        updateConnectionStatus(false);
        currentWsHost = currentWsHost === "127.0.0.1" ? "localhost" : "127.0.0.1";
        reconnectTimer = setTimeout(() => connectWebSocket(), 2500);
      };

      ws.onerror = () => {
        try { ws.close(); } catch (e) {}
      };
    } catch (err) {
      updateConnectionStatus(false);
      currentWsHost = currentWsHost === "127.0.0.1" ? "localhost" : "127.0.0.1";
      reconnectTimer = setTimeout(() => connectWebSocket(), 2500);
    }
  }

  /* ==========================================================================
     7. BOOTSTRAPPER & GUARDED INITIALIZATION
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
      console.log("[WE-Sync] Studio Suite v3.0.1 initialized successfully.");
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
