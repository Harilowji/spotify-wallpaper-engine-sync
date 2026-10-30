# ======================================================================
#   🎵 SPOTIFY x WALLPAPER ENGINE SYNC - 1-LINE INSTALLER SCRIPT v3.1.1
#   👤 Phát triển bởi: Harilowji (https://github.com/Harilowji)
#   🔗 GitHub: https://github.com/Harilowji/spotify-wallpaper-engine-sync
# ======================================================================

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$Host.UI.RawUI.WindowTitle = "Spotify x Wallpaper Engine Sync - Auto Installer v3.1.1"

Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "  🎵 SPOTIFY x WALLPAPER ENGINE SYNC - BỘ CÀI ĐẶT TỰ ĐỘNG 1-CLICK" -ForegroundColor Green
Write-Host "  👤 Phiên bản: v3.1.1 | Tác giả: Harilowji" -ForegroundColor Yellow
Write-Host "  ✨ 100% Trong suốt - Đồng bộ hình nền - Chống cập nhật ngầm" -ForegroundColor White
Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host ""

# 1. Kiểm tra kết nối mạng Internet tới GitHub
Write-Host "[*] Đang kiểm tra kết nối mạng tới GitHub..." -ForegroundColor Cyan
try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 -bor [Net.SecurityProtocolType]::Tls13
    $pingTest = Invoke-WebRequest -Uri "https://raw.githubusercontent.com" -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop
    Write-Host "       -> Kết nối mạng ổn định!" -ForegroundColor Green
}
catch {
    Write-Host ""
    Write-Host "⚠️ CẢNH BÁO: Không thể kết nối tới raw.githubusercontent.com!" -ForegroundColor Yellow
    Write-Host "   Nếu máy bạn đang bị chặn mạng, hãy kiểm tra lại kết nối Internet hoặc tắt tạm proxy/VPN." -ForegroundColor DarkYellow
    Write-Host "   Script vẫn sẽ tiếp tục thử tải từ GitHub..." -ForegroundColor DarkGray
}

$zipUrl = "https://github.com/Harilowji/spotify-wallpaper-engine-sync/archive/refs/heads/main.zip"
$tempZip = Join-Path $env:TEMP "spotify-wallpaper-engine-sync-main.zip"
$destFolder = Join-Path $env:USERPROFILE "Downloads\spotify-wallpaper-engine-sync"

try {
    # 2. Tải bản cài đặt mới nhất từ GitHub
    Write-Host ""
    Write-Host "[1/3] 📥 Đang tải trọn bộ cài đặt mới nhất từ GitHub..." -ForegroundColor Cyan
    Invoke-WebRequest -Uri $zipUrl -OutFile $tempZip -UseBasicParsing
    Write-Host "       -> Đã tải xuống thành công file cài đặt!" -ForegroundColor Green

    # 3. Giải nén an toàn vào thư mục Downloads
    Write-Host ""
    Write-Host "[2/3] 📦 Đang giải nén bộ cài đặt vào thư mục Downloads..." -ForegroundColor Cyan
    if (Test-Path $destFolder) {
        Remove-Item -Path $destFolder -Recurse -Force -ErrorAction SilentlyContinue
    }
    New-Item -ItemType Directory -Path $destFolder -Force | Out-Null
    Expand-Archive -Path $tempZip -DestinationPath $destFolder -Force
    Remove-Item -Path $tempZip -Force -ErrorAction SilentlyContinue
    Write-Host "       -> Giải nén hoàn tất an toàn!" -ForegroundColor Green

    $sourceDir = Join-Path $destFolder "spotify-wallpaper-engine-sync-main"
    if (-not (Test-Path $sourceDir)) {
        $sourceDir = $destFolder
    }

    $installBat = Join-Path $sourceDir "install.bat"
    if (-not (Test-Path $installBat)) {
        throw "Không tìm thấy file install.bat sau khi giải nén tại: $sourceDir"
    }

    # 4. Khởi chạy trực tiếp install.bat (an toàn tuyệt đối với đường dẫn có dấu cách hoặc tiếng Việt)
    Write-Host ""
    Write-Host "[3/3] 🚀 Đang khởi chạy trình cài đặt install.bat..." -ForegroundColor Cyan
    Write-Host "       -> Đang cấu hình Node.js, Spicetify, Theme và máy chủ ngầm..." -ForegroundColor White
    
    Start-Process -FilePath $installBat -WorkingDirectory $sourceDir -Wait

    Write-Host ""
    Write-Host "======================================================================" -ForegroundColor Green
    Write-Host "  ✨ Quá trình cài đặt đã hoàn tất thành công!" -ForegroundColor White
    Write-Host "  📁 Thư mục mã nguồn được lưu tại: $sourceDir" -ForegroundColor DarkGray
    Write-Host "======================================================================" -ForegroundColor Green
}
catch {
    Write-Host ""
    Write-Host "❌ Có lỗi xảy ra trong quá trình thực hiện:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host ""
    Write-Host "👉 Bạn có thể tải thủ công file ZIP tại:" -ForegroundColor Yellow
    Write-Host "   https://github.com/Harilowji/spotify-wallpaper-engine-sync" -ForegroundColor Cyan
    Write-Host "   Sau đó giải nén ra thư mục và nhấp đúp vào file 'install.bat'." -ForegroundColor Yellow
}
