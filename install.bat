@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul

echo ======================================================================
echo   🎵 SPOTIFY x WALLPAPER ENGINE SYNC - BỘ CÀI ĐẶT TỰ ĐỘNG
echo   👤 Phát triển bởi: Harilowji (https://github.com/Harilowji)
echo   ✨ Tự động đồng bộ hình nền động / tĩnh từ Wallpaper Engine vào Spotify
echo ======================================================================
echo.

:: ==========================================
:: Kiểm tra các công cụ phụ thuộc hệ thống
:: ==========================================
echo [*] Đang kiểm tra các công cụ hệ thống...

:: 1. Kiểm tra winget
where winget >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [CẢNH BÁO] Hệ thống chưa có 'winget'.
    echo Nếu thiếu Node.js hoặc FFmpeg, bạn vui lòng cài thủ công:
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

:: 3. Kiểm tra Spicetify
where spicetify >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [THÔNG TIN] Đang tự động cài đặt Spicetify CLI...
    powershell -Command "iwr -useb https://raw.githubusercontent.com/spicetify/cli/main/install.ps1 | iex"
    set "PATH=%PATH%;%LOCALAPPDATA%\spicetify"
    echo [THÀNH CÔNG] Đã cài đặt Spicetify!
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
set "PATH=%SYS_PATH%;%USR_PATH%;%PATH%;%LOCALAPPDATA%\spicetify"

:: ==========================================
:: Bước 1: Cài đặt Máy chủ nền (Daemon Server)
:: ==========================================
echo.
echo [1/4] Đang cài đặt máy chủ nền WESync Server...

:: Ngăn chặn lỗi chạy trực tiếp từ trong file nén ZIP
if not exist "%~dp0WESyncServer.js" (
    echo.
    echo [LỖI NGHIÊM TRỌNG] Thiếu các file cài đặt!
    echo Bạn có đang click trực tiếp từ file nén .ZIP không?
    echo Vui lòng bấm chuột phải vào file ZIP -^> chọn 'Extract All' (Giải nén toàn bộ) ra một thư mục bình thường rồi chạy lại install.bat!
    echo.
    pause
    exit /b 1
)

mkdir "%APPDATA%\WESync" 2>nul
copy /y "%~dp0WESyncServer.js" "%APPDATA%\WESync\" >nul

:: Dừng các tiến trình server cũ đang chạy nếu có
taskkill /f /fi "WINDOWTITLE eq WESyncServer_Loop" >nul 2>nul
taskkill /f /im node.exe >nul 2>nul
wmic process where "name='node.exe' and commandline like '%%WESyncServer%%'" call terminate >nul 2>nul
wmic process where "name='cmd.exe' and commandline like '%%WESyncServer_Loop%%'" call terminate >nul 2>nul

timeout /t 2 /nobreak >nul
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

:: Tạo script vòng lặp tự khởi động lại khi crash (Self-Healing Loop)
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
:: Bước 2: Cài đặt Spicetify Extension
:: ==========================================
echo [2/4] Đang cài đặt Spicetify Extension...
if not exist "%APPDATA%\spicetify\Extensions" mkdir "%APPDATA%\spicetify\Extensions"
copy /y "%~dp0we-sync.js" "%APPDATA%\spicetify\Extensions\we-sync.js" >nul

:: Chặn Spotify Auto-Update tự ý ghi đè làm mất giao diện Spicetify
mkdir "%LOCALAPPDATA%\Spotify\Update" 2>nul
icacls "%LOCALAPPDATA%\Spotify\Update" /deny "%username%":W >nul 2>nul

:: ==========================================
:: Bước 3: Cài đặt Giao diện Kính mờ Spicetify
:: ==========================================
echo [3/4] Đang cài đặt Transparent Theme (Giao diện trong suốt)...
if not exist "%APPDATA%\spicetify\Themes\TransparentTheme" mkdir "%APPDATA%\spicetify\Themes\TransparentTheme"
copy /y "%~dp0user.css" "%APPDATA%\spicetify\Themes\TransparentTheme\user.css" >nul
copy /y "%~dp0color.ini" "%APPDATA%\spicetify\Themes\TransparentTheme\color.ini" >nul

:: ==========================================
:: Bước 4: Áp dụng cài đặt Spicetify
:: ==========================================
echo [4/4] Đang áp dụng thiết lập vào Spotify...
spicetify config extensions we-sync.js >nul 2>nul
spicetify config current_theme TransparentTheme >nul 2>nul
spicetify config inject_css 1 replace_colors 1 overwrite_assets 1 >nul 2>nul

echo [THÔNG TIN] Đang khởi động lại Spotify để nạp cấu hình mới...
taskkill /f /im spotify.exe >nul 2>nul
timeout /t 2 /nobreak >nul
spicetify apply || spicetify backup apply

:: ==========================================
:: Khởi chạy máy chủ ngầm lần đầu
:: ==========================================
echo.
echo Đang khởi chạy máy chủ ngầm WESync...
wscript "%VBS_PATH%"

echo.
echo ======================================================================
echo   🎉 CHÚC MỪNG! BẠN ĐÃ CÀI ĐẶT THÀNH CÔNG!
echo   ✨ Mở Spotify lên và thưởng thức giao diện đồng bộ hình nền tuyệt đẹp!
echo   👤 Dự án: Spotify x Wallpaper Engine Sync by Harilowji
echo ======================================================================
echo.
pause
