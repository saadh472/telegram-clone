-- Telegram Web Clone — SQL Server setup for SSMS
-- Server: set in backend/.env (SQL_SERVER=your-instance)
-- Database: TelegramClone (DB_NAME in .env)
-- Authentication: Windows Authentication
-- Encryption: Mandatory | Trust server certificate: True
--
-- Run this entire script in SSMS to create schema + Pakistani/Muslim demo data.
-- Flask backend also migrates/seeds on startup via services/seeder.py

USE master;
GO

IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = N'TelegramClone')
  CREATE DATABASE TelegramClone;
GO

USE TelegramClone;
GO

-- ── Tables ──────────────────────────────────────────────────────────────────

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
);
GO

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'chats')
CREATE TABLE chats (
  id INT IDENTITY(1,1) PRIMARY KEY,
  name NVARCHAR(200) NULL,
  type NVARCHAR(20) NOT NULL DEFAULT 'private',
  created_at DATETIME2 NOT NULL DEFAULT GETUTCDATE()
);
GO

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'chat_members')
CREATE TABLE chat_members (
  chat_id INT NOT NULL,
  user_id INT NOT NULL,
  joined_at DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
  PRIMARY KEY (chat_id, user_id),
  FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
GO

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
);
GO

IF NOT EXISTS (SELECT name FROM sys.indexes WHERE name = 'idx_messages_chat')
  CREATE INDEX idx_messages_chat ON messages(chat_id, created_at);

IF NOT EXISTS (SELECT name FROM sys.indexes WHERE name = 'idx_messages_chat_id')
  CREATE INDEX idx_messages_chat_id ON messages(chat_id, id);
GO

-- Soft delete for "delete for everyone" (Telegram-style placeholder)
IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('messages') AND name = 'is_deleted'
)
  ALTER TABLE messages ADD is_deleted BIT NOT NULL DEFAULT 0;
GO
IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('messages') AND name = 'deleted_at'
)
  ALTER TABLE messages ADD deleted_at DATETIME2 NULL;
GO

IF NOT EXISTS (SELECT name FROM sys.indexes WHERE name = 'idx_chat_members_user')
  CREATE INDEX idx_chat_members_user ON chat_members(user_id);
GO

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
);
GO

IF NOT EXISTS (SELECT name FROM sys.indexes WHERE name = 'idx_message_hidden_user_chat')
  CREATE INDEX idx_message_hidden_user_chat ON message_hidden(user_id, chat_id);
GO

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'message_reactions')
CREATE TABLE message_reactions (
  message_id INT NOT NULL,
  user_id INT NOT NULL,
  emoji NVARCHAR(16) NOT NULL,
  created_at DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
  PRIMARY KEY (message_id, user_id, emoji),
  FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE NO ACTION
);
GO

-- Performance indexes for chat list query (chat_id + user_id lookups, message ordering):
-- idx_messages_chat covers (chat_id, created_at) for last-message CTE
-- idx_chat_members_user covers membership filter by user_id
-- Optional composite for member lookups per chat:
IF NOT EXISTS (SELECT name FROM sys.indexes WHERE name = 'idx_chat_members_chat_user')
  CREATE INDEX idx_chat_members_chat_user ON chat_members(chat_id, user_id);
GO

-- ── Remove legacy Western demo users ────────────────────────────────────────

DECLARE @legacy TABLE (id INT);
INSERT INTO @legacy SELECT id FROM users WHERE username IN ('alice','bob','charlie','diana');

IF EXISTS (SELECT 1 FROM @legacy)
BEGIN
  DELETE m FROM messages m
  INNER JOIN chat_members cm ON cm.chat_id = m.chat_id
  INNER JOIN @legacy l ON cm.user_id = l.id;

  DELETE cm FROM chat_members cm
  INNER JOIN @legacy l ON cm.user_id = l.id;

  DELETE c FROM chats c
  WHERE c.id NOT IN (SELECT DISTINCT chat_id FROM chat_members)
     OR c.name IN ('SCD Study Group', 'University Friends', 'Family Group');

  DELETE u FROM users u INNER JOIN @legacy l ON u.id = l.id;
  PRINT 'Removed legacy users: alice, bob, charlie, diana';
END
GO

-- ── Seed users (Pakistani/Muslim contacts) ─────────────────────────────────
-- Passwords: saad = 12345678 | all others = password123 (bcrypt, 10 rounds)
-- Core 14 contacts below; ~86 additional contacts are inserted idempotently by
-- backend/services/seeder.py (BULK_CONTACTS) on Flask startup — total ~101 users.

DECLARE @defaultHash NVARCHAR(255) = '$2b$10$W9WJhzmgAGSFGMNDyEZQlOOyBxQqgjT3QA19PkrKRPmu3LMYOrPZe';
DECLARE @saadHash NVARCHAR(255) = '$2b$10$1NqllncsJ4BCBIqZOXoqIeTsk8HFPYtvZdKa4IHAHrOeZRnps/l/6';

MERGE users AS t
USING (VALUES
  ('saad',    @saadHash,    'Saad Hussain',      '#3390ec'),
  ('ahmed',   @defaultHash, 'Ahmed Khan',        '#e17076'),
  ('fatima',  @defaultHash, 'Fatima Ali',        '#7bc862'),
  ('usman',   @defaultHash, 'Usman Malik',       '#e5ca77'),
  ('ayesha',  @defaultHash, 'Ayesha Siddiqui',   '#65aadd'),
  ('hamza',   @defaultHash, 'Hamza Raza',        '#a695e7'),
  ('zainab',  @defaultHash, 'Zainab Shah',       '#ee7aae'),
  ('bilal',   @defaultHash, 'Bilal Ahmed',       '#6fcbea'),
  ('maryam',  @defaultHash, 'Maryam Hassan',     '#e5a45c'),
  ('hassan',  @defaultHash, 'Hassan Raza',       '#54a0ff'),
  ('sana',    @defaultHash, 'Sana Mirza',        '#ff6b81'),
  ('omar',    @defaultHash, 'Omar Farooq',       '#2ed573'),
  ('hira',    @defaultHash, 'Hira Abbas',        '#ffa502'),
  ('imran',   @defaultHash, 'Imran Qureshi',     '#5758bb')
) AS s(username, password, display_name, avatar_color)
ON t.username = s.username
WHEN MATCHED THEN
  UPDATE SET display_name = s.display_name, avatar_color = s.avatar_color
WHEN NOT MATCHED THEN
  INSERT (username, password, display_name, avatar_color)
  VALUES (s.username, s.password, s.display_name, s.avatar_color);
GO

-- Always reset saad password so demo login works
UPDATE users SET password = '$2b$10$1NqllncsJ4BCBIqZOXoqIeTsk8HFPYtvZdKa4IHAHrOeZRnps/l/6',
  display_name = 'Saad Hussain'
WHERE username = 'saad';
GO

-- ── Seed chats & messages (only if no messages exist) ───────────────────────

IF NOT EXISTS (SELECT 1 FROM messages)
BEGIN
  SET NOCOUNT ON;

  DECLARE @saad INT, @ahmed INT, @fatima INT, @usman INT, @ayesha INT;
  DECLARE @hamza INT, @zainab INT;
  DECLARE @chat1 INT, @chat2 INT, @chat3 INT, @chat4 INT, @chat5 INT;

  SELECT @saad = id FROM users WHERE username = 'saad';
  SELECT @ahmed = id FROM users WHERE username = 'ahmed';
  SELECT @fatima = id FROM users WHERE username = 'fatima';
  SELECT @usman = id FROM users WHERE username = 'usman';
  SELECT @ayesha = id FROM users WHERE username = 'ayesha';
  SELECT @hamza = id FROM users WHERE username = 'hamza';
  SELECT @zainab = id FROM users WHERE username = 'zainab';

  -- Private: Saad ↔ Ahmed
  INSERT INTO chats (name, type) VALUES (NULL, 'private');
  SET @chat1 = SCOPE_IDENTITY();
  INSERT INTO chat_members (chat_id, user_id) VALUES (@chat1, @saad), (@chat1, @ahmed);
  INSERT INTO messages (chat_id, sender_id, content, created_at) VALUES
    (@chat1, @ahmed, 'Assalam o Alaikum Saad! Kaisay ho?', DATEADD(HOUR, -2, GETUTCDATE())),
    (@chat1, @saad, 'Walaikum Assalam Ahmed bhai, Alhamdulillah theek hoon.', DATEADD(MINUTE, -117, GETUTCDATE())),
    (@chat1, @ahmed, 'SCD assignment ka kaam ho gaya?', DATEADD(MINUTE, -115, GETUTCDATE())),
    (@chat1, @saad, 'Haan, Telegram clone Flask + SQL Server pe bana raha hoon.', DATEADD(MINUTE, -110, GETUTCDATE()));

  -- Private: Saad ↔ Fatima
  INSERT INTO chats (name, type) VALUES (NULL, 'private');
  SET @chat2 = SCOPE_IDENTITY();
  INSERT INTO chat_members (chat_id, user_id) VALUES (@chat2, @saad), (@chat2, @fatima);
  INSERT INTO messages (chat_id, sender_id, content, created_at) VALUES
    (@chat2, @fatima, 'Saad, presentation slides ready hain?', DATEADD(HOUR, -4, GETUTCDATE())),
    (@chat2, @saad, 'Almost done — MVC architecture slide baqi hai.', DATEADD(MINUTE, -225, GETUTCDATE())),
    (@chat2, @fatima, 'Shukriya! Kal class mein discuss karte hain.', DATEADD(MINUTE, -220, GETUTCDATE()));

  -- Private: Saad ↔ Usman
  INSERT INTO chats (name, type) VALUES (NULL, 'private');
  SET @chat3 = SCOPE_IDENTITY();
  INSERT INTO chat_members (chat_id, user_id) VALUES (@chat3, @saad), (@chat3, @usman);
  INSERT INTO messages (chat_id, sender_id, content, created_at) VALUES
    (@chat3, @usman, 'Database section SSMS pe complete kar liya?', DATEADD(HOUR, -6, GETUTCDATE())),
    (@chat3, @saad, 'Yes bro, TelegramClone database chal rahi hai.', DATEADD(MINUTE, -350, GETUTCDATE())),
    (@chat3, @usman, 'Mashallah, kal demo dikha dena.', DATEADD(MINUTE, -345, GETUTCDATE()));

  -- Private: Saad ↔ Ayesha
  INSERT INTO chats (name, type) VALUES (NULL, 'private');
  SET @chat4 = SCOPE_IDENTITY();
  INSERT INTO chat_members (chat_id, user_id) VALUES (@chat4, @saad), (@chat4, @ayesha);
  INSERT INTO messages (chat_id, sender_id, content, created_at) VALUES
    (@chat4, @ayesha, 'Saad bhai, OST endpoints document kar liye?', DATEADD(HOUR, -8, GETUTCDATE())),
    (@chat4, @saad, 'Haan Ayesha, auth aur chat controllers done hain.', DATEADD(MINUTE, -470, GETUTCDATE())),
    (@chat4, @ayesha, 'Zabardast! Kal submit kar dete hain.', DATEADD(MINUTE, -465, GETUTCDATE()));

  -- Group: University Friends
  INSERT INTO chats (name, type) VALUES ('University Friends', 'group');
  SET @chat5 = SCOPE_IDENTITY();
  INSERT INTO chat_members (chat_id, user_id) VALUES
    (@chat5, @saad), (@chat5, @ahmed), (@chat5, @fatima), (@chat5, @usman),
    (@chat5, @ayesha), (@chat5, @hamza), (@chat5, @zainab);
  INSERT INTO messages (chat_id, sender_id, content, created_at) VALUES
    (@chat5, @hamza, 'Assalam everyone! Assignment 05 deadline next week hai.', DATEADD(DAY, -1, GETUTCDATE())),
    (@chat5, @ayesha, 'Microservices aur MVC dono cover karna hai.', DATEADD(HOUR, -23, GETUTCDATE())),
    (@chat5, @zainab, 'Main FST specification likh rahi hoon.', DATEADD(HOUR, -23, GETUTCDATE()) + 7),
    (@chat5, @saad, 'Group mein sab share kar lena, InshaAllah sab set ho jayega.', DATEADD(HOUR, -23, GETUTCDATE()) + 15),
    (@chat5, @ahmed, 'Chalo kal library mein milte hain.', DATEADD(HOUR, -22, GETUTCDATE()));

  PRINT 'Seed data inserted: 9 users, 5 chats, sample messages.';
END
ELSE
  PRINT 'Messages already exist — users updated via MERGE; run Flask backend to migrate new chats.';
GO

-- ── Migrate new users/chats on existing DB (idempotent) ─────────────────────
-- Restart Flask backend (services/seeder.py) to add bulk contacts (~100 total users),
-- 8 new private chats with sample messages, and ensure existing saad chats stay intact.

-- ── Verify in SSMS ──────────────────────────────────────────────────────────
SELECT username, display_name FROM users ORDER BY id;
SELECT id, name, type FROM chats;
SELECT COUNT(*) AS message_count FROM messages;
GO
