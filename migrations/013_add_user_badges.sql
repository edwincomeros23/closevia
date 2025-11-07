-- Add numeric badges array to users
ALTER TABLE users
  ADD COLUMN badges JSON NULL AFTER bio;

-- Initialize existing users with empty array
UPDATE users SET badges = JSON_ARRAY() WHERE badges IS NULL;

