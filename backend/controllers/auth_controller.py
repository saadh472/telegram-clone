"""CONTROLLER — Authentication HTTP handlers."""

from flask import Blueprint, g, jsonify, request



from services.auth_service import AuthService

from services.http_helpers import map_client_error, server_error_response

from services.rate_limit import rate_limit

from services.security import login_required

from services.validators import ValidationError



auth_bp = Blueprint("auth", __name__)

auth_service = AuthService()





@auth_bp.post("/register")

@rate_limit(5, 60)

def register():

    data = request.get_json(silent=True) or {}

    try:

        result = auth_service.register(

            data.get("username", ""),

            data.get("password", ""),

            data.get("display_name", ""),

        )

        return jsonify(result)

    except ValidationError as exc:

        return jsonify({"error": str(exc)}), 400

    except ValueError as exc:

        status = 409 if "exists" in str(exc).lower() else 400

        return jsonify({"error": str(exc)}), status

    except Exception as exc:

        return server_error_response(exc)





@auth_bp.post("/login")

@rate_limit(10, 60)

def login():

    data = request.get_json(silent=True) or {}

    try:

        result = auth_service.login(data.get("username", ""), data.get("password", ""))

        return jsonify(result)

    except ValidationError as exc:

        return jsonify({"error": str(exc)}), 400

    except ValueError as exc:

        return jsonify({"error": str(exc)}), 401

    except Exception as exc:

        return server_error_response(exc)





@auth_bp.post("/logout")

@login_required

def logout():

    try:

        return jsonify(auth_service.logout(g.user_id))

    except Exception as exc:

        return server_error_response(exc)

