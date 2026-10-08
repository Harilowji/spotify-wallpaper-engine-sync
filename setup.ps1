# ======================================================================
#   🎵 SPOTIFY x WALLPAPER ENGINE SYNC - 1-LINE INSTALLER SCRIPT
#   👤 Phát triển bởi: Harilowji (https://github.com/Harilowji)
#   🔗 GitHub: https://github.com/Harilowji/spotify-wallpaper-engine-sync
# ======================================================================

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$Host.UI.RawUI.WindowTitle = "Spotify x Wallpaper Engine Sync - Auto Installer"

Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "  🎵 SPOTIFY x WALLPAPER ENGINE SYNC - BỘ CÀI ĐẶT TỰ ĐỘNG 1-CLICK" -ForegroundColor Green
Write-Host "  👤 Phát triển bởi: Harilowji (https://github.com/Harilowji)" -ForegroundColor Yellow
Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host ""

$zipUrl = "https://github.com/Harilowji/spotify-wallpaper-engine-sync/archive/refs/heads/main.zip"
$tempZip = Join-Path $env:TEMP "spotify-wallpaper-engine-sync-main.zip"
$destFolder = Join-Path $env:USERPROFILE "Downloads\spotify-wallpaper-engine-sync"

try {
    Write-Host "[1/3] 📥 Đang tải trọn bộ cài đặt mới nhất từ GitHub..." -ForegroundColor Cyan
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -Uri $zipUrl -OutFile $tempZip -UseBasicParsing
    Write-Host "       -> Tải xuống thành công!" -ForegroundColor Green

    Write-Host "[2/3] 📦 Đang giải nén bộ cài đặt vào Downloads..." -ForegroundColor Cyan
    if (Test-Path $destFolder) {
        Remove-Item -Path $destFolder -Recurse -Force -ErrorAction SilentlyContinue
    }
    New-Item -ItemType Directory -Path $destFolder -Force | Out-Null
    Expand-Archive -Path $tempZip -DestinationPath $destFolder -Force
    Remove-Item -Path $tempZip -Force -ErrorAction SilentlyContinue
    Write-Host "       -> Giải nén hoàn tất!" -ForegroundColor Green

    $sourceDir = Join-Path $destFolder "spotify-wallpaper-engine-sync-main"
    if (-not (Test-Path $sourceDir)) {
        $sourceDir = $destFolder
    }

    $installBat = Join-Path $sourceDir "install.bat"
    if (-not (Test-Path $installBat)) {
        throw "Không tìm thấy file install.bat sau khi giải nén!"
    }

    Write-Host "[3/3] 🚀 Đang khởi chạy trình cài đặt install.bat..." -ForegroundColor Cyan
    Start-Process -FilePath "cmd.exe" -ArgumentList "/c `"$installBat`"" -WorkingDirectory $sourceDir

    Write-Host ""
    Write-Host "======================================================================" -ForegroundColor Green
    Write-Host "  ✨ Quá trình tải về đã xong! Cửa sổ cài đặt install.bat đang chạy." -ForegroundColor White
    Write-Host "  Thư mục lưu trữ: $sourceDir" -ForegroundColor DarkGray
    Write-Host "======================================================================" -ForegroundColor Green
}
catch {
    Write-Host ""
    Write-Host "❌ Có lỗi xảy ra trong quá trình tải xuống:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host ""
    Write-Host "Bạn có thể tải thủ công tại: https://github.com/Harilowji/spotify-wallpaper-engine-sync" -ForegroundColor Yellow
}
