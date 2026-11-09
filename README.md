# Telegram Web Clone

[![Quality](https://github.com/saadh472/telegram-clone/actions/workflows/quality.yml/badge.svg)](https://github.com/saadh472/telegram-clone/actions/workflows/quality.yml)
[![MIT License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

A Telegram-inspired web app for private and group messaging. It pairs a plain JavaScript frontend with a layered Flask REST API and runs locally with SQLite or SQL Server.

## What you can try

- Register or sign in with a seeded demo account and browse private and group chats.
- Send, reply to, edit, forward, and react to messages. Try attachments, stickers, and voice messages.
- Keep notes in Saved Messages and organize chats with pin, mute, and archive controls.
- Explore typing indicators, search, themes, and per-chat wallpaper.

## Quick start

Install **Python 3.11 or later**, then run the commands below from the repository root. The SQLite demo starts the frontend and API on the same local port. It needs neither Node.js nor a database server.

**Windows PowerShell**

    python -m venv .venv
    .\.venv\Scripts\python.exe -m pip install -r backend/requirements-prod.txt
    $env:DB_ENGINE = "sqlite"
    $env:SERVE_FRONTEND = "true"
    $env:FLASK_HOST = "127.0.0.1"
    $env:JWT_SECRET = .\.venv\Scripts\python.exe -c "import secrets; print(secrets.token_hex(32))"
    .\.venv\Scripts\python.exe backend/app.py

**macOS or Linux**

    python3 -m venv .venv
    .venv/bin/python -m pip install -r backend/requirements-prod.txt
    export DB_ENGINE=sqlite SERVE_FRONTEND=true FLASK_HOST=127.0.0.1
    export JWT_SECRET="$(.venv/bin/python -c 'import secrets; print(secrets.token_hex(32))')"
    .venv/bin/python backend/app.py

Open [http://127.0.0.1:3000](http://127.0.0.1:3000). Sign in with demo username `saad` and password `12345678`. [API health](http://127.0.0.1:3000/api/health) shows the database connection and engine.

For SQL Server or separate frontend and backend processes, see the [development guide](docs/DEVELOPMENT.md). See the [deployment guide](docs/DEPLOYMENT.md) for a Docker and Render walkthrough.

## Project layout

| Path | Responsibility |
| --- | --- |
| [frontend/](frontend/) | Hash-routed UI, JavaScript models, views and controllers, and client preferences |
| [backend/](backend/) | Flask routes, business logic, JWT authentication, database access, and demo fixtures |
| [docs/](docs/) | [Architecture](docs/ARCHITECTURE.md), [API reference](docs/API.md), and setup guides |

The frontend polls REST endpoints for message and typing updates. On the backend, controllers delegate business rules to services and database operations to models. SQLite is the simplest way to run the demo, and the project also supports SQL Server through ODBC.

## Verify locally

    npm --prefix frontend run check
    python -m compileall -q backend

With the app running at port 3000, run `python backend/tests/smoke_api.py` to check health, demo login, profile lookup, chat listing, and invalid JSON handling.

## Demo limits

Use sample data and test files. Startup refreshes the shared demo account, and changes to the seed version can reset its conversations. Calls are simulated. The experimental encryption mode is for learning, and attachments are stored with message data.

This educational project is independent of Telegram. Source code is released under the [MIT License](LICENSE).
