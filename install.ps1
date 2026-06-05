# Maqolas-backend — paketlarni o'rnatish
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Write-Host "=== Maqolas backend: npm install ===" -ForegroundColor Cyan

# SSL muammosi (UNABLE_TO_VERIFY_LEAF_SIGNATURE) uchun
$env:NODE_TLS_REJECT_UNAUTHORIZED = "0"

function Test-InstallOk {
  return Test-Path ".\node_modules\@nestjs\core\package.json"
}

# 1) Oddiy install (.npmrc: strict-ssl=false)
Write-Host "`n[1/3] npm install (default registry)..." -ForegroundColor Yellow
npm install 2>&1
if (Test-InstallOk) { goto ok }

# 2) npmmirror (tez, ba'zan SSL muammosiz)
Write-Host "`n[2/3] npm install (npmmirror)..." -ForegroundColor Yellow
npm install --registry https://registry.npmmirror.com 2>&1
if (Test-InstallOk) { goto ok }

# 3) cache tozalab qayta
Write-Host "`n[3/3] cache clean + npm install..." -ForegroundColor Yellow
npm cache clean --force 2>&1
npm install --registry https://registry.npmmirror.com 2>&1
if (Test-InstallOk) { goto ok }

Write-Host "`nXATO: Paketlar o'rnatilmadi." -ForegroundColor Red
Write-Host "Log: %LOCALAPPDATA%\npm-cache\_logs\" -ForegroundColor Gray
exit 1

:ok
Write-Host "`nTayyor! Ishga tushirish:" -ForegroundColor Green
Write-Host "  npm run start:dev" -ForegroundColor White
Write-Host "(nest CLI shart emas — tsx ishlatiladi)" -ForegroundColor Gray
