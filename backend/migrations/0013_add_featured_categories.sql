-- Add is_featured flag to categories for showing as tabs in video detail view
ALTER TABLE categories ADD COLUMN is_featured INTEGER DEFAULT 0;
