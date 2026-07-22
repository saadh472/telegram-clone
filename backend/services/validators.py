"""SERVICE — Input validation rules."""
from __future__ import annotations

import re

import config


class ValidationError(ValueError):
    pass


def validate_username(username: str) -> str:
    u = (username or "").strip().lower()
    if len(u) < 2:
        raise ValidationError("Username must be at least 2 characters")
    if not re.fullmatch(r"[a-z0-9_]+", u):
        raise ValidationError("Username may only contain letters, numbers, and underscores")
    return u


def validate_password(password: str, min_len: int = 6) -> str:
    if not password:
        raise ValidationError("Password is required")
    if len(password) < min_len:
        raise ValidationError(f"Password must be at least {min_len} characters")
    return password


def validate_display_name(name: str) -> str:
    n = (name or "").strip()
    if len(n) < 2:
        raise ValidationError("Display name must be at least 2 characters")
    if len(n) > DISPLAY_NAME_MAX_LENGTH:
        raise ValidationError(f"Display name is too long (max {DISPLAY_NAME_MAX_LENGTH} characters)")
    return n


def validate_group_name(name: str) -> str:
    n = (name or "").strip()
    if len(n) < 2:
        raise ValidationError("Group name must be at least 2 characters")
    if len(n) > GROUP_NAME_MAX_LENGTH:
        raise ValidationError(f"Group name is too long (max {GROUP_NAME_MAX_LENGTH} characters)")
    return n


def validate_reaction_emoji(emoji: str) -> str:
    e = (emoji or "").strip()
    if e not in ALLOWED_REACTION_EMOJIS:
        raise ValidationError("Invalid reaction emoji")
    return e


MESSAGE_TEXT_MAX_LENGTH = config.MESSAGE_TEXT_MAX_LENGTH
MESSAGE_MEDIA_MAX_LENGTH = config.MESSAGE_MEDIA_MAX_LENGTH
MEDIA_PREFIXES = ("[photo] ", "[file] ", "[voice] ", "[sticker] ")
ALLOWED_REACTION_EMOJIS = frozenset({"👍", "❤️", "😂", "😮", "😢", "🙏"})
GROUP_NAME_MAX_LENGTH = 64
DISPLAY_NAME_MAX_LENGTH = 64


def _is_media_message(content: str) -> bool:
    return any(content.startswith(p) for p in MEDIA_PREFIXES)


def validate_message_content(content: str) -> str:
    if content is None or not str(content).strip():
        raise ValidationError("Message content required")
    trimmed = str(content).strip()
    is_media = _is_media_message(trimmed)
    max_len = MESSAGE_MEDIA_MAX_LENGTH if is_media else MESSAGE_TEXT_MAX_LENGTH
    if len(trimmed) > max_len:
        if is_media:
            raise ValidationError(f"Media message is too large (max {config.MAX_ATTACHMENT_LABEL})")
        raise ValidationError("Message is too long (max 10,000 characters)")
    return trimmed
