-- Migration number: 0005 	 2026-01-10T00:00:00.000Z
ALTER TABLE playlists ADD COLUMN source_channel_id TEXT;
