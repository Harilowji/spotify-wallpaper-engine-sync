@echo off
chcp 65001 >nul
title Kiem Tra Cap Nhat Spotify Mod - by Harilowji
color 0A

echo ======================================================================
echo   KIEM TRA PHIEN BAN VA TU DONG KHOI PHUC MOD SPOTIFY
echo   Tac gia: Harilowji
echo   Du an: Spotify x Wallpaper Engine Sync
echo ======================================================================
echo.
echo [1/2] Dang kiem tra trang thai qua dich vu ngam WESync...

curl -s http://127.0.0.1:8989/check-update > "%TEMP%\spotify_check_result.json" 2>nul
if %errorlevel% neq 0 (
    echo.
    echo [THONG TIN] May chu ngam chua san sang. Dang tu dong khoi phuc truc tiep...
    echo.
    taskkill /f /im spotify.exe >nul 2>nul
    timeout /t 2 /nobreak >nul
    spicetify restore >nul 2>nul
    spicetify clear >nul 2>nul
    spicetify backup apply
    echo.
    echo [HOAN TAT] Da khoi phuc thanh cong giao dien Spotify!
) else (
    echo [2/2] Ket qua phan hoi tu he thong:
    echo.
    type "%TEMP%\spotify_check_result.json"
    echo.
    echo.
    echo [THANH CONG] He thong da dong bo xong!
)

echo.
echo ======================================================================
pause
