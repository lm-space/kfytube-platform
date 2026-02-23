-- Multi-tenant subdomain support
-- Allows creating isolated video collections under subdomains like learn.tube.twozao.com

-- 1. Create tenants table
CREATE TABLE IF NOT EXISTS tenants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT UNIQUE NOT NULL,        -- 'learn', 'play', 'funny' (used in subdomain)
    name TEXT NOT NULL,               -- Display name: 'Learn', 'Play', 'Funny'
    description TEXT,                 -- Optional description
    created_at TEXT DEFAULT (datetime('now')),
    is_active INTEGER DEFAULT 1
);

-- 2. Add tenant_id to videos (0 = global, >0 = specific tenant)
ALTER TABLE videos ADD COLUMN tenant_id INTEGER DEFAULT 0;

-- 3. Add tenant_id and telegram_handle to users
ALTER TABLE users ADD COLUMN tenant_id INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN telegram_handle TEXT;

-- 4. Add tenant_id to categories
ALTER TABLE categories ADD COLUMN tenant_id INTEGER DEFAULT 0;

-- 5. Add tenant_id to playlists
ALTER TABLE playlists ADD COLUMN tenant_id INTEGER DEFAULT 0;

-- 6. Create index for faster tenant filtering
CREATE INDEX IF NOT EXISTS idx_videos_tenant ON videos(tenant_id);
CREATE INDEX IF NOT EXISTS idx_categories_tenant ON categories(tenant_id);
CREATE INDEX IF NOT EXISTS idx_playlists_tenant ON playlists(tenant_id);
CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_users_telegram ON users(telegram_handle);
