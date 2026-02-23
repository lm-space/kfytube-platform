-- Add is_short column to videos table
ALTER TABLE videos ADD COLUMN is_short INTEGER DEFAULT 0;
