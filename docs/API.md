# API Reference

Base URL:

```text
http://127.0.0.1:3000/api
```

Authenticated routes require:

```http
Authorization: Bearer <jwt>
```

## Health

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/health` | Check backend and database status |

## Auth

| Method | Path | Body | Description |
| --- | --- | --- | --- |
| `POST` | `/auth/register` | `{ "username", "password", "display_name" }` | Create user and return JWT |
| `POST` | `/auth/login` | `{ "username", "password" }` | Authenticate and return JWT |
| `POST` | `/auth/logout` | none | End current session client flow |

## Users

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/users` | List available users except current user |
| `GET` | `/users/me` | Get current user profile |
| `POST` | `/users/heartbeat` | Mark current user online |
| `POST` | `/users/offline` | Mark current user offline |

## Chats

| Method | Path | Body / Query | Description |
| --- | --- | --- | --- |
| `GET` | `/chats` | none | List chat summaries |
| `POST` | `/chats` | private: `{ "user_id" }` | Create or return private chat |
| `POST` | `/chats` | group: `{ "type": "group", "name", "member_ids" }` | Create group chat |
| `GET` | `/chats/{chat_id}/members` | none | List members |
| `POST` | `/chats/{chat_id}/members` | `{ "user_id" }` | Add member |

## Messages

| Method | Path | Body / Query | Description |
| --- | --- | --- | --- |
| `GET` | `/chats/{chat_id}/messages` | `limit`, `offset`, optional `since_id` | List paged messages or newer message delta |
| `POST` | `/chats/{chat_id}/messages` | `{ "content", "reply_to_id" }` | Send message |
| `PATCH` | `/chats/{chat_id}/messages/{message_id}` | `{ "content" }` | Edit own message |
| `DELETE` | `/chats/{chat_id}/messages/{message_id}` | none | Delete own message for everyone |
| `POST` | `/chats/{chat_id}/messages/{message_id}/hide` | none | Hide message for current user |

## Typing

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/chats/{chat_id}/typing` | Set typing activity |
| `GET` | `/chats/{chat_id}/typing` | Get active typing users |

## Reactions

| Method | Path | Body | Description |
| --- | --- | --- | --- |
| `GET` | `/chats/{chat_id}/reactions` | none | Get reaction summary for chat |
| `GET` | `/chats/{chat_id}/messages/{message_id}/reactions` | none | Get reactions for message |
| `POST` | `/chats/{chat_id}/messages/{message_id}/reactions` | `{ "emoji" }` | Toggle reaction |

## Common Errors

| Status | Meaning |
| --- | --- |
| `400` | Validation error |
| `401` | Missing or invalid JWT |
| `403` | User is not allowed to access the chat/message |
| `404` | Resource not found |
| `413` | Upload payload too large |
| `500` | Unexpected server error |

