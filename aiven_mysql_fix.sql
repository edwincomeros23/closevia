-- MySQL commands for Aiven database
-- Run these in your Aiven MySQL console

-- Connect to your Aiven MySQL database first
-- Then run:

ALTER TABLE trades ADD COLUMN trade_option VARCHAR(20) NULL AFTER status;
ALTER TABLE trades ADD COLUMN delivery_address TEXT NULL AFTER trade_option;

-- Optional: Create index for better query performance
CREATE INDEX idx_trades_trade_option ON trades (trade_option);

-- Check the table structure
DESCRIBE trades;
