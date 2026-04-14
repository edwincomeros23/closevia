-- URGENT: Quick fix for cancel trade 500 errors
-- Compatible with MySQL 5.7+ (no IF NOT EXISTS in ALTER TABLE)

-- Add cancellation tracking columns one by one
-- If a column already exists, it will error but that's okay - just move to the next one

ALTER TABLE trades ADD COLUMN cancellation_reason VARCHAR(255) NULL COMMENT 'Reason provided when cancelling the trade';
ALTER TABLE trades ADD COLUMN cancelled_by INT NULL COMMENT 'User ID of who cancelled the trade';
ALTER TABLE trades ADD COLUMN cancelled_at TIMESTAMP NULL COMMENT 'Timestamp when trade was cancelled';
ALTER TABLE trades ADD COLUMN cancelled_while_active BOOLEAN DEFAULT FALSE COMMENT 'Whether trade was cancelled while in active/accepted status';

-- Add foreign key constraint (ignore if already exists)
ALTER TABLE trades ADD CONSTRAINT fk_trades_cancelled_by 
FOREIGN KEY (cancelled_by) REFERENCES users(id) ON DELETE SET NULL;

-- Add indexes (ignore if already exists)
CREATE INDEX idx_trades_cancelled_by ON trades(cancelled_by, cancelled_at);

-- Verify the columns were created
SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
AND TABLE_NAME = 'trades'
AND COLUMN_NAME IN ('cancellation_reason', 'cancelled_by', 'cancelled_at', 'cancelled_while_active')
ORDER BY ORDINAL_POSITION;
