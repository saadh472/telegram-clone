"""SERVICE — Authentication business logic."""
from __future__ import annotations

import bcrypt

import config
from models.user_model import UserModel
from services.security import create_token
from services.validators import ValidationError, validate_display_name, validate_password, validate_username
from views.auth_view import auth_json, logout_json


class AuthService:
    def __init__(self) -> None:
        self.users = UserModel()

    def register(self, username: str, password: str, display_name: str) -> dict:
        username = validate_username(username)
        password = validate_password(password)
        display_name = validate_display_name(display_name)
        if self.users.exists(username):
            raise ValueError("Username already exists")
        color = config.AVATAR_COLORS[hash(username) % len(config.AVATAR_COLORS)]
        pwd_hash = bcrypt.hashpw(password.encode(), bcrypt.gensalt(rounds=10)).decode()
        user = self.users.create(username, pwd_hash, display_name, color)
        token = create_token(user["id"], user["username"])
        return auth_json(token, user)

    def login(self, username: str, password: str) -> dict:
        if not username or not password:
            raise ValidationError("Username and password required")
        user = self.users.find_by_username(username.strip().lower())
        if not user or not bcrypt.checkpw(password.encode(), user["password"].encode()):
            raise ValueError("Invalid username or password")
        self.users.set_online(user["id"], True)
        token = create_token(user["id"], user["username"])
        return auth_json(token, user)

    def logout(self, user_id: int) -> dict:
        self.users.set_online(user_id, False)
        return logout_json()
