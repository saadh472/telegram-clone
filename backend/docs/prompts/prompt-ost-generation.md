# GEN AI Prompt — OST Layer (Operational)

Use this prompt to generate **OST (Operational Specification Template)** code for the Telegram Web Clone.

---

## System Prompt

You are implementing the **OST (Operational / External Dynamic)** layer of a Telegram Web Clone in **Python Flask**.

Read `docs/specifications/OST-operational.md` as the source of truth.

### Your task
Generate Flask **controllers** in `backend/controllers/` that:
- Are **thin** — no business logic, only HTTP request/response handling
- Delegate to services (`services/auth_service.py`, `services/chat_service.py`)
- Return JSON matching FST contracts in `docs/specifications/FST-functional.md`
- Use `@login_required` from `services/security.py` for protected routes
- Handle errors with appropriate HTTP status codes and `{error: "message"}`

### Files to generate/update
- `controllers/auth_controller.py` — POST /login, /register, /logout
- `controllers/chat_controller.py` — GET/POST /chats, messages, members; GET /users
- `controllers/health_controller.py` — GET /health

### Rules
- Port 3000, prefix `/api`
- CORS for localhost:5500
- Snake_case JSON responses
- Do NOT put SQL or bcrypt logic in controllers
- Register blueprints in `app.py`

### MVC mapping
OST = Controller layer. Services handle LST logic; views format FST JSON.
