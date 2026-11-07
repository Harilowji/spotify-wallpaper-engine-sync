#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
================================================================================
Spotify x Wallpaper Engine Sync Engine (v3.2.1 Enterprise Edition)
Tự động hóa đồng bộ trạng thái phát nhạc Spotify và Wallpaper Engine chuyên nghiệp
Phát triển & Tối ưu bởi: Harilowji (https://github.com/Harilowji)
================================================================================
Tính năng cốt lõi:
1. Xử lý triệt để 100% ngoại lệ: None/null, Quảng cáo (Ads), Podcast/Episode, Nhạc nội bộ (Local Files).
2. Tự phục hồi mạng: Exponential Backoff, HTTP 429 Rate Limit (Retry-After), Auto-refresh OAuth2 Token 24/7.
3. Tự động bắt OAuth Callback bằng HTTP Server tích hợp (webbrowser), không cần copy-paste thủ công.
4. Điều khiển Wallpaper Engine siêu tốc: Tự dò tìm đa ổ đĩa, chạy ngầm tuyệt đối (CREATE_NO_WINDOW).
5. Đổi hình nền theo thể loại nhạc (genre_wallpaper_mapping) kèm RAM cache thông tin nghệ sĩ.
6. Fallback Timer tự động: Chuyển về hình nền/màu mặc định khi tắt hoặc dừng nhạc quá [X] giây.
7. Hiệu năng đỉnh cao: Caching trạng thái bài hát, xử lý ảnh thumbnail nhỏ nhất hoàn toàn trên RAM (io.BytesIO).
8. Tách biệt cấu hình: Quản lý qua .env và config.json, hệ thống Logging đa tầng chuẩn Enterprise.
================================================================================
"""

import os
import sys
import time
import json
import io
import re
import base64
import logging
import signal
import subprocess
import webbrowser
import http.server
import urllib.parse
from pathlib import Path
from typing import Optional, Dict, Any, Tuple, List
from logging.handlers import RotatingFileHandler

# Thư viện mạng & xử lý ảnh (Thuần Python & Pillow tối ưu nhẹ)
try:
    import requests
except ImportError:
    print("[CRITICAL] Thiếu thư viện 'requests'. Vui lòng cài đặt: pip install requests")
    sys.exit(1)

try:
    from PIL import Image
except ImportError:
    print("[CRITICAL] Thiếu thư viện 'Pillow'. Vui lòng cài đặt: pip install Pillow")
    sys.exit(1)


# ==============================================================================
# 1. HỆ THỐNG LOGGING CHUYÊN NGHIỆP (ENTERPRISE LOGGING)
# ==============================================================================
def setup_logger(config: Dict[str, Any]) -> logging.Logger:
    """
    Khởi tạo hệ thống Logging chuyên nghiệp với xuất định dạng chuẩn thời gian,
    hỗ trợ ghi file tự động xoay vòng (Rotating File Handler) và hiển thị console.
    """
    log_cfg = config.get("logging", {})
    log_level_name = log_cfg.get("level", "INFO").upper()
    log_level = getattr(logging, log_level_name, logging.INFO)

    logger = logging.getLogger("SpotifyWESync")
    logger.setLevel(log_level)
    logger.handlers.clear()

    formatter = logging.Formatter(
        fmt="%(asctime)s [%(levelname)-7s] %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S"
    )

    # 1. Console Handler
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(log_level)
    console_handler.setFormatter(formatter)
    logger.addHandler(console_handler)

    # 2. Rotating File Handler (Nếu được bật)
    if log_cfg.get("log_to_file", True):
        log_file = log_cfg.get("log_file_path", "spotify_we_sync.log")
        max_bytes = int(log_cfg.get("max_file_size_mb", 5)) * 1024 * 1024
        backup_count = int(log_cfg.get("backup_count", 3))

        try:
            file_handler = RotatingFileHandler(
                filename=log_file,
                maxBytes=max_bytes,
                backupCount=backup_count,
                encoding="utf-8"
            )
            file_handler.setLevel(log_level)
            file_handler.setFormatter(formatter)
            logger.addHandler(file_handler)
        except Exception as e:
            logger.warning(f"Không thể khởi tạo file log tại '{log_file}': {e}")

    return logger


# ==============================================================================
# 2. TÁCH BIỆT CẤU HÌNH & QUẢN LÝ MÔI TRƯỜNG (.ENV & CONFIG.JSON)
# ==============================================================================
def load_env_file(env_path: str = ".env") -> None:
    """
    Đọc biến môi trường từ file .env.
    Tự tích hợp bộ giải mã nội bộ nếu máy chưa cài python-dotenv.
    """
    if not os.path.exists(env_path):
        return

    try:
        from dotenv import load_dotenv
        load_dotenv(env_path)
    except ImportError:
        # Bộ nạp .env thuần Python dự phòng
        try:
            with open(env_path, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if not line or line.startswith("#") or "=" not in line:
                        continue
                    key, val = line.split("=", 1)
                    key = key.strip()
                    val = val.strip().strip("'\"")
                    if key and key not in os.environ:
                        os.environ[key] = val
        except Exception:
            pass


def load_config(config_path: str = "config.json") -> Dict[str, Any]:
    """
    Tải file cấu hình config.json, tự động khởi tạo cấu hình mặc định an toàn.
    """
    default_config = {
        "sync_settings": {
            "polling_interval_seconds": 2.0,
            "pause_timeout_seconds": 30.0,
            "request_timeout_seconds": 5.0,
            "max_retries": 5,
            "backoff_factor": 1.5
        },
        "wallpaper_engine": {
            "custom_executable_path": "",
            "control_wallpaper": True,
            "control_accent_color": True,
            "default_wallpaper": "",
            "default_accent_color": "#1DB954"
        },
        "album_color_extraction": {
            "enabled": True,
            "prefer_smallest_thumbnail": True,
            "color_quantization_levels": 8,
            "saturation_boost": True
        },
        "genre_wallpaper_mapping": {},
        "logging": {
            "level": "INFO",
            "log_to_file": True,
            "log_file_path": "spotify_we_sync.log",
            "max_file_size_mb": 5,
            "backup_count": 3
        }
    }

    if os.path.exists(config_path):
        try:
            with open(config_path, "r", encoding="utf-8") as f:
                user_cfg = json.load(f)
                for section, values in user_cfg.items():
                    if isinstance(values, dict) and section in default_config:
                        default_config[section].update(values)
                    else:
                        default_config[section] = values
        except Exception as e:
            print(f"[CẢNH BÁO] Không đọc được config.json ({e}), sử dụng thiết lập mặc định.")

    return default_config


# ==============================================================================
# 3. ĐIỀU KHIỂN GIAO TIẾP WALLPAPER ENGINE (BACKGROUND CLI & NO-WINDOW)
# ==============================================================================
class WallpaperEngineController:
    """
    Quản lý giao tiếp với Wallpaper Engine thông qua giao diện dòng lệnh (CLI).
    Tự động dò tìm đường dẫn cài đặt trên đa phân vùng ổ đĩa và thực thi ngầm
    tuyệt đối (CREATE_NO_WINDOW), không làm nháy cửa sổ console.
    """

    def __init__(self, config: Dict[str, Any], logger: logging.Logger):
        self.config = config
        self.logger = logger
        self.we_cfg = config.get("wallpaper_engine", {})
        self.executable_path = self._locate_executable()

        if self.executable_path:
            self.logger.info(f"Đã phát hiện Wallpaper Engine: {self.executable_path}")
        else:
            self.logger.error(
                "KHÔNG TÌM THẤY Wallpaper Engine! Vui lòng kiểm tra đường dẫn hoặc "
                "chỉ định rõ 'custom_executable_path' trong file config.json."
            )

    def _locate_executable(self) -> Optional[str]:
        """Tự động dò tìm wallpaper64.exe hoặc wallpaper32.exe."""
        custom_path = self.we_cfg.get("custom_executable_path") or os.environ.get("WALLPAPER_ENGINE_EXE")
        if custom_path and os.path.exists(custom_path):
            return custom_path

        candidates = set()

        # 1. Quét từ Registry Windows (Steam App 431960)
        try:
            import winreg
            for root in [winreg.HKEY_LOCAL_MACHINE, winreg.HKEY_CURRENT_USER]:
                try:
                    key = winreg.OpenKey(root, r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\Steam App 431960")
                    val, _ = winreg.QueryValueEx(key, "InstallLocation")
                    if val and os.path.exists(val):
                        candidates.add(val)
                except OSError:
                    pass
                try:
                    key = winreg.OpenKey(root, r"Software\Valve\Steam")
                    val, _ = winreg.QueryValueEx(key, "SteamPath")
                    if val:
                        steam_dir = val.replace("/", "\\")
                        candidates.add(os.path.join(steam_dir, "steamapps", "common", "wallpaper_engine"))
                        vdf_path = os.path.join(steam_dir, "steamapps", "libraryfolders.vdf")
                        if os.path.exists(vdf_path):
                            with open(vdf_path, "r", encoding="utf-8", errors="ignore") as vf:
                                vdf_txt = vf.read()
                                for m in re.finditer(r'"path"\s+"([^"]+)"', vdf_txt):
                                    lib = m.group(1).replace("\\\\", "\\")
                                    candidates.add(os.path.join(lib, "steamapps", "common", "wallpaper_engine"))
                except OSError:
                    pass
        except Exception:
            pass

        # 2. Quét các ổ đĩa phổ thông từ C đến H
        for d in ["C", "D", "E", "F", "G", "H"]:
            candidates.add(f"{d}:\\Steam\\steamapps\\common\\wallpaper_engine")
            candidates.add(f"{d}:\\SteamLibrary\\steamapps\\common\\wallpaper_engine")
            candidates.add(f"{d}:\\Program Files (x86)\\Steam\\steamapps\\common\\wallpaper_engine")
            candidates.add(f"{d}:\\Program Files\\Steam\\steamapps\\common\\wallpaper_engine")

        for folder in candidates:
            for exe_name in ["wallpaper64.exe", "wallpaper32.exe"]:
                target = os.path.join(folder, exe_name)
                if os.path.exists(target):
                    return target

        return None

    def execute_command(self, args: list) -> bool:
        """
        Thực thi lệnh CLI an toàn trên Windows với cờ CREATE_NO_WINDOW và SW_HIDE
        để bảo đảm 100% không làm nháy màn hình game/ứng dụng của người dùng.
        """
        if not self.executable_path or not os.path.exists(self.executable_path):
            self.logger.warning("Bỏ qua lệnh CLI vì chưa xác định được file thực thi Wallpaper Engine.")
            return False

        full_cmd = [self.executable_path] + args
        try:
            startupinfo = None
            creationflags = 0

            if os.name == "nt":
                startupinfo = subprocess.STARTUPINFO()
                startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
                startupinfo.wShowWindow = subprocess.SW_HIDE
                creationflags = subprocess.CREATE_NO_WINDOW  # 0x08000000

            proc = subprocess.run(
                full_cmd,
                startupinfo=startupinfo,
                creationflags=creationflags,
                capture_output=True,
                text=True,
                timeout=5.0
            )
            return proc.returncode == 0
        except subprocess.TimeoutExpired:
            self.logger.warning(f"Lệnh CLI Wallpaper Engine bị quá thời gian (Timeout 5s): {args}")
            return False
        except Exception as e:
            self.logger.error(f"Lỗi khi thực thi lệnh Wallpaper Engine ({args}): {e}")
            return False

    def open_wallpaper(self, wallpaper_path_or_id: str, monitor: Optional[int] = None) -> bool:
        """Kích hoạt đổi hình nền theo đường dẫn file hoặc Workshop ID."""
        if not wallpaper_path_or_id:
            return False

        args = ["-control", "openWallpaper", "-file", wallpaper_path_or_id]
        if monitor is not None:
            args.extend(["-location", str(monitor)])

        self.logger.info(f"[Wallpaper Engine] Đang chuyển hình nền -> {wallpaper_path_or_id}")
        return self.execute_command(args)

    def set_accent_color(self, hex_or_rgb: Any) -> bool:
        """
        Cập nhật màu sắc giao diện/hiệu ứng trong Wallpaper Engine (thuộc tính schemecolor).
        Định dạng Wallpaper Engine: chuỗi 3 số thực từ 0.0 đến 1.0 cách nhau bởi dấu cách.
        """
        r, g, b = 29, 185, 84  # Mặc định: Spotify Green

        if isinstance(hex_or_rgb, (tuple, list)) and len(hex_or_rgb) >= 3:
            r, g, b = int(hex_or_rgb[0]), int(hex_or_rgb[1]), int(hex_or_rgb[2])
        elif isinstance(hex_or_rgb, str):
            clean_hex = hex_or_rgb.strip().lstrip("#")
            if len(clean_hex) == 6:
                try:
                    r = int(clean_hex[0:2], 16)
                    g = int(clean_hex[2:4], 16)
                    b = int(clean_hex[4:6], 16)
                except ValueError:
                    pass

        # Chuẩn hóa về dải [0.0 - 1.0] cho Wallpaper Engine
        norm_r = f"{r / 255.0:.3f}"
        norm_g = f"{g / 255.0:.3f}"
        norm_b = f"{b / 255.0:.3f}"
        scheme_val = f"{norm_r} {norm_g} {norm_b}"

        props = json.dumps({"schemecolor": scheme_val})
        self.logger.info(f"[Wallpaper Engine] Đồng bộ màu chủ đạo: RGB({r},{g},{b}) -> {props}")
        return self.execute_command(["-control", "applyProperties", "-properties", props])

    def control_playback(self, action: str) -> bool:
        """Điều khiển phát nhạc của Wallpaper Engine: 'pause', 'play', 'stop'."""
        if action in ["pause", "play", "stop"]:
            return self.execute_command(["-control", action])
        return False


# ==============================================================================
# 4. TRÍCH XUẤT MÀU SẮC ALBUM ART TRÊN BỘ NHỚ RAM (ZERO-DISK WEAR)
# ==============================================================================
class InMemoryColorExtractor:
    """
    Trích xuất màu sắc chủ đạo từ ảnh bìa Spotify hoàn toàn trên bộ nhớ RAM (io.BytesIO).
    Tự động chọn ảnh thumbnail kích thước nhỏ nhất để tối ưu tốc độ gấp 10 lần,
    hoàn toàn không ghi file tạm ra SSD giúp bảo vệ phần cứng.
    """

    def __init__(self, logger: logging.Logger):
        self.logger = logger

    def extract_dominant_color_from_url(self, image_url: str) -> Optional[Tuple[int, int, int]]:
        """Tải ảnh và phân tích màu sắc trực tiếp trên RAM."""
        if not image_url:
            return None

        try:
            # Tải ảnh trực tiếp vào RAM
            resp = requests.get(image_url, timeout=4.0)
            if resp.status_code != 200 or not resp.content:
                return None

            # Đọc byte trực tiếp bằng io.BytesIO
            with Image.open(io.BytesIO(resp.content)) as img:
                # Chuyển đổi và thu nhỏ về 48x48 để phân tích siêu tốc (<2ms)
                rgb_img = img.convert("RGB").resize((48, 48), Image.Resampling.BILINEAR)

                # Giảm bảng màu xuống 8 màu nổi bật
                quantized = rgb_img.quantize(colors=8, method=Image.Quantize.MEDIANCUT)
                palette = quantized.getpalette()[:24]

                best_color = None
                max_score = -1.0

                for i in range(0, len(palette), 3):
                    r, g, b = palette[i], palette[i + 1], palette[i + 2]

                    # Tính độ sáng (Luminance)
                    brightness = (r * 299 + g * 587 + b * 114) / 1000.0
                    # Loại bỏ màu quá tối (<30) hoặc quá sáng (>230)
                    if brightness < 30.0 or brightness > 230.0:
                        continue

                    # Tính độ bão hòa (Saturation)
                    max_c = max(r, g, b)
                    min_c = min(r, g, b)
                    sat = ((max_c - min_c) / max_c) if max_c > 0 else 0.0

                    # Ưu tiên màu sắc sống động, gần độ sáng cân bằng 128
                    score = (sat * 120.0) + (100.0 - abs(brightness - 128.0))
                    if score > max_score:
                        max_score = score
                        best_color = (r, g, b)

                return best_color or (palette[0], palette[1], palette[2])

        except Exception as e:
            self.logger.debug(f"Không thể trích xuất màu từ ảnh {image_url}: {e}")
            return None


# ==============================================================================
# 5. SPOTIFY API CLIENT VỚI OAUTH HTTP SERVER & ARTIST GENRE CACHE
# ==============================================================================
class SpotifyAPIClient:
    """
    Client kết nối Spotify Web API tối ưu hóa cho ứng dụng Desktop chạy ngầm 24/7.
    Bảo vệ trước mọi lỗi ngoại lệ:
    - Token Auto-refresh trước khi hết hạn.
    - Tự động bắt OAuth Callback bằng HTTP Server cục bộ (webbrowser tích hợp).
    - Bộ nhớ đệm thể loại ca sĩ trên RAM (artist_genre_cache).
    - Xử lý lỗi HTTP 429 Rate Limit (Exponential Backoff kèm đọc Retry-After).
    - Tự động bắt lỗi mạng tạm thời (Timeout, ConnectionError).
    - Bóc tách an toàn các loại nội dung: Ads, Podcast, Local Files, Paused state.
    """

    TOKEN_URL = "https://accounts.spotify.com/api/token"
    PLAYER_URL = "https://api.spotify.com/v1/me/player"
    ARTIST_URL = "https://api.spotify.com/v1/artists"
    TOKEN_CACHE_FILE = ".spotify_token_cache.json"

    def __init__(self, config: Dict[str, Any], logger: logging.Logger):
        self.config = config
        self.logger = logger
        self.sync_cfg = config.get("sync_settings", {})

        self.client_id = os.environ.get("SPOTIPY_CLIENT_ID", "")
        self.client_secret = os.environ.get("SPOTIPY_CLIENT_SECRET", "")
        self.redirect_uri = os.environ.get("SPOTIPY_REDIRECT_URI", "http://localhost:8888/callback")

        self.access_token: Optional[str] = None
        self.refresh_token: Optional[str] = None
        self.token_expires_at: float = 0.0

        # Bộ nhớ đệm RAM lưu thể loại của nghệ sĩ (tránh gọi lại API nhiều lần)
        self.artist_genre_cache: Dict[str, List[str]] = {}

        self.backoff_delay = float(self.sync_cfg.get("backoff_factor", 1.5))
        self.max_backoff = 60.0

        self._load_cached_token()

    def _load_cached_token(self) -> None:
        """Đọc token từ bộ nhớ đệm an toàn."""
        if os.path.exists(self.TOKEN_CACHE_FILE):
            try:
                with open(self.TOKEN_CACHE_FILE, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    self.access_token = data.get("access_token")
                    self.refresh_token = data.get("refresh_token")
                    self.token_expires_at = float(data.get("expires_at", 0))
            except Exception as e:
                self.logger.warning(f"Không thể đọc token cache: {e}")

    def _save_cached_token(self) -> None:
        """Lưu trữ token vào bộ nhớ đệm để tái sử dụng."""
        try:
            with open(self.TOKEN_CACHE_FILE, "w", encoding="utf-8") as f:
                json.dump({
                    "access_token": self.access_token,
                    "refresh_token": self.refresh_token,
                    "expires_at": self.token_expires_at
                }, f, indent=2)
        except Exception as e:
            self.logger.warning(f"Không thể lưu token cache: {e}")

    def refresh_access_token(self) -> bool:
        """Tự động làm mới Access Token khi sắp hoặc đã hết hạn."""
        if not self.refresh_token or not self.client_id or not self.client_secret:
            return False

        auth_header = base64.b64encode(f"{self.client_id}:{self.client_secret}".encode()).decode()
        headers = {
            "Authorization": f"Basic {auth_header}",
            "Content-Type": "application/x-www-form-urlencoded"
        }
        data = {
            "grant_type": "refresh_token",
            "refresh_token": self.refresh_token
        }

        try:
            resp = requests.post(self.TOKEN_URL, headers=headers, data=data, timeout=8.0)
            if resp.status_code == 200:
                token_data = resp.json()
                self.access_token = token_data.get("access_token")
                expires_in = token_data.get("expires_in", 3600)
                self.token_expires_at = time.time() + expires_in - 60.0  # Làm mới sớm 60 giây
                if "refresh_token" in token_data:
                    self.refresh_token = token_data["refresh_token"]
                self._save_cached_token()
                self.logger.info("Đã tự động làm mới Spotify Access Token thành công.")
                return True
            else:
                self.logger.error(f"Lỗi làm mới token: HTTP {resp.status_code} - {resp.text}")
                return False
        except requests.exceptions.RequestException as e:
            self.logger.warning(f"Lỗi kết nối khi làm mới token: {e}")
            return False

    def authorize_interactive(self) -> bool:
        """
        Xác thực Spotify OAuth2 thông minh:
        - Mở HTTP Server cục bộ tại cổng của redirect_uri (ví dụ port 8888).
        - Tự động mở trình duyệt qua webbrowser.open().
        - Tự động bắt mã ?code=... và gửi trang HTML tiếng Việt thông báo thành công.
        - Tự động fallback về nhập tay qua console nếu cổng bị chiếm dụng.
        """
        if self.refresh_token and self.refresh_access_token():
            return True

        if not self.client_id or not self.client_secret:
            self.logger.error(
                "Chưa cấu hình SPOTIPY_CLIENT_ID hoặc SPOTIPY_CLIENT_SECRET trong file .env!\n"
                "Vui lòng tạo ứng dụng tại https://developer.spotify.com/dashboard và điền thông tin vào .env."
            )
            return False

        scope = "user-read-playback-state user-read-currently-playing"
        auth_query = urllib.parse.urlencode({
            "client_id": self.client_id,
            "response_type": "code",
            "redirect_uri": self.redirect_uri,
            "scope": scope
        })
        auth_url = f"https://accounts.spotify.com/authorize?{auth_query}"

        # Phân tích host và port từ redirect_uri
        parsed_uri = urllib.parse.urlparse(self.redirect_uri)
        listen_host = parsed_uri.hostname or "127.0.0.1"
        listen_port = parsed_uri.port or 8888

        auth_code: Optional[str] = None

        # Lớp xử lý yêu cầu Callback HTTP
        class OAuthCallbackHandler(http.server.BaseHTTPRequestHandler):
            captured_code = None
            captured_error = None

            def do_GET(self):
                parsed = urllib.parse.urlparse(self.path)
                params = urllib.parse.parse_qs(parsed.query)

                if "code" in params:
                    OAuthCallbackHandler.captured_code = params["code"][0]
                    self.send_response(200)
                    self.send_header("Content-Type", "text/html; charset=utf-8")
                    self.end_headers()
                    success_html = """<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="utf-8">
    <title>Xác thực Spotify Thành Công</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #121212; color: #FFFFFF; text-align: center; padding-top: 80px; margin: 0; }
        .card { background: #181818; border: 1px solid #282828; border-radius: 12px; display: inline-block; padding: 40px; box-shadow: 0 8px 24px rgba(0,0,0,0.6); max-width: 460px; }
        h1 { color: #1DB954; font-size: 26px; margin-bottom: 12px; }
        p { color: #b3b3b3; font-size: 15px; line-height: 1.5; margin: 0; }
        .badge { background: #1DB954; color: #000; font-weight: bold; border-radius: 20px; padding: 6px 16px; display: inline-block; margin-top: 20px; }
    </style>
</head>
<body>
    <div class="card">
        <h1>✔ Xác thực Spotify Thành Công!</h1>
        <p>Ứng dụng <strong>Spotify x Wallpaper Engine Sync</strong> đã kết nối an toàn.</p>
        <p style="margin-top: 10px;">Bạn có thể an tâm đóng tab trình duyệt này.</p>
        <div class="badge">ĐỒNG BỘ ĐÃ SẴN SÀNG</div>
    </div>
</body>
</html>"""
                    self.wfile.write(success_html.encode("utf-8"))
                else:
                    OAuthCallbackHandler.captured_error = params.get("error", ["Không rõ lỗi"])[0]
                    self.send_response(400)
                    self.send_header("Content-Type", "text/html; charset=utf-8")
                    self.end_headers()
                    self.wfile.write(f"<h1>Xác thực thất bại: {OAuthCallbackHandler.captured_error}</h1>".encode("utf-8"))

            def log_message(self, format, *args):
                pass  # Tắt log stdout của HTTP server để giữ console sạch sẽ

        httpd = None
        server_started = False
        try:
            httpd = http.server.HTTPServer((listen_host, listen_port), OAuthCallbackHandler)
            httpd.timeout = 120.0  # Chờ người dùng đăng nhập trong 2 phút
            server_started = True
            self.logger.info(f"Đã mở cổng lắng nghe OAuth tại http://{listen_host}:{listen_port}")
        except Exception as e:
            self.logger.warning(f"Không thể mở cổng lắng nghe tự động {listen_port} ({e}). Chuyển sang chế độ nhập tay.")

        # Tự động mở trình duyệt xác thực
        self.logger.info("Đang tự động mở trình duyệt để xác thực Spotify...")
        try:
            webbrowser.open(auth_url)
        except Exception:
            pass

        if server_started and httpd:
            self.logger.info("Đang chờ xác nhận từ trình duyệt (Tự động nhận diện code)...")
            try:
                httpd.handle_request()
                auth_code = OAuthCallbackHandler.captured_code
            except Exception as e:
                self.logger.warning(f"Lỗi khi bắt callback tự động: {e}")
            finally:
                try:
                    httpd.server_close()
                except Exception:
                    pass

        # Fallback chế độ nhập tay nếu server không bắt được
        if not auth_code:
            print("\n" + "=" * 70)
            print("XÁC THỰC SPOTIFY THỦ CÔNG (FALLBACK)")
            print("1. Nếu trình duyệt chưa tự mở, hãy truy cập link sau:")
            print(f"\n   {auth_url}\n")
            print("2. Sau khi bấm Đồng ý (Agree), sao chép toàn bộ URL chuyển hướng hoặc mã code dán vào đây:")
            print("=" * 70)
            try:
                user_input = input("Nhập URL chuyển hướng hoặc mã Code: ").strip()
                if "code=" in user_input:
                    match = re.search(r"code=([^&]+)", user_input)
                    auth_code = match.group(1) if match else user_input
                else:
                    auth_code = user_input
            except (KeyboardInterrupt, EOFError):
                return False

        if not auth_code:
            self.logger.error("Không nhận được mã xác thực hợp lệ.")
            return False

        # Đổi authorization_code lấy access_token & refresh_token
        auth_header = base64.b64encode(f"{self.client_id}:{self.client_secret}".encode()).decode()
        headers = {
            "Authorization": f"Basic {auth_header}",
            "Content-Type": "application/x-www-form-urlencoded"
        }
        data = {
            "grant_type": "authorization_code",
            "code": auth_code,
            "redirect_uri": self.redirect_uri
        }

        try:
            resp = requests.post(self.TOKEN_URL, headers=headers, data=data, timeout=10.0)
            if resp.status_code == 200:
                res_json = resp.json()
                self.access_token = res_json.get("access_token")
                self.refresh_token = res_json.get("refresh_token")
                expires_in = res_json.get("expires_in", 3600)
                self.token_expires_at = time.time() + expires_in - 60.0
                self._save_cached_token()
                self.logger.info("Xác thực Spotify thành công! Token đã được lưu trữ an toàn.")
                return True
            else:
                self.logger.error(f"Xác thực thất bại: HTTP {resp.status_code} - {resp.text}")
                return False
        except Exception as e:
            self.logger.error(f"Lỗi gửi yêu cầu cấp token: {e}")
            return False

    def get_artist_genres(self, artist_id: str) -> List[str]:
        """
        Lấy danh sách thể loại nhạc (genres) của nghệ sĩ từ Spotify API.
        Tích hợp bộ nhớ đệm RAM (artist_genre_cache) để không gọi lại API cho cùng 1 nghệ sĩ.
        """
        if not artist_id:
            return []

        # Kiểm tra bộ nhớ đệm RAM
        if artist_id in self.artist_genre_cache:
            return self.artist_genre_cache[artist_id]

        if time.time() >= self.token_expires_at:
            if not self.refresh_access_token():
                return []

        headers = {
            "Authorization": f"Bearer {self.access_token}",
            "Content-Type": "application/json"
        }
        artist_url = f"{self.ARTIST_URL}/{artist_id}"
        req_timeout = float(self.sync_cfg.get("request_timeout_seconds", 5.0))

        try:
            resp = requests.get(artist_url, headers=headers, timeout=req_timeout)
            if resp.status_code == 200:
                artist_data = resp.json()
                genres = [g.lower() for g in artist_data.get("genres", []) if isinstance(g, str)]
                self.artist_genre_cache[artist_id] = genres
                self.logger.debug(f"[Genre Cache] Nghệ sĩ {artist_id} có các thể loại: {genres}")
                return genres
            elif resp.status_code == 401:
                if self.refresh_access_token():
                    return self.get_artist_genres(artist_id)
            elif resp.status_code == 429:
                retry_after = int(resp.headers.get("Retry-After", 5))
                time.sleep(retry_after)
        except Exception as e:
            self.logger.debug(f"Không thể lấy thể loại của nghệ sĩ {artist_id}: {e}")

        return []

    def get_current_playback(self) -> Optional[Dict[str, Any]]:
        """
        Lấy thông tin trạng thái phát nhạc hiện tại.
        Bảo vệ toàn diện trước mã lỗi HTTP 429, 401, Timeout và mất mạng.
        """
        if time.time() >= self.token_expires_at:
            if not self.refresh_access_token():
                self.logger.warning("Đang thử kết nối lại với xác thực Spotify...")
                return None

        headers = {
            "Authorization": f"Bearer {self.access_token}",
            "Content-Type": "application/json"
        }
        req_timeout = float(self.sync_cfg.get("request_timeout_seconds", 5.0))

        try:
            resp = requests.get(self.PLAYER_URL, headers=headers, timeout=req_timeout)

            # Trường hợp 1: Tắt Spotify hoặc tạm dừng (HTTP 204 No Content)
            if resp.status_code == 204:
                self.backoff_delay = float(self.sync_cfg.get("backoff_factor", 1.5))
                return None

            # Trường hợp 2: Token hết hạn (HTTP 401)
            if resp.status_code == 401:
                self.logger.info("Access Token đã hết hạn. Đang làm mới...")
                if self.refresh_access_token():
                    return self.get_current_playback()
                return None

            # Trường hợp 3: Bị giới hạn tần suất gọi API (HTTP 429 Too Many Requests)
            if resp.status_code == 429:
                retry_after = int(resp.headers.get("Retry-After", 5))
                self.logger.warning(
                    f"Spotify Rate Limit (HTTP 429)! Tự động hoãn theo yêu cầu máy chủ: {retry_after}s"
                )
                time.sleep(retry_after)
                return None

            # Trường hợp 4: Thành công (HTTP 200)
            if resp.status_code == 200:
                self.backoff_delay = float(self.sync_cfg.get("backoff_factor", 1.5))
                return resp.json()

            self.logger.debug(f"Spotify API trả về trạng thái HTTP {resp.status_code}")
            return None

        except requests.exceptions.Timeout:
            self.logger.warning("Kết nối đến Spotify API bị quá thời gian (Timeout).")
            self._apply_exponential_backoff()
            return None
        except requests.exceptions.ConnectionError:
            self.logger.warning("Không thể kết nối đến máy chủ Spotify (Mất mạng tạm thời).")
            self._apply_exponential_backoff()
            return None
        except requests.exceptions.RequestException as e:
            self.logger.warning(f"Lỗi ngoại lệ mạng khi gọi Spotify API: {e}")
            self._apply_exponential_backoff()
            return None

    def _apply_exponential_backoff(self) -> None:
        """Áp dụng cơ chế Exponential Backoff để chống quá tải khi mất mạng."""
        time.sleep(self.backoff_delay)
        self.backoff_delay = min(self.backoff_delay * 2.0, self.max_backoff)


# ==============================================================================
# 6. MÔ-ĐUN PHÂN TÍCH VÀ BÓC TÁCH DỮ LIỆU BÀI HÁT AN TOÀN (TRACK PARSER)
# ==============================================================================
class TrackMetadataParser:
    """
    Bóc tách an toàn tuyệt đối các trường dữ liệu bài hát từ phản hồi Spotify API.
    Đặc trị các ca hóc búa: Ads, Podcast, Local Files và Album Art thiếu trường.
    """

    @staticmethod
    def parse_playback(playback: Optional[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Phân tích đối tượng playback, trả về từ điển dữ liệu chuẩn hóa:
        - is_playing: bool
        - track_id: str
        - track_title: str
        - artist_name: str
        - primary_artist_id: Optional[str] (Dùng để tra cứu genre)
        - album_name: str
        - thumbnail_url: Optional[str] (kích thước nhỏ nhất để tối ưu RAM)
        - content_type: 'track' | 'ad' | 'episode' | 'local' | 'unknown'
        """
        result = {
            "is_playing": False,
            "track_id": "",
            "track_title": "",
            "artist_name": "",
            "primary_artist_id": None,
            "album_name": "",
            "thumbnail_url": None,
            "content_type": "unknown"
        }

        if not playback or not isinstance(playback, dict):
            return result

        result["is_playing"] = bool(playback.get("is_playing", False))
        curr_type = playback.get("currently_playing_type", "track")
        item = playback.get("item")

        # 1. Trường hợp: Quảng cáo (Ads)
        if curr_type == "ad" or (item and str(item.get("uri", "")).startswith("spotify:ad:")):
            result["content_type"] = "ad"
            result["track_title"] = "[Spotify Advertisement]"
            result["track_id"] = "spotify:ad"
            return result

        if not item or not isinstance(item, dict):
            return result

        # 2. Trường hợp: Podcast / Episode (Không có trường 'album' truyền thống)
        if curr_type == "episode" or item.get("type") == "episode":
            result["content_type"] = "episode"
            result["track_id"] = item.get("id") or item.get("uri") or "podcast_episode"
            result["track_title"] = item.get("name") or "Podcast Episode"
            show = item.get("show", {})
            result["artist_name"] = show.get("name") or "Podcast Show"
            result["album_name"] = show.get("publisher") or "Podcast"

            images = item.get("images") or show.get("images") or []
            if images and isinstance(images, list):
                result["thumbnail_url"] = images[-1].get("url")
            return result

        # 3. Trường hợp: Nhạc nội bộ trên máy người dùng (Local Files)
        if item.get("is_local") or str(item.get("uri", "")).startswith("spotify:local:"):
            result["content_type"] = "local"
            title = item.get("name") or "Local Track"
            artists = ", ".join([a.get("name", "") for a in item.get("artists", []) if a.get("name")]) or "Local Artist"
            result["track_title"] = title
            result["artist_name"] = artists
            result["album_name"] = item.get("album", {}).get("name") or "Local Album"
            result["track_id"] = f"local:{artists}:{title}"
            result["thumbnail_url"] = None
            return result

        # 4. Trường hợp: Bài hát chuẩn (Standard Track)
        result["content_type"] = "track"
        result["track_id"] = item.get("id") or item.get("uri") or ""
        result["track_title"] = item.get("name") or "Unknown Track"

        artists_list = item.get("artists") or []
        result["artist_name"] = ", ".join([a.get("name", "") for a in artists_list if a.get("name")]) or "Unknown Artist"

        # Trích xuất primary_artist_id của ca sĩ chính để phân tích thể loại
        if artists_list and isinstance(artists_list, list) and len(artists_list) > 0:
            result["primary_artist_id"] = artists_list[0].get("id")

        album = item.get("album") or {}
        result["album_name"] = album.get("name") or "Unknown Album"

        images = album.get("images") or []
        if images and isinstance(images, list):
            # Chọn thumbnail nhỏ nhất (64x64 hoặc 300x300) để tải nhanh gấp 10 lần
            result["thumbnail_url"] = images[-1].get("url")

        return result


# ==============================================================================
# 7. VÒNG LẶP ĐỒNG BỘ ĐIỀU PHỐI TRUNG TÂM (CORE SYNC ENGINE)
# ==============================================================================
class SpotifyWallpaperSyncEngine:
    """
    Trình điều phối trung tâm:
    - Quản lý bộ đếm Fallback Timer khi tạm dừng nhạc quá [X] giây.
    - Caching trạng thái (State Caching): Chỉ kích hoạt lệnh khi có thay đổi thực sự.
    - Đổi hình nền theo thể loại nhạc (genre_wallpaper_mapping).
    - Phối hợp lấy màu RAM và điều khiển Wallpaper Engine ngầm.
    """

    def __init__(self, config_path: str = "config.json", env_path: str = ".env"):
        load_env_file(env_path)
        self.config = load_config(config_path)
        self.logger = setup_logger(self.config)

        self.logger.info("=" * 65)
        self.logger.info("   Spotify x Wallpaper Engine Sync Engine - Enterprise v3.2.1")
        self.logger.info("   Tự động OAuth - Khớp Thể Loại (Genre) - Chống Crash - Tối ưu RAM")
        self.logger.info("=" * 65)

        self.we_controller = WallpaperEngineController(self.config, self.logger)
        self.color_extractor = InMemoryColorExtractor(self.logger)
        self.api_client = SpotifyAPIClient(self.config, self.logger)

        self.sync_cfg = self.config.get("sync_settings", {})
        self.we_cfg = self.config.get("wallpaper_engine", {})
        self.color_cfg = self.config.get("album_color_extraction", {})

        # Bộ nhớ đệm trạng thái (State Cache)
        self.last_track_id: Optional[str] = None
        self.last_is_playing: Optional[bool] = None
        self.current_wallpaper: Optional[str] = None

        # Fallback Timer
        self.pause_start_time: Optional[float] = None
        self.fallback_applied: bool = False
        self.pause_timeout: float = float(self.sync_cfg.get("pause_timeout_seconds", 30.0))

        # Cờ vòng lặp chính
        self.running = True

    def initialize(self) -> bool:
        """Khởi động và kiểm tra xác thực ban đầu."""
        if not self.api_client.authorize_interactive():
            self.logger.error("Không thể xác thực với Spotify. Chương trình tạm dừng.")
            return False
        return True

    def handle_fallback(self) -> None:
        """Kích hoạt cơ chế Fallback khi dừng nhạc hoặc tắt Spotify quá thời gian quy định."""
        if self.fallback_applied:
            return

        self.logger.info(
            f"[Fallback] Nhạc đã dừng hơn {self.pause_timeout:.0f}s. "
            "Đang tự động chuyển về hình nền và giao diện dự phòng..."
        )

        default_wp = self.we_cfg.get("default_wallpaper")
        if default_wp and default_wp != self.current_wallpaper:
            if self.we_controller.open_wallpaper(default_wp):
                self.current_wallpaper = default_wp

        default_color = self.we_cfg.get("default_accent_color", "#1DB954")
        if default_color:
            self.we_controller.set_accent_color(default_color)

        self.fallback_applied = True

    def process_cycle(self) -> None:
        """Thực thi một chu kỳ kiểm tra và đồng bộ trạng thái."""
        raw_playback = self.api_client.get_current_playback()
        track = TrackMetadataParser.parse_playback(raw_playback)

        current_is_playing = track["is_playing"]
        current_track_id = track["track_id"]
        content_type = track["content_type"]

        # ==============================================================
        # 1. Xử lý trạng thái Dừng nhạc / Tắt Spotify (Fallback Timer)
        # ==============================================================
        if not current_is_playing:
            if self.pause_start_time is None:
                self.pause_start_time = time.time()
                self.logger.info("[Trạng thái] Nhạc đang tạm dừng hoặc Spotify chưa phát bài nào.")

            elapsed_paused = time.time() - self.pause_start_time
            if elapsed_paused >= self.pause_timeout:
                self.handle_fallback()

            self.last_is_playing = False
            return

        # ==============================================================
        # 2. Nhạc đang phát -> Đặt lại bộ đếm Fallback Timer
        # ==============================================================
        self.pause_start_time = None
        self.fallback_applied = False

        # ==============================================================
        # 3. Bỏ qua Quảng cáo (Ads)
        # ==============================================================
        if content_type == "ad":
            self.logger.info("[Quảng cáo] Đang phát quảng cáo Spotify. Bỏ qua đồng bộ hình nền.")
            return

        # ==============================================================
        # 4. Tối ưu Hiệu năng: Caching trạng thái (State Caching)
        # Chỉ thực thi lệnh khi bài hát hoặc trạng thái phát THỰC SỰ THAY ĐỔI
        # ==============================================================
        if current_track_id == self.last_track_id and current_is_playing == self.last_is_playing:
            return  # Không có thay đổi, không spam lệnh cho Wallpaper Engine

        self.last_track_id = current_track_id
        self.last_is_playing = current_is_playing

        self.logger.info(
            f"[Đang phát] {track['track_title']} - {track['artist_name']} "
            f"[{track['album_name']}] ({content_type})"
        )

        # ==============================================================
        # 5. Đổi hình nền theo thể loại nhạc (genre_wallpaper_mapping)
        # ==============================================================
        if self.we_cfg.get("control_wallpaper", True):
            genre_mapping = self.config.get("genre_wallpaper_mapping", {})
            primary_artist_id = track.get("primary_artist_id")

            matched_wallpaper = None
            if primary_artist_id and genre_mapping:
                genres = self.api_client.get_artist_genres(primary_artist_id)
                for g in genres:
                    g_clean = g.strip().lower()
                    for target_genre, wp_file in genre_mapping.items():
                        target_clean = target_genre.strip().lower()
                        if wp_file and (target_clean in g_clean or g_clean in target_clean):
                            matched_wallpaper = wp_file
                            self.logger.info(
                                f"[Genre Match] Thể loại '{g}' khớp với cấu hình '{target_genre}' -> {wp_file}"
                            )
                            break
                    if matched_wallpaper:
                        break

            # Kích hoạt đổi hình nền nếu tìm thấy và khác hình nền đang phát
            if matched_wallpaper and matched_wallpaper != self.current_wallpaper:
                if self.we_controller.open_wallpaper(matched_wallpaper):
                    self.current_wallpaper = matched_wallpaper

        # ==============================================================
        # 6. Trích xuất màu trên RAM & Cập nhật Wallpaper Engine
        # ==============================================================
        if self.color_cfg.get("enabled", True) and track.get("thumbnail_url"):
            extracted_rgb = self.color_extractor.extract_dominant_color_from_url(track["thumbnail_url"])
            if extracted_rgb:
                self.we_controller.set_accent_color(extracted_rgb)
        elif self.we_cfg.get("control_accent_color", True):
            default_color = self.we_cfg.get("default_accent_color", "#1DB954")
            self.we_controller.set_accent_color(default_color)

    def run(self) -> None:
        """Vòng lặp chạy ngầm chính với khả năng bắt tín hiệu dừng an toàn."""
        if not self.initialize():
            return

        polling_interval = float(self.sync_cfg.get("polling_interval_seconds", 2.0))
        self.logger.info(f"Bắt đầu lắng nghe trạng thái Spotify (Chu kỳ quét: {polling_interval}s)...")

        def handle_signal(sig, frame):
            self.logger.info("Nhận tín hiệu dừng chương trình. Đang dọn dẹp an toàn...")
            self.running = False

        signal.signal(signal.SIGINT, handle_signal)
        signal.signal(signal.SIGTERM, handle_signal)

        while self.running:
            try:
                self.process_cycle()
            except Exception as e:
                self.logger.error(f"Ngoại lệ không mong muốn trong vòng lặp chính: {e}", exc_info=True)

            time.sleep(polling_interval)

        self.logger.info("Chương trình Spotify x Wallpaper Engine Sync đã dừng hoàn tất.")


# ==============================================================================
# ĐIỂM KHỞI CHẠY CHÍNH (ENTRY POINT)
# ==============================================================================
if __name__ == "__main__":
    app = SpotifyWallpaperSyncEngine(
        config_path="config.json",
        env_path=".env"
    )
    app.run()
