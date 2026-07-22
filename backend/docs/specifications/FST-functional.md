# FST — Functional Specification Template
**Type:** External Static | **Telegram Web Clone**

## Purpose
Defines API contracts: endpoints, request/response shapes, and service interfaces. No implementation logic.

---

## Base URL
`http://localhost:3000/api`

All JSON uses **snake_case** keys.

---

## Endpoints

### Health
| Method | Path | Auth | Response |
|--------|------|------|----------|
| GET | `/health` | No | `{status: "ok", database: "connected"}` |

### Auth
| Method | Path | Body | Response |
|--------|------|------|----------|
| POST | `/auth/login` | `{username, password}` | `{token, user}` |
| POST | `/auth/register` | `{username, password, display_name}` | `{token, user}` |
| POST | `/auth/logout` | — | `{success: true}` |

**User object:**
```json
{
  "id": 1,
  "username": "saad",
  "display_name": "Saad Hussain",
  "avatar_color": "#3390ec"
}
```

### Users
| Method | Path | Response |
|--------|------|----------|
| GET | `/users` | `[UserDto+]` (includes `online`, `last_seen`) |

### Chats
| Method | Path | Body / Query | Response |
|--------|------|--------------|----------|
| GET | `/chats` | — | `[ChatSummaryDto]` |
| POST | `/chats` | `{user_id, type}` or `{name, type, member_ids}` | `{id, type, existing?}` |
| GET | `/chats/{id}/messages` | `?limit=50&offset=0` | `[MessageDto]` |
| POST | `/chats/{id}/messages` | `{content}` | `MessageDto` |
| GET | `/chats/{id}/members` | — | `[UserDto]` |

**ChatSummaryDto:**
```json
{
  "id": 1,
  "name": null,
  "type": "private",
  "display_name": "Alice Johnson",
  "avatar_color": "#e17076",
  "other_user_id": 2,
  "last_message": "Hey Saad!",
  "last_message_time": "2026-06-21T10:00:00Z",
  "unread_count": 0
}
```

**MessageDto:**
```json
{
  "id": 10,
  "content": "Hello",
  "created_at": "2026-06-21T10:05:00Z",
  "sender_id": 1,
  "sender_name": "Saad Hussain",
  "sender_color": "#3390ec"
}
```

### Errors
```json
{"error": "Invalid username or password"}
```
HTTP status: 400, 401, 403, 409, 500, 503

---

## Service Contracts (Python)

```python
# lst/auth_service.py — implements auth contract
def login(username, password) -> dict  # {token, user}
def register(username, password, display_name) -> dict
def logout(user_id) -> dict

# lst/chat_service.py — implements chat contract
def list_chats(user_id) -> list
def get_messages(chat_id, user_id, limit, offset) -> list
def send_message(chat_id, user_id, content) -> dict
```
