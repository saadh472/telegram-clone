"""CONTROLLER — Chat and user HTTP handlers."""
from flask import Blueprint, g, jsonify, make_response, request

import config
from services.chat_service import ChatService
from services.security import login_required
from services.http_helpers import client_error_response, request_json, server_error_response
from services.validators import ValidationError

chat_bp = Blueprint("chats", __name__)
user_bp = Blueprint("users", __name__)
chat_service = ChatService()


def _client_or_server_error(exc: Exception):
    client_error = client_error_response(exc)
    if client_error:
        return client_error
    return server_error_response(exc)


@user_bp.get("/users")
@login_required
def list_users():
    try:
        return jsonify(chat_service.list_users(g.user_id))
    except Exception as exc:
        return server_error_response(exc)


@chat_bp.get("/chats")
@login_required
def list_chats():
    try:
        payload = chat_service.list_chats(g.user_id)
        resp = make_response(jsonify(payload))
        ttl = max(1, int(config.CHATS_CACHE_TTL))
        resp.headers["Cache-Control"] = f"private, max-age={ttl}"
        return resp
    except Exception as exc:
        return server_error_response(exc)


@chat_bp.post("/chats")
@login_required
def create_chat():
    try:
        data = request_json()
        return jsonify(chat_service.create_chat(g.user_id, data))
    except Exception as exc:
        return _client_or_server_error(exc)


@chat_bp.get("/chats/<int:chat_id>/messages")
@login_required
def get_messages(chat_id: int):
    limit = request.args.get("limit", config.MESSAGES_DEFAULT_LIMIT, type=int)
    offset = request.args.get("offset", 0, type=int)
    since_id = request.args.get("since_id", None, type=int)
    try:
        return jsonify(chat_service.get_messages(chat_id, g.user_id, limit, offset, since_id))
    except Exception as exc:
        return _client_or_server_error(exc)


@chat_bp.post("/chats/<int:chat_id>/messages")
@login_required
def send_message(chat_id: int):
    try:
        data = request_json()
        reply_to = data.get("reply_to_id")
        return jsonify(chat_service.send_message(
            chat_id, g.user_id, data.get("content", ""), int(reply_to) if reply_to else None
        ))
    except Exception as exc:
        return _client_or_server_error(exc)


@chat_bp.patch("/chats/<int:chat_id>/messages/<int:message_id>")
@login_required
def edit_message(chat_id: int, message_id: int):
    try:
        data = request_json()
        return jsonify(chat_service.edit_message(chat_id, g.user_id, message_id, data.get("content", "")))
    except Exception as exc:
        return _client_or_server_error(exc)


@chat_bp.delete("/chats/<int:chat_id>/messages/<int:message_id>")
@login_required
def delete_message(chat_id: int, message_id: int):
    try:
        return jsonify(chat_service.delete_message(chat_id, g.user_id, message_id))
    except Exception as exc:
        return _client_or_server_error(exc)


@chat_bp.post("/chats/<int:chat_id>/messages/<int:message_id>/hide")
@login_required
def hide_message(chat_id: int, message_id: int):
    try:
        return jsonify(chat_service.hide_message_for_user(chat_id, g.user_id, message_id))
    except Exception as exc:
        return _client_or_server_error(exc)


@chat_bp.post("/chats/<int:chat_id>/typing")
@login_required
def post_typing(chat_id: int):
    try:
        return jsonify(chat_service.set_typing(chat_id, g.user_id))
    except Exception as exc:
        return _client_or_server_error(exc)


@chat_bp.get("/chats/<int:chat_id>/typing")
@login_required
def get_typing(chat_id: int):
    try:
        return jsonify(chat_service.get_typing(chat_id, g.user_id))
    except Exception as exc:
        return _client_or_server_error(exc)


@chat_bp.get("/chats/<int:chat_id>/members")
@login_required
def get_members(chat_id: int):
    try:
        return jsonify(chat_service.get_members(chat_id, g.user_id))
    except Exception as exc:
        return _client_or_server_error(exc)


@chat_bp.get("/chats/<int:chat_id>/reactions")
@login_required
def get_chat_reactions(chat_id: int):
    try:
        return jsonify(chat_service.get_chat_reactions(chat_id, g.user_id))
    except Exception as exc:
        return _client_or_server_error(exc)


@chat_bp.post("/chats/<int:chat_id>/members")
@login_required
def add_member(chat_id: int):
    try:
        data = request_json()
        return jsonify(chat_service.add_member(chat_id, g.user_id, data.get("user_id")))
    except Exception as exc:
        return _client_or_server_error(exc)


@chat_bp.get("/chats/<int:chat_id>/messages/<int:message_id>/reactions")
@login_required
def get_reactions(chat_id: int, message_id: int):
    try:
        return jsonify(chat_service.get_reactions(chat_id, g.user_id, message_id))
    except Exception as exc:
        return _client_or_server_error(exc)


@chat_bp.post("/chats/<int:chat_id>/messages/<int:message_id>/reactions")
@login_required
def toggle_reaction(chat_id: int, message_id: int):
    try:
        data = request_json()
        return jsonify(chat_service.toggle_reaction(chat_id, g.user_id, message_id, data.get("emoji", "")))
    except Exception as exc:
        return _client_or_server_error(exc)


@user_bp.get("/users/me")
@login_required
def get_me():
    try:
        return jsonify(chat_service.get_current_user(g.user_id))
    except ValidationError as exc:
        return jsonify({"error": str(exc)}), 404
    except Exception as exc:
        return server_error_response(exc)


@user_bp.post("/users/heartbeat")
@login_required
def heartbeat():
    try:
        return jsonify(chat_service.set_presence(g.user_id, True))
    except Exception as exc:
        return server_error_response(exc)


@user_bp.post("/users/offline")
@login_required
def go_offline():
    try:
        return jsonify(chat_service.set_presence(g.user_id, False))
    except Exception as exc:
        return server_error_response(exc)
