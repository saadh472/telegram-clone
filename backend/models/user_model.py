"""MODEL — User entity data access (maps to SST/LST user persistence)."""
from __future__ import annotations

from datetime import datetime, timezone

import pyodbc

from database.singleton import DatabaseSingleton
from models.db import row_to_dict


class UserModel:
  def __init__(self) -> None:
    self._db = DatabaseSingleton.get_instance()

  def _conn(self) -> pyodbc.Connection:
    return self._db.get_connection()

  def find_by_id(self, user_id: int) -> dict | None:
    conn = self._conn()
    try:
      cur = conn.cursor()
      cur.execute(
        "SELECT id, username, display_name, avatar_color, online, last_seen FROM users WHERE id = ?",
        user_id,
      )
      row = cur.fetchone()
      return row_to_dict(cur, row) if row else None
    finally:
      conn.close()

  def find_by_username(self, username: str) -> dict | None:
    conn = self._conn()
    try:
      cur = conn.cursor()
      cur.execute(
        "SELECT id, username, password, display_name, avatar_color, online, last_seen FROM users WHERE username = ?",
        username,
      )
      row = cur.fetchone()
      return row_to_dict(cur, row) if row else None
    finally:
      conn.close()

  def exists(self, username: str) -> bool:
    conn = self._conn()
    try:
      cur = conn.cursor()
      cur.execute("SELECT 1 FROM users WHERE username = ?", username)
      return cur.fetchone() is not None
    finally:
      conn.close()

  def create(self, username: str, password_hash: str, display_name: str, avatar_color: str) -> dict:
    conn = self._conn()
    try:
      cur = conn.cursor()
      cur.execute(
        """
        INSERT INTO users (username, password, display_name, avatar_color)
        OUTPUT INSERTED.id, INSERTED.username, INSERTED.display_name, INSERTED.avatar_color
        VALUES (?, ?, ?, ?)
        """,
        username,
        password_hash,
        display_name,
        avatar_color,
      )
      row = cur.fetchone()
      conn.commit()
      return {"id": row[0], "username": row[1], "display_name": row[2], "avatar_color": row[3]}
    except Exception:
      conn.rollback()
      raise
    finally:
      conn.close()

  def list_except(self, user_id: int) -> list[dict]:
    conn = self._conn()
    try:
      cur = conn.cursor()
      cur.execute(
        """
        SELECT id, username, display_name, avatar_color, online, last_seen
        FROM users WHERE id <> ? ORDER BY display_name
        """,
        user_id,
      )
      return [row_to_dict(cur, row) for row in cur.fetchall()]
    finally:
      conn.close()

  def set_online(self, user_id: int, online: bool) -> None:
    conn = self._conn()
    try:
      cur = conn.cursor()
      cur.execute(
        "UPDATE users SET online = ?, last_seen = ? WHERE id = ?",
        1 if online else 0,
        datetime.now(timezone.utc).replace(tzinfo=None),
        user_id,
      )
      conn.commit()
    except Exception:
      conn.rollback()
      raise
    finally:
      conn.close()

  def update_password(self, username: str, password_hash: str) -> None:
    conn = self._conn()
    try:
      cur = conn.cursor()
      cur.execute("UPDATE users SET password = ? WHERE username = ?", password_hash, username)
      conn.commit()
    except Exception:
      conn.rollback()
      raise
    finally:
      conn.close()

  def count(self) -> int:
    conn = self._conn()
    try:
      cur = conn.cursor()
      cur.execute("SELECT COUNT(*) FROM users")
      return int(cur.fetchone()[0])
    finally:
      conn.close()
