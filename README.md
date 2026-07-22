# Telegram Web Clone

[![Quality](https://github.com/saadh472/telegram-clone/actions/workflows/quality.yml/badge.svg)](https://github.com/saadh472/telegram-clone/actions/workflows/quality.yml)
![Frontend](https://img.shields.io/badge/frontend-vanilla%20JS-f7df1e?logo=javascript&logoColor=111)
![Backend](https://img.shields.io/badge/backend-Flask-000?logo=flask)
![Database](https://img.shields.io/badge/database-SQL%20Server-cc2927?logo=microsoftsqlserver&logoColor=white)
![Deploy](https://img.shields.io/badge/deploy-GitHub%20Pages%20%2B%20Docker-24292f?logo=github)
![License](https://img.shields.io/badge/license-MIT-green)

A Telegram-inspired messaging application built with a vanilla HTML/CSS/JavaScript frontend, a Flask REST API, JWT authentication, and SQL Server persistence. The project demonstrates a complete MVC/layered architecture with private chats, groups, media-style messages, reactions, typing indicators, settings, and seeded demo data.

> Educational portfolio project. Not affiliated with Telegram.

## Highlights

- Hash-routed single-page frontend using plain JavaScript modules
- Flask REST API with controller/service/model/view separation
- SQL Server bootstrap and demo seeding on backend startup
- JWT auth with registration, login, logout, and protected routes
- Private chats, group chats, replies, edits, soft delete, hide-for-me delete, forwarding, reactions, and typing indicators
- Photo, file, sticker, and voice-message style content
- Client-side preferences for pin, mute, archive, theme, wallpaper, privacy, and profile settings
- Accessible, responsive messaging UI with loading, empty, error, and success states
- Local launcher scripts for Windows development

## Tech Stack

| Layer | Technology |
| --- | --- |
| Frontend | HTML, CSS, vanilla JavaScript modules |
| Frontend architecture | MVC-style models, views, controllers |
| Backend | Python, Flask, Flask-CORS |
| Backend architecture | Layered MVC: controllers, services, models, views |
| Database | Microsoft SQL Server Express via `pyodbc` |
| Auth | JWT bearer tokens |
| Tooling | npm scripts, PowerShell checks, GitHub Actions |

## Quick Start

### Prerequisites

- Python 3.10+
- Node.js LTS
- SQL Server Express with Windows Authentication
- Microsoft ODBC Driver 17 or 18 for SQL Server

### Run on Windows

```bat
git clone https://github.com/saadh472/telegram-clone.git
cd telegram-clone
copy backend\.env.example backend\.env
start.cmd
```

Open:

```text
http://127.0.0.1:5500
```

Demo account:

| Username | Password |
| --- | --- |
| `saad` | `12345678` |

Other seeded demo users normally use `password123`.

## Configuration

Create `backend/.env` from `backend/.env.example` and adjust the SQL Server name shown in SSMS.

```env
SQL_SERVER=localhost\SQLEXPRESS
DB_NAME=TelegramClone
JWT_SECRET=change-me
FLASK_HOST=0.0.0.0
FLASK_PORT=3000
FLASK_DEBUG=false
```

For shared demos, change `JWT_SECRET` before running the app.

## Deploy Full Stack From GitHub

The full stack is deployable from this repo as one web service. In production, Flask serves both the frontend and the `/api` routes from the same URL.

GitHub itself does not run Flask apps on GitHub Pages. Use GitHub as the source repo, then deploy the full-stack service with Render or another Docker-capable host.

Recommended production split:

| Part | Deployment target |
| --- | --- |
| Frontend | Served by Flask from the same Render service |
| Backend | Render Docker service from `render.yaml` and `backend/Dockerfile` |
| Database | Cloud SQL Server/Azure SQL reachable by the backend |

Required setup:

1. Push this repo to GitHub.
2. Create a hosted SQL Server database named `TelegramClone` or your preferred `DB_NAME`.
3. Deploy the app on Render using the repo Blueprint (`render.yaml`).
4. Set backend environment variables: `SQL_SERVER`, `DB_NAME`, `SQL_USER`, `SQL_PASSWORD`, and `SKIP_DATABASE_CREATE=true`.
5. Open the Render URL. The app UI loads at `/` and the API runs at `/api`.

Optional static-only frontend deployment is still available through GitHub Pages if you add repository variable `API_BASE_URL` and run `.github/workflows/deploy-pages.yml`.

The frontend can also be pointed to any API temporarily:

```text
https://saadh472.github.io/telegram-clone/?api=https://your-backend.example.com/api
```

## Commands

| Command | Purpose |
| --- | --- |
| `start.cmd` | Check prerequisites, install missing dependencies, start backend and frontend |
| `start.cmd --fast` | Start without dependency installation |
| `start.cmd --install` | Force reinstall Python and frontend dependencies |
| `stop.cmd` | Stop local services on ports 3000 and 5500 |
| `npm --prefix frontend run check` | Syntax-check frontend JavaScript modules |
| `powershell -ExecutionPolicy Bypass -File scripts/check-repo.ps1` | Run repository quality checks |

Manual run:

```bat
cd backend
pip install -r requirements.txt
python app.py

cd ..\frontend
npm install
npm start
```

## URLs

| Service | URL |
| --- | --- |
| App | `http://127.0.0.1:5500` |
| API | `http://127.0.0.1:3000/api` |
| Health | `http://127.0.0.1:3000/api/health` |

Always open the frontend through `http://`; opening `frontend/index.html` directly with `file://` will not connect to the API.

## Project Structure

```text
telegram-clone/
|-- backend/
|   |-- app.py
|   |-- config.py
|   |-- controllers/
|   |-- database/
|   |-- docs/
|   |-- models/
|   |-- services/
|   |-- sql/
|   |-- tests/
|   `-- views/
|-- frontend/
|   |-- index.html
|   |-- css/
|   |-- js/
|   |   |-- controllers/
|   |   |-- models/
|   |   `-- views/
|   `-- scripts/
|-- docs/
|-- scripts/
|-- start.cmd
`-- stop.cmd
```

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [API reference](docs/API.md)
- [Development guide](docs/DEVELOPMENT.md)
- [Deployment guide](docs/DEPLOYMENT.md)
- [Contributing](CONTRIBUTING.md)
- [Security policy](SECURITY.md)
- [Changelog](CHANGELOG.md)

## Screenshots

Add polished screenshots to `docs/assets/` and reference them here:

```md
![Login screen](docs/assets/login.png)
![Chat screen](docs/assets/chat.png)
```

Recommended screenshots:

- Login/register screen
- Main chat view
- Mobile layout
- Settings/profile panel

## Quality Checks

GitHub Actions runs:

- frontend dependency installation
- JavaScript module syntax checks
- backend Python syntax compilation

Run the same checks locally:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/check-repo.ps1
```

## Known Constraints

- SQL Server and an ODBC driver are required for the web version.
- Media content is stored as message content for demonstration purposes.
- Typing and chat updates use REST polling.
- The E2E mode is an educational client-side demo, not a production-grade secure messaging protocol.

## Troubleshooting

| Problem | Fix |
| --- | --- |
| Backend health check fails | Start SQL Server, install ODBC Driver 17/18, and verify `SQL_SERVER` in `backend/.env` |
| `EADDRINUSE` on port 3000 or 5500 | Run `stop.cmd`, then start again |
| Login shows "Failed to fetch" | Open `http://127.0.0.1:5500`, not `file://` |
| Invalid demo credentials | Restart the backend so the seeder resets demo users |
| LAN access does not connect | Add your frontend origin to `CORS_ORIGINS` in `backend/.env` |

## License

Released under the [MIT License](LICENSE).
