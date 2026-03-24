-- Add meetup time field to trades table
ALTER TABLE trades
  ADD COLUMN meetup_time VARCHAR(50) NULL AFTER meetup_location COMMENT 'Meetup time in HH:MM format (24-hour)';

-- Add index for meetup scheduling queries
CREATE INDEX idx_trades_meetup_schedule ON trades (meetup_location, meetup_time) WHERE meetup_location IS NOT NULL AND meetup_time IS NOT NULL;
