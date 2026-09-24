@echo off
setlocal
chcp 65001 >nul

echo ======================================================================
echo   🗑️ SPOTIFY x WALLPAPER ENGINE SYNC - BỘ GỠ CÀI ĐẶT
echo   👤 Phát triển bởi: Harilowji (https://github.com/Harilowji)
echo ======================================================================
echo.

echo [CẢNH BÁO] Thao tác này sẽ gỡ bỏ hoàn toàn giao diện nền và tiến trình đồng bộ.
echo Các công cụ hệ thống (Node.js, Spicetify, FFmpeg) sẽ KHÔNG bị xóa.
echo.
set /p CONFIRM="Bạn có chắc chắn muốn tiếp tục gỡ cài đặt không? (Y/N): "
if /i not "%CONFIRM%"=="Y" (
    echo.
    echo Đã hủy thao tác gỡ cài đặt.
    pause
    exit /b 0
)

echo.
echo [1/4] Đang dừng tiến trình máy chủ ngầm và Spotify...
taskkill /f /fi "WINDOWTITLE eq WESyncServer_Loop" >nul 2>nul
taskkill /f /im node.exe >nul 2>nul
taskkill /f /im spotify.exe >nul 2>nul
wmic process where "name='node.exe' and commandline like '%%WESyncServer%%'" call terminate >nul 2>nul
wmic process where "name='cmd.exe' and commandline like '%%WESyncServer_Loop%%'" call terminate >nul 2>nul
timeout /t 2 /nobreak >nul

echo [2/4] Đang xóa file máy chủ nền, startup daemon và bộ nhớ đệm video...
rmdir /s /q "%APPDATA%\WESync" 2>nul
del /q "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\StartWESyncServer.vbs" 2>nul
rmdir /s /q "%TEMP%\spotify_we_cache" 2>nul

echo [3/4] Đang gỡ bỏ extension và theme khỏi Spicetify...
del /q "%APPDATA%\spicetify\Extensions\we-sync.js" 2>nul
rmdir /s /q "%APPDATA%\spicetify\Themes\TransparentTheme" 2>nul

echo [4/4] Đang khôi phục cấu hình Spotify về trạng thái gốc...
set "PATH=%PATH%;%LOCALAPPDATA%\spicetify"

where spicetify >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    spicetify config extensions we-sync.js- >nul 2>nul
    spicetify config current_theme "" >nul 2>nul
    spicetify config inject_css 0 replace_colors 0 overwrite_assets 0 >nul 2>nul
    spicetify apply >nul 2>nul
    echo [OK] Đã khôi phục giao diện Spotify về mặc định thành công!
) else (
    echo [THÔNG TIN] Không tìm thấy lệnh Spicetify trong PATH, bỏ qua bước áp dụng.
)

echo.
echo ======================================================================
echo   ✅ ĐÃ GỠ CÀI ĐẶT THÀNH CÔNG!
echo   Giao diện Spotify đã được trả về trạng thái mặc định sạch sẽ.
echo ======================================================================
echo.
pause
