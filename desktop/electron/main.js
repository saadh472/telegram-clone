const { app, BrowserWindow, Menu, dialog, shell } = require('electron');
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const net = require('net');
const path = require('path');
const { spawn } = require('child_process');

const APP_NAME = 'Telegram Web Desktop';
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

let mainWindow;
let backendProcess;
let backendPort;
let backendLogPath;
let isQuitting = false;

function getIconPath() {
  return path.join(PROJECT_ROOT, 'desktop', 'assets', 'icon.ico');
}

function createDefaultEnv() {
  const secret = crypto.randomBytes(32).toString('hex');
  return [
    '# Telegram Web Desktop backend configuration',
    '# Edit SQL_SERVER if your SSMS instance is not localhost\\SQLEXPRESS.',
    'SQL_SERVER=localhost\\SQLEXPRESS',
    'DB_NAME=TelegramClone',
    'FLASK_HOST=127.0.0.1',
    'FLASK_DEBUG=false',
    `JWT_SECRET=${secret}`,
    'JWT_EXPIRATION_SECONDS=604800',
    'ODBC_ENCRYPT=yes',
    'ODBC_TRUST_CERT=yes',
    'ODBC_TRUSTED_CONNECTION=yes',
    '',
  ].join('\r\n');
}

function ensureDesktopEnv() {
  const userData = app.getPath('userData');
  fs.mkdirSync(userData, { recursive: true });
  const envPath = path.join(userData, 'backend.env');
  if (!fs.existsSync(envPath)) {
    fs.writeFileSync(envPath, createDefaultEnv(), 'utf8');
  }
  return envPath;
}

function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = address && typeof address === 'object' ? address.port : null;
      server.close(() => {
        if (port) resolve(port);
        else reject(new Error('Could not allocate a local backend port.'));
      });
    });
  });
}

function getBackendCommand() {
  if (app.isPackaged) {
    return {
      command: path.join(process.resourcesPath, 'backend', 'telegram_backend.exe'),
      args: [],
      cwd: path.join(process.resourcesPath, 'backend'),
    };
  }

  return {
    command: process.env.PYTHON || 'python',
    args: [path.join(PROJECT_ROOT, 'backend', 'desktop_server.py')],
    cwd: path.join(PROJECT_ROOT, 'backend'),
  };
}

function appendBackendLog(chunk) {
  if (!backendLogPath || !chunk) return;
  fs.appendFile(backendLogPath, chunk.toString(), () => {});
}

function startBackend(port, envPath) {
  const backend = getBackendCommand();
  if (!fs.existsSync(backend.command) && app.isPackaged) {
    throw new Error(`Bundled backend executable was not found:\n${backend.command}`);
  }

  backendLogPath = path.join(app.getPath('userData'), 'backend.log');
  fs.writeFileSync(backendLogPath, `Starting backend on port ${port}\r\n`, 'utf8');

  backendProcess = spawn(backend.command, backend.args, {
    cwd: backend.cwd,
    env: {
      ...process.env,
      TELEGRAM_DESKTOP: '1',
      TELEGRAM_DESKTOP_ENV: envPath,
      FLASK_HOST: '127.0.0.1',
      FLASK_PORT: String(port),
      FLASK_DEBUG: 'false',
      CORS_ORIGINS: `http://127.0.0.1:${port}`,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  backendProcess.stdout?.on('data', appendBackendLog);
  backendProcess.stderr?.on('data', appendBackendLog);
  backendProcess.startupError = null;
  backendProcess.on('error', (error) => {
    backendProcess.startupError = error;
    appendBackendLog(`Backend process error: ${error.message}\r\n`);
  });

  return backendProcess;
}

function fetchHealth(port) {
  return new Promise((resolve) => {
    const req = http.get(
      {
        host: '127.0.0.1',
        port,
        path: '/api/health',
        timeout: 1000,
      },
      (res) => {
        res.resume();
        resolve(res.statusCode && res.statusCode >= 200 && res.statusCode < 300);
      },
    );
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitForBackend(port, processRef) {
  const started = Date.now();
  const timeoutMs = 45000;

  while (Date.now() - started < timeoutMs) {
    if (processRef.startupError) {
      throw processRef.startupError;
    }
    if (processRef.exitCode !== null) {
      throw new Error(`Backend stopped during startup. See log:\n${backendLogPath}`);
    }
    if (await fetchHealth(port)) return;
    await new Promise((resolve) => setTimeout(resolve, 650));
  }

  throw new Error(`Backend did not become ready within ${timeoutMs / 1000}s. See log:\n${backendLogPath}`);
}

function createMenu(envPath) {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Open Backend Config',
          click: () => shell.openPath(envPath),
        },
        {
          label: 'Open Logs Folder',
          click: () => shell.openPath(app.getPath('userData')),
        },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'SQL Server Setup Help',
          click: () => dialog.showMessageBox(mainWindow, {
            type: 'info',
            title: 'SQL Server Setup',
            message: 'Telegram Web Desktop requires SQL Server Express/SSMS and Microsoft ODBC Driver 17 or 18 for SQL Server.',
            detail: `Edit this file if your server is different:\n${envPath}\n\nDefault server: localhost\\SQLEXPRESS`,
          }),
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 960,
    minHeight: 620,
    show: false,
    backgroundColor: '#0e1621',
    icon: getIconPath(),
    title: APP_NAME,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  return mainWindow;
}

async function loadErrorPage(error, envPath) {
  const message = error && error.message ? error.message : String(error);
  appendBackendLog(`\r\nDesktop startup failed:\r\n${message}\r\n`);
  if (!mainWindow) return;
  await mainWindow.loadFile(path.join(__dirname, 'error.html'), {
    query: {
      message,
      envPath,
      logPath: backendLogPath || '',
    },
  });
}

async function boot() {
  app.setAppUserModelId('com.saad.telegramwebdesktop');
  const envPath = ensureDesktopEnv();
  createMenu(envPath);
  createWindow();

  await mainWindow.loadFile(path.join(__dirname, 'loading.html'));

  try {
    backendPort = await findFreePort();
    const processRef = startBackend(backendPort, envPath);
    await waitForBackend(backendPort, processRef);

    const apiBase = `http://127.0.0.1:${backendPort}/api`;
    await mainWindow.loadURL(`http://127.0.0.1:${backendPort}/index.html?desktop=1&api=${encodeURIComponent(apiBase)}`);
  } catch (error) {
    await loadErrorPage(error, envPath);
  }
}

function stopBackend() {
  if (backendProcess && !backendProcess.killed) {
    backendProcess.kill();
  }
  backendProcess = null;
}

app.whenReady().then(boot);

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) boot();
});

app.on('before-quit', () => {
  isQuitting = true;
  stopBackend();
});

app.on('window-all-closed', () => {
  if (!isQuitting) stopBackend();
  if (process.platform !== 'darwin') app.quit();
});
