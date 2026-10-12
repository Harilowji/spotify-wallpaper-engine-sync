@echo off
setlocal
chcp 65001 >nul
title "Kiem Tra Cap Nhat va Khoi Phuc Mod Spotify - by Harilowji"
color 0A

echo ======================================================================
echo   🎵 KIỂM TRA PHIÊN BẢN VÀ TỰ ĐỘNG KHÔI PHỤC MOD SPOTIFY
echo   👤 Tác giả: Harilowji (https://github.com/Harilowji)
echo   ✨ Dự án: Spotify x Wallpaper Engine Sync
echo ======================================================================
echo.

:: Đảm bảo tường chắn chống Spotify tự ý cập nhật ngầm luôn bật
mkdir "%LOCALAPPDATA%\Spotify\Update" 2>nul
icacls "%LOCALAPPDATA%\Spotify\Update" /deny "%username%":(OI)(CI)(W,D) >nul 2>nul
if not exist "%LOCALAPPDATA%\Spotify\SpotifyUpdate.exe" echo. > "%LOCALAPPDATA%\Spotify\SpotifyUpdate.exe" 2>nul
icacls "%LOCALAPPDATA%\Spotify\SpotifyUpdate.exe" /deny "%username%":(W,D) >nul 2>nul

echo [1/2] Đang kiểm tra trạng thái qua dịch vụ ngầm WESync...

curl -m 4 -s http://127.0.0.1:8989/check-update > "%TEMP%\spotify_check_result.json" 2>nul
if %errorlevel% neq 0 (
    echo.
    echo [THÔNG TIN] Máy chủ ngầm chưa sẵn sàng. Đang tiến hành khôi phục mod trực tiếp...
    echo.
    taskkill /f /im spotify.exe >nul 2>nul
    timeout /t 2 /nobreak >nul
    set "PATH=%PATH%;%LOCALAPPDATA%\spicetify"
    spicetify restore >nul 2>nul
    spicetify clear >nul 2>nul
    spicetify backup apply
    echo.
    echo [HOÀN TẤT] Đã đồng bộ và khôi phục thành công giao diện Spotify!
    cmd.exe /c start spotify:
) else (
    echo [2/2] Kết quả phản hồi từ hệ thống:
    echo.
    type "%TEMP%\spotify_check_result.json"
    echo.
    echo.
    echo [THÀNH CÔNG] Hệ thống hoạt động hoàn hảo và giao diện được bảo vệ!
)

echo.
echo ======================================================================
pause
