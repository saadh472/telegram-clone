"""Application configuration (Telegram Clone — SQL Server / SSMS only).

All settings are read from backend/.env (copy from .env.example).
No machine-specific hostnames are hardcoded here — set SQL_SERVER in .env per laptop.
"""
import os
from pathlib import Path

from dotenv import load_dotenv

_backend_dir = Path(__file__).resolve().parent
load_dotenv(_backend_dir / ".env")
load_dotenv(_backend_dir.parent / ".env")

HOST = os.getenv("FLASK_HOST", "0.0.0.0")
PORT = int(os.getenv("PORT") or os.getenv("FLASK_PORT", "3000"))
DEBUG = os.getenv("FLASK_DEBUG", "false").lower() == "true"
SERVE_FRONTEND = os.getenv("SERVE_FRONTEND", "false").lower() == "true"
FRONTEND_DIR = os.getenv("FRONTEND_DIR", str(_backend_dir.parent / "frontend"))

_DEFAULT_JWT_SECRET = "change-me"
JWT_SECRET = os.getenv("JWT_SECRET", _DEFAULT_JWT_SECRET)
JWT_SECRET_IS_DEFAULT = JWT_SECRET in (_DEFAULT_JWT_SECRET, "change-me-in-production")
JWT_EXPIRATION_SECONDS = int(os.getenv("JWT_EXPIRATION_SECONDS", str(7 * 24 * 60 * 60)))

# SQL Server — set SQL_SERVER in backend/.env (see .env.example)
_default_server = r"localhost\SQLEXPRESS"
SQL_SERVER = os.getenv("SQL_SERVER", _default_server)
SQL_DATABASE = os.getenv("DB_NAME") or os.getenv("SQL_DATABASE", "TelegramClone")
SQL_HOST = os.getenv("SQL_HOST", SQL_SERVER.split("\\")[0] if "\\" in SQL_SERVER else SQL_SERVER)
SQL_INSTANCE = os.getenv(
    "SQL_INSTANCE",
    SQL_SERVER.split("\\")[1] if "\\" in SQL_SERVER else "SQLEXPRESS",
)
SQL_PORT = os.getenv("SQL_PORT", "")
SQL_USER = os.getenv("SQL_USER", "")
SQL_PASSWORD = os.getenv("SQL_PASSWORD", "")
SKIP_DATABASE_CREATE = os.getenv("SKIP_DATABASE_CREATE", "false").lower() == "true"

# Attachment limits — align with frontend/js/config.js (demo; large files may be slow)
MAX_ATTACHMENT_BYTES = 1024 * 1024 * 1024  # 1 GB raw file
MESSAGE_TEXT_MAX_LENGTH = 10_000
MESSAGE_MEDIA_MAX_LENGTH = 1_400_000_000  # base64 payload ceiling (~1 GB * 4/3)
MAX_ATTACHMENT_LABEL = "1 GB"

MESSAGES_DEFAULT_LIMIT = int(os.getenv("MESSAGES_DEFAULT_LIMIT", "50"))
MESSAGES_MAX_LIMIT = int(os.getenv("MESSAGES_MAX_LIMIT", "500"))
CHATS_LIST_LIMIT = int(os.getenv("CHATS_LIST_LIMIT", "200"))
CHATS_CACHE_TTL = float(os.getenv("CHATS_CACHE_TTL", "15"))
USERS_CACHE_TTL = float(os.getenv("USERS_CACHE_TTL", "30"))

SAAD_PASSWORD = "12345678"
DEFAULT_PASSWORD = "password123"

AVATAR_COLORS = [
    "#3390ec", "#e17076", "#7bc862", "#e5ca77", "#65aadd", "#a695e7", "#ee7aae"
]

# ODBC connection flags (SSMS: Encryption Mandatory, Trust server certificate)
ODBC_ENCRYPT = os.getenv("ODBC_ENCRYPT", "yes")
ODBC_TRUST_CERT = os.getenv("ODBC_TRUST_CERT", "yes")
ODBC_TRUSTED_CONNECTION = os.getenv("ODBC_TRUSTED_CONNECTION", "yes")
