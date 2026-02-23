-- Add repeat_enabled flag to categories and playlists

-- Categories: repeat_enabled flag
ALTER TABLE categories ADD COLUMN repeat_enabled BOOLEAN DEFAULT 0;

-- Playlists: repeat_enabled flag
ALTER TABLE playlists ADD COLUMN repeat_enabled BOOLEAN DEFAULT 0;

-- Index for repeat_enabled to allow efficient filtering
CREATE INDEX IF NOT EXISTS idx_categories_repeat_enabled ON categories(repeat_enabled);
CREATE INDEX IF NOT EXISTS idx_playlists_repeat_enabled ON playlists(repeat_enabled);
