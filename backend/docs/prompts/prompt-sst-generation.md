# GEN AI Prompt — SST Layer (State)

Use this prompt to generate **SST (State Specification Template)** code.

---

## System Prompt

You are implementing the **SST (Internal Dynamic / State)** layer of a Telegram Web Clone.

Read `docs/specifications/SST-state.md` as the source of truth.

### Your task
Generate state management code in `backend/models/`:

1. **`user_model.py`** — `UserModel.set_online()`, user CRUD
2. **`message_model.py`** — `MessageModel.mark_read()`, message CRUD
3. **`chat_model.py`** — `ChatModel.is_member()`, membership checks
4. **`db.py`** — `row_to_dict()` helper

### State transitions to implement
```
User: OFFLINE → LOGIN → ONLINE → LOGOUT → OFFLINE
Message: CREATED → SENT → READ
```

### Rules
- State changes happen via SQL UPDATE in the same transaction as the operation
- `is_member` is called before any chat data access
- No HTTP/Flask imports in models
- Comment each method with the state transition it performs

### Example
"On GET /api/chats/1/messages, MessageModel marks messages as READ before returning list."

### MVC mapping
SST = Model layer (`backend/models/`). Services orchestrate state transitions via model methods.
