# Architecture

This project uses a layered MVC architecture on both the frontend and backend.

## Request Flow

```text
Browser UI
  -> frontend controller
  -> frontend model API call
  -> Flask controller
  -> service business logic
  -> model SQL query
  -> view DTO formatter
  -> JSON response
  -> frontend view render
```

## Frontend

The frontend is a hash-routed single-page app written in vanilla JavaScript modules.

| Folder | Responsibility |
| --- | --- |
| `frontend/js/controllers` | User actions, route orchestration, polling, form flows |
| `frontend/js/models` | API calls, local state helpers, preferences |
| `frontend/js/views` | DOM rendering and UI state |
| `frontend/js/config.js` | Shared constants, selectors, app state |
| `frontend/css/style.css` | Application styling and responsive rules |

## Backend

The backend is a Flask API with explicit separation between HTTP, business rules, persistence, and JSON formatting.

| Folder | Responsibility |
| --- | --- |
| `backend/controllers` | Flask blueprints and request/response handling |
| `backend/services` | Business rules, validation flow, seeding, security helpers |
| `backend/models` | SQL Server data access |
| `backend/views` | JSON DTO shaping |
| `backend/database` | SQL Server connection singleton |
| `backend/sql` | Manual schema and seed SQL |

## Data Model

Core tables:

- `users`
- `chats`
- `chat_members`
- `messages`
- `message_hidden`
- `message_reactions`

The startup seeder creates and migrates the schema when the backend starts.

## Runtime Services

- Backend API: `http://127.0.0.1:3000/api`
- Frontend app: `http://127.0.0.1:5500`
- Health check: `GET /api/health`

## Design Notes

- REST polling is used for chat updates and typing indicators.
- The frontend keeps client-side preferences in local storage.
- Attachment-like messages are encoded in message content for demo simplicity.
- The E2E mode is educational and intentionally documented as non-production cryptography.

