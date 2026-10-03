# 🛠️ Hướng Dẫn Khắc Phục Sự Cố (Troubleshooting Guide)
### Spotify x Wallpaper Engine Sync • Developed by Harilowji

Nếu bạn gặp phải bất kỳ vấn đề nào trong quá trình cài đặt hoặc sử dụng, hãy tra cứu các tình huống phổ biến dưới đây để xử lý nhanh chóng:

---

### ❌ Tình huống 1: Mở Spotify lên vẫn là giao diện đen xám gốc (Không có nền trong suốt)
* **Nguyên nhân chính:**
  1. Bạn đang sử dụng phiên bản **Microsoft Store** của Spotify. Spicetify không thể can thiệp vào mã nguồn của ứng dụng trong môi trường Sandbox của Microsoft Store.
  2. Lối tắt Spotify trên Desktop hoặc Taskbar đang trỏ tới phiên bản cũ.
* **Cách khắc phục:**
  1. Mở Windows **Settings > Apps > Installed apps**, tìm Spotify có biểu tượng Microsoft Store và chọn **Uninstall**.
  2. Truy cập [trang tải chính thức của Spotify](https://www.spotify.com/download/windows/) để tải về bản cài đặt truyền thống (**Desktop Standalone**).
  3. Cài đặt Spotify xong, nhấp đúp chạy lại `install.bat`.

---

### ❌ Tình huống 2: Báo lỗi "The system cannot find the path specified" hoặc thiếu file
* **Nguyên nhân chính:**
  1. Bạn **chưa giải nén** file ZIP mà đã nhấp đúp trực tiếp vào `install.bat` từ trong cửa sổ xem trước của trình giải nén.
  2. Bạn chọn chuột phải vào `install.bat` và chọn *"Run as Administrator"* (Chạy với quyền quản trị viên) khiến thư mục làm việc bị chuyển về `C:\Windows\System32`.
* **Cách khắc phục:**
  1. Nhấp chuột phải vào file nén `.zip` -> Chọn **Extract All... (Giải nén toàn bộ)** ra một thư mục thông thường.
  2. Mở thư mục vừa giải nén, **nhấp đúp chuột trái thông thường** vào `install.bat` (Tuyệt đối không chạy bằng quyền Administrator).

---

### ❌ Tình huống 3: Spotify hiển thị "🔌 Máy chủ đồng bộ chưa chạy (kiểm tra WESyncServer)"
* **Nguyên nhân chính:**
  * Tiến trình máy chủ chạy ngầm (`node.exe`) bị phần mềm diệt virus (Windows Defender / Antivirus của bên thứ 3) chặn hoặc cổng `8989` đang bị chiếm dụng.
* **Cách khắc phục:**
  1. Nhấn tổ hợp phím `Win + R`, nhập `%APPDATA%\WESync` rồi nhấn **Enter**.
  2. Trong thư mục hiện ra, nhấp đúp vào `WESyncServer_Loop.bat` để chạy trực tiếp trên màn hình xem log báo lỗi.
  3. Nếu Antivirus hiển thị cảnh báo, hãy chọn **Allow / Cho phép**. Cổng `8989` là cổng kết nối nội bộ (`127.0.0.1`) an toàn 100%.

---

### ❓ Tình huống 4: Đổi hình nền máy tính thấy hơi chậm một chút? Ổ cứng có bị đầy không?
* **Giải thích hoạt động:**
  1. **Chuyển mã tối ưu (Transcoding):** Khi bạn chuyển sang một hình nền video độ phân giải cao (2K, 4K) lần đầu tiên, FFmpeg sẽ chuyển mã sang định dạng `WebM VP8` tối ưu cho Spotify trong khoảng 5–10 giây. Thao tác này tiêu tốn CPU tạm thời nên máy có thể hơi giật nhẹ vài giây là hoàn toàn bình thường.
  2. **Bộ nhớ đệm (Cache):** Sau khi chuyển mã xong, video được lưu vào bộ nhớ tạm. Những lần sau chuyển lại hình nền đó sẽ hiển thị tức thì 0 giây.
  3. **Không lo đầy ổ cứng:** Máy chủ nền tích hợp sẵn cơ chế **Auto-Cleanup** tự động duy trì tối đa **10 hình nền gần nhất** trong `%TEMP%\spotify_we_cache`. Các hình nền cũ hơn sẽ tự động được xóa vĩnh viễn.

---

### 🌟 Tình huống 5: Hình nền Wallpaper Engine là dạng Scene (.pkg / Web) thì sao?
* **Bản nâng cấp độc quyền v2.0 của Harilowji:**
  * Ở phiên bản gốc của Trung Quốc, khi gặp file `.pkg` hệ thống sẽ báo lỗi `Unsupported format`.
  * Trong phiên bản v2.0 này, hệ thống đã được tích hợp bộ phân giải thông minh (**Smart Scene Resolver**): Tự động trích xuất ảnh bìa chất lượng cao (`preview.jpg`, `preview.gif`, `preview.png`) của hình nền từ Steam Workshop để làm nền tĩnh / động cho Spotify cực kỳ đẹp mắt, không còn bất kỳ lỗi nào!

---

### 🔄 Tình huống 6: Spotify vừa cập nhật phiên bản mới làm mất nền
* **Nguyên nhân:**
  * Spotify tự động cập nhật phiên bản mới (như v1.3.3) và ghi đè gói `xpui.spa` gốc, làm mất mã can thiệp của Spicetify.
* **Cách khắc phục:**
  * **Cách 1 (Nhanh nhất & Đơn giản nhất):** Nhấp đúp chuột chạy lại file `install.bat`. Trình cài đặt đã được nâng cấp cơ chế tự nhận diện phiên bản mới, tự dọn dẹp backup cũ và nạp lại toàn bộ mod chỉ trong 5 giây!
  * **Cách 2 (Bằng dòng lệnh Terminal):** Mở PowerShell hoặc Command Prompt gõ lần lượt:
    ```bash
    spicetify restore
    spicetify clear
    spicetify backup apply
    ```
    Giao diện kính mờ và tính năng đồng bộ Wallpaper Engine sẽ xuất hiện trở lại ngay lập tức!
