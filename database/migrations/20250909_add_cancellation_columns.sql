-- Migration: Add cancellation tracking columns to trades table
-- This migration adds support for tracking trade cancellations with reasons,
-- timestamps, and penalty tracking for cancelled-while-active trades.

ALTER TABLE trades ADD COLUMN IF NOT EXISTS cancellation_reason VARCHAR(255) NULL COMMENT 'Reason provided when cancelling the trade';

ALTER TABLE trades ADD COLUMN IF NOT EXISTS cancelled_by INT NULL COMMENT 'User ID of who cancelled the trade';

ALTER TABLE trades ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP NULL COMMENT 'Timestamp when trade was cancelled';

ALTER TABLE trades ADD COLUMN IF NOT EXISTS cancelled_while_active BOOLEAN DEFAULT FALSE COMMENT 'Whether trade was cancelled while in active/accepted status (affects trust score penalty)';

-- Add foreign key constraint for cancelled_by if not exists
ALTER TABLE trades ADD CONSTRAINT fk_trades_cancelled_by 
FOREIGN KEY (cancelled_by) REFERENCES users(id) ON DELETE SET NULL;

-- Add index for cancellation queries
CREATE INDEX IF NOT EXISTS idx_trades_cancelled_by ON trades(cancelled_by, cancelled_at);

-- Verify columns were created
SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
AND TABLE_NAME = 'trades'
AND COLUMN_NAME IN ('cancellation_reason', 'cancelled_by', 'cancelled_at', 'cancelled_while_active')
ORDER BY ORDINAL_POSITION;
