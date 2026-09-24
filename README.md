# 🎵 Spotify x Wallpaper Engine Sync v2.0

<div align="center">

![Version](https://img.shields.io/badge/version-2.0.0-1ED760.svg?style=for-the-badge&logo=spotify&logoColor=white)
![Platform](https://img.shields.io/badge/platform-Windows%2010%20%7C%2011-0078D6.svg?style=for-the-badge&logo=windows&logoColor=white)
![Node.js](https://img.shields.io/badge/runtime-Node.js%2020+-339933.svg?style=for-the-badge&logo=node.js&logoColor=white)
![Spicetify](https://img.shields.io/badge/extension-Spicetify-FF6B6B.svg?style=for-the-badge)
![License](https://img.shields.io/badge/license-MIT-9966FF.svg?style=for-the-badge)

**Đồng bộ hình nền động & tĩnh siêu mượt từ Wallpaper Engine hoặc Windows Desktop trực tiếp vào giao diện Spotify bằng Spicetify.**

[Tính Năng Nổi Bật](#-tính-năng-nổi-bật) • [Cài Đặt 1-Click](#-hướng-dẫn-cài-đặt-1-click) • [Gỡ Cài Đặt](#-gỡ-cài-đặt) • [Báo Cáo Kỹ Thuật](DOCS_TINH_NANG.md) • [Sửa Lỗi Phổ Biến](HUONG_DAN_SUA_LOI.md)

</div>

---

## 🌟 Tính Năng Nổi Bật

### 1. 🔄 Đồng Bộ Thời Gian Thực Tự Động (Real-time Sync)
* **Tự động nhận diện:** Liên tục theo dõi hình nền đang phát trên Wallpaper Engine (màn hình chính `Monitor0`) và phản ánh ngay vào giao diện Spotify trong 3–5 giây.
* **Smart Fallback:** Nếu bạn không mở Wallpaper Engine, tiện ích sẽ tự động nhận diện và áp dụng hình nền desktop mặc định của Windows. Spotify của bạn sẽ luôn có hình nền tuyệt đẹp!

### 2. 🎬 Hỗ Trợ Đa Phương Tiện & Phân Giải Scene (.pkg) Độc Quyền
* **Video & Ảnh Tĩnh:** Tương thích hoàn hảo với MP4, WebM, MKV, AVI, MOV và các định dạng ảnh JPG, PNG, WEBP, GIF.
* **🔥 Đột phá mới (Smart Scene Resolver):** Khắc phục triệt để lỗi không hỗ trợ file `.pkg` của bản cũ. Hệ thống tự động bóc tách ảnh bìa/gif động chất lượng cao từ Steam Workshop để hiển thị trên Spotify.

### 3. ⚡ Chuyển Mã Tức Thì & Tiết Kiệm Phần Cứng (FFmpeg On-the-fly)
* **Chuyển mã thông minh:** Sử dụng FFmpeg chuyển đổi các video 2K/4K nặng nề sang định dạng `WebM VP8` tối ưu (1080p, 30 FPS), giảm thiểu tối đa tải CPU/GPU khi nghe nhạc.
* **HTTP Byte-Range Streaming:** Truyền phát từng phần dữ liệu (Status 206 Partial Content), giúp video phát ngay lập tức mà không phải chờ tải toàn bộ.

### 4. 🧹 Bộ Nhớ Đệm Tự Động Dọn Rác (Auto-Cleanup Cache)
* Máy chủ tự động băm mã MD5 theo đường dẫn hình nền để tái sử dụng tức thì ở những lần sau (0ms trễ).
* Tích hợp cơ chế tự động dọn dẹp dung lượng: **Luôn chỉ lưu tối đa 10 video gần nhất**, tự xóa các video cũ hơn khỏi `%TEMP%\spotify_we_cache`. Tuyệt đối không lo đầy ổ cứng.

### 5. 🔔 Hộp Thoại Xác Nhận Trong Ứng Dụng (In-App Sync Prompt)
* Khi bạn đổi hình nền máy tính, một pop-up phong cách Spotify sẽ hiển thị ở góc trên bên phải để hỏi bạn: **"Giữ nguyên"** hay **"Đồng bộ ngay"**. Bạn có toàn quyền quyết định khi nào muốn đồng bộ!

### 6. ✨ Giao Diện Trong Suốt Kính Mờ Cao Cấp (Frosted Glass Theme)
* Xóa bỏ hoàn toàn lớp nền đen đơn điệu của Spotify.
* Áp dụng hiệu ứng kính mờ (Glassmorphism / Frosted Glass) cho thanh bên trái và thẻ nhạc, giúp chữ và danh sách bài hát luôn nổi bật, sắc nét và dễ đọc.

### 7. 🛡️ Cài Đặt Tự Động 1-Click & Chạy Ngầm Bền Bỉ
* Script `install.bat` tự động phát hiện và cài đặt các công cụ thiếu (Node.js, FFmpeg, Spicetify).
* Tạo tiến trình Daemon chạy ngầm khởi động cùng Windows, hoàn toàn ẩn không hiện cửa sổ đen.
* Tự động khóa quyền cập nhật của Spotify để tránh việc cập nhật làm mất giao diện Spicetify.

---

## 🚀 Hướng Dẫn Cài Đặt 1-Click

### Yêu cầu hệ thống:
* **Hệ điều hành:** Windows 10 hoặc Windows 11.
* **Spotify:** Bản Windows Desktop truyền thống (Tải từ [spotify.com](https://www.spotify.com/download/windows/)).  
  *(⚠️ **LƯU Ý:** Bản tải từ Microsoft Store **KHÔNG** được hỗ trợ do chính sách sandbox của Windows).*
* *(Tùy chọn):* Wallpaper Engine (Steam).

### Các bước cài đặt:
1. Tải file **`Spotify_WESync_Plugin.zip`** mới nhất từ tab [Releases](../../releases).
2. Nhấp chuột phải vào file ZIP -> Chọn **Extract All... (Giải nén toàn bộ)** ra một thư mục trên máy tính.
3. Mở thư mục vừa giải nén, nhấp đúp vào **`install.bat`**.
4. Trình cài đặt sẽ tự động thiết lập mọi thứ trong vòng 1-2 phút.
5. Mở Spotify lên và thưởng thức giao diện đồng bộ hình nền cực đỉnh!

---

## 🗑️ Gỡ Cài Đặt

Nếu bạn muốn gỡ bỏ plugin và đưa Spotify về giao diện mặc định:
1. Mở thư mục dự án.
2. Nhấp đúp vào **`uninstall.bat`**.
3. Toàn bộ máy chủ ngầm, cache video và extension sẽ được dọn dẹp sạch sẽ trong 3 giây.

---

## 🛠️ Công Nghệ Sử Dụng (Tech Stack)

* **Node.js:** Máy chủ nền nhẹ, quản lý bộ nhớ đệm, đọc Registry Windows và theo dõi tiến trình Wallpaper Engine.
* **FFmpeg:** Chuyển mã video on-the-fly sang WebM (VP8/Vorbis) hạ tải phần cứng.
* **Spicetify CLI:** Can thiệp DOM và tiêm theme CSS trong suốt vào Spotify Desktop Client.
* **VBScript & Windows Batch:** Điều phối vòng lặp tự phục hồi và tự chạy cùng Windows.

---

## 📖 Tài Liệu Tham Khảo

* Chi tiết kiến trúc & phân tích chuyên sâu từng tính năng: Xem file [DOCS_TINH_NANG.md](DOCS_TINH_NANG.md).
* Khắc phục các lỗi thường gặp: Xem file [HUONG_DAN_SUA_LOI.md](HUONG_DAN_SUA_LOI.md).

---

## 👤 Tác Giả & Bản Quyền

Dự án được tái cấu trúc, nâng cấp tính năng và phát triển bởi:  
**Harilowji** • [GitHub: @Harilowji](https://github.com/Harilowji) • Email: [hloitran2007@gmail.com](mailto:hloitran2007@gmail.com)

Phát hành theo giấy phép [MIT License](LICENSE).
