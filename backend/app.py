"""
Telegram Web Clone — Flask API entry point.

MVC Architecture (SCD Assignment 05):
  Request → Controller → Service (logic) → Model (DB) → View (JSON) → Response

SCD layer mapping:
  Controller = OST (operational HTTP endpoints)
  View       = FST (JSON response shapes / DTOs)
  Model      = SST + LST (entity data access & persistence)
  Service    = LST business rules between controller and model
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from flask import Flask, jsonify
from flask_cors import CORS

import config
from controllers.auth_controller import auth_bp
from controllers.chat_controller import chat_bp, user_bp
from controllers.health_controller import health_bp
from services.http_helpers import apply_security_headers
from services.seeder import initialize_database


def _cors_origins() -> list[str]:
    raw = os.getenv("CORS_ORIGINS", "")
    extras = [o.strip() for o in raw.split(",") if o.strip()]
    defaults = [
        "http://localhost:5500",
        "http://127.0.0.1:5500",
    ]
    seen: set[str] = set()
    merged: list[str] = []
    for origin in defaults + extras:
        if origin not in seen:
            seen.add(origin)
            merged.append(origin)
    return merged


def create_app() -> Flask:
    app = Flask(__name__)
    # Allow large JSON media payloads (base64 attachments); align with config.MESSAGE_MEDIA_MAX_LENGTH
    app.config["MAX_CONTENT_LENGTH"] = config.MESSAGE_MEDIA_MAX_LENGTH + 10_000_000
    CORS(
        app,
        resources={r"/api/*": {
            "origins": _cors_origins(),
            "origin_regex": (
                r"https?://(localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3})"
                r"(:\d+)?"
            ),
            "methods": ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
            "allow_headers": ["Content-Type", "Authorization"],
        }},
        supports_credentials=True,
    )

    app.register_blueprint(health_bp, url_prefix="/api")
    app.register_blueprint(auth_bp, url_prefix="/api/auth")
    app.register_blueprint(chat_bp, url_prefix="/api")
    app.register_blueprint(user_bp, url_prefix="/api")

    @app.errorhandler(404)
    def not_found(_):
        return jsonify({"error": "Not found"}), 404

    @app.errorhandler(413)
    def too_large(_):
        return jsonify({"error": f"Upload too large (max {config.MAX_ATTACHMENT_LABEL})"}), 413

    @app.errorhandler(500)
    def server_error(err):
        app.logger.exception("Internal server error")
        if config.DEBUG:
            return jsonify({"error": str(err)}), 500
        return jsonify({"error": "Internal server error"}), 500

    @app.after_request
    def add_security_headers(response):
        return apply_security_headers(response)

    return app


app = create_app()


def main() -> None:
    if config.JWT_SECRET_IS_DEFAULT:
        print("WARNING: Using default JWT_SECRET — set JWT_SECRET in backend/.env for production.")

    print("Initializing database (SQL Server + Singleton)...")
    try:
        initialize_database()
        print("Database ready.")
    except Exception as exc:
        print(f"ERROR: Database init failed: {exc}")
        print("Fix SQL Server / backend/.env and restart.")
        sys.exit(1)

    print(f"Telegram Web Clone API (Flask MVC) on http://localhost:{config.PORT}/api")
    print("Demo account: saad / 12345678")
    app.run(host=config.HOST, port=config.PORT, debug=config.DEBUG, threaded=True)


if __name__ == "__main__":
    main()
