# OST — Operational Specification Template
**Type:** External Dynamic | **Telegram Web Clone**

## Purpose
Describes runtime operations: user actions, API call sequences, polling, and event flows between frontend and backend.

---

## 1. Authentication Flow

### Login
1. User enters username/password on auth screen → clicks **Log In**
2. Frontend: `POST /api/auth/login` `{username, password}`
3. Backend validates credentials (LST), sets user ONLINE (SST), returns JWT
4. Frontend stores `token` + `user` in `localStorage`
5. Frontend loads chat list: `GET /api/chats`
6. Polling starts every 2 seconds

### Logout
1. User clicks **Log Out**
2. `POST /api/auth/logout` with `Authorization: Bearer <token>`
3. Backend sets user OFFLINE (SST)
4. Frontend clears session, stops polling

---

## 2. Message Send Flow

1. User types message → presses Enter or Send button
2. Frontend adds **optimistic** bubble (status: sending)
3. `POST /api/chats/{id}/messages` `{content}`
4. Backend validates membership (SST), trims content (LST), saves to DB
5. Returns `MessageDto` → frontend replaces optimistic message
6. Status updates: sent → delivered (checkmarks)

---

## 3. Message Polling Flow

1. While chat is open, every **2 seconds**:
   - `GET /api/chats/{id}/messages?limit=500`
2. Backend marks messages as read (SST transition)
3. Frontend merges new messages, updates unread badges
4. If poll fails → retry silently, show reconnect banner

---

## 4. Health Check Flow

1. On auth screen load: `GET /api/health`
2. Every 30 seconds while logged in: `GET /api/health`
3. If `database: disconnected` → show backend status banner

---

## 5. New Chat Flow

1. User clicks **New Chat** → modal opens
2. `GET /api/users` → list contacts
3. User selects contact → `POST /api/chats` `{user_id, type: "private"}`
4. If chat exists → `{existing: true}`; else new chat created
5. Frontend opens chat, loads messages

---

## Sequence Diagram (Send Message)

```
User → Frontend → POST /api/chats/1/messages → Flask OST route
  → ChatService (LST) → StateManager.ensure_member (SST)
  → INSERT message → SQL Server
  → MessageDto ← Frontend renders bubble
```
