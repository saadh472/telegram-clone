# Contributing

Thanks for improving this project. Keep changes focused, easy to review, and aligned with the existing Flask plus vanilla JavaScript architecture.

## Local Setup

```bat
copy backend\.env.example backend\.env
start.cmd
```

Run checks before opening a pull request:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/check-repo.ps1
```

## Development Guidelines

- Preserve the current MVC/layered structure.
- Keep frontend code as vanilla JavaScript modules unless the project intentionally changes stack.
- Keep backend HTTP work in controllers, business rules in services, and SQL access in models.
- Do not commit local `.env` files, logs, database files, `node_modules`, or `__pycache__`.
- Keep UI changes responsive and accessible.
- Document any new environment variables in `backend/.env.example` and `README.md`.

## Pull Request Checklist

- [ ] The app still starts with `start.cmd`.
- [ ] Frontend check passes.
- [ ] Backend Python files compile.
- [ ] README/docs are updated for user-facing behavior changes.
- [ ] No secrets or local machine paths are committed.

