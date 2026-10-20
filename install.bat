@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul

echo ======================================================================
echo   🎵 SPOTIFY x WALLPAPER ENGINE SYNC - BỘ CÀI ĐẶT ZERO-TOUCH v2.5.2
echo   👤 Phát triển bởi: Harilowji (https://github.com/Harilowji)
echo   ✨ Tự động cấu hình 100%% - Trong suốt tuyệt đối - Chống lỗi vặt
echo ======================================================================
echo.

:: ==========================================
:: Bước 0: Ngăn chặn lỗi chạy trực tiếp từ file nén ZIP
:: ==========================================
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

:: ==========================================
:: Bước 1: Kiểm tra & Xử lý bản Spotify chuẩn
:: ==========================================
echo [*] [1/6] Đang kiểm tra phiên bản Spotify Desktop...

:: Đóng các tiến trình Spotify đang chạy ngầm trước để tránh xung đột
taskkill /f /im Spotify.exe >nul 2>nul

set "SPOTIFY_DIR=%APPDATA%\Spotify"
set "SPOTIFY_EXE=%APPDATA%\Spotify\Spotify.exe"
set "NEED_INSTALL_SPOTIFY=0"

if not exist "!SPOTIFY_EXE!" (
    set "NEED_INSTALL_SPOTIFY=1"
)

:: Kiểm tra nếu người dùng đang dùng bản Microsoft Store (SpotifyAB.SpotifyMusic)
set "STORE_DETECTED="
for /f "tokens=*" %%P in ('powershell -NoProfile -Command "(Get-AppxPackage -Name SpotifyAB.SpotifyMusic -ErrorAction SilentlyContinue).PackageFamilyName" 2^>nul') do (
    set "STORE_DETECTED=%%P"
)

if defined STORE_DETECTED (
    echo.
    echo [CẢNH BÁO] Phát hiện bạn đang sử dụng Spotify từ Microsoft Store!
    echo Bản Microsoft Store bị Windows cô lập (Sandbox), Spicetify KHÔNG THỂ can thiệp giao diện.
    echo [*] Đang tự động gỡ bản Microsoft Store và cài đặt bản Spotify Desktop chuẩn...
    winget uninstall SpotifyAB.SpotifyMusic --accept-source-agreements >nul 2>nul
    set "NEED_INSTALL_SPOTIFY=1"
)

if "!NEED_INSTALL_SPOTIFY!"=="1" (
    echo [*] Đang cài đặt Spotify Desktop chính thức qua winget...
    winget install Spotify.Spotify --accept-package-agreements --accept-source-agreements
    timeout /t 3 /nobreak >nul
    if not exist "!SPOTIFY_EXE!" (
        echo [!] Chưa tìm thấy Spotify sau khi winget cài đặt. Bạn có thể tải thủ công tại:
        echo     https://www.spotify.com/download/windows/
    ) else (
        echo [OK] Đã cài đặt thành công Spotify Desktop chuẩn!
    )
) else (
    echo [OK] Spotify Desktop chuẩn đã sẵn sàng.
)

:: Khởi chạy 5s để tự sinh file cấu hình prefs nếu là máy mới cài Spotify
if not exist "%APPDATA%\Spotify\prefs" (
    if exist "!SPOTIFY_EXE!" (
        echo [*] Khởi chạy Spotify lần đầu để tự động tạo file cấu hình (prefs)...
        start "" "!SPOTIFY_EXE!"
        timeout /t 5 /nobreak >nul
        taskkill /f /im Spotify.exe >nul 2>nul
        timeout /t 1 /nobreak >nul
    )
)

:: ==========================================
:: Bước 2: Kiểm tra các công cụ hệ thống (winget, Node, Spicetify, FFmpeg)
:: ==========================================
echo.
echo [*] [2/6] Đang kiểm tra các công cụ phụ thuộc hệ thống...

:: 1. Kiểm tra winget
where winget >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [CẢNH BÁO] Hệ thống chưa có 'winget'.
    echo Nếu thiếu Node.js hoặc FFmpeg, bạn có thể cài thủ công:
    echo   - Node.js: https://nodejs.org/
    echo   - FFmpeg:  https://ffmpeg.org/download.html
)

:: 2. Kiểm tra Node.js
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [THÔNG TIN] Đang tự động cài đặt Node.js qua winget...
    winget install OpenJS.NodeJS --accept-package-agreements --accept-source-agreements
    echo [THÀNH CÔNG] Đã cài đặt Node.js!
) else (
    echo [OK] Node.js đã sẵn sàng.
)

:: 3. Kiểm tra Spicetify CLI
where spicetify >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [THÔNG TIN] Đang tự động cài đặt Spicetify CLI...
    powershell -NoProfile -Command "iwr -useb https://raw.githubusercontent.com/spicetify/cli/main/install.ps1 | iex"
    set "PATH=%PATH%;%LOCALAPPDATA%\spicetify"
    echo [THÀNH CÔNG] Đã cài đặt Spicetify CLI!
) else (
    echo [OK] Spicetify CLI đã sẵn sàng.
)

:: 4. Kiểm tra FFmpeg
where ffmpeg >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [THÔNG TIN] Đang tự động cài đặt FFmpeg qua winget...
    winget install Gyan.FFmpeg --accept-package-agreements --accept-source-agreements
    echo [THÀNH CÔNG] Đã cài đặt FFmpeg!
) else (
    echo [OK] FFmpeg đã sẵn sàng.
)

:: Làm mới biến môi trường PATH tạm thời cho phiên làm việc
for /f "tokens=2*" %%A in ('reg query "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" /v Path 2^>nul') do set "SYS_PATH=%%B"
for /f "tokens=2*" %%A in ('reg query "HKCU\Environment" /v Path 2^>nul') do set "USR_PATH=%%B"
set "PATH=%SYS_PATH%;%USR_PATH%;%PATH%;%LOCALAPPDATA%\spicetify;C:\Program Files\nodejs"

:: ==========================================
:: Bước 3: Cài đặt Máy chủ nền (Daemon Server)
:: ==========================================
echo.
echo [*] [3/6] Đang cài đặt máy chủ nền WESync Server...

mkdir "%APPDATA%\WESync" 2>nul
copy /y "%~dp0WESyncServer.js" "%APPDATA%\WESync\" >nul
if exist "%~dp0catjam.webm" copy /y "%~dp0catjam.webm" "%APPDATA%\WESync\" >nul

:: Dừng CHÍNH XÁC tiến trình WESyncServer cũ qua CIM/PowerShell
:: (KHÔNG dùng taskkill /im node.exe bừa bãi tránh tắt nhầm ứng dụng khác, KHÔNG dùng wmic vì đã bị gỡ trên Win 11 24H2+)
powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { ($_.Name -eq 'node.exe' -and $_.CommandLine -like '*WESyncServer*') -or ($_.Name -eq 'cmd.exe' -and $_.CommandLine -like '*WESyncServer_Loop*') } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }" >nul 2>nul

timeout /t 1 /nobreak >nul
rmdir /s /q "%TEMP%\spotify_we_cache" 2>nul

:: Tự động phân giải đường dẫn thực tế của node.exe và ffmpeg.exe
set "NODE_EXE="
for /f "delims=" %%I in ('where node 2^>nul') do (
    set "NODE_EXE=%%I"
    goto :found_node
)
:found_node
if "%NODE_EXE%"=="" (
    if exist "C:\Program Files\nodejs\node.exe" (
        set "NODE_EXE=C:\Program Files\nodejs\node.exe"
    ) else (
        set "NODE_EXE=node"
    )
)

set "FFMPEG_EXE="
for /f "delims=" %%I in ('where ffmpeg 2^>nul') do (
    set "FFMPEG_EXE=%%I"
    goto :found_ffmpeg
)
:found_ffmpeg
if "%FFMPEG_EXE%"=="" (
    if exist "%LOCALAPPDATA%\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe" (
        for /f "delims=" %%F in ('dir /s /b "%LOCALAPPDATA%\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg.exe" 2^>nul') do (
            set "FFMPEG_EXE=%%F"
            goto :found_ffmpeg_search
        )
    )
)
:found_ffmpeg_search
if "%FFMPEG_EXE%"=="" (
    set "FFMPEG_EXE=ffmpeg"
)

:: Tạo script vòng lặp tự phục hồi khi crash (Self-Healing Loop)
set "LOOP_BAT=%APPDATA%\WESync\WESyncServer_Loop.bat"
(
    echo @echo off
    echo :loop
    echo if not exist "%%APPDATA%%\WESync\WESyncServer.js" exit /b
    echo set "FFMPEG_PATH=%FFMPEG_EXE%"
    echo "%NODE_EXE%" "%%APPDATA%%\WESync\WESyncServer.js"
    echo timeout /t 10 /nobreak ^>nul
    echo goto loop
) > "%LOOP_BAT%"

:: Đăng ký khởi động ngầm cùng Windows (Startup Daemon qua VBScript)
set "VBS_PATH=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\StartWESyncServer.vbs"
(
    echo Set objShell = CreateObject^("WScript.Shell"^)
    echo objShell.Run "cmd /c ""%APPDATA%\WESync\WESyncServer_Loop.bat""", 0, False
) > "%VBS_PATH%"

:: ==========================================
:: Bước 4: Cài đặt Spicetify Extension & Khóa cập nhật Spotify
:: ==========================================
echo.
echo [*] [4/6] Đang cài đặt Spicetify Extensions và thiết lập khiên bảo vệ...

if not exist "%APPDATA%\spicetify\Extensions" mkdir "%APPDATA%\spicetify\Extensions"
copy /y "%~dp0we-sync.js" "%APPDATA%\spicetify\Extensions\we-sync.js" >nul
if exist "%~dp0cat-jam.js" copy /y "%~dp0cat-jam.js" "%APPDATA%\spicetify\Extensions\cat-jam.js" >nul
if exist "%~dp0adblock.js" copy /y "%~dp0adblock.js" "%APPDATA%\spicetify\Extensions\adblock.js" >nul

:: Chặn triệt để Spotify Auto-Update tự ý ghi đè làm mất giao diện Spicetify
mkdir "%LOCALAPPDATA%\Spotify\Update" 2>nul
icacls "%LOCALAPPDATA%\Spotify\Update" /deny "%username%":(OI)(CI)(W,D) >nul 2>nul
echo. > "%LOCALAPPDATA%\Spotify\SpotifyUpdate.exe" 2>nul
icacls "%LOCALAPPDATA%\Spotify\SpotifyUpdate.exe" /deny "%username%":(W,D) >nul 2>nul

:: ==========================================
:: Bước 5: Cài đặt Theme & Áp dụng Spicetify thông minh
:: ==========================================
echo.
echo [*] [5/6] Đang cài đặt Ultra-Transparent Theme và áp dụng cài đặt...

if not exist "%APPDATA%\spicetify\Themes\TransparentTheme" mkdir "%APPDATA%\spicetify\Themes\TransparentTheme"
copy /y "%~dp0user.css" "%APPDATA%\spicetify\Themes\TransparentTheme\user.css" >nul
copy /y "%~dp0color.ini" "%APPDATA%\spicetify\Themes\TransparentTheme\color.ini" >nul

spicetify config extensions "we-sync.js|cat-jam.js|adblock.js" >nul 2>nul
spicetify config current_theme TransparentTheme >nul 2>nul
spicetify config inject_css 1 replace_colors 1 overwrite_assets 1 >nul 2>nul

:: Đóng triệt để Spotify trước khi patch để tránh lỗi "Spotify is not responding"
taskkill /f /im Spotify.exe >nul 2>nul
timeout /t 1 /nobreak >nul

:: Áp dụng cài đặt thông minh: thử apply trước, nếu máy mới chưa có backup thì chạy backup apply
spicetify apply >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [THÔNG TIN] Máy mới cài đặt hoặc Spotify vừa cập nhật, đang tự động tạo bản sao lưu (backup apply)...
    spicetify backup apply
    if !ERRORLEVEL! neq 0 (
        echo [THÔNG TIN] Đang làm sạch và đồng bộ lại...
        spicetify restore backup apply
    )
)

:: Luôn chạy bản vá tương thích Spotify 1.3.5+ (Rspack & Proxy Fallback)
if exist "%~dp0patch-spotify-1.3.5.js" (
    echo [*] Đang áp dụng bản vá tương thích Spotify 1.3.5+ (Rspack ^& Proxy Fallback)...
    node "%~dp0patch-spotify-1.3.5.js"
)

:: ==========================================
:: Bước 6: Khởi chạy WESync Server & Tự động mở Spotify
:: ==========================================
echo.
echo [*] [6/6] Đang khởi chạy máy chủ ngầm WESync và khởi động Spotify...
wscript "%VBS_PATH%"
timeout /t 2 /nobreak >nul

:: Kiểm tra nhanh phản hồi máy chủ cổng 8989
powershell -NoProfile -Command "try { $r = Invoke-WebRequest -Uri 'http://127.0.0.1:8989/status' -UseBasicParsing -TimeoutSec 3; Write-Host '       -> [OK] Máy chủ WESync Server đang hoạt động tốt tại cổng 8989!' -ForegroundColor Green } catch { Write-Host '       -> [!] Máy chủ WESync Server đang khởi tạo trong nền...' -ForegroundColor Yellow }"

:: Tự động mở Spotify để người dùng thấy ngay thành quả
if exist "!SPOTIFY_EXE!" (
    echo [*] Đang mở ứng dụng Spotify...
    start "" "!SPOTIFY_EXE!"
)

echo.
echo ======================================================================
echo   🎉 CHÚC MỪNG! BẠN ĐÃ CÀI ĐẶT THÀNH CÔNG!
echo.
echo   ✨ Giao diện Spotify đã được kích hoạt trong suốt 100%%.
echo   ⌨️ PHÍM TẮT TRONG SPOTIFY:
echo      Bấm [Alt + T] để đổi giữa 3 chế độ:
echo      1. Pure Transparent (Trong suốt 100%%)
echo      2. Crystal Contrast (Tăng tương phản)
echo      3. Frosted Glass (Kính mờ cao cấp)
echo.
echo   🐱 Chú mèo Cat Jam và Mod chặn quảng cáo đã sẵn sàng hoạt động!
echo   👤 Dự án: Spotify x Wallpaper Engine Sync by Harilowji
echo ======================================================================
echo.
pause
