@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul
title "Nang Cap Spotify An Toan - by Harilowji"
color 0B

echo ======================================================================
echo   🎵 BỘ NÂNG CẤP SPOTIFY AN TOÀN (SAFE SPOTIFY UPDATER)
echo   👤 Tác giả: Harilowji (https://github.com/Harilowji)
echo   ✨ Cập nhật Spotify lên bản mới nhất mà KHÔNG bị mất hình nền động
echo ======================================================================
echo.

set "PATH=%PATH%;%LOCALAPPDATA%\spicetify"

:: 1. Tạm mở khóa quyền cập nhật của Spotify
echo [1/5] 🔓 Đang tạm mở khóa tường bảo vệ để cho phép Spotify cập nhật...
icacls "%LOCALAPPDATA%\Spotify\Update" /grant "%username%":(OI)(CI)F >nul 2>nul
icacls "%LOCALAPPDATA%\Spotify\SpotifyUpdate.exe" /grant "%username%":F >nul 2>nul
del /f /q "%LOCALAPPDATA%\Spotify\SpotifyUpdate.exe" 2>nul

:: 2. Kiểm tra cập nhật qua winget hoặc tải bản chính thức từ CDN Spotify
echo [2/5] 🔍 Đang kiểm tra và tải phiên bản Spotify mới nhất...

set "UPDATED=0"
where winget >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    echo [*] Đang kiểm tra qua Windows Package Manager (winget)...
    winget upgrade Spotify.Spotify --accept-package-agreements --accept-source-agreements
    if !ERRORLEVEL! EQU 0 (
        set "UPDATED=1"
    )
)

if "!UPDATED!"=="0" (
    echo [*] Đang tải bộ cài chính thức mới nhất từ Spotify CDN...
    powershell -NoProfile -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; (New-Object Net.WebClient).DownloadFile('https://download.scdn.co/SpotifySetup.exe', '$env:TEMP\SpotifySetup.exe')"
    if exist "%TEMP%\SpotifySetup.exe" (
        echo [*] Đang khởi chạy trình cập nhật Spotify...
        start /wait "" "%TEMP%\SpotifySetup.exe"
        del /f /q "%TEMP%\SpotifySetup.exe" 2>nul
        set "UPDATED=1"
    ) else (
        echo [CẢNH BÁO] Không thể tải SpotifySetup.exe từ mạng.
    )
)

:: 3. Đóng tiến trình Spotify để áp dụng mod
echo [3/5] 🔄 Đang chuẩn bị nạp lại Spicetify và giao diện hình nền động...
taskkill /f /im spotify.exe >nul 2>nul
timeout /t 3 /nobreak >nul

:: 4. Nạp lại Spicetify cho phiên bản mới
echo [4/5] 🎨 Đang sao lưu và khôi phục giao diện hình nền vào Spotify...
spicetify restore >nul 2>nul
spicetify clear >nul 2>nul
spicetify backup apply
if %ERRORLEVEL% NEQ 0 (
    echo [THỬ LẠI] Đang áp dụng lại cấu hình...
    spicetify apply
)

:: 5. Khóa lại tường bảo vệ chống Spotify tự ý âm thầm update lần sau
echo [5/5] 🛡️ Đang kích hoạt lại Tường Chắn Bảo Vệ (Anti-Update Shield)...
mkdir "%LOCALAPPDATA%\Spotify\Update" 2>nul
icacls "%LOCALAPPDATA%\Spotify\Update" /deny "%username%":(OI)(CI)(W,D) >nul 2>nul
echo. > "%LOCALAPPDATA%\Spotify\SpotifyUpdate.exe" 2>nul
icacls "%LOCALAPPDATA%\Spotify\SpotifyUpdate.exe" /deny "%username%":(W,D) >nul 2>nul

echo.
echo ======================================================================
echo   🎉 HOÀN TẤT! SPOTIFY ĐÃ ĐƯỢC CẬP NHẬT & BẢO VỆ GIAO DIỆN THÀNH CÔNG!
echo   ✨ Khởi động lại Spotify để tận hưởng âm nhạc cùng hình nền Wallpaper Engine!
echo ======================================================================
echo.

cmd.exe /c start spotify:
pause
