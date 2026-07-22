# Telegram Web Clone

Telegram-style messaging web app built for **SCD Assignment 05**. Vanilla HTML/CSS/JS frontend with an MVC Flask API and Microsoft SQL Server persistence.

## Tech stack

| Layer | Technology |
|-------|------------|
| Frontend | HTML, CSS, vanilla JavaScript (MVC) |
| Backend | Python Flask REST API |
| Database | SQL Server Express (via `pyodbc` + ODBC Driver 17) |
| Auth | JWT (Bearer token) |

## Features

- Login / register with JWT sessions
- Private chats and group chats
- Send, edit, delete, reply, and react to messages
- Typing indicators (REST polling)
- Photo, voice, and file attachments (demo storage in message content)
- Pin / mute / archive preferences (client-side)
- Client-side E2E demo (AES-GCM — labeled clearly; not Signal-grade)
- Seeded demo data (~100 users, sample threads) on first backend start

## Prerequisites

- **Python 3.10+**
- **Node.js** (LTS) — used to serve the static frontend
- **SQL Server Express** (Windows Authentication)
- [**ODBC Driver 17 for SQL Server**](https://learn.microsoft.com/en-us/sql/connect/odbc/download-odbc-driver-for-sql-server)

## Setup

1. **Clone the repo**

   ```bash
   git clone https://github.com/saadh472/telegram-clone.git
   cd telegram-clone
   ```

2. **Configure the database**

   ```bash
   copy backend\.env.example backend\.env
   ```

   Edit `backend\.env` and set `SQL_SERVER` to the name shown in the SSMS Connect dialog (for example `YOUR-PC\SQLEXPRESS`).

3. **Install dependencies** (or let `start.cmd` do this on first run)

   ```bash
   pip install -r backend\requirements.txt
   cd frontend && npm install && cd ..
   ```

4. **Start the app**

   Double-click **`start.cmd`**, or from a terminal:

   ```bash
   start.cmd
   ```

   Useful flags:

   | Command | Purpose |
   |---------|---------|
   | `start.cmd` | Checks prerequisites, installs deps if needed, starts API + UI |
   | `start.cmd --fast` | Skip dependency install |
   | `start.cmd --install` | Force pip + npm install |
   | `stop.cmd` | Free ports 3000 and 5500 |

5. Open **http://127.0.0.1:5500** (opened automatically by `start.cmd`).

> Always use `http://` — never open `frontend/index.html` via `file://` (the API will not connect).

### Manual run

```bash
cd backend
pip install -r requirements.txt
python app.py

cd frontend
npm install
npm start
```

| Service | URL |
|---------|-----|
| App | http://127.0.0.1:5500 |
| API | http://127.0.0.1:3000/api |
| Health | http://127.0.0.1:3000/api/health |

## Demo login

| Username | Password |
|----------|----------|
| **saad** | **12345678** |

Other seeded users typically use password `password123` (see `backend/services/seeder.py`).

## Project structure

```
telegram-clone/
├── start.cmd                 # Launch backend + frontend
├── stop.cmd                  # Stop services on ports 3000 / 5500
├── frontend/                 # Static UI (MVC)
│   ├── index.html
│   ├── css/
│   └── js/
│       ├── models/
│       ├── views/
│       └── controllers/
└── backend/                  # Flask API (MVC)
    ├── .env.example
    ├── app.py
    ├── config.py
    ├── controllers/
    ├── models/
    ├── views/
    ├── services/
    ├── database/             # SQL Server connection singleton
    ├── sql/init.sql
    ├── docs/                 # Assignment specs (FST / LST / OST / SST)
    └── tests/
```

## Architecture

Both sides follow **MVC**:

- **Frontend:** models talk to the API; views render the UI; controllers wire user actions.
- **Backend:** Flask blueprints/controllers handle HTTP; services hold business logic; models access SQL Server.

Schema and seed data are applied on startup by `backend/services/seeder.py` (creates the `TelegramClone` database if missing). You can also run `backend/sql/init.sql` manually in SSMS.

## Environment

Create `backend/.env` from `backend/.env.example`:

```env
SQL_SERVER=YOUR-PC\SQLEXPRESS
DB_NAME=TelegramClone
JWT_SECRET=change-me
FLASK_PORT=3000
```

The frontend resolves the API host from the page hostname (`frontend/js/config.js`), so LAN access via `http://YOUR-IP:5500` talks to `http://YOUR-IP:3000/api`.

## Screenshots

_Add screenshots of the login screen and chat UI here if desired._

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Backend health check fails | Start SQL Server; set `SQL_SERVER` in `backend/.env`; install ODBC Driver 17 |
| `EADDRINUSE` on 3000/5500 | Run `stop.cmd`, then `start.cmd` again |
| Login / "Failed to fetch" | Open via http://127.0.0.1:5500 (not `file://`) |
| Invalid credentials | Restart backend — demo user `saad` is reset to `12345678` on seed |

## Note

University assignment project (SCD Assignment 05). Not affiliated with Telegram.
