-- Add reply functionality to reviews table
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS reply TEXT;
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS reply_date DATETIME;
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS replied_by_user_id INT;

-- Add foreign key for replied_by_user_id
ALTER TABLE reviews ADD CONSTRAINT fk_reviews_reply_user 
    FOREIGN KEY (replied_by_user_id) REFERENCES users(id) ON DELETE SET NULL;
