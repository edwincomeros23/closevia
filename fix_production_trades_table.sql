-- Fix production trades table by adding missing columns
-- Run this on your Aiven MySQL database

-- Add trade_option column (required for meetup vs delivery selection)
ALTER TABLE trades ADD COLUMN trade_option VARCHAR(20) NULL AFTER status;

-- Add delivery_address column (required for delivery trades)
ALTER TABLE trades ADD COLUMN delivery_address TEXT NULL AFTER trade_option;

-- Optional: Add indexes for better performance
CREATE INDEX idx_trades_trade_option ON trades (trade_option);

-- Optional: Update existing trades to have a default trade_option
-- Uncomment the line below if you want to set existing trades to 'meetup' by default
-- UPDATE trades SET trade_option = 'meetup' WHERE trade_option IS NULL AND status IN ('pending', 'accepted', 'active');

-- Verify the changes
DESCRIBE trades;
