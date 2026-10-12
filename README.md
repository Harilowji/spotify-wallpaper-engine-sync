# 🎵 Spotify x Wallpaper Engine Sync v2.5

<div align="center">

![Preview](assets/preview.png)

<br/>

[![GitHub Stars](https://img.shields.io/github/stars/Harilowji/spotify-wallpaper-engine-sync?style=for-the-badge&logo=github&color=FFD700)](https://github.com/Harilowji/spotify-wallpaper-engine-sync/stargazers)
[![GitHub Forks](https://img.shields.io/github/forks/Harilowji/spotify-wallpaper-engine-sync?style=for-the-badge&logo=github&color=00B4D8)](https://github.com/Harilowji/spotify-wallpaper-engine-sync/network/members)
[![Version](https://img.shields.io/badge/version-2.5.0-1ED760.svg?style=for-the-badge&logo=spotify&logoColor=white)](https://github.com/Harilowji/spotify-wallpaper-engine-sync/releases)
[![Platform](https://img.shields.io/badge/platform-Windows%2010%20%7C%2011-0078D6.svg?style=for-the-badge&logo=windows&logoColor=white)](https://www.microsoft.com/windows)
[![Spicetify](https://img.shields.io/badge/extension-Spicetify%20v2.45+-FF6B6B.svg?style=for-the-badge)](https://spicetify.app/)
[![License](https://img.shields.io/badge/license-MIT-9966FF.svg?style=for-the-badge)](LICENSE)

<br/>

**Biến giao diện Spotify thành một tác phẩm nghệ thuật sống động — Tự động đồng bộ hình nền động & tĩnh từ Wallpaper Engine hoặc Windows Desktop với hiệu ứng kính mờ (Frosted Glass) siêu mượt!**

[⚡ Lệnh Cài Nhanh 1-Click](#-cách-1-cài-đặt-siêu-tốc-1-dòng-lệnh-powershell---khuyên-dùng) • [✨ Tính Năng Nổi Bật](#-tính-năng-nổi-bật) • [📥 Hướng Dẫn Chi Tiết](#-hướng-dẫn-tải--cài-đặt-chi-tiết) • [🔄 Khắc Phục Khi Update](#-khi-spotify-tự-cập-nhật-thì-làm-sao) • [English Quickstart](#-english-quickstart)

</div>

---

## ⚡ CÀI ĐẶT NHANH TRONG 5 GIÂY (POWERSHELL 1-LINER)

Chỉ cần mở **PowerShell** (hoặc Windows Terminal) trên máy tính của bạn, dán dòng lệnh sau và nhấn **Enter**:

```powershell
iwr -useb https://raw.githubusercontent.com/Harilowji/spotify-wallpaper-engine-sync/main/setup.ps1 | iex
```

*(hoặc dùng lệnh `irm`: `irm https://raw.githubusercontent.com/Harilowji/spotify-wallpaper-engine-sync/main/setup.ps1 | iex`)*

> 💡 **Lệnh trên sẽ tự động:**
> 1. Tải bản cài đặt mới nhất từ GitHub về máy.
> 2. Giải nén an toàn vào thư mục `Downloads`.
> 3. Tự động chạy `install.bat` để cấu hình tất cả mọi thứ (Node.js, FFmpeg, Spicetify, Theme & Server ngầm) hoàn toàn tự động!

---

## 🌟 Tính Năng Nổi Bật

### 1. 🔄 Đồng Bộ Thời Gian Thực (Real-time Live Sync)
* **Tự động nhận diện:** Liên tục theo dõi hình nền đang phát trên Wallpaper Engine (mọi màn hình) và cập nhật ngay vào nền Spotify chỉ sau **3–5 giây**.
* **Smart Windows Fallback:** Khi bạn tắt Wallpaper Engine, hệ thống tự động chuyển sang hình nền Desktop của Windows. Spotify của bạn sẽ luôn có hình nền đẹp, không bao giờ bị đen hay trống trải!

### 2. 🎬 Hỗ Trợ Đa Phương Tiện & Phân Giải Scene (.pkg) Độc Quyền
* **Video & Ảnh:** Tương thích mượt mà với mọi định dạng: `MP4`, `WebM`, `MKV`, `AVI`, `MOV`, `PNG`, `JPG`, `WEBP`, `GIF`.
* **Smart Scene Resolver:** Tự động giải mã và trích xuất ảnh bìa/animation chất lượng cao từ các hình nền dạng Scene (`.pkg` / `project.json`) của Steam Workshop.

### 3. ⚡ Chuyển Mã Tức Thì & Tiết Kiệm Phần Cứng (FFmpeg On-the-Fly)
* Tự động nén và chuyển mã video 2K/4K sang định dạng `WebM VP8` tối ưu (1080p, 30 FPS).
* Công nghệ **HTTP Byte-Range Streaming** (Status 206) phát video ngay lập tức với mức tiêu thụ CPU & GPU cực thấp.
* **Bộ nhớ đệm thông minh (Auto Cache Cleaner):** Tự động băm mã MD5 và chỉ lưu tối đa 10 hình nền gần nhất, tự dọn dẹp các file cũ trong `%TEMP%\spotify_we_cache`, đảm bảo không lo đầy ổ cứng.

### 4. 💎 Giao Diện Kính Mờ Trong Suốt Đỉnh Cao (Frosted Glass Theme)
* Xóa sạch các khối nền hộp đen đục ngầu truyền thống của Spotify.
* Hiệu ứng kính mờ **Glassmorphism** sang trọng cho thanh danh sách phát (Left Sidebar), thanh điều khiển (Player Bar) và khung lời bài hát (Lyrics).
* **Trang Nghệ sĩ (Artist Page) trong suốt:** Tích hợp hiệu ứng cuộn mờ dần mượt mà, hòa quyện tự nhiên cùng hình nền động.

### 5. 🐱 Chi Tiết Tùy Chỉnh Độc Đáo
* **Icon chú mèo đáng yêu:** Tích hợp icon mèo trắng sinh động ngay cạnh biểu tượng micro, căn chỉnh tỉ lệ 36px chuẩn xác.
* **Cover Art 42px tinh chỉnh:** Kích thước ảnh bìa bài hát được tối ưu không bị vỡ hạt và không bị tràn viền khi bạn phóng to cửa sổ Spotify.

### 6. 🛡️ Kháng Cập Nhật Toàn Diện (Anti-Update Shield & PE Auto-Healer)
* **Tường chắn Anti-Update Shield:** Tự động thiết lập quyền ACL khóa chặt thư mục `Update` và `SpotifyUpdate.exe`. Spotify hoàn toàn không thể âm thầm tải bản cập nhật ngầm để ghi đè làm mất hình nền của bạn!
* **Nhận diện PE siêu tốc (<15ms):** Thuật toán đọc header nhị phân của file thực thi Spotify.exe tức thì, loại bỏ hoàn toàn độ trễ và tránh hiện tượng đơ máy.
* **Bộ nâng cấp an toàn 1-Click (`update_spotify.bat`):** Khi bạn muốn chủ động nâng cấp Spotify lên bản mới nhất, công cụ sẽ tự động mở khóa, cập nhật, nạp lại mod Spicetify và tái kích hoạt khiên bảo vệ.

---

## 📥 Hướng Dẫn Tải & Cài Đặt Chi Tiết

Dành cho tất cả mọi người khi truy cập GitHub của dự án!

### 📋 Điều kiện cần chuẩn bị:
1. **Hệ điều hành:** Windows 10 hoặc Windows 11 (64-bit).
2. **Spotify:** Cài đặt bản **Spotify Desktop truyền thống** tải từ trang chủ [spotify.com/download](https://www.spotify.com/download/windows/).  
   > ⚠️ **LƯU Ý QUAN TRỌNG:** Bản tải từ **Microsoft Store** sẽ **KHÔNG** hoạt động do chính sách cô lập ứng dụng (sandbox) của Windows. Nếu đang dùng bản Store, bạn hãy gỡ ra và tải file `.exe` từ web Spotify nhé!
3. *(Tùy chọn)*: **Wallpaper Engine** trên Steam.

---

### 🚀 Cách 1: Dùng lệnh tải tự động 1-Click (Khuyên dùng)
Mở **PowerShell** và chạy lệnh:
```powershell
iwr -useb https://raw.githubusercontent.com/Harilowji/spotify-wallpaper-engine-sync/main/setup.ps1 | iex
```

---

### 📦 Cách 2: Tải thủ công file ZIP từ GitHub
1. Nhấp vào nút xanh **`Code`** ở đầu trang này -> Chọn **`Download ZIP`**  
   *(Hoặc tải từ mục [Releases](https://github.com/Harilowji/spotify-wallpaper-engine-sync/releases))*.
2. Chuột phải vào file `.zip` vừa tải -> Chọn **`Extract All...` (Giải nén toàn bộ)** ra một thư mục bất kỳ.  
   > ⚠️ **Chú ý:** Không chạy trực tiếp từ trong file nén `.zip`, phải giải nén ra trước!
3. Mở thư mục đã giải nén, nhấp đúp vào file **`install.bat`**.
4. Trình cài đặt tự động sẽ làm mọi việc trong 1-2 phút.

---

### 💻 Cách 3: Dành cho Developer (Dùng Git)
```bash
# 1. Clone repository về máy
git clone https://github.com/Harilowji/spotify-wallpaper-engine-sync.git

# 2. Truy cập vào thư mục
cd spotify-wallpaper-engine-sync

# 3. Khởi chạy bộ cài đặt
install.bat
```

---

## 🔄 Khi Nâng Cấp Spotify Hoặc Bị Mất Giao Diện Thì Làm Sao?
Nhờ vào **Anti-Update Shield**, Spotify sẽ không thể âm thầm tự cập nhật ngầm gây mất mod nữa. Trong trường hợp bạn chủ động nâng cấp hoặc cần khôi phục:

* **Chủ động nâng cấp Spotify mới nhất an toàn:** Nhấp đúp vào **`update_spotify.bat`** — hệ thống sẽ tự động nâng cấp Spotify lên phiên bản mới nhất từ trang chủ, tái áp dụng giao diện kính mờ và bật lại khiên chắn bảo vệ.
* **Kiểm tra & Khôi phục tức thì 1-Click:** Nhấp đúp vào **`check_update.bat`** (hoặc `install.bat`) để hệ thống tự động kiểm tra và phục hồi lại mod chỉ trong 3 giây.
* **Tự động trong nền:** Dịch vụ ngầm `WESyncServer` sẽ tự động nhận diện và khôi phục khi phát hiện phiên bản Spotify thay đổi.

---

## 🗑️ Gỡ Cài Đặt (Uninstall)

Nếu bạn muốn đưa Spotify về lại giao diện gốc ban đầu:
1. Mở thư mục dự án.
2. Nhấp đúp vào file **`uninstall.bat`**.
3. Toàn bộ tiến trình nền, cache video và theme tùy chỉnh sẽ được gỡ bỏ hoàn toàn sạch sẽ trong 3 giây.

---

## 🌍 English Quickstart

### Prerequisites
* Windows 10 / 11 (64-bit).
* Standard Spotify Desktop client from [spotify.com/download](https://www.spotify.com/download/windows/) (Microsoft Store version is **not** supported).
* *(Optional)* Wallpaper Engine on Steam.

### 1-Line PowerShell Installation (Recommended)
Open **PowerShell** and run:
```powershell
iwr -useb https://raw.githubusercontent.com/Harilowji/spotify-wallpaper-engine-sync/main/setup.ps1 | iex
```

### Manual Installation
1. Click **Code** -> **Download ZIP** (or get it from [Releases](https://github.com/Harilowji/spotify-wallpaper-engine-sync/releases)).
2. Extract the ZIP archive completely.
3. Double-click **`install.bat`**.
4. The automated installer will download required dependencies (`Node.js`, `FFmpeg`, `Spicetify`) via Windows Package Manager (`winget`), register the background daemon, and inject the theme.
5. Launch Spotify and enjoy your synchronized live wallpaper!

---

## 🛠️ Công Nghệ Sử Dụng (Tech Stack)

* **Node.js:** Máy chủ nền siêu nhẹ, giám sát registry Windows & Wallpaper Engine IPC.
* **FFmpeg:** Chuyển mã video đa luồng on-the-fly sang WebM (VP8/Vorbis).
* **Spicetify CLI:** Can thiệp DOM và tiêm CSS / JS vào client Spotify.
* **Vanilla JavaScript & CSS3:** Tùy biến giao diện kính mờ và xử lý video không độ trễ.
* **Windows Batch & VBScript & PowerShell:** Điều phối cài đặt và tự phục hồi mượt mà.

---

## 👤 Tác Giả & Đóng Góp

Dự án được nghiên cứu, tối ưu hóa và phát triển bởi:  
**Harilowji**  
* 🐙 **GitHub:** [@Harilowji](https://github.com/Harilowji)
* 📧 **Email:** [hloitran2007@gmail.com](mailto:hloitran2007@gmail.com)
* 💡 *Nếu bạn thấy dự án hữu ích, hãy tặng một ngôi sao ⭐ (Star) trên GitHub để ủng hộ mình nhé!*

---

## 📄 Bản Quyền (License)

Dự án được phát hành theo giấy phép **[MIT License](LICENSE)**. Tự do sử dụng, chỉnh sửa và chia sẻ.
