@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul
title Spotify x Wallpaper Engine Sync - Studio Suite v3.1.0
cls

echo ======================================================================
echo    Spotify x Wallpaper Engine Sync - Trình Cài Đặt Tự Động v3.1.0
echo    Phát triển & Tối ưu bởi: Harilowji (https://github.com/Harilowji)
echo    Tự động cấu hình 100%% - Trong suốt tuyệt đối - Chống lỗi vặt
echo ======================================================================
echo.

:: 0. Ngăn chặn lỗi chạy trực tiếp từ file nén ZIP
if not exist "%~dp0WESyncServer.js" (
    echo.
    echo ======================================================================
    echo [LỖI NGHIÊM TRỌNG] THIẾU CÁC FILE CÀI ĐẶT!
    echo.
    echo Có vẻ bạn đang click trực tiếp từ trong file nén .ZIP.
    echo Vui lòng bấm chuột phải vào file ZIP -^> chọn 'Extract All' (Giải nén toàn bộ)
    echo ra một thư mục bình thường rồi chạy lại file install.bat nhé!
    echo ======================================================================
    echo.
    pause
    exit /b 1
)

:: 1. Đóng triệt để Spotify đang chạy ngầm để chống lỗi "The Spotify application is not responding"
echo [*] [1/7] Đang đóng các tiến trình Spotify để chuẩn bị cài đặt...
taskkill /F /IM Spotify.exe >nul 2>&1
timeout /t 1 /nobreak >nul

:: 2. Kiểm tra bản Spotify Desktop chuẩn
echo [*] [2/7] Đang kiểm tra phiên bản Spotify Desktop...
set "SPOTIFY_DIR=%APPDATA%\Spotify"
set "SPOTIFY_EXE=%APPDATA%\Spotify\Spotify.exe"

if not exist "%SPOTIFY_EXE%" (
    echo [!] Không tìm thấy bản Spotify Desktop truyền thống tại %APPDATA%\Spotify.
    echo [*] Đang kiểm tra bản cài đặt từ winget...
    winget install Spotify.Spotify --accept-package-agreements --accept-source-agreements
    timeout /t 2 /nobreak >nul
)

:: 3. Dừng tiến trình WESyncServer cũ (Chỉ dừng tiến trình của server này, KHÔNG kill nhầm node.exe khác)
echo [*] [3/7] Đang dọn dẹp các tiến trình máy chủ cũ...
powershell -Command "Get-CimInstance Win32_Process | Where-Object { ($_.Name -eq 'node.exe' -and $_.CommandLine -like '*WESyncServer*') -or ($_.Name -eq 'cmd.exe' -and $_.CommandLine -like '*WESyncServer_Loop*') } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }" >nul 2>&1

:: 4. Cài đặt Spicetify Extensions & Khóa cập nhật Spotify
echo [*] [4/7] Đang sao chép Extensions và thiết lập khiên bảo vệ...
if not exist "%APPDATA%\spicetify\Extensions" mkdir "%APPDATA%\spicetify\Extensions"
copy /y "%~dp0we-sync.js" "%APPDATA%\spicetify\Extensions\we-sync.js" >nul
if exist "%~dp0cat-jam.js" copy /y "%~dp0cat-jam.js" "%APPDATA%\spicetify\Extensions\cat-jam.js" >nul
if exist "%~dp0adblock.js" copy /y "%~dp0adblock.js" "%APPDATA%\spicetify\Extensions\adblock.js" >nul

:: Chặn triệt để Spotify Auto-Update tự ý ghi đè làm mất giao diện Spicetify
mkdir "%LOCALAPPDATA%\Spotify\Update" 2>nul
icacls "%LOCALAPPDATA%\Spotify\Update" /deny "%username%":(OI)(CI)(W,D) >nul 2>nul
echo. > "%LOCALAPPDATA%\Spotify\SpotifyUpdate.exe" 2>nul
icacls "%LOCALAPPDATA%\Spotify\SpotifyUpdate.exe" /deny "%username%":(W,D) >nul 2>nul

:: 5. Cài đặt Theme & Áp dụng Spicetify
echo [*] [5/7] Đang cài đặt TransparentTheme và kích hoạt Spicetify...
if not exist "%APPDATA%\spicetify\Themes\TransparentTheme" mkdir "%APPDATA%\spicetify\Themes\TransparentTheme"
copy /y "%~dp0user.css" "%APPDATA%\spicetify\Themes\TransparentTheme\user.css" >nul
copy /y "%~dp0color.ini" "%APPDATA%\spicetify\Themes\TransparentTheme\color.ini" >nul

call spicetify config extensions we-sync.js cat-jam.js adblock.js >nul 2>&1
call spicetify config current_theme TransparentTheme >nul 2>&1
call spicetify config inject_css 1 replace_colors 1 overwrite_assets 1 >nul 2>&1

:: Đóng lại Spotify nếu có phát sinh
taskkill /F /IM Spotify.exe >nul 2>&1
timeout /t 1 /nobreak >nul

call spicetify apply >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [THÔNG TIN] Đang tự động sao lưu và áp dụng Spicetify (backup apply)...
    call spicetify backup apply
    if !ERRORLEVEL! neq 0 (
        echo [THÔNG TIN] Đang khôi phục và đồng bộ lại...
        call spicetify restore backup apply
    )
)

:: Luôn áp dụng bản vá tương thích Spotify 1.3.5+ (Rspack & Proxy Fallback)
if exist "%~dp0patch-spotify-1.3.5.js" (
    echo [*] Đang áp dụng bản vá chunk Spotify 1.3.5+...
    node "%~dp0patch-spotify-1.3.5.js"
)

:: 6. Đăng ký máy chủ tự khởi động cùng Windows (Startup Shortcut)
echo [*] [6/7] Đang thiết lập máy chủ chạy ngầm cùng Windows...
if not exist "%APPDATA%\WESync" mkdir "%APPDATA%\WESync"
copy /y "%~dp0WESyncServer.js" "%APPDATA%\WESync\WESyncServer.js" >nul
copy /y "%~dp0WESyncServer_Silent.vbs" "%APPDATA%\WESync\WESyncServer_Silent.vbs" >nul
if exist "%~dp0catjam.webm" copy /y "%~dp0catjam.webm" "%APPDATA%\WESync\catjam.webm" >nul

powershell -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut([System.IO.Path]::Combine($env:APPDATA, 'Microsoft\Windows\Start Menu\Programs\Startup\WESyncServer.lnk')); $s.TargetPath = 'wscript.exe'; $s.Arguments = '\"' + [System.IO.Path]::Combine($env:APPDATA, 'WESync\WESyncServer_Silent.vbs') + '\"'; $s.WorkingDirectory = [System.IO.Path]::Combine($env:APPDATA, 'WESync'); $s.WindowStyle = 7; $s.Save()"

:: Khởi động máy chủ ngầm ngay lập tức
wscript "%APPDATA%\WESync\WESyncServer_Silent.vbs"
timeout /t 2 /nobreak >nul

:: 7. Khởi chạy Spotify an toàn
echo [*] [7/7] Đang mở lại Spotify...
if exist "%SPOTIFY_EXE%" (
    start "" "%SPOTIFY_EXE%"
)

echo.
echo ======================================================================
echo    [THÀNH CÔNG] Đã hoàn tất nâng cấp lên v3.1.0!
echo    - Nhấn Alt + S trong Spotify để mở bảng Cài Đặt Kính Mờ & Visualizer.
echo    - Máy chủ WESync đã được cấu hình chạy ngầm và tự khởi động cùng Windows.
echo ======================================================================
pause
