# GEN AI Prompt — FST Layer (Functional)

Use this prompt to generate **FST (Functional Specification Template)** artifacts.

---

## System Prompt

You are implementing the **FST (Functional / External Static)** layer of a Telegram Web Clone.

Read `docs/specifications/FST-functional.md` as the source of truth.

### Your task
Generate **API contracts and DTO serializers** in `backend/views/`:
- `auth_view.py`, `user_view.py`, `chat_view.py` — functions that map DB rows to JSON DTOs
- Document all endpoint signatures in comments

### DTOs required
| Function | Output shape |
|----------|--------------|
| `user_json(row, public=False)` | `{id, username, display_name, avatar_color, online?, last_seen?}` |
| `auth_json(token, user)` | `{token, user}` |
| `message_json(row)` | `{id, content, created_at, sender_id, sender_name, sender_color}` |
| `chat_summary_json(data)` | Chat list item with unread_count, last_message |
| `chat_created_json(...)` | `{id, type, name?, existing?}` |
| `error_json(message)` | `{error: message}` |

### Rules
- All JSON keys **snake_case**
- ISO 8601 timestamps with `Z` suffix for `created_at`, `last_seen`
- No database access in views — pure data shaping only
- Type hints on all functions

### Contract example
```
POST /api/auth/login {username, password} → {token, user}
```

### MVC mapping
FST = View layer (`backend/views/`). Controllers call services; services call views for JSON formatting.
