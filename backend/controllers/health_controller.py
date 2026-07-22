"""CONTROLLER — Health check HTTP handler."""

from flask import Blueprint, jsonify



import config

from database.singleton import DatabaseSingleton



health_bp = Blueprint("health", __name__)





@health_bp.get("/health")

def health():

    singleton = DatabaseSingleton.get_instance()

    ok, detail = singleton.test_connection()

    if ok:

        body = {"status": "ok", "database": "connected"}

        if config.DEBUG:

            body["server"] = config.SQL_SERVER

            body["db_name"] = config.SQL_DATABASE

        return jsonify(body)



    body = {"status": "error", "database": "disconnected"}

    if config.DEBUG:

        info = singleton.connection_info()

        body["server"] = config.SQL_SERVER

        body["db_name"] = config.SQL_DATABASE

        body["detail"] = detail

        body["connection"] = info

    else:

        body["error"] = "Database unavailable"

    return jsonify(body), 503

