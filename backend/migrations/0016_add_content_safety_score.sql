-- Add content safety scoring for kids' content filtering
ALTER TABLE video_queue ADD COLUMN kids_safety_score REAL;          -- 0-100 score for kids content suitability
ALTER TABLE video_queue ADD COLUMN safety_review_status TEXT DEFAULT 'pending'; -- pending, approved, rejected
ALTER TABLE video_queue ADD COLUMN safety_concerns TEXT;             -- JSON array of content flags (e.g., violence, inappropriate, etc.)
ALTER TABLE video_queue ADD COLUMN reviewed_by_ai_at TEXT;           -- Timestamp when AI reviewed the video

-- Index for efficient filtering by safety
CREATE INDEX IF NOT EXISTS idx_video_queue_safety_score ON video_queue(kids_safety_score);
CREATE INDEX IF NOT EXISTS idx_video_queue_safety_status ON video_queue(safety_review_status);
