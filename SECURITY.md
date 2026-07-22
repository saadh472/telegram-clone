# Security Policy

## Supported Scope

This is an educational messaging clone and portfolio project. Security fixes are welcome for the current `main` branch.

## Reporting a Vulnerability

Please do not post exploitable security details in a public issue. Instead, contact the repository owner privately through GitHub profile contact options, then open a minimal public issue after the fix is prepared if tracking is needed.

## Important Notes

- Change `JWT_SECRET` before any shared or public deployment.
- Do not commit `backend/.env` or real database connection strings.
- The client-side E2E mode is a demo and should not be treated as Signal-grade secure messaging.
- The demo stores attachment payloads in message content; avoid using real private files.

