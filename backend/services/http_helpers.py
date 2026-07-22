"""SERVICE — Safe HTTP error responses and security headers."""
from __future__ import annotations

from typing import Any

from flask import Response, current_app, jsonify, request

import config
from services.validators import ValidationError


def server_error_response(exc: Exception) -> tuple[Any, int]:
    """Log full exception; return generic message unless DEBUG."""
    current_app.logger.exception("Unhandled API error: %s", exc)
    if config.DEBUG:
        return jsonify({"error": str(exc)}), 500
    return jsonify({"error": "Internal server error"}), 500


def request_json() -> dict[str, Any]:
    if not request.data:
        return {}
    data = request.get_json(silent=True)
    if data is None:
        raise ValidationError("Invalid JSON request body")
    if not isinstance(data, dict):
        raise ValidationError("Request body must be a JSON object")
    return data


def map_client_error(exc: Exception) -> tuple[Any, int] | None:
    if isinstance(exc, ValidationError):
        return jsonify({"error": str(exc)}), 400
    if isinstance(exc, PermissionError):
        return jsonify({"error": "Access denied"}), 403
    if isinstance(exc, ValueError):
        return jsonify({"error": str(exc)}), 400
    return None


def client_error_response(exc: Exception) -> tuple[Any, int] | None:
    return map_client_error(exc)


def apply_security_headers(response: Response) -> Response:
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    response.headers.setdefault("Permissions-Policy", "camera=(), microphone=(self), geolocation=()")
    if not config.DEBUG:
        response.headers.setdefault(
            "Strict-Transport-Security",
            "max-age=31536000; includeSubDomains",
        )
    return response
