-- Add review and proof fields to trades table
ALTER TABLE trades
  ADD COLUMN buyer_rating INT NULL AFTER seller_feedback,
  ADD COLUMN seller_rating INT NULL AFTER buyer_rating,
  ADD COLUMN buyer_feedback TEXT NULL AFTER seller_rating,
  ADD COLUMN seller_feedback TEXT NULL AFTER buyer_feedback,
  ADD COLUMN buyer_proof_url VARCHAR(500) NULL AFTER seller_feedback,
  ADD COLUMN seller_proof_url VARCHAR(500) NULL AFTER buyer_proof_url;

-- Add constraints for ratings (1-5)
ALTER TABLE trades ADD CONSTRAINT check_buyer_rating CHECK (buyer_rating IS NULL OR (buyer_rating >= 1 AND buyer_rating <= 5));
ALTER TABLE trades ADD CONSTRAINT check_seller_rating CHECK (seller_rating IS NULL OR (seller_rating >= 1 AND seller_rating <= 5));
