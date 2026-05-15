-- Track how many times users report a video as not found/unavailable
ALTER TABLE videos ADD COLUMN not_found_count INTEGER NOT NULL DEFAULT 0;
