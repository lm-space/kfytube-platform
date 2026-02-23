-- Tracked YouTube channels for auto-import
CREATE TABLE IF NOT EXISTS youtube_channels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    channel_id TEXT NOT NULL UNIQUE,           -- UC... YouTube channel ID
    channel_name TEXT NOT NULL,
    channel_handle TEXT,                        -- @handle
    thumbnail_url TEXT,                         -- Channel thumbnail
    default_category_id INTEGER,                -- Default category for imported videos
    import_mode TEXT DEFAULT 'queue',           -- 'auto' = auto-import, 'queue' = review first
    min_views INTEGER DEFAULT 0,                -- Minimum views for auto-import
    is_active INTEGER DEFAULT 1,                -- Whether to sync this channel
    last_synced TEXT,                           -- Last successful sync timestamp
    video_count INTEGER DEFAULT 0,              -- Total videos discovered
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (default_category_id) REFERENCES categories(id)
);

-- Video discovery queue for pending imports
CREATE TABLE IF NOT EXISTS video_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    youtube_video_id TEXT NOT NULL UNIQUE,      -- YouTube video ID
    channel_id TEXT NOT NULL,                   -- Source channel ID
    title TEXT NOT NULL,
    thumbnail_url TEXT,
    duration TEXT,                              -- ISO 8601 duration (PT4M30S)
    view_count INTEGER DEFAULT 0,
    like_count INTEGER DEFAULT 0,
    published_at TEXT,
    is_made_for_kids INTEGER DEFAULT 0,
    is_short INTEGER DEFAULT 0,
    suggested_category_id INTEGER,              -- AI/rule suggested category
    status TEXT DEFAULT 'pending',              -- pending, approved, rejected, imported
    reviewed_by INTEGER,                        -- User who reviewed
    reviewed_at TEXT,
    imported_video_id INTEGER,                  -- ID in videos table after import
    discovered_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (suggested_category_id) REFERENCES categories(id),
    FOREIGN KEY (reviewed_by) REFERENCES users(id),
    FOREIGN KEY (imported_video_id) REFERENCES videos(id)
);

-- Index for efficient queries
CREATE INDEX IF NOT EXISTS idx_video_queue_status ON video_queue(status);
CREATE INDEX IF NOT EXISTS idx_video_queue_channel ON video_queue(channel_id);
CREATE INDEX IF NOT EXISTS idx_youtube_channels_active ON youtube_channels(is_active);

-- Auto-import rules (keywords/patterns for auto-categorization)
CREATE TABLE IF NOT EXISTS import_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    pattern TEXT NOT NULL,                      -- Regex pattern to match title
    pattern_type TEXT DEFAULT 'contains',       -- 'contains', 'regex', 'starts_with'
    target_category_id INTEGER NOT NULL,
    priority INTEGER DEFAULT 0,                 -- Higher priority rules checked first
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (target_category_id) REFERENCES categories(id)
);
