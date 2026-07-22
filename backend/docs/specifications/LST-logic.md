# LST — Logic Specification Template
**Type:** Internal Static | **Telegram Web Clone**

## Purpose
Business rules, validation, algorithms, and security logic. No HTTP or UI concerns.

---

## 1. Authentication Rules

| Rule | Implementation |
|------|----------------|
| Passwords bcrypt-hashed (10 rounds) | `lst/seeder.py`, `lst/auth_service.py` |
| Username stored lowercase | `validate_username()` |
| Login failure message generic | "Invalid username or password" (no user enumeration) |
| JWT HS256, 7-day expiry | `lst/security.py` |
| Saad password reset on startup | `ensure_saad_password()` → `12345678` |

---

## 2. Validation Rules (`lst/validators.py`)

| Field | Rule |
|-------|------|
| Username | ≥2 chars, `[a-z0-9_]` only |
| Password (register) | ≥6 chars |
| Password (login) | non-empty |
| Display name | ≥2 chars |
| Message content | non-empty after trim, max 10,000 chars |

---

## 3. Chat Membership Rules

- User can only read/send messages in chats where they are a `chat_members` row
- Private chat between two users: reuse existing if one already exists
- Group chat requires `name` + at least one `member_id`

---

## 4. Message Rules

- Content trimmed before save: `content.strip()`
- Empty messages rejected
- Sender must be chat member
- Pagination: default limit 50, max 500; offset 0 returns **most recent** N messages

---

## 5. Singleton Database Pattern (`database/singleton.py`)

```python
class DatabaseSingleton:
    """Thread-safe Singleton — one connection factory app-wide."""
    _instance = None
    _lock = threading.Lock()

    def get_connection(self) -> pyodbc.Connection:
        ...
```

- Tries multiple ODBC connection strings (named instance, TCP port, localhost)
- Windows Authentication (`Trusted_Connection=yes`)
- `Encrypt=yes; TrustServerCertificate=yes`

---

## 6. Seed Data Rules

| User | Password |
|------|----------|
| saad | `12345678` |
| ahmed, fatima, usman, ayesha, hamza, zainab, bilal, maryam | `password123` |

- Skip seed if `users` table non-empty (except saad password refresh + legacy migration)
- 5 chats: 4 private (saad+ahmed, saad+fatima, saad+usman, saad+ayesha), 1 group (University Friends)

---

## 7. Security Rules

- All `/api/*` except `/health`, `/auth/login`, `/auth/register` require `Authorization: Bearer <jwt>`
- CORS allowed: `http://localhost:5500`, `http://127.0.0.1:5500`
- HTML in messages escaped on frontend (`escapeHtml`) — backend stores plain text
