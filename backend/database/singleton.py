"""
Database connection manager.

The app supports two engines:
- SQL Server via pyodbc for the original local SSMS workflow.
- SQLite for self-contained production/demo deployments with no external DB.
"""
from __future__ import annotations

import os
import sqlite3
import threading
from pathlib import Path
from typing import Any, Optional

import config

_FALLBACK_SERVERS = (
    r"localhost\SQLEXPRESS",
    r".\SQLEXPRESS",
    r"(local)\SQLEXPRESS",
)


class SQLiteCursorAdapter:
    """Tiny adapter that accepts pyodbc-style variadic execute parameters."""

    fast_executemany = False

    def __init__(self, cursor: sqlite3.Cursor) -> None:
        self._cursor = cursor

    @property
    def description(self):
        return self._cursor.description

    @property
    def rowcount(self) -> int:
        return self._cursor.rowcount

    @property
    def lastrowid(self) -> int:
        return self._cursor.lastrowid

    def execute(self, sql: str, *params):
        values: tuple[Any, ...]
        if len(params) == 1 and isinstance(params[0], (list, tuple)):
            values = tuple(params[0])
        else:
            values = tuple(params)
        self._cursor.execute(sql, values)
        return self

    def executemany(self, sql: str, seq_of_params):
        self._cursor.executemany(sql, seq_of_params)
        return self

    def fetchone(self):
        return self._cursor.fetchone()

    def fetchall(self):
        return self._cursor.fetchall()


class SQLiteConnectionAdapter:
    """Connection adapter with pyodbc-compatible surface used by models."""

    def __init__(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        self._conn = sqlite3.connect(
            path,
            timeout=30,
            detect_types=sqlite3.PARSE_DECLTYPES | sqlite3.PARSE_COLNAMES,
        )
        self._conn.execute("PRAGMA foreign_keys = ON")
        self._conn.execute("PRAGMA journal_mode = WAL")
        self._conn.execute("PRAGMA busy_timeout = 30000")

    @property
    def autocommit(self) -> bool:
        return False

    @autocommit.setter
    def autocommit(self, _value: bool) -> None:
        # sqlite3 manages transactions with commit/rollback on the connection.
        return None

    def cursor(self) -> SQLiteCursorAdapter:
        return SQLiteCursorAdapter(self._conn.cursor())

    def commit(self) -> None:
        self._conn.commit()

    def rollback(self) -> None:
        self._conn.rollback()

    def close(self) -> None:
        self._conn.close()


class DatabaseSingleton:
    """Thread-safe singleton for the selected database engine."""

    _instance: Optional["DatabaseSingleton"] = None
    _lock = threading.Lock()

    def __init__(self) -> None:
        self._conn_str: Optional[str] = None
        self._last_error: Optional[str] = None
        self.engine = config.DB_ENGINE

    @classmethod
    def get_instance(cls) -> "DatabaseSingleton":
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = cls()
        return cls._instance

    @property
    def is_sqlite(self) -> bool:
        return self.engine == "sqlite"

    @property
    def sqlite_path(self) -> Path:
        return Path(config.SQLITE_DB_PATH).expanduser().resolve()

    def _pyodbc(self):
        try:
            import pyodbc  # type: ignore
        except ImportError as exc:
            raise RuntimeError(
                "DB_ENGINE=sqlserver requires pyodbc and Microsoft ODBC Driver. "
                "Use DB_ENGINE=sqlite for self-contained deployments."
            ) from exc
        return pyodbc

    def _pick_driver(self) -> str:
        pyodbc = self._pyodbc()
        for name in (
            "ODBC Driver 18 for SQL Server",
            "ODBC Driver 17 for SQL Server",
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
            servers.extend([f"{host},{config.SQL_PORT}", f"localhost,{config.SQL_PORT}", f"127.0.0.1,{config.SQL_PORT}"])
        servers.extend(_FALLBACK_SERVERS)

        seen: set[str] = set()
        unique: list[str] = []
        for server in servers:
            if server and server not in seen:
                seen.add(server)
                unique.append(server)
        return unique

    def build_connection_strings(self, database: str | None = None) -> list[str]:
        if self.is_sqlite:
            return [str(self.sqlite_path)]

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
        if self.is_sqlite:
            return str(self.sqlite_path)
        if database is None and self._conn_str:
            return self._conn_str

        pyodbc = self._pyodbc()
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

    def get_connection(self):
        if self.is_sqlite:
            return SQLiteConnectionAdapter(self.sqlite_path)
        pyodbc = self._pyodbc()
        cs = self.resolve_connection_string()
        return pyodbc.connect(cs, autocommit=False, timeout=10)

    def get_master_connection(self):
        if self.is_sqlite:
            return self.get_connection()
        pyodbc = self._pyodbc()
        cs = self.resolve_connection_string("master")
        return pyodbc.connect(cs, autocommit=True, timeout=10)

    def test_connection(self) -> tuple[bool, str]:
        try:
            conn = self.get_connection()
            cur = conn.cursor()
            if self.is_sqlite:
                cur.execute("SELECT sqlite_version()")
                version = cur.fetchone()[0]
                conn.close()
                return True, f"connected to SQLite {version}"
            cur.execute("SELECT DB_NAME()")
            db_name = cur.fetchone()[0]
            conn.close()
            return True, f"connected to {db_name}"
        except Exception as exc:
            return False, str(exc)

    def connection_info(self) -> dict:
        if self.is_sqlite:
            return {
                "engine": "sqlite",
                "path": str(self.sqlite_path),
            }
        try:
            cs = self.resolve_connection_string()
            safe = cs.replace("Trusted_Connection=yes", "Trusted_Connection=***")
            safe = safe.replace("Trusted_Connection=no", "Trusted_Connection=***")
            if config.SQL_USER:
                safe = safe.replace(f"UID={config.SQL_USER};", "UID=***;")
            if config.SQL_PASSWORD:
                safe = safe.replace(f"PWD={config.SQL_PASSWORD};", "PWD=***;")
            return {
                "engine": "sqlserver",
                "server": config.SQL_SERVER,
                "database": config.SQL_DATABASE,
                "driver": self._pick_driver(),
                "connection_string": safe,
            }
        except Exception as exc:
            return {
                "engine": "sqlserver",
                "server": config.SQL_SERVER,
                "database": config.SQL_DATABASE,
                "error": str(exc),
            }

    def shutdown(self) -> None:
        self._conn_str = None
