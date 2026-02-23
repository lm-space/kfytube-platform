-- 1. Create the new users table
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  channel_name TEXT,
  magic_link_token TEXT,
  magic_link_expires TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Migrate existing admins to users
-- We convert 'admin' to a proper email to satisfy the new schema
INSERT INTO users (email, channel_name)
SELECT 
  CASE WHEN username = 'admin' THEN 'admin@kfytube.com' ELSE username || '@kfytube.com' END, 
  'Admin Channel' 
FROM admins;

-- 3. Add new columns to existings tables (SQLite supports ADD COLUMN)
-- We default is_global to 1 (true) for all existing content so it remains visible

ALTER TABLE categories ADD COLUMN channel_id INTEGER;
ALTER TABLE categories ADD COLUMN is_global BOOLEAN DEFAULT 1;

ALTER TABLE videos ADD COLUMN channel_id INTEGER;
ALTER TABLE videos ADD COLUMN is_global BOOLEAN DEFAULT 1;

ALTER TABLE playlists ADD COLUMN channel_id INTEGER;
ALTER TABLE playlists ADD COLUMN is_global BOOLEAN DEFAULT 1;

-- 4. Rename old admins table to backup (just in case)
ALTER TABLE admins RENAME TO admins_backup_pre_migration;

-- Note: We are strictly adding columns. We are NOT dropping/recreating content tables to preserve data.
