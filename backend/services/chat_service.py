"""SERVICE — Chat and messaging business logic."""
from __future__ import annotations

import time

import config
from models.chat_model import ChatModel
from models.message_model import MessageModel
from models.reaction_model import ReactionModel
from models.user_model import UserModel
from services.cache_service import get_or_set, invalidate_user
from services.validators import ValidationError, validate_message_content, validate_group_name, validate_reaction_emoji
from views.chat_view import chat_created_json, chats_json, message_json, messages_json
from views.user_view import users_json

# In-memory typing indicators: chat_id -> {user_id: timestamp}
_typing: dict[int, dict[int, float]] = {}


class ChatService:
    def __init__(self) -> None:
        self.chats = ChatModel()
        self.messages = MessageModel()
        self.users = UserModel()
        self.reactions = ReactionModel()

    def _invalidate_chat_members(self, chat_id: int, actor_id: int) -> None:
        invalidate_user(actor_id)
        for member in self.chats.list_members(chat_id):
            if member["id"] != actor_id:
                invalidate_user(member["id"])

    def list_users(self, current_user_id: int) -> list[dict]:
        key = f"users:{current_user_id}"
        return get_or_set(
            key,
            config.USERS_CACHE_TTL,
            lambda: users_json(self.users.list_except(current_user_id), public=True),
        )

    def list_chats(self, user_id: int) -> list[dict]:
        key = f"chats:{user_id}:list"
        return get_or_set(
            key,
            config.CHATS_CACHE_TTL,
            lambda: chats_json(
                self.chats.list_summaries_for_user(user_id, limit=config.CHATS_LIST_LIMIT)
            ),
        )

    def create_chat(self, user_id: int, body: dict) -> dict:
        chat_type = body.get("type", "private")
        if chat_type == "group":
            name = validate_group_name(body.get("name") or "")
            member_ids = [int(m) for m in (body.get("member_ids") or [])]
            if not name or not member_ids:
                raise ValidationError("Group name and members required")
            chat_id = self.chats.create_group(name, user_id, member_ids)
            invalidate_user(user_id)
            for mid in member_ids:
                invalidate_user(mid)
            return chat_created_json(chat_id, "group", name=name)

        other_user_id = body.get("user_id")
        if not other_user_id:
            raise ValidationError("User ID required for private chat")
        other_user_id = int(other_user_id)
        if other_user_id == user_id:
            raise ValidationError("Cannot create a private chat with yourself")
        existing = self.chats.find_private_chat(user_id, other_user_id)
        if existing:
            return chat_created_json(existing, "private", existing=True)
        chat_id = self.chats.create_private(user_id, other_user_id)
        invalidate_user(user_id)
        invalidate_user(other_user_id)
        return chat_created_json(chat_id, "private")

    def get_messages(
        self,
        chat_id: int,
        user_id: int,
        limit: int,
        offset: int,
        since_id: int | None = None,
    ) -> dict:
        if not self.chats.is_member(chat_id, user_id):
            raise PermissionError("Access denied")
        limit = max(1, min(limit, config.MESSAGES_MAX_LIMIT))
        offset = max(0, offset)
        total = self.messages.count_by_chat(chat_id, user_id)
        if since_id and since_id > 0:
            rows = self.messages.list_after_id(chat_id, since_id, limit, user_id)
            self.messages.mark_read(chat_id, user_id)
            invalidate_user(user_id)
            return {
                "messages": messages_json(rows),
                "total": total,
                "offset": max(0, total - len(rows)),
                "limit": limit,
                "has_more": False,
                "delta": True,
                "since_id": since_id,
            }
        effective_offset = offset
        if effective_offset == 0 and total > limit:
            effective_offset = max(0, total - limit)
        rows = self.messages.list_for_chat(chat_id, effective_offset, limit, user_id)
        self.messages.mark_read(chat_id, user_id)
        invalidate_user(user_id)
        return {
            "messages": messages_json(rows),
            "total": total,
            "offset": effective_offset,
            "limit": limit,
            "has_more": effective_offset > 0,
        }

    def send_message(self, chat_id: int, user_id: int, content: str, reply_to_id: int | None = None) -> dict:
        if not self.chats.is_member(chat_id, user_id):
            raise PermissionError("Access denied")
        content = validate_message_content(content)
        if reply_to_id:
            reply = self.messages.get_by_id(int(reply_to_id))
            if not reply:
                raise ValidationError("Reply message not found")
            if int(reply.get("chat_id", 0)) != chat_id:
                raise ValidationError("Reply message must belong to this chat")
        self._invalidate_chat_members(chat_id, user_id)
        return message_json(self.messages.create(chat_id, user_id, content, reply_to_id))

    def edit_message(self, chat_id: int, user_id: int, message_id: int, content: str) -> dict:
        if not self.chats.is_member(chat_id, user_id):
            raise PermissionError("Access denied")
        content = validate_message_content(content)
        existing = self.messages.get_by_id(message_id)
        if not existing or int(existing.get("chat_id", 0)) != chat_id:
            raise ValidationError("Message not found in this chat")
        row = self.messages.update_content(message_id, user_id, content)
        if not row:
            raise ValidationError("Cannot edit this message (not found, not yours, or older than 48h)")
        self._invalidate_chat_members(chat_id, user_id)
        return message_json(row)

    def delete_message(self, chat_id: int, user_id: int, message_id: int) -> dict:
        if not self.chats.is_member(chat_id, user_id):
            raise PermissionError("Access denied")
        existing = self.messages.get_by_id(message_id)
        if not existing or int(existing.get("chat_id", 0)) != chat_id:
            raise ValidationError("Message not found in this chat")
        row = self.messages.soft_delete_for_everyone(message_id, user_id, chat_id)
        if not row:
            raise ValidationError("Cannot delete this message")
        self._invalidate_chat_members(chat_id, user_id)
        return message_json(row)

    def hide_message_for_user(self, chat_id: int, user_id: int, message_id: int) -> dict:
        if not self.chats.is_member(chat_id, user_id):
            raise PermissionError("Access denied")
        existing = self.messages.get_by_id(message_id)
        if not existing or int(existing.get("chat_id", 0)) != chat_id:
            raise ValidationError("Message not found in this chat")
        if not self.messages.hide_for_user(message_id, user_id, chat_id):
            raise ValidationError("Message not found in this chat")
        invalidate_user(user_id)
        return {"success": True, "id": message_id, "scope": "me"}

    def set_typing(self, chat_id: int, user_id: int) -> dict:
        if not self.chats.is_member(chat_id, user_id):
            raise PermissionError("Access denied")
        bucket = _typing.setdefault(chat_id, {})
        bucket[user_id] = time.time()
        cutoff = time.time() - 5
        for uid, ts in list(bucket.items()):
            if ts < cutoff:
                del bucket[uid]
        return {"success": True}

    def get_typing(self, chat_id: int, user_id: int) -> list[dict]:
        if not self.chats.is_member(chat_id, user_id):
            raise PermissionError("Access denied")
        bucket = _typing.get(chat_id, {})
        cutoff = time.time() - 5
        active_ids = [uid for uid, ts in bucket.items() if ts >= cutoff and uid != user_id]
        if not active_ids:
            return []
        members = {m["id"]: m for m in self.chats.list_members(chat_id)}
        return [
            {"user_id": uid, "display_name": members[uid]["display_name"]}
            for uid in active_ids if uid in members
        ]

    def get_members(self, chat_id: int, user_id: int) -> list[dict]:
        if not self.chats.is_member(chat_id, user_id):
            raise PermissionError("Access denied")
        return users_json(self.chats.list_members(chat_id), public=True)

    def get_current_user(self, user_id: int) -> dict:
        user = self.users.find_by_id(user_id)
        if not user:
            raise ValidationError("User not found")
        return users_json([user], public=True)[0]

    def set_presence(self, user_id: int, online: bool) -> dict:
        self.users.set_online(user_id, online)
        return {"success": True, "online": online}

    def toggle_reaction(self, chat_id: int, user_id: int, message_id: int, emoji: str) -> dict:
        if not self.chats.is_member(chat_id, user_id):
            raise PermissionError("Access denied")
        emoji = validate_reaction_emoji(emoji)
        if not self.reactions.message_in_chat(message_id, chat_id):
            raise ValidationError("Message not found in this chat")
        reactions = self.reactions.toggle(message_id, user_id, emoji)
        self._invalidate_chat_members(chat_id, user_id)
        return {"message_id": message_id, "reactions": reactions}

    def get_reactions(self, chat_id: int, user_id: int, message_id: int) -> dict:
        if not self.chats.is_member(chat_id, user_id):
            raise PermissionError("Access denied")
        if not self.reactions.message_in_chat(message_id, chat_id):
            raise ValidationError("Message not found in this chat")
        return {"message_id": message_id, "reactions": self.reactions.list_for_message(message_id)}

    def get_chat_reactions(self, chat_id: int, user_id: int) -> dict:
        if not self.chats.is_member(chat_id, user_id):
            raise PermissionError("Access denied")
        by_message = self.reactions.list_for_chat(chat_id)
        return {
            "chat_id": chat_id,
            "reactions": {str(mid): emojis for mid, emojis in by_message.items()},
        }

    def add_member(self, chat_id: int, user_id: int, new_user_id: int) -> dict:
        if not self.chats.is_member(chat_id, user_id):
            raise PermissionError("Access denied")
        chat_type = self.chats.get_type(chat_id)
        if chat_type != "group":
            raise ValidationError("Can only add members to group chats")
        if not new_user_id:
            raise ValidationError("User ID required")
        new_user_id = int(new_user_id)
        if self.chats.is_member(chat_id, new_user_id):
            raise ValidationError("User is already a member")
        if not self.users.find_by_id(new_user_id):
            raise ValidationError("User not found")
        self.chats.add_member(chat_id, new_user_id)
        self._invalidate_chat_members(chat_id, user_id)
        invalidate_user(new_user_id)
        return {"success": True, "user_id": new_user_id}
