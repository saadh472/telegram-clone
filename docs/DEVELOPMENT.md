# Development Guide

## Local Workflow

1. Copy environment file:

   ```bat
   copy backend\.env.example backend\.env
   ```

2. Edit `backend/.env` and set `SQL_SERVER`.

3. Start the app:

   ```bat
   start.cmd
   ```

4. Run checks before committing:

   ```powershell
   powershell -ExecutionPolicy Bypass -File scripts/check-repo.ps1
   ```

## Frontend Guidelines

- Keep DOM selectors centralized in `frontend/js/config.js`.
- Put API calls and local data helpers in `frontend/js/models`.
- Put DOM rendering in `frontend/js/views`.
- Put event wiring and workflows in `frontend/js/controllers`.
- Prefer event delegation for repeated chat/message items.
- Keep loading, empty, success, and error states visible for each workflow.

## Backend Guidelines

- Controllers should stay thin and return HTTP responses.
- Services should own validation flow and business rules.
- Models should own SQL queries.
- Views should format JSON payloads.
- Update `backend/.env.example` when adding config.
- Avoid returning raw exceptions unless `FLASK_DEBUG=true`.

## Database Notes

The backend initializes schema and demo data through `backend/services/seeder.py`.

For manual inspection, the SQL script lives at:

```text
backend/sql/init.sql
```

For GitHub-based deployment, see [Deployment](DEPLOYMENT.md). Local development still uses `start.cmd` and `backend/.env`.

## Git Hygiene

Do not commit:

- `backend/.env`
- logs
- `node_modules`
- Python bytecode
- local database files
- generated build artifacts

## Suggested GitHub Topics

Add these repository topics on GitHub:

```text
flask
vanilla-javascript
sql-server
jwt-authentication
messaging-app
telegram-clone
mvc-architecture
portfolio-project
```
