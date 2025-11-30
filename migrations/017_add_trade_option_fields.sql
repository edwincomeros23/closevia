-- Add trade option and delivery address fields to trades table
ALTER TABLE trades
  ADD COLUMN trade_option VARCHAR(20) NULL AFTER status,
  ADD COLUMN delivery_address TEXT NULL AFTER trade_option;

-- Add index for trade_option
CREATE INDEX idx_trades_trade_option ON trades (trade_option);

-- Update existing trades to have a default trade_option if needed
-- Note: This assumes existing trades should default to 'meetup' but this should be reviewed
