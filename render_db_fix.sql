-- Run these commands in your Aiven MySQL database console

ALTER TABLE trades ADD COLUMN trade_option VARCHAR(20) NULL AFTER status;
ALTER TABLE trades ADD COLUMN delivery_address TEXT NULL AFTER trade_option;

-- Verify the columns were added
DESCRIBE trades;
