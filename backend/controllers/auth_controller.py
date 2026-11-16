"""CONTROLLER — Authentication HTTP handlers."""
from flask import Blueprint, g, jsonify

from services.auth_service import AuthService, InvalidCredentialsError, UsernameTakenError
from services.http_helpers import client_error_response, request_json, server_error_response
from services.rate_limit import rate_limit
from services.security import login_required
from services.validators import ValidationError

auth_bp = Blueprint("auth", __name__)
auth_service = AuthService()


@auth_bp.post("/register")
@rate_limit(5, 60)
def register():
    try:
        data = request_json()
        result = auth_service.register(
            data.get("username", ""),
            data.get("password", ""),
            data.get("display_name", ""),
        )
        return jsonify(result)
    except ValidationError as exc:
        return client_error_response(exc)
    except UsernameTakenError:
        return jsonify({"error": "Username already exists"}), 409
    except Exception as exc:
        return server_error_response(exc)


@auth_bp.post("/login")
@rate_limit(10, 60)
def login():
    try:
        data = request_json()
        result = auth_service.login(data.get("username", ""), data.get("password", ""))
        return jsonify(result)
    except ValidationError as exc:
        return client_error_response(exc)
    except InvalidCredentialsError:
        return jsonify({"error": "Invalid username or password"}), 401
    except Exception as exc:
        return server_error_response(exc)


@auth_bp.post("/logout")
@login_required
def logout():
    try:
        return jsonify(auth_service.logout(g.user_id))
    except Exception as exc:
        return server_error_response(exc)
