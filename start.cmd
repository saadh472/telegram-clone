@echo off
title Telegram Web Clone Launcher
setlocal EnableExtensions EnableDelayedExpansion

cd /d "%~dp0"
set "ROOT=%~dp0"

echo ============================================
echo   Telegram Web Clone - Starting Services
echo ============================================
echo.

REM --- Parse flags ---
set "DO_INSTALL=0"
set "FAST=0"
:parse_args
if "%~1"=="" goto args_done
if /i "%~1"=="--fast" set "FAST=1"
if /i "%~1"=="--install" set "DO_INSTALL=1"
shift
goto parse_args
:args_done

REM ============================================================
REM Phase 1 — Environment checks
REM ============================================================
echo [Phase 1] Checking prerequisites...
echo.

where python >nul 2>&1
if errorlevel 1 (
  echo ERROR: Python is not on PATH.
  echo        Install Python 3.10+ and ensure "python" works in cmd.
  pause
  exit /b 1
)

python -c "import sys; raise SystemExit(0 if sys.version_info >= (3, 10) else 1)" >nul 2>&1
if errorlevel 1 (
  echo ERROR: Python 3.10 or later is required.
  for /f "delims=" %%v in ('python --version 2^>^&1') do echo        Found: %%v
  pause
  exit /b 1
)
for /f "delims=" %%v in ('python --version 2^>^&1') do echo   OK  %%v

where node >nul 2>&1
if errorlevel 1 (
  echo ERROR: Node.js is not on PATH. Install from https://nodejs.org
  pause
  exit /b 1
)
for /f "delims=" %%v in ('node --version 2^>^&1') do echo   OK  Node.js %%v

where curl >nul 2>&1
if errorlevel 1 (
  echo ERROR: curl is not available ^(needed for backend health check^).
  echo        Windows 10+ includes curl — update Windows or add curl to PATH.
  pause
  exit /b 1
)
echo   OK  curl found

echo.
echo   Checking ODBC / pyodbc...
python -c "import pyodbc; drivers=[d for d in pyodbc.drivers() if 'SQL Server' in d]; print('OK  SQL Server ODBC drivers:', drivers if drivers else 'NONE')" 2>nul
if errorlevel 1 (
  echo   WARN pyodbc not installed yet — will install in setup phase.
) else (
  python -c "import pyodbc; drivers=[d for d in pyodbc.drivers() if 'SQL Server' in d]; import sys; sys.exit(0 if drivers else 1)" >nul 2>&1
  if errorlevel 1 (
    echo   WARN No SQL Server ODBC driver found.
    echo        Install "ODBC Driver 17 for SQL Server" from Microsoft.
  )
)
echo.

REM ============================================================
REM Phase 2 — Setup
REM ============================================================
echo [Phase 2] Environment setup...
echo.

if not exist "%ROOT%backend\.env" (
  echo   backend\.env missing — copying from .env.example ...
  copy /Y "%ROOT%backend\.env.example" "%ROOT%backend\.env" >nul
  if errorlevel 1 (
    echo ERROR: Could not create backend\.env
    pause
    exit /b 1
  )
  echo.
  echo   *** EDIT backend\.env with your SQL_SERVER instance name ***
  echo       ^(SSMS Connect dialog shows the correct server name^)
  echo.
)

if not exist "%ROOT%frontend\node_modules" set "DO_INSTALL=1"

if "%FAST%"=="1" (
  echo   Fast start — skipping pip/npm install ^(--fast^).
  echo.
) else if "%DO_INSTALL%"=="1" (
  echo   Installing backend dependencies...
  pip install -r "%ROOT%backend\requirements.txt"
  if errorlevel 1 (
    echo ERROR: pip install failed.
    pause
    exit /b 1
  )
  echo.
  echo   Installing frontend dependencies...
  pushd "%ROOT%frontend"
  call npm install
  if errorlevel 1 (
    popd
    echo ERROR: npm install failed.
    pause
    exit /b 1
  )
  popd
  echo   Dependencies installed.
  echo.
) else (
  echo   Dependencies look installed. Use --install to force reinstall.
  echo.
)

REM ============================================================
REM Phase 3 — SQL Server hint
REM ============================================================
echo [Phase 3] SQL Server configuration...
findstr /B /C:"SQL_SERVER=localhost\SQLEXPRESS" "%ROOT%backend\.env" >nul 2>&1
if not errorlevel 1 (
  echo   REMINDER: backend\.env still has default SQL_SERVER=localhost\SQLEXPRESS
  echo             If connection fails, open SSMS and copy your server name into .env
  echo             ^(e.g. YOUR-PC\SQLEXPRESS^). Or run setup.cmd once.
)
echo.

REM ============================================================
REM Phase 4 — Start services
REM ============================================================
echo [Phase 4] Starting services...
echo.

echo   Freeing ports 3000 ^(backend^) and 5500 ^(frontend^)...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000" ^| findstr "LISTENING"') do (
  echo     Stopping PID %%a on port 3000
  taskkill /F /PID %%a >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":5500" ^| findstr "LISTENING"') do (
  echo     Stopping PID %%a on port 5500
  taskkill /F /PID %%a >nul 2>&1
)
timeout /t 2 /nobreak >nul
echo.

echo   [1/2] Starting Flask backend on 0.0.0.0:3000 ...
start /MIN "Telegram Backend" cmd /k pushd "%ROOT%backend" ^&^& python app.py

echo   Waiting for backend health at http://127.0.0.1:3000/api/health ...
set "ATTEMPTS=0"

:wait_backend
timeout /t 2 /nobreak >nul
set /a ATTEMPTS+=1
curl -sf -o nul http://127.0.0.1:3000/api/health 2>nul
if not errorlevel 1 goto backend_ready
if !ATTEMPTS! GEQ 30 goto backend_failed
goto wait_backend

:backend_failed
echo.
echo ============================================
echo   ERROR: Backend health check failed
echo ============================================
echo.
echo   Could not reach a healthy backend after 30 attempts ^(~60 seconds^).
echo.
echo   Common fixes:
echo     1. Start SQL Server service ^(Services.msc or SSMS^)
echo     2. Edit backend\.env — set SQL_SERVER to your SSMS server name
echo     3. Install ODBC Driver 17 for SQL Server
echo     4. Read the minimized "Telegram Backend" window for Python errors
echo.
echo   Frontend will NOT be started.
pause
exit /b 1

:backend_ready
echo   Backend is healthy.
echo.

echo   [2/2] Starting frontend on 0.0.0.0:5500 ...
start /MIN "Telegram Frontend" cmd /k pushd "%ROOT%frontend" ^&^& npm start

timeout /t 3 /nobreak >nul
echo   Opening http://127.0.0.1:5500 in your browser...
start "" http://127.0.0.1:5500

echo.
echo ============================================
echo   Telegram Web Clone is running
echo ============================================
echo.
echo   App:     http://127.0.0.1:5500  ^(or http://YOUR-LAN-IP:5500^)
echo   API:     http://127.0.0.1:3000/api
echo.
echo   Demo login: saad / 12345678
echo.
echo   Always open via http:// — never file://
echo   Stop: run stop.cmd or close the minimized server windows.
echo.
pause
endlocal
