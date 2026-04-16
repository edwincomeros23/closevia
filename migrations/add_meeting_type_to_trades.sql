-- Add meeting_type column to trades table to distinguish between 'meetup' and 'pickup' flows
-- Meetup: Both parties mutually agree on location
-- Pickup: Seller sets location, buyer agrees to pick up

ALTER TABLE trades ADD COLUMN meeting_type VARCHAR(20) DEFAULT 'meetup' COMMENT 'Type of meeting: meetup (mutual agreement) or pickup (seller-set location)';

-- Create index for queries
CREATE INDEX idx_trades_meeting_type ON trades(meeting_type);

-- Add comments for clarity
ALTER TABLE trades MODIFY COLUMN trade_option VARCHAR(20) COMMENT 'meetup (default for trades), delivery (buyouts only)';
