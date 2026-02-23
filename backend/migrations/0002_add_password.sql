-- Add password_hash to users table
ALTER TABLE users ADD COLUMN password_hash TEXT;

-- Restore admin password from the backup table (if it exists and has data)
-- We know 'admin' maped to 'admin@kfytube.com'
UPDATE users 
SET password_hash = (SELECT password_hash FROM admins_backup_pre_migration WHERE username = 'admin')
WHERE email = 'admin@kfytube.com';
