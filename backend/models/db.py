"""MODEL — database row helpers."""
from __future__ import annotations

from typing import Any


def row_to_dict(cursor: Any, row: tuple) -> dict:
    columns = [col[0] for col in cursor.description]
    return dict(zip(columns, row))
