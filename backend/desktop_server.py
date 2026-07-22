"""Desktop runtime entry point.

PyInstaller builds this file into the backend sidecar used by Electron. It keeps
the existing Flask API intact, adds static frontend serving, and runs via
Waitress instead of Flask's development server.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

from flask import Flask, send_from_directory
from waitress import serve

import config
from app import create_app
from services.seeder import initialize_database


def _runtime_root() -> Path:
    if getattr(sys, "frozen", False) and hasattr(sys, "_MEIPASS"):
        return Path(sys._MEIPASS)  # type: ignore[attr-defined]
    return Path(__file__).resolve().parent.parent


def _frontend_dir() -> Path:
    root = _runtime_root()
    candidates = [
        root / "frontend",
        Path(__file__).resolve().parent.parent / "frontend",
    ]
    for candidate in candidates:
        if (candidate / "index.html").exists():
            return candidate
    raise RuntimeError("Frontend assets were not bundled with the desktop backend.")


def create_desktop_app() -> Flask:
    app = create_app()
    frontend_dir = _frontend_dir()

    @app.get("/")
    def desktop_root():
        return send_from_directory(frontend_dir, "index.html")

    @app.get("/<path:asset_path>")
    def desktop_asset(asset_path: str):
        target = frontend_dir / asset_path
        if target.is_file():
            return send_from_directory(frontend_dir, asset_path)
        return send_from_directory(frontend_dir, "index.html")

    return app


def main() -> None:
    if config.JWT_SECRET_IS_DEFAULT:
        print("WARNING: Using default JWT_SECRET. Change it in the desktop backend env file.", flush=True)

    print("Initializing SQL Server database...", flush=True)
    try:
        initialize_database()
    except Exception as exc:
        print(f"DESKTOP_BACKEND_STARTUP_ERROR: {exc}", flush=True)
        raise SystemExit(1) from exc

    host = os.getenv("FLASK_HOST", "127.0.0.1")
    port = int(os.getenv("FLASK_PORT", str(config.PORT)))
    app = create_desktop_app()
    print(f"Desktop backend ready on http://{host}:{port}", flush=True)
    serve(app, host=host, port=port, threads=8)


if __name__ == "__main__":
    main()
