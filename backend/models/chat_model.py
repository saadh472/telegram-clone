"""MODEL — Chat and membership data access."""
from __future__ import annotations

import pyodbc

from database.singleton import DatabaseSingleton
from models.db import row_to_dict


class ChatModel:
  def __init__(self) -> None:
    self._db = DatabaseSingleton.get_instance()

  def _conn(self) -> pyodbc.Connection:
    return self._db.get_connection()

  def list_summaries_for_user(self, user_id: int, limit: int = 200) -> list[dict]:
    conn = self._conn()
    try:
      cur = conn.cursor()
      cur.execute(
        """
        WITH last_msg AS (
          SELECT m.chat_id,
                 CASE WHEN m.is_deleted = 1 THEN '[deleted]' ELSE m.content END AS last_message,
                 m.created_at AS last_message_time,
                 m.is_deleted AS last_message_deleted,
                 ROW_NUMBER() OVER (PARTITION BY m.chat_id ORDER BY m.created_at DESC, m.id DESC) AS rn
          FROM messages m
          WHERE NOT EXISTS (
            SELECT 1 FROM message_hidden h
            WHERE h.message_id = m.id AND h.user_id = ?
          )
        ),
        unread AS (
          SELECT m.chat_id, COUNT(*) AS unread_count
          FROM messages m
          WHERE m.sender_id <> ? AND m.is_read = 0 AND m.is_deleted = 0
            AND NOT EXISTS (
              SELECT 1 FROM message_hidden h
              WHERE h.message_id = m.id AND h.user_id = ?
            )
          GROUP BY m.chat_id
        ),
        other_user AS (
          SELECT chat_id, other_user_id, display_name, avatar_color, other_online, other_last_seen
          FROM (
            SELECT cm.chat_id, u.id AS other_user_id, u.display_name, u.avatar_color,
                   u.online AS other_online, u.last_seen AS other_last_seen,
                   ROW_NUMBER() OVER (PARTITION BY cm.chat_id ORDER BY u.id) AS rn
            FROM chat_members cm
            INNER JOIN chats cp ON cp.id = cm.chat_id AND cp.type = 'private'
            INNER JOIN users u ON u.id = cm.user_id
            WHERE cm.user_id <> ?
          ) ou WHERE ou.rn = 1
        )
        SELECT TOP (?)
          c.id, c.name, c.type,
          lm.last_message,
          lm.last_message_time,
          lm.last_message_deleted,
          ISNULL(u.unread_count, 0) AS unread_count,
          CASE WHEN c.type = 'group' THEN c.name ELSE ou.display_name END AS display_name,
          CASE WHEN c.type = 'group' THEN '#65aadd' ELSE ou.avatar_color END AS avatar_color,
          CASE WHEN c.type = 'group' THEN NULL ELSE ou.other_user_id END AS other_user_id,
          CASE WHEN c.type = 'group' THEN NULL ELSE ou.other_online END AS other_online,
          CASE WHEN c.type = 'group' THEN NULL ELSE ou.other_last_seen END AS other_last_seen
        FROM chats c
        INNER JOIN chat_members cm ON cm.chat_id = c.id AND cm.user_id = ?
        LEFT JOIN last_msg lm ON lm.chat_id = c.id AND lm.rn = 1
        LEFT JOIN unread u ON u.chat_id = c.id
        LEFT JOIN other_user ou ON ou.chat_id = c.id
        ORDER BY lm.last_message_time DESC, c.id DESC
        """,
        user_id,
        user_id,
        user_id,
        user_id,
        limit,
        user_id,
      )
      return [row_to_dict(cur, row) for row in cur.fetchall()]
    finally:
      conn.close()

  def find_private_chat(self, user_id: int, other_user_id: int) -> int | None:
    conn = self._conn()
    try:
      cur = conn.cursor()
      cur.execute(
        """
        SELECT c.id FROM chats c
        JOIN chat_members cm1 ON cm1.chat_id = c.id AND cm1.user_id = ?
        JOIN chat_members cm2 ON cm2.chat_id = c.id AND cm2.user_id = ?
        WHERE c.type = 'private'
        """,
        user_id,
        other_user_id,
      )
      row = cur.fetchone()
      return int(row[0]) if row else None
    finally:
      conn.close()

  def create_private(self, user_id: int, other_user_id: int) -> int:
    conn = self._conn()
    try:
      cur = conn.cursor()
      cur.execute("INSERT INTO chats (name, type) OUTPUT INSERTED.id VALUES (NULL, 'private')")
      chat_id = int(cur.fetchone()[0])
      cur.execute("INSERT INTO chat_members (chat_id, user_id) VALUES (?, ?)", chat_id, user_id)
      cur.execute("INSERT INTO chat_members (chat_id, user_id) VALUES (?, ?)", chat_id, other_user_id)
      conn.commit()
      return chat_id
    except Exception:
      conn.rollback()
      raise
    finally:
      conn.close()

  def create_group(self, name: str, owner_id: int, member_ids: list[int]) -> int:
    conn = self._conn()
    try:
      cur = conn.cursor()
      cur.execute("INSERT INTO chats (name, type) OUTPUT INSERTED.id VALUES (?, 'group')", name)
      chat_id = int(cur.fetchone()[0])
      cur.execute("INSERT INTO chat_members (chat_id, user_id) VALUES (?, ?)", chat_id, owner_id)
      for mid in member_ids:
        if mid != owner_id:
          cur.execute("INSERT INTO chat_members (chat_id, user_id) VALUES (?, ?)", chat_id, mid)
      conn.commit()
      return chat_id
    except Exception:
      conn.rollback()
      raise
    finally:
      conn.close()

  def get_type(self, chat_id: int) -> str | None:
    conn = self._conn()
    try:
      cur = conn.cursor()
      cur.execute("SELECT type FROM chats WHERE id = ?", chat_id)
      row = cur.fetchone()
      return str(row[0]) if row else None
    finally:
      conn.close()

  def is_member(self, chat_id: int, user_id: int) -> bool:
    conn = self._conn()
    try:
      cur = conn.cursor()
      cur.execute("SELECT 1 FROM chat_members WHERE chat_id = ? AND user_id = ?", chat_id, user_id)
      return cur.fetchone() is not None
    finally:
      conn.close()

  def list_members(self, chat_id: int) -> list[dict]:
    conn = self._conn()
    try:
      cur = conn.cursor()
      cur.execute(
        """
        SELECT u.id, u.username, u.display_name, u.avatar_color, u.online, u.last_seen
        FROM users u JOIN chat_members cm ON cm.user_id = u.id
        WHERE cm.chat_id = ?
        """,
        chat_id,
      )
      return [row_to_dict(cur, row) for row in cur.fetchall()]
    finally:
      conn.close()

  def add_member(self, chat_id: int, user_id: int) -> None:
    conn = self._conn()
    try:
      cur = conn.cursor()
      cur.execute("INSERT INTO chat_members (chat_id, user_id) VALUES (?, ?)", chat_id, user_id)
      conn.commit()
    except Exception:
      conn.rollback()
      raise
    finally:
      conn.close()

  def create_chat_row(self, name: str | None, chat_type: str) -> int:
    conn = self._conn()
    try:
      cur = conn.cursor()
      cur.execute("INSERT INTO chats (name, type) OUTPUT INSERTED.id VALUES (?, ?)", name, chat_type)
      chat_id = int(cur.fetchone()[0])
      conn.commit()
      return chat_id
    except Exception:
      conn.rollback()
      raise
    finally:
      conn.close()
