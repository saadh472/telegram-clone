"""MODEL — pyodbc row helpers for SQL Server (not a database engine or file store)."""
from __future__ import annotations

import pyodbc


def row_to_dict(cursor: pyodbc.Cursor, row: tuple) -> dict:
    columns = [col[0] for col in cursor.description]
    return dict(zip(columns, row))
