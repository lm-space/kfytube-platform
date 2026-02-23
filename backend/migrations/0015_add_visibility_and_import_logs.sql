-- Add visibility flag to videos for admin control
ALTER TABLE videos ADD COLUMN is_visible INTEGER DEFAULT 1;

-- Create import logs table to track how videos were imported
CREATE TABLE IF NOT EXISTS import_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  video_id INTEGER NOT NULL,
  import_source TEXT NOT NULL, -- 'channel', 'playlist', 'search', 'manual', 'api'
  import_method TEXT NOT NULL, -- 'auto', 'manual'
  source_name TEXT, -- name of channel/playlist/source
  source_id TEXT, -- ID of channel/playlist
  imported_by TEXT, -- email of user who triggered import (or 'system' for auto)
  metadata TEXT, -- JSON with additional info
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE
);

-- Add index for efficient queries
CREATE INDEX idx_import_logs_video_id ON import_logs(video_id);
CREATE INDEX idx_import_logs_source ON import_logs(import_source);
CREATE INDEX idx_import_logs_created ON import_logs(created_at);
