-- Add meetup-related fields to trades table
ALTER TABLE trades
  ADD COLUMN meetup_location VARCHAR(500) NULL AFTER seller_feedback,
  ADD COLUMN buyer_meetup_confirmed BOOLEAN DEFAULT FALSE AFTER meetup_location,
  ADD COLUMN seller_meetup_confirmed BOOLEAN DEFAULT FALSE AFTER buyer_meetup_confirmed;

-- Add indexes for meetup fields
CREATE INDEX idx_trades_meetup_confirmed ON trades (buyer_meetup_confirmed, seller_meetup_confirmed);
