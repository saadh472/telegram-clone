@echo off
title Telegram Web Clone - Stop Services
setlocal EnableExtensions

cd /d "%~dp0"

echo ============================================
echo   Stopping Telegram Web Clone
echo ============================================
echo.
echo Killing processes on ports 3000 ^(backend^) and 5500 ^(frontend^)...
echo.

for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000" ^| findstr "LISTENING"') do (
  echo   Port 3000 — PID %%a
  taskkill /F /PID %%a >nul 2>&1
)

for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":5500" ^| findstr "LISTENING"') do (
  echo   Port 5500 — PID %%a
  taskkill /F /PID %%a >nul 2>&1
)

echo.
echo Done. Ports 3000 and 5500 should now be free.
pause
endlocal
