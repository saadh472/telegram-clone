# Telegram Web Clone

Telegram-style chat app: **HTML/CSS/JS** frontend + **Python Flask** backend + **SQL Server (SSMS)**.

## Windows desktop installer

This project now includes a Windows desktop packaging layer using **Electron + PyInstaller + NSIS**.
It creates a single `.exe` installer with desktop/start-menu shortcuts, a bundled Flask backend sidecar,
custom icon, and clean uninstall support.

Release guide: [`docs/DESKTOP_RELEASE.md`](docs/DESKTOP_RELEASE.md)

Build installer:

```powershell
npm install
npm --prefix frontend install
npm run desktop:release
```

If Electron's postinstall download stalls on a slow network, repair the local runtime cache with:

```powershell
$env:ELECTRON_MIRROR = "https://npmmirror.com/mirrors/electron/"
$env:ELECTRON_BUILDER_BINARIES_MIRROR = "https://npmmirror.com/mirrors/electron-builder-binaries/"
npm run desktop:install-electron
```

## Moving to another laptop

Copy the whole `telegram-clone` folder — no absolute paths are required in code.

1. **Install prerequisites**
   - Python 3.10+
   - Node.js (LTS)
   - SQL Server Express
   - [ODBC Driver 17 for SQL Server](https://learn.microsoft.com/en-us/sql/connect/odbc/download-odbc-driver-for-sql-server)
2. **Copy the project folder** to the new machine (USB, zip, git clone, etc.)
3. **Configure SQL Server**
   - Run **`setup.cmd`** (interactive — prompts for your SSMS server name), **or**
   - Edit **`backend/.env`** and set `SQL_SERVER` to the name shown in SSMS Connect (e.g. `YOUR-PC\SQLEXPRESS`)
4. **Start the app:** double-click **`start.cmd`** (use `start.cmd --fast` after dependencies are installed)
5. **Login:** **saad** / **12345678**

> **Important:** Always open the app via **`http://127.0.0.1:5500`** (or `http://YOUR-LAN-IP:5500`).  
> Never open `index.html` with **file://** — the API will not connect.

## Database — SQL Server / SSMS Only

This project uses **only Microsoft SQL Server (SSMS)** for all persistent data — users, chats, messages, and reactions. The backend connects exclusively through `pyodbc` and `backend/database/singleton.py`.

| Setting | Default (override in `.env`) |
|---------|------------------------------|
| Server | `localhost\SQLEXPRESS` |
| Database | `TelegramClone` (`DB_NAME`) |
| Auth | Windows Authentication |
| Encryption | Mandatory (`Encrypt=yes`) |
| Driver | pyodbc → `database/singleton.py` |

Schema and seed data are applied by `backend/services/seeder.py` on startup (auto-creates the database if missing), or manually via `backend/sql/init.sql` in SSMS.

## Quick Start

1. Ensure **SQL Server** is running
2. First time on this machine: run **`setup.cmd`**, or copy **`backend/.env.example`** → **`backend/.env`** and edit `SQL_SERVER`
3. Double-click **`start.cmd`**
   - Checks Python 3.10+, Node.js, curl, and ODBC drivers
   - Installs deps on first run (or `start.cmd --install`); skip with `start.cmd --fast`
   - Creates **`backend/.env`** from **`.env.example`** if missing
   - Frees ports 3000/5500, starts backend (`0.0.0.0:3000`) + frontend (`0.0.0.0:5500`)
   - Polls **`/api/health`** — exits with error if DB init fails
4. Browser opens **http://127.0.0.1:5500**
5. Login: **saad** / **12345678**

| Service  | URL |
|----------|-----|
| App      | http://127.0.0.1:5500 (LAN: http://YOUR-IP:5500) |
| API      | http://127.0.0.1:3000/api |
| Health   | http://127.0.0.1:3000/api/health |

## Environment configuration

Create **`backend/.env`** from **`backend/.env.example`**:

```env
SQL_SERVER=YOUR-PC\SQLEXPRESS
DB_NAME=TelegramClone
JWT_SECRET=change-me
FLASK_PORT=3000
# Optional: CORS_ORIGINS=http://192.168.1.5:5500
```

The backend warns on startup if `JWT_SECRET` is still the default.

Frontend API URL is resolved automatically in `frontend/js/config.js`:

```js
`${window.location.protocol}//${window.location.hostname}:3000/api`
```

So opening `http://192.168.1.5:5500` talks to `http://192.168.1.5:3000/api` on the same machine.

## Scripts

| Script | Purpose |
|--------|---------|
| `setup.cmd` | One-time: prompt SQL Server name, pip + npm install |
| `start.cmd` | Start backend + frontend, health check, open browser |
| `start.cmd --fast` | Skip dependency install |
| `start.cmd --install` | Force pip + npm install |
| `stop.cmd` | Kill processes on ports 3000 and 5500 |

## Demo tips (presentation)

- **Photos & voice** sent during the live demo are stored in SQL Server as `[photo]` / `[voice]` content with a tiny base64 payload — they persist after refresh like seeded messages.
- **Attachments** (photo, file, voice) are limited to **1 GB** per file on both client and server (demo ceiling). Very large files may be slow to encode, upload, and render.
- Rehearse once with a **live photo attachment** (paperclip → image) so Hassan-style bubbles and sidebar previews (`📷 Photo`) are familiar.
- Seeded Hassan/Omar chats already include demo photo and voice bubbles from `seeder.py`.

## Structure

```
telegram-clone/
├── setup.cmd       # one-time SQL + deps wizard
├── start.cmd
├── stop.cmd
├── frontend/       # index.html, css/, js/
└── backend/        # Flask API + SQL Server
    ├── .env.example
    ├── app.py
    ├── config.py
    ├── database/singleton.py
    ├── models/, views/, controllers/, services/
    └── sql/init.sql
```

## Demo scale (seed data)

After startup, SSMS should show approximately:

| Resource | Count |
|----------|-------|
| Users | **~100** (saad + 13 core + 86 bulk contacts) |
| Saad's chats | **~21** (17 private + 4 groups) |
| Messages | Sample threads in each chat |

Verify:

```sql
USE TelegramClone;
SELECT COUNT(*) AS users FROM users;
SELECT COUNT(*) AS chats FROM chats c
  JOIN chat_members cm ON cm.chat_id = c.id
  JOIN users u ON u.id = cm.user_id AND u.username = 'saad';
SELECT COUNT(*) AS message_count FROM messages;
```

## Demo Accounts

| Username | Password | Display Name |
|----------|----------|--------------|
| **saad** | **12345678** | Saad Hussain |
| ahmed | password123 | Ahmed Khan |
| fatima | password123 | Fatima Ali |
| … | password123 | (see seeder for full list) |

**New Chat** lists all contacts. **New Group** (in modal) creates a group with selected members.

## Features (assignment demo)

- MVC Flask backend + vanilla JS frontend
- Optimistic send with merge on poll, retry on failure
- Edit / delete / reply with server validation
- Reactions persisted in `message_reactions` table
- Typing indicators via REST API
- Photo/voice/file attachments stored as `[type] meta|base64` in message content (max **1 GB** per attachment — demo limit; very large files may be slow to upload and load)
- Client-side E2E demo (AES-GCM — **not** Signal; banner labels this clearly)
- Pin / mute / archive (localStorage prefs)
- JWT session with `/users/me` validation on restore

## Prerequisites

- Python 3.10+
- Node.js (frontend static server)
- SQL Server Express
- ODBC Driver 17+ for SQL Server

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `start.cmd` exits with backend error | Check SQL Server + `backend/.env`; read Backend window |
| `EADDRINUSE` port 5500 or 3000 | Run `start.cmd` again or `stop.cmd` |
| Login fails / "Failed to fetch" | Use http://127.0.0.1:5500 via start.cmd (not file://) |
| Invalid credentials | Restart backend — saad password reset to `12345678` on startup |

## Manual Run

```bash
cd backend && pip install -r requirements.txt && python app.py
cd frontend && npm install && npm start
```
