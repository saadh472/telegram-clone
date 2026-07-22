$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
Push-Location $Root

try {
  Write-Host "==> Frontend dependencies"
  if (Test-Path "frontend/package-lock.json") {
    npm ci --prefix frontend
  } else {
    npm install --prefix frontend
  }

  Write-Host "==> Frontend JavaScript check"
  npm --prefix frontend run check

  Write-Host "==> Backend Python compile check"
  python -m compileall -q backend

  Write-Host ""
  Write-Host "Repository checks passed."
} finally {
  Pop-Location
}

