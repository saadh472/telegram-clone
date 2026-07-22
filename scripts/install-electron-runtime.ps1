param(
  [string]$ElectronVersion,
  [string]$DownloadBaseUrl = $env:ELECTRON_MIRROR,
  [string]$Architecture = "x64"
)

$ErrorActionPreference = "Stop"

$root = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
Set-Location $root

if (-not $ElectronVersion) {
  $packageJson = Get-Content -LiteralPath (Join-Path $root "package.json") -Raw | ConvertFrom-Json
  $ElectronVersion = $packageJson.devDependencies.electron -replace "^[^\d]*", ""
}

if (-not $ElectronVersion) {
  throw "Unable to resolve Electron version from package.json."
}

$platformArch = "win32-$Architecture"
$nodeElectronDir = Join-Path $root "node_modules\electron"
$electronExe = Join-Path $nodeElectronDir "dist\electron.exe"

if (Test-Path -LiteralPath $electronExe) {
  Write-Host "Electron runtime already installed: $electronExe"
  exit 0
}

$cacheDir = Join-Path $root "desktop\build\cache"
$zipName = "electron-v$ElectronVersion-$platformArch.zip"
$zipPath = Join-Path $cacheDir $zipName
if ($DownloadBaseUrl) {
  $downloadBase = $DownloadBaseUrl.TrimEnd("/")
  $downloadUrl = "$downloadBase/v$ElectronVersion/$zipName"
} else {
  $downloadUrl = "https://github.com/electron/electron/releases/download/v$ElectronVersion/$zipName"
}

New-Item -ItemType Directory -Force -Path $cacheDir | Out-Null
New-Item -ItemType Directory -Force -Path $nodeElectronDir | Out-Null

Write-Host "Installing Electron runtime $ElectronVersion ($platformArch)..."
Write-Host "Download URL: $downloadUrl"

if (-not (Test-Path -LiteralPath $zipPath)) {
  & curl.exe -L --fail --retry 5 --retry-delay 2 -o $zipPath $downloadUrl
} else {
  & curl.exe -L --fail --retry 5 --retry-delay 2 -C - -o $zipPath $downloadUrl
}

if ($LASTEXITCODE -ne 0) {
  throw "Electron runtime download failed with exit code $LASTEXITCODE."
}

$zipItem = Get-Item -LiteralPath $zipPath
if ($zipItem.Length -lt 100MB) {
  throw "Electron runtime archive appears incomplete: $($zipItem.Length) bytes."
}

$distDir = Join-Path $nodeElectronDir "dist"
if (Test-Path -LiteralPath $distDir) {
  $resolvedDist = (Resolve-Path -LiteralPath $distDir).Path
  if (-not $resolvedDist.StartsWith($root, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to remove a directory outside the project: $resolvedDist"
  }
  Remove-Item -LiteralPath $resolvedDist -Recurse -Force
}

New-Item -ItemType Directory -Force -Path $distDir | Out-Null
& tar.exe -xf $zipPath -C $distDir
if ($LASTEXITCODE -ne 0) {
  throw "Electron runtime extraction failed with exit code $LASTEXITCODE."
}

Set-Content -LiteralPath (Join-Path $nodeElectronDir "path.txt") -Value "electron.exe" -NoNewline
Set-Content -LiteralPath (Join-Path $distDir "version") -Value $ElectronVersion -NoNewline

if (-not (Test-Path -LiteralPath $electronExe)) {
  throw "Electron runtime extraction completed, but electron.exe was not found."
}

Write-Host "Electron runtime installed: $electronExe"
