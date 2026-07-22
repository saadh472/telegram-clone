"""
Singleton connection manager for Microsoft SQL Server via pyodbc.

All users, chats, and messages are persisted in the TelegramClone database.
Configure the server via SQL_SERVER in backend/.env (see .env.example).
Auth: Windows Authentication locally, or SQL username/password in hosted environments.
Driver: ODBC Driver 17 for SQL Server (preferred)
"""
from __future__ import annotations

import os
import threading
from typing import Optional

import pyodbc

import config

_FALLBACK_SERVERS = (
    r"localhost\SQLEXPRESS",
    r".\SQLEXPRESS",
    r"(local)\SQLEXPRESS",
)


class DatabaseSingleton:
    """Thread-safe Singleton for SQL Server access via pyodbc."""

    _instance: Optional["DatabaseSingleton"] = None
    _lock = threading.Lock()

    def __init__(self) -> None:
        self._conn_str: Optional[str] = None
        self._last_error: Optional[str] = None

    @classmethod
    def get_instance(cls) -> "DatabaseSingleton":
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = cls()
        return cls._instance

    @staticmethod
    def _pick_driver() -> str:
        for name in (
            "ODBC Driver 17 for SQL Server",
            "ODBC Driver 18 for SQL Server",
            "SQL Server Native Client 11.0",
            "SQL Server",
        ):
            if any(d.lower() == name.lower() for d in pyodbc.drivers()):
                return name
        installed = pyodbc.drivers()
        if installed:
            return installed[-1]
        raise RuntimeError("No SQL Server ODBC driver found. Install ODBC Driver 17+.")

    def _base_flags(self, driver: str, database: str) -> str:
        auth = (
            f"UID={config.SQL_USER};PWD={config.SQL_PASSWORD};"
            if config.SQL_USER and config.SQL_PASSWORD
            else f"Trusted_Connection={config.ODBC_TRUSTED_CONNECTION};"
        )
        return (
            f"DRIVER={{{driver}}};"
            f"DATABASE={database};"
            f"{auth}"
            f"Encrypt={config.ODBC_ENCRYPT};"
            f"TrustServerCertificate={config.ODBC_TRUST_CERT};"
        )

    def _server_candidates(self) -> list[str]:
        if os.getenv("DB_CONNECTION_STRING"):
            return []

        servers: list[str] = []

        if config.SQL_SERVER:
            servers.append(config.SQL_SERVER)

        if config.SQL_PORT:
            host = config.SQL_HOST or "localhost"
            servers.append(f"{host},{config.SQL_PORT}")
            servers.append(f"localhost,{config.SQL_PORT}")
            servers.append(f"127.0.0.1,{config.SQL_PORT}")

        for fallback in _FALLBACK_SERVERS:
            servers.append(fallback)

        seen: set[str] = set()
        unique: list[str] = []
        for s in servers:
            if s and s not in seen:
                seen.add(s)
                unique.append(s)
        return unique

    def build_connection_strings(self, database: str | None = None) -> list[str]:
        db = database or config.SQL_DATABASE
        driver = self._pick_driver()
        base = self._base_flags(driver, db)
        candidates: list[str] = []

        override = os.getenv("DB_CONNECTION_STRING")
        if override:
            candidates.append(override)

        for server in self._server_candidates():
            candidates.append(f"{base}SERVER={server};")

        return candidates

    def resolve_connection_string(self, database: str | None = None) -> str:
        if database is None and self._conn_str:
            return self._conn_str

        errors: list[str] = []
        for cs in self.build_connection_strings(database):
            try:
                conn = pyodbc.connect(cs, timeout=10)
                conn.close()
                if database is None:
                    self._conn_str = cs
                return cs
            except Exception as exc:
                errors.append(f"SERVER={cs.split('SERVER=')[1][:40]} -> {exc}")

        self._last_error = "\n".join(errors[-5:])
        raise RuntimeError(
            "Could not connect to SQL Server. Ensure SSMS can connect to "
            f"{config.SQL_SERVER} and SQL Server service is running.\n"
            + (self._last_error or "")
        )

    def get_connection(self) -> pyodbc.Connection:
        cs = self.resolve_connection_string()
        return pyodbc.connect(cs, autocommit=False, timeout=10)

    def get_master_connection(self) -> pyodbc.Connection:
        cs = self.resolve_connection_string("master")
        return pyodbc.connect(cs, autocommit=True, timeout=10)

    def test_connection(self) -> tuple[bool, str]:
        try:
            conn = self.get_connection()
            cur = conn.cursor()
            cur.execute("SELECT DB_NAME()")
            db_name = cur.fetchone()[0]
            conn.close()
            return True, f"connected to {db_name}"
        except Exception as exc:
            return False, str(exc)

    def connection_info(self) -> dict:
        try:
            cs = self.resolve_connection_string()
            safe = cs.replace("Trusted_Connection=yes", "Trusted_Connection=***")
            safe = safe.replace("Trusted_Connection=no", "Trusted_Connection=***")
            if config.SQL_USER:
                safe = safe.replace(f"UID={config.SQL_USER};", "UID=***;")
            if config.SQL_PASSWORD:
                safe = safe.replace(f"PWD={config.SQL_PASSWORD};", "PWD=***;")
            return {
                "server": config.SQL_SERVER,
                "database": config.SQL_DATABASE,
                "driver": self._pick_driver(),
                "connection_string": safe,
            }
        except Exception as exc:
            return {"server": config.SQL_SERVER, "database": config.SQL_DATABASE, "error": str(exc)}

    def shutdown(self) -> None:
        self._conn_str = None
