-- Migration: Review & Trust Score System Enhancement
-- Adds support for immutable initial reviews, follow-up reviews, and auto-completion

-- Step 1: Create trade_reviews table for review history
CREATE TABLE IF NOT EXISTS trade_reviews (
  id INT PRIMARY KEY AUTO_INCREMENT,
  trade_id INT NOT NULL,
  reviewer_id INT NOT NULL,
  rating INT NOT NULL COMMENT '1-5 stars',
  feedback TEXT COMMENT 'Review text/comments',
  proof_url VARCHAR(1000) COMMENT 'Photo evidence URL',
  is_camera_photo BOOLEAN DEFAULT FALSE COMMENT 'Was proof photo taken with in-app camera',
  is_followup BOOLEAN DEFAULT FALSE COMMENT 'Is this a follow-up review (1) or initial (0)',
  is_auto_generated BOOLEAN DEFAULT FALSE COMMENT 'Auto-generated due to 3-day timeout',
  rating_delta INT DEFAULT 0 COMMENT 'Rating change if followup: positive=increase, negative=decrease',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (trade_id) REFERENCES trades(id) ON DELETE CASCADE,
  FOREIGN KEY (reviewer_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY unique_initial_review (trade_id, reviewer_id, is_followup),
  INDEX idx_trade_reviewer (trade_id, reviewer_id),
  INDEX idx_trade_created (trade_id, created_at DESC),
  INDEX idx_reviewer_followup (reviewer_id, is_followup)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Step 2: Add new columns to trades table for review tracking
ALTER TABLE trades ADD COLUMN IF NOT EXISTS buyer_review_created_at TIMESTAMP NULL COMMENT 'Timestamp of initial buyer review' AFTER buyer_rating;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS seller_review_created_at TIMESTAMP NULL COMMENT 'Timestamp of initial seller review' AFTER seller_rating;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS buyer_initial_review_locked BOOLEAN DEFAULT FALSE COMMENT 'Prevent tampering with initial review' AFTER buyer_review_created_at;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS seller_initial_review_locked BOOLEAN DEFAULT FALSE COMMENT 'Prevent tampering with initial review' AFTER seller_review_created_at;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS auto_completed_at TIMESTAMP NULL COMMENT 'Timestamp when auto-completed due to timeout' AFTER auto_completed_at;

-- Step 3: Create index for auto-completion queries
CREATE INDEX IF NOT EXISTS idx_trades_auto_complete ON trades(status, created_at) WHERE status IN ('active', 'awaiting_confirmation', 'completed');

-- Step 4: Insert existing reviews into trade_reviews table (preserve data)
-- For trades with existing ratings, create initial reviews from the current data
INSERT INTO trade_reviews (
  trade_id, reviewer_id, rating, feedback, proof_url, 
  is_camera_photo, is_followup, is_auto_generated, created_at, updated_at
)
SELECT 
  id as trade_id,
  buyer_id as reviewer_id,
  buyer_rating as rating,
  buyer_feedback as feedback,
  buyer_proof_url as proof_url,
  buyer_photo_is_camera as is_camera_photo,
  FALSE as is_followup,
  FALSE as is_auto_generated,
  COALESCE(updated_at, CURRENT_TIMESTAMP) as created_at,
  COALESCE(updated_at, CURRENT_TIMESTAMP) as updated_at
FROM trades
WHERE buyer_rating IS NOT NULL AND buyer_rating > 0
  AND NOT EXISTS (
    SELECT 1 FROM trade_reviews 
    WHERE trade_reviews.trade_id = trades.id 
      AND trade_reviews.reviewer_id = trades.buyer_id
      AND trade_reviews.is_followup = FALSE
  )
ON DUPLICATE KEY UPDATE updated_at = VALUES(updated_at);

INSERT INTO trade_reviews (
  trade_id, reviewer_id, rating, feedback, proof_url, 
  is_camera_photo, is_followup, is_auto_generated, created_at, updated_at
)
SELECT 
  id as trade_id,
  seller_id as reviewer_id,
  seller_rating as rating,
  seller_feedback as feedback,
  seller_proof_url as proof_url,
  seller_photo_is_camera as is_camera_photo,
  FALSE as is_followup,
  FALSE as is_auto_generated,
  COALESCE(updated_at, CURRENT_TIMESTAMP) as created_at,
  COALESCE(updated_at, CURRENT_TIMESTAMP) as updated_at
FROM trades
WHERE seller_rating IS NOT NULL AND seller_rating > 0
  AND NOT EXISTS (
    SELECT 1 FROM trade_reviews 
    WHERE trade_reviews.trade_id = trades.id 
      AND trade_reviews.reviewer_id = trades.seller_id
      AND trade_reviews.is_followup = FALSE
  )
ON DUPLICATE KEY UPDATE updated_at = VALUES(updated_at);

-- Step 5: Set initial review locks and timestamps for existing reviews
UPDATE trades t
SET 
  buyer_review_created_at = (
    SELECT created_at FROM trade_reviews tr 
    WHERE tr.trade_id = t.id AND tr.reviewer_id = t.buyer_id AND tr.is_followup = FALSE
    LIMIT 1
  ),
  buyer_initial_review_locked = TRUE
WHERE buyer_rating IS NOT NULL AND buyer_rating > 0
  AND buyer_review_created_at IS NULL;

UPDATE trades t
SET 
  seller_review_created_at = (
    SELECT created_at FROM trade_reviews tr 
    WHERE tr.trade_id = t.id AND tr.reviewer_id = t.seller_id AND tr.is_followup = FALSE
    LIMIT 1
  ),
  seller_initial_review_locked = TRUE
WHERE seller_rating IS NOT NULL AND seller_rating > 0
  AND seller_review_created_at IS NULL;

-- Step 6: Create view for getting latest review per reviewer
CREATE OR REPLACE VIEW latest_trade_review AS
SELECT 
  tr.trade_id,
  tr.reviewer_id,
  tr.id,
  tr.rating,
  tr.feedback,
  tr.proof_url,
  tr.is_camera_photo,
  tr.is_followup,
  tr.is_auto_generated,
  tr.rating_delta,
  tr.created_at,
  tr.updated_at,
  ROW_NUMBER() OVER (PARTITION BY tr.trade_id, tr.reviewer_id ORDER BY tr.created_at DESC) as rn
FROM trade_reviews tr;

-- Migration completed successfully
-- Next steps:
-- 1. Deploy this SQL
-- 2. Update Trade model in models.go
-- 3. Update CompleteTrade handler
-- 4. Implement auto-completion scheduler
-- 5. Update frontend ReviewTab component
