"""SERVICE — Database bootstrap, schema, and demo seed data."""
from __future__ import annotations

import bcrypt
import pyodbc
from datetime import datetime, timedelta, timezone

import config
from database.singleton import DatabaseSingleton

# Legacy Western demo users replaced by Pakistani/Muslim contacts
LEGACY_USERNAMES = ("alice", "bob", "charlie", "diana")

# Demo contacts (password: password123) — saad is primary login
DEMO_CONTACTS = [
    ("ahmed", "Ahmed Khan", "#e17076"),
    ("fatima", "Fatima Ali", "#7bc862"),
    ("usman", "Usman Malik", "#e5ca77"),
    ("ayesha", "Ayesha Siddiqui", "#65aadd"),
    ("hamza", "Hamza Raza", "#a695e7"),
    ("zainab", "Zainab Shah", "#ee7aae"),
    ("bilal", "Bilal Ahmed", "#6fcbea"),
    ("maryam", "Maryam Hassan", "#e5a45c"),
    ("hassan", "Hassan Raza", "#54a0ff"),
    ("sana", "Sana Mirza", "#ff6b81"),
    ("omar", "Omar Farooq", "#2ed573"),
    ("hira", "Hira Abbas", "#ffa502"),
    ("imran", "Imran Qureshi", "#5758bb"),
]

SAAD_USER = ("saad", "Saad Hussain", "#3390ec")

# Tiny demo media payloads (1x1 PNG + minimal WAV) — keeps DB small but renders bubbles
_DEMO_PHOTO_B64 = (
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
)
_DEMO_VOICE_B64 = "UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA="
DEMO_PHOTO_CONTENT = f"[photo] demo.jpg|{_DEMO_PHOTO_B64}"
DEMO_VOICE_CONTENT = f"[voice] 0:05|{_DEMO_VOICE_B64}"

_CONTACT_COLORS = [
    "#3390ec", "#e17076", "#7bc862", "#e5ca77", "#65aadd", "#a695e7", "#ee7aae",
    "#6fcbea", "#e5a45c", "#54a0ff", "#ff6b81", "#2ed573", "#ffa502", "#5758bb",
    "#1e90ff", "#ff6348", "#2ecc71", "#9b59b6", "#f39c12", "#e74c3c", "#16a085",
    "#d35400", "#8e44ad", "#27ae60", "#c0392b",
]

# 86 additional Pakistani/Muslim contacts (password: password123) — ~100 total with DEMO_CONTACTS
_BULK_CONTACT_RAW: list[tuple[str, str]] = [
    ("tariq", "Tariq Khan"),
    ("kamran", "Kamran Malik"),
    ("faisal", "Faisal Qureshi"),
    ("shahid", "Shahid Raza"),
    ("nadeem", "Nadeem Siddiqui"),
    ("asad", "Asad Mirza"),
    ("waqas", "Waqas Abbas"),
    ("rizwan", "Rizwan Sheikh"),
    ("arif", "Arif Butt"),
    ("junaid", "Junaid Chaudhry"),
    ("salman", "Salman Hashmi"),
    ("farhan", "Farhan Iqbal"),
    ("danish", "Danish Jamil"),
    ("adnan", "Adnan Kazmi"),
    ("khurram", "Khurram Lodhi"),
    ("zeeshan", "Zeeshan Mahmood"),
    ("yasir", "Yasir Naeem"),
    ("amir", "Amir Pirzada"),
    ("raheel", "Raheel Saeed"),
    ("tahir", "Tahir Zafar"),
    ("munir", "Munir ul Haq"),
    ("jabbar", "Jabbar Yousaf"),
    ("kashif", "Kashif Tariq"),
    ("shoaib", "Shoaib Akram"),
    ("akram", "Akram Hussain"),
    ("iftikhar", "Iftikhar Baig"),
    ("naveed", "Naveed Anwar"),
    ("parvez", "Parvez Gill"),
    ("rafiq", "Rafiq Sheikh"),
    ("sajid", "Sajid Malik"),
    ("tanveer", "Tanveer Khan"),
    ("waseem", "Waseem Ali"),
    ("yousuf", "Yousuf Ahmed"),
    ("zubair", "Zubair Rahman"),
    ("abrar", "Abrar Siddiqui"),
    ("basit", "Basit Khan"),
    ("ehsan", "Ehsan Malik"),
    ("fahad", "Fahad Qureshi"),
    ("ghulam", "Ghulam Raza"),
    ("haris", "Haris Mirza"),
    ("irfan", "Irfan Abbas"),
    ("javed", "Javed Butt"),
    ("kaleem", "Kaleem Chaudhry"),
    ("liaqat", "Liaqat Hashmi"),
    ("majid", "Majid Iqbal"),
    ("nasir", "Nasir Jamil"),
    ("owais", "Owais Kazmi"),
    ("qasim", "Qasim Lodhi"),
    ("rauf", "Rauf Mahmood"),
    ("saqlain", "Saqlain Naeem"),
    ("taimoor", "Taimoor Pirzada"),
    ("umer", "Umer Saeed"),
    ("ali_hassan", "Ali Hassan"),
    ("rehan", "Rehan Khan"),
    ("sohail", "Sohail Malik"),
    ("noman", "Noman Qureshi"),
    ("sheraz", "Sheraz Raza"),
    ("hassan_ali", "Hassan Ali"),
    ("bilal_hussain", "Bilal Hussain"),
    ("hamza_ahmed", "Hamza Ahmed"),
    ("amina", "Amina Khan"),
    ("rabia", "Rabia Ali"),
    ("nadia", "Nadia Malik"),
    ("saima", "Saima Siddiqui"),
    ("bushra", "Bushra Qureshi"),
    ("farah", "Farah Raza"),
    ("ghazala", "Ghazala Mirza"),
    ("hina", "Hina Abbas"),
    ("iqra", "Iqra Sheikh"),
    ("javeria", "Javeria Butt"),
    ("khalida", "Khalida Chaudhry"),
    ("lubna", "Lubna Hashmi"),
    ("mehwish", "Mehwish Iqbal"),
    ("naila", "Naila Jamil"),
    ("parveen", "Parveen Kazmi"),
    ("qurat", "Qurat ul Ain Lodhi"),
    ("rukhsana", "Rukhsana Mahmood"),
    ("samina", "Samina Naeem"),
    ("tanzeela", "Tanzeela Pirzada"),
    ("uzma", "Uzma Saeed"),
    ("wajiha", "Wajiha Zafar"),
    ("yasmeen", "Yasmeen Yousaf"),
    ("zara", "Zara Tariq"),
    ("amna", "Amna Akram"),
    ("beenish", "Beenish Hussain"),
    ("eman", "Eman Baig"),
]

BULK_CONTACTS: list[tuple[str, str, str]] = [
    (username, display_name, _CONTACT_COLORS[i % len(_CONTACT_COLORS)])
    for i, (username, display_name) in enumerate(_BULK_CONTACT_RAW)
]

# New private chats for saad with bulk contacts (existing 9 private + 4 group chats stay intact)
_BULK_CHAT_CONTACTS: list[tuple[str, list[tuple[str, str]]]] = [
    ("tariq", [
        ("tariq", "Assalam Saad bhai, project demo kab hai?"),
        ("saad", "Kal InshaAllah — backend seeding complete kar raha hoon."),
    ]),
    ("kamran", [
        ("kamran", "Bro MVC folder structure share kar do."),
        ("saad", "Backend controllers/services alag hain — README dekho."),
    ]),
    ("amina", [
        ("amina", "Saad, FST document ka link bhej do please."),
        ("saad", "Group drive pe upload hai — check karo."),
    ]),
    ("faisal", [
        ("faisal", "SQL Server connection string theek hai?"),
        ("saad", "Haan, Windows Auth + pyodbc chal raha hai."),
    ]),
    ("iqra", [
        ("iqra", "Frontend dark theme ka code kahan hai?"),
        ("saad", "frontend/js/theme.js — wahan toggle hai."),
    ]),
    ("nadeem", [
        ("nadeem", "Kal quiz hai yaad hai?"),
        ("saad", "Haan, microservices wala topic revise kar lo."),
    ]),
    ("saima", [
        ("saima", "Notes mil gaye — shukriya!"),
        ("saad", "Khush raho, koi baat ho to batana."),
    ]),
    ("rizwan", [
        ("rizwan", "Postman collection bhej do API test ke liye."),
        ("saad", "Abhi bhejta hoon group mein."),
    ]),
]


def _utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt(rounds=10)).decode()


def ensure_database_exists() -> None:
    """Create TelegramClone database on master if it does not exist."""
    singleton = DatabaseSingleton.get_instance()
    conn = singleton.get_master_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            f"""
            IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = N'{config.SQL_DATABASE}')
            CREATE DATABASE [{config.SQL_DATABASE}]
            """
        )
        print(f"Database '{config.SQL_DATABASE}' is ready.")
    finally:
        conn.close()


def ensure_schema(cursor: pyodbc.Cursor) -> None:
    cursor.execute(
        """
        IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'users')
        CREATE TABLE users (
          id INT IDENTITY(1,1) PRIMARY KEY,
          username NVARCHAR(100) NOT NULL UNIQUE,
          password NVARCHAR(255) NOT NULL,
          display_name NVARCHAR(200) NOT NULL,
          avatar_color NVARCHAR(20) NOT NULL DEFAULT '#3390ec',
          online BIT NOT NULL DEFAULT 0,
          last_seen DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
          created_at DATETIME2 NOT NULL DEFAULT GETUTCDATE()
        )
        """
    )
    cursor.execute(
        """
        IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'chats')
        CREATE TABLE chats (
          id INT IDENTITY(1,1) PRIMARY KEY,
          name NVARCHAR(200) NULL,
          type NVARCHAR(20) NOT NULL DEFAULT 'private',
          created_at DATETIME2 NOT NULL DEFAULT GETUTCDATE()
        )
        """
    )
    cursor.execute(
        """
        IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'chat_members')
        CREATE TABLE chat_members (
          chat_id INT NOT NULL,
          user_id INT NOT NULL,
          joined_at DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
          PRIMARY KEY (chat_id, user_id),
          FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
        """
    )
    cursor.execute(
        """
        IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'messages')
        CREATE TABLE messages (
          id INT IDENTITY(1,1) PRIMARY KEY,
          chat_id INT NOT NULL,
          sender_id INT NOT NULL,
          content NVARCHAR(MAX) NOT NULL,
          is_read BIT NOT NULL DEFAULT 0,
          created_at DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
          FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE,
          FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
        )
        """
    )
    cursor.execute(
        """
        IF NOT EXISTS (SELECT name FROM sys.indexes WHERE name = 'idx_messages_chat')
        CREATE INDEX idx_messages_chat ON messages(chat_id, created_at)
        """
    )
    cursor.execute(
        """
        IF NOT EXISTS (SELECT name FROM sys.indexes WHERE name = 'idx_messages_chat_id')
        CREATE INDEX idx_messages_chat_id ON messages(chat_id, id)
        """
    )
    cursor.execute(
        """
        IF NOT EXISTS (SELECT name FROM sys.indexes WHERE name = 'idx_chat_members_user')
        CREATE INDEX idx_chat_members_user ON chat_members(user_id)
        """
    )
    _ensure_message_columns(cursor)
    _ensure_reactions_table(cursor)
    _ensure_message_hidden_table(cursor)


def _ensure_reactions_table(cursor: pyodbc.Cursor) -> None:
    # SQL Server rejects multiple CASCADE paths: messages.sender_id -> users and
    # message_reactions.user_id -> users both CASCADE when message_id also CASCADEs
    # to messages. Drop legacy table if user_id FK still uses CASCADE (demo data only).
    cursor.execute(
        """
        IF EXISTS (
          SELECT 1
          FROM sys.foreign_keys fk
          INNER JOIN sys.foreign_key_columns fkc ON fk.object_id = fkc.constraint_object_id
          WHERE fk.parent_object_id = OBJECT_ID('message_reactions')
            AND COL_NAME(fkc.parent_object_id, fkc.parent_column_id) = 'user_id'
            AND fk.delete_referential_action = 1
        )
        DROP TABLE message_reactions
        """
    )
    cursor.execute(
        """
        IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'message_reactions')
        CREATE TABLE message_reactions (
          message_id INT NOT NULL,
          user_id INT NOT NULL,
          emoji NVARCHAR(16) NOT NULL,
          created_at DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
          PRIMARY KEY (message_id, user_id, emoji),
          FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE NO ACTION
        )
        """
    )


def _ensure_message_hidden_table(cursor: pyodbc.Cursor) -> None:
    # SQL Server rejects multiple CASCADE paths: chats -> messages -> message_hidden
    # and chats -> message_hidden both CASCADE. Drop legacy table if chat_id FK
    # still uses CASCADE (demo data only; rows are recreated on re-seed if needed).
    cursor.execute(
        """
        IF EXISTS (
          SELECT 1
          FROM sys.foreign_keys fk
          INNER JOIN sys.foreign_key_columns fkc ON fk.object_id = fkc.constraint_object_id
          WHERE fk.parent_object_id = OBJECT_ID('message_hidden')
            AND COL_NAME(fkc.parent_object_id, fkc.parent_column_id) = 'chat_id'
            AND fk.delete_referential_action = 1
        )
        DROP TABLE message_hidden
        """
    )
    cursor.execute(
        """
        IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'message_hidden')
        CREATE TABLE message_hidden (
          user_id INT NOT NULL,
          message_id INT NOT NULL,
          chat_id INT NOT NULL,
          deleted_at DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
          PRIMARY KEY (user_id, message_id),
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE NO ACTION,
          FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
          FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE NO ACTION
        )
        """
    )
    cursor.execute(
        """
        IF NOT EXISTS (SELECT name FROM sys.indexes WHERE name = 'idx_message_hidden_user_chat')
        CREATE INDEX idx_message_hidden_user_chat ON message_hidden(user_id, chat_id)
        """
    )


def _ensure_message_columns(cursor: pyodbc.Cursor) -> None:
    """Add optional message columns for reply/edit (safe migration)."""
    cursor.execute(
        """
        IF NOT EXISTS (
          SELECT 1 FROM sys.columns
          WHERE object_id = OBJECT_ID('messages') AND name = 'reply_to_id'
        )
        ALTER TABLE messages ADD reply_to_id INT NULL
        """
    )
    cursor.execute(
        """
        IF NOT EXISTS (
          SELECT 1 FROM sys.columns
          WHERE object_id = OBJECT_ID('messages') AND name = 'edited_at'
        )
        ALTER TABLE messages ADD edited_at DATETIME2 NULL
        """
    )
    cursor.execute(
        """
        IF NOT EXISTS (
          SELECT 1 FROM sys.columns
          WHERE object_id = OBJECT_ID('messages') AND name = 'is_deleted'
        )
        ALTER TABLE messages ADD is_deleted BIT NOT NULL DEFAULT 0
        """
    )
    cursor.execute(
        """
        IF NOT EXISTS (
          SELECT 1 FROM sys.columns
          WHERE object_id = OBJECT_ID('messages') AND name = 'deleted_at'
        )
        ALTER TABLE messages ADD deleted_at DATETIME2 NULL
        """
    )


def _get_user_id(cursor: pyodbc.Cursor, username: str) -> int | None:
    cursor.execute("SELECT id FROM users WHERE username = ?", username)
    row = cursor.fetchone()
    return row[0] if row else None


def ensure_saad_password(cursor: pyodbc.Cursor) -> None:
    """Always reset saad password to 12345678 so demo login never breaks."""
    if _get_user_id(cursor, "saad"):
        cursor.execute(
            "UPDATE users SET password = ? WHERE username = ?",
            _hash_password(config.SAAD_PASSWORD),
            "saad",
        )


def ensure_saad_display_name(cursor: pyodbc.Cursor) -> None:
    cursor.execute(
        "UPDATE users SET display_name = ? WHERE username = ?",
        SAAD_USER[1],
        "saad",
    )


def _upsert_user(cursor: pyodbc.Cursor, username: str, password_hash: str, display_name: str, color: str) -> int:
    existing = _get_user_id(cursor, username)
    if existing:
        cursor.execute(
            "UPDATE users SET display_name = ?, avatar_color = ? WHERE username = ?",
            display_name,
            color,
            username,
        )
        return existing
    cursor.execute(
        """
        INSERT INTO users (username, password, display_name, avatar_color)
        OUTPUT INSERTED.id
        VALUES (?, ?, ?, ?)
        """,
        username,
        password_hash,
        display_name,
        color,
    )
    return cursor.fetchone()[0]


def _ensure_bulk_contacts(
    cursor: pyodbc.Cursor,
    contacts: list[tuple[str, str, str]],
    password_hash: str,
) -> dict[str, int]:
    """Idempotent batch upsert for bulk demo contacts."""
    if not contacts:
        return {}

    usernames = [c[0] for c in contacts]
    placeholders = ",".join("?" * len(usernames))
    cursor.execute(
        f"SELECT username, id FROM users WHERE username IN ({placeholders})",
        *usernames,
    )
    existing_map = {row[0]: row[1] for row in cursor.fetchall()}

    ids: dict[str, int] = {}
    to_insert: list[tuple[str, str, str, str]] = []
    for username, display_name, color in contacts:
        if username in existing_map:
            cursor.execute(
                "UPDATE users SET display_name = ?, avatar_color = ? WHERE username = ?",
                display_name,
                color,
                username,
            )
            ids[username] = existing_map[username]
        else:
            to_insert.append((username, password_hash, display_name, color))

    if to_insert:
        cursor.fast_executemany = True
        cursor.executemany(
            """
            INSERT INTO users (username, password, display_name, avatar_color)
            VALUES (?, ?, ?, ?)
            """,
            to_insert,
        )
        new_names = [row[0] for row in to_insert]
        ph = ",".join("?" * len(new_names))
        cursor.execute(
            f"SELECT username, id FROM users WHERE username IN ({ph})",
            *new_names,
        )
        for row in cursor.fetchall():
            ids[row[0]] = row[1]

    return ids


def ensure_demo_users(cursor: pyodbc.Cursor) -> dict[str, int]:
    """Insert or update all demo users; return username -> id map."""
    default_hash = _hash_password(config.DEFAULT_PASSWORD)
    saad_hash = _hash_password(config.SAAD_PASSWORD)
    ids: dict[str, int] = {}

    ids["saad"] = _upsert_user(cursor, SAAD_USER[0], saad_hash, SAAD_USER[1], SAAD_USER[2])
    for username, display_name, color in DEMO_CONTACTS:
        ids[username] = _upsert_user(cursor, username, default_hash, display_name, color)
    ids.update(_ensure_bulk_contacts(cursor, BULK_CONTACTS, default_hash))
    return ids


def migrate_legacy_demo_users(cursor: pyodbc.Cursor) -> bool:
    """Remove old alice/bob/charlie/diana demo data. Returns True if migration ran."""
    placeholders = ",".join("?" * len(LEGACY_USERNAMES))
    cursor.execute(f"SELECT id FROM users WHERE username IN ({placeholders})", *LEGACY_USERNAMES)
    legacy_ids = [row[0] for row in cursor.fetchall()]
    if not legacy_ids:
        return False

    id_ph = ",".join("?" * len(legacy_ids))
    cursor.execute(f"SELECT DISTINCT chat_id FROM chat_members WHERE user_id IN ({id_ph})", *legacy_ids)
    legacy_chat_ids = [row[0] for row in cursor.fetchall()]
    for chat_id in legacy_chat_ids:
        cursor.execute("DELETE FROM messages WHERE chat_id = ?", chat_id)
        cursor.execute("DELETE FROM chat_members WHERE chat_id = ?", chat_id)
        cursor.execute("DELETE FROM chats WHERE id = ?", chat_id)
    cursor.execute("DELETE FROM chats WHERE name IN ('SCD Study Group', 'University Friends', 'Family Group')")
    cursor.execute(f"DELETE FROM users WHERE id IN ({id_ph})", *legacy_ids)
    print("Migrated: removed legacy demo users (alice, bob, charlie, diana).")
    return True


def _find_private_chat(cursor: pyodbc.Cursor, u1: int, u2: int) -> int | None:
    cursor.execute(
        """
        SELECT c.id FROM chats c
        JOIN chat_members m1 ON m1.chat_id = c.id AND m1.user_id = ?
        JOIN chat_members m2 ON m2.chat_id = c.id AND m2.user_id = ?
        WHERE c.type = 'private'
        """,
        u1,
        u2,
    )
    row = cursor.fetchone()
    return row[0] if row else None


def _insert_private_chat(cursor: pyodbc.Cursor, u1: int, u2: int) -> int:
    cursor.execute("INSERT INTO chats (name, type) OUTPUT INSERTED.id VALUES (NULL, 'private')")
    chat_id = cursor.fetchone()[0]
    cursor.execute("INSERT INTO chat_members (chat_id, user_id) VALUES (?, ?)", chat_id, u1)
    cursor.execute("INSERT INTO chat_members (chat_id, user_id) VALUES (?, ?)", chat_id, u2)
    return chat_id


def _chat_has_messages(cursor: pyodbc.Cursor, chat_id: int) -> bool:
    cursor.execute("SELECT COUNT(*) FROM messages WHERE chat_id = ?", chat_id)
    return cursor.fetchone()[0] > 0


def _insert_messages(cursor: pyodbc.Cursor, rows: list[tuple]) -> None:
    for chat_id, sender_id, content, created in rows:
        cursor.execute(
            "INSERT INTO messages (chat_id, sender_id, content, created_at) VALUES (?, ?, ?, ?)",
            chat_id,
            sender_id,
            content,
            created,
        )


def _ensure_private_chat(
    cursor: pyodbc.Cursor,
    saad_id: int,
    other_id: int,
    messages: list[tuple[int, str, datetime]],
) -> None:
    chat_id = _find_private_chat(cursor, saad_id, other_id)
    if not chat_id:
        chat_id = _insert_private_chat(cursor, saad_id, other_id)
    if not _chat_has_messages(cursor, chat_id):
        _insert_messages(cursor, [
            (chat_id, sender_id, content, created) for sender_id, content, created in messages
        ])


def _ensure_group_chat(
    cursor: pyodbc.Cursor,
    name: str,
    member_ids: list[int],
    messages: list[tuple[int, str, datetime]],
) -> None:
    cursor.execute("SELECT id FROM chats WHERE name = ? AND type = 'group'", name)
    row = cursor.fetchone()
    if row:
        chat_id = row[0]
        for mid in member_ids:
            cursor.execute(
                "SELECT 1 FROM chat_members WHERE chat_id = ? AND user_id = ?",
                chat_id,
                mid,
            )
            if not cursor.fetchone():
                cursor.execute(
                    "INSERT INTO chat_members (chat_id, user_id) VALUES (?, ?)",
                    chat_id,
                    mid,
                )
    else:
        cursor.execute(
            "INSERT INTO chats (name, type) OUTPUT INSERTED.id VALUES (?, 'group')",
            name,
        )
        chat_id = cursor.fetchone()[0]
        for uid in member_ids:
            cursor.execute("INSERT INTO chat_members (chat_id, user_id) VALUES (?, ?)", chat_id, uid)
    if not _chat_has_messages(cursor, chat_id):
        _insert_messages(cursor, [
            (chat_id, sender_id, content, created) for sender_id, content, created in messages
        ])


def ensure_demo_chats(cursor: pyodbc.Cursor, user_ids: dict[str, int]) -> None:
    """Create saad's demo chats and sample messages if missing."""
    saad_id = user_ids["saad"]
    now = _utc_now()

    def uid(name: str) -> int:
        return user_ids[name]

    # ── Private chats ──────────────────────────────────────────────────────
    _ensure_private_chat(cursor, saad_id, uid("ahmed"), [
        (uid("ahmed"), "Assalam o Alaikum Saad! Kaisay ho?", now - timedelta(hours=2)),
        (saad_id, "Walaikum Assalam Ahmed bhai, Alhamdulillah theek hoon.", now - timedelta(hours=2) + timedelta(minutes=3)),
        (uid("ahmed"), "SCD assignment ka kaam ho gaya?", now - timedelta(hours=1, minutes=55)),
        (saad_id, "Haan, Telegram clone Flask + SQL Server pe bana raha hoon.", now - timedelta(hours=1, minutes=50)),
    ])

    _ensure_private_chat(cursor, saad_id, uid("fatima"), [
        (uid("fatima"), "Saad, presentation slides ready hain?", now - timedelta(hours=4)),
        (saad_id, "Almost done — MVC architecture slide baqi hai.", now - timedelta(hours=3, minutes=45)),
        (uid("fatima"), "Shukriya! Kal class mein discuss karte hain.", now - timedelta(hours=3, minutes=40)),
    ])

    _ensure_private_chat(cursor, saad_id, uid("usman"), [
        (uid("usman"), "Database section SSMS pe complete kar liya?", now - timedelta(hours=6)),
        (saad_id, "Yes bro, TelegramClone database chal rahi hai.", now - timedelta(hours=5, minutes=50)),
        (uid("usman"), "Mashallah, kal demo dikha dena.", now - timedelta(hours=5, minutes=45)),
    ])

    _ensure_private_chat(cursor, saad_id, uid("ayesha"), [
        (uid("ayesha"), "Saad bhai, OST endpoints document kar liye?", now - timedelta(hours=8)),
        (saad_id, "Haan Ayesha, auth aur chat controllers done hain.", now - timedelta(hours=7, minutes=50)),
        (uid("ayesha"), "Zabardast! Kal submit kar dete hain.", now - timedelta(hours=7, minutes=45)),
    ])

    _ensure_private_chat(cursor, saad_id, uid("hassan"), [
        (uid("hassan"), "Saad bhai, kal cricket match dekho ge?", now - timedelta(hours=1)),
        (saad_id, "Haan Hassan, Pakistan vs India — InshaAllah!", now - timedelta(minutes=55)),
        (uid("hassan"), DEMO_PHOTO_CONTENT, now - timedelta(minutes=50)),
        (saad_id, "Wah, kitna acha view hai!", now - timedelta(minutes=45)),
        (uid("hassan"), "Stadium mein milte hain phir.", now - timedelta(minutes=40)),
    ])

    _ensure_private_chat(cursor, saad_id, uid("sana"), [
        (uid("sana"), "Assalam Saad! Notes share kar do please.", now - timedelta(hours=3)),
        (saad_id, "Bhej diye hain — check karo.", now - timedelta(hours=2, minutes=50)),
        (uid("sana"), "Shukriya jazakAllah!", now - timedelta(hours=2, minutes=45)),
    ])

    _ensure_private_chat(cursor, saad_id, uid("omar"), [
        (uid("omar"), "Bro API testing kaise kar rahe ho?", now - timedelta(days=1)),
        (saad_id, "Postman se, aur frontend localhost:5500 pe.", now - timedelta(days=1) + timedelta(minutes=10)),
        (uid("omar"), DEMO_VOICE_CONTENT, now - timedelta(days=1) + timedelta(minutes=20)),
        (saad_id, "Sun liya — theek suggestion hai.", now - timedelta(days=1) + timedelta(minutes=25)),
    ])

    _ensure_private_chat(cursor, saad_id, uid("hira"), [
        (uid("hira"), "Saad, group project mein frontend tum handle karoge?", now - timedelta(days=2)),
        (saad_id, "Haan Hira, main JS MVC bana raha hoon.", now - timedelta(days=2) + timedelta(hours=1)),
        (uid("hira"), "Perfect! CSS Telegram jaisa rakho.", now - timedelta(days=2) + timedelta(hours=2)),
        (saad_id, "Done — dark/light theme bhi hai.", now - timedelta(days=2) + timedelta(hours=3)),
    ])

    _ensure_private_chat(cursor, saad_id, uid("imran"), [
        (uid("imran"), "Assignment submit ho gaya?", now - timedelta(days=3)),
        (saad_id, "Abhi finalize kar raha hoon.", now - timedelta(days=3) + timedelta(hours=2)),
        (uid("imran"), "Deadline Friday hai yaad rakhna.", now - timedelta(days=3) + timedelta(hours=4)),
    ])

    # ── Group chats ────────────────────────────────────────────────────────
    _ensure_group_chat(cursor, "University Friends", [
        saad_id, uid("ahmed"), uid("fatima"), uid("usman"), uid("ayesha"), uid("hamza"), uid("zainab"),
    ], [
        (uid("hamza"), "Assalam everyone! Assignment 05 deadline next week hai.", now - timedelta(days=1)),
        (uid("ayesha"), "Microservices aur MVC dono cover karna hai.", now - timedelta(days=1) + timedelta(minutes=8)),
        (uid("zainab"), "Main FST specification likh rahi hoon.", now - timedelta(days=1) + timedelta(minutes=15)),
        (saad_id, "Group mein sab share kar lena, InshaAllah sab set ho jayega.", now - timedelta(days=1) + timedelta(minutes=25)),
        (uid("ahmed"), "Chalo kal library mein milte hain.", now - timedelta(days=1) + timedelta(minutes=40)),
    ])

    _ensure_group_chat(cursor, "SCD Assignment Group", [
        saad_id, uid("ahmed"), uid("fatima"), uid("usman"), uid("hamza"),
    ], [
        (uid("hamza"), "Controllers aur services alag rakho — MVC clear hona chahiye.", now - timedelta(hours=5)),
        (uid("fatima"), "Main SST document update kar rahi hoon.", now - timedelta(hours=4, minutes=50)),
        (saad_id, "Backend seeder bhi update kar diya — ab 13 chats hain.", now - timedelta(hours=4, minutes=40)),
        (uid("usman"), "SSMS verify query bhej do group mein.", now - timedelta(hours=4, minutes=30)),
    ])

    _ensure_group_chat(cursor, "Cricket Fans PK", [
        saad_id, uid("bilal"), uid("omar"), uid("hassan"), uid("imran"),
    ], [
        (uid("bilal"), "Pakistan ne match jeet liya! 🎉", now - timedelta(hours=12)),
        (uid("omar"), "Babar ka century dekha?", now - timedelta(hours=11, minutes=50)),
        (uid("hassan"), DEMO_PHOTO_CONTENT, now - timedelta(hours=11, minutes=40)),
        (saad_id, "Mashallah, kya performance thi!", now - timedelta(hours=11, minutes=30)),
        (uid("imran"), "Agle match ka plan banao.", now - timedelta(hours=11, minutes=20)),
    ])

    _ensure_group_chat(cursor, "Family Group", [
        saad_id, uid("maryam"), uid("zainab"), uid("sana"),
    ], [
        (uid("maryam"), "Assalam everyone! Jummah Mubarak.", now - timedelta(days=1)),
        (uid("zainab"), "Ammi ne biryani banayi hai — aa jao.", now - timedelta(days=1) + timedelta(minutes=30)),
        (uid("sana"), "Main 6 baje aa rahi hoon.", now - timedelta(days=1) + timedelta(minutes=45)),
        (saad_id, "Main thori der baad aata hoon, assignment submit karni hai.", now - timedelta(days=1) + timedelta(hours=1)),
    ])

    _ensure_bulk_contact_chats(cursor, saad_id, user_ids, now)


def _ensure_bulk_contact_chats(
    cursor: pyodbc.Cursor,
    saad_id: int,
    user_ids: dict[str, int],
    now: datetime,
) -> None:
    """Private chats with new bulk contacts (does not touch existing saad chats)."""
    for contact_username, message_specs in _BULK_CHAT_CONTACTS:
        other_id = user_ids.get(contact_username)
        if not other_id:
            continue
        messages: list[tuple[int, str, datetime]] = []
        for sender_name, content in message_specs:
            sender_id = saad_id if sender_name == "saad" else user_ids[sender_name]
            offset = timedelta(minutes=len(messages) * 5)
            messages.append((sender_id, content, now - timedelta(hours=10) + offset))
        _ensure_private_chat(cursor, saad_id, other_id, messages)


def _upgrade_placeholder_media(cursor: pyodbc.Cursor) -> None:
    """Replace legacy emoji-only media placeholders with renderable payloads."""
    cursor.execute(
        "UPDATE messages SET content = ? WHERE content IN (N'📷 Photo', N'Photo')",
        DEMO_PHOTO_CONTENT,
    )
    cursor.execute(
        "UPDATE messages SET content = ? WHERE content IN (N'🎤 Voice message', N'Voice message')",
        DEMO_VOICE_CONTENT,
    )


def seed_demo_data(cursor: pyodbc.Cursor) -> None:
    cursor.execute("SELECT COUNT(*) FROM users")
    has_users = cursor.fetchone()[0] > 0

    if has_users:
        migrated = migrate_legacy_demo_users(cursor)
        ensure_saad_password(cursor)
        ensure_saad_display_name(cursor)
        user_ids = ensure_demo_users(cursor)
        ensure_demo_chats(cursor, user_ids)
        _upgrade_placeholder_media(cursor)
        cursor.execute("SELECT COUNT(*) FROM users")
        total_users = cursor.fetchone()[0]
        if migrated:
            print(f"Demo data migrated to Pakistani/Muslim contacts ({total_users} users).")
        else:
            print(f"Demo users exist — ensured saad password, {total_users} users, and chats.")
        return

    user_ids = ensure_demo_users(cursor)
    ensure_demo_chats(cursor, user_ids)
    total = len(user_ids)
    print(
        f"Seeded {total} users (saad + {len(DEMO_CONTACTS)} core + {len(BULK_CONTACTS)} bulk contacts), "
        "chats, and sample messages."
    )


def initialize_database() -> None:
    if not config.SKIP_DATABASE_CREATE:
        ensure_database_exists()
    conn = DatabaseSingleton.get_instance().get_connection()
    try:
        conn.autocommit = False
        cur = conn.cursor()
        ensure_schema(cur)
        seed_demo_data(cur)
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
