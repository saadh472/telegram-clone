param(
  [switch]$SkipInstall
)

$ErrorActionPreference = "Stop"

$root = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
$backend = Join-Path $root "backend"
$frontend = Join-Path $root "frontend"
$desktop = Join-Path $root "desktop"
$dist = Join-Path $desktop "dist\backend"
$work = Join-Path $desktop "build\pyinstaller"
$spec = Join-Path $desktop "build"

if (-not (Test-Path -LiteralPath (Join-Path $backend "desktop_server.py"))) {
  throw "Missing backend\desktop_server.py"
}
if (-not (Test-Path -LiteralPath (Join-Path $frontend "index.html"))) {
  throw "Missing frontend\index.html"
}

New-Item -ItemType Directory -Force -Path $dist, $work, $spec | Out-Null

if (-not $SkipInstall) {
  python -m pip install --upgrade pip
  python -m pip install -r (Join-Path $backend "requirements.txt") pyinstaller
}

$icon = Join-Path $desktop "assets\icon.ico"
$frontendData = "$frontend;frontend"

python -m PyInstaller `
  --noconfirm `
  --clean `
  --onefile `
  --name telegram_backend `
  --distpath $dist `
  --workpath $work `
  --specpath $spec `
  --icon $icon `
  --hidden-import pyodbc `
  --add-data $frontendData `
  (Join-Path $backend "desktop_server.py")

$exe = Join-Path $dist "telegram_backend.exe"
if (-not (Test-Path -LiteralPath $exe)) {
  throw "PyInstaller completed but backend executable was not created: $exe"
}

Write-Host "Backend sidecar built: $exe"
