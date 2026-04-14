-- URGENT: Quick fix for cancel trade 500 errors
-- Apply this directly to the Render MySQL database via SQL Editor

-- First, check if columns exist
SET @col_exists = 0;
SELECT COUNT(*) INTO @col_exists FROM information_schema.COLUMNS 
WHERE TABLE_SCHEMA = DATABASE() 
AND TABLE_NAME = 'trades' 
AND COLUMN_NAME = 'cancellation_reason';

-- Only proceed if columns don't exist
IF @col_exists = 0 THEN
  -- Add all missing cancellation tracking columns
  ALTER TABLE trades ADD COLUMN cancellation_reason VARCHAR(255) NULL COMMENT 'Reason provided when cancelling the trade';
  ALTER TABLE trades ADD COLUMN cancelled_by INT NULL COMMENT 'User ID of who cancelled the trade';
  ALTER TABLE trades ADD COLUMN cancelled_at TIMESTAMP NULL COMMENT 'Timestamp when trade was cancelled';
  ALTER TABLE trades ADD COLUMN cancelled_while_active BOOLEAN DEFAULT FALSE COMMENT 'Whether trade was cancelled while in active/accepted status (affects trust score penalty)';
  
  -- Add foreign key constraint
  ALTER TABLE trades ADD CONSTRAINT fk_trades_cancelled_by 
  FOREIGN KEY (cancelled_by) REFERENCES users(id) ON DELETE SET NULL;
  
  -- Add indexes
  CREATE INDEX idx_trades_cancelled_by ON trades(cancelled_by, cancelled_at);
  
  SELECT 'MIGRATION APPLIED: Cancellation columns added successfully' as result;
ELSE
  SELECT 'MIGRATION SKIPPED: Cancellation columns already exist' as result;
END IF;

-- Verify the columns
SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
AND TABLE_NAME = 'trades'
AND COLUMN_NAME IN ('cancellation_reason', 'cancelled_by', 'cancelled_at', 'cancelled_while_active')
ORDER BY ORDINAL_POSITION;
