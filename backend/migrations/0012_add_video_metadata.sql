-- Add video metadata columns for YouTube statistics
ALTER TABLE videos ADD COLUMN duration INTEGER; -- Duration in seconds
ALTER TABLE videos ADD COLUMN view_count INTEGER; -- View count from YouTube
ALTER TABLE videos ADD COLUMN like_count INTEGER; -- Like count from YouTube
ALTER TABLE videos ADD COLUMN published_at TEXT; -- Original publish date from YouTube
