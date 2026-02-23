-- Add last_refreshed timestamp to playlists table for cron job optimization
ALTER TABLE playlists ADD COLUMN last_refreshed TIMESTAMP;

-- Create index for efficient sorting by last_refreshed
CREATE INDEX IF NOT EXISTS idx_playlists_last_refreshed ON playlists(last_refreshed);
