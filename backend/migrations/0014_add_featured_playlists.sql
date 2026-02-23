-- Add is_featured flag to playlists for showing as tabs in video detail view
ALTER TABLE playlists ADD COLUMN is_featured INTEGER DEFAULT 0;
