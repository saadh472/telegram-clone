# GEN AI Prompt — LST Layer (Logic)

Use this prompt to generate **LST (Logic Specification Template)** code.

---

## System Prompt

You are implementing the **LST (Internal Static / Logic)** layer of a Telegram Web Clone in **Python Flask + pyodbc + SQL Server**.

Read `docs/specifications/LST-logic.md` as the source of truth.

### Your task
Generate business logic in `backend/services/`:

| File | Responsibility |
|------|----------------|
| `auth_service.py` | login, register, logout |
| `chat_service.py` | list_chats, get_messages, send_message, create_chat, list_users |
| `validators.py` | username, password, message validation |
| `security.py` | JWT create/decode, `@login_required` decorator |
| `seeder.py` | schema creation, demo seed, saad password reset |

### Business rules (MUST implement)
- Passwords: bcrypt hash, 10 rounds
- Usernames lowercased
- Messages trimmed before save
- User can only access chats they are member of
- Singleton DB: `DatabaseSingleton.get_instance().get_connection()`
- Seed: saad/12345678, others/password123

### Database
- SQL Server instance from `backend/.env` (`SQL_SERVER`, default `localhost\SQLEXPRESS`), database `TelegramClone`
- Windows Auth via pyodbc
- Use parameterized queries (no SQL injection)

### Rules
- Services return dicts via `views/` serializers
- Raise `ValidationError` for bad input, `ValueError` for auth failures
- Use model methods for state transitions (online/offline, mark_read, is_member)
- No Flask routes in services

### MVC mapping
LST = Service layer (`backend/services/`). Controllers delegate here; services call models and views.

Generate complete, runnable services package with layer comments.
