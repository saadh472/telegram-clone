param(
  [switch]$SkipInstall
)

$ErrorActionPreference = "Stop"

$root = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
Set-Location $root

if (-not $SkipInstall) {
  npm install
  npm --prefix frontend install
}

$env:CSC_IDENTITY_AUTO_DISCOVERY = "false"

npm run check
$backendArgs = @()
if ($SkipInstall) {
  $backendArgs += "-SkipInstall"
}
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $root "scripts\build-backend.ps1") @backendArgs
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $root "scripts\install-electron-runtime.ps1")
npx electron-builder --win nsis --publish=never

Write-Host "Installer output:"
Get-ChildItem -Path (Join-Path $root "release") -Filter "*Setup.exe" -Recurse
