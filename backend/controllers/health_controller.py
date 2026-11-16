"""CONTROLLER — Health check HTTP handler."""
from flask import Blueprint, current_app, jsonify

from database.singleton import DatabaseSingleton

health_bp = Blueprint("health", __name__)


@health_bp.get("/health")
def health():
    singleton = DatabaseSingleton.get_instance()
    ok, detail = singleton.test_connection()
    if ok:
        return jsonify({"status": "ok", "database": "connected", "engine": singleton.engine})

    current_app.logger.warning("Health check database failure: %s", detail)
    return jsonify({
        "status": "error",
        "database": "disconnected",
        "error": "Database unavailable",
    }), 503
