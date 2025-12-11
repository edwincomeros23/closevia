-- Fix: Add missing delivery state columns to trades table
-- Run this directly on your production database
-- Safe to run multiple times - ignores errors for existing columns

USE clovia; -- Change this to your actual database name

-- Add delivery state columns (ignore errors if they already exist)
ALTER TABLE trades ADD COLUMN delivery_type VARCHAR(20) NULL DEFAULT 'standard';
ALTER TABLE trades ADD COLUMN payment_method VARCHAR(20) NULL DEFAULT 'gcash';
ALTER TABLE trades ADD COLUMN payment_confirmed BOOLEAN DEFAULT FALSE;
ALTER TABLE trades ADD COLUMN proof_of_delivery LONGTEXT NULL;
ALTER TABLE trades ADD COLUMN buyer_confirmed_receipt BOOLEAN DEFAULT FALSE;
ALTER TABLE trades ADD COLUMN seller_confirmed_delivery BOOLEAN DEFAULT FALSE;

-- Create indexes (ignore if they already exist)
CREATE INDEX idx_trades_delivery_type ON trades (delivery_type);
CREATE INDEX idx_trades_payment_confirmed ON trades (payment_confirmed);

-- Verify the columns were added
SELECT
    COLUMN_NAME,
    COLUMN_TYPE,
    IS_NULLABLE,
    COLUMN_DEFAULT
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
AND TABLE_NAME = 'trades'
AND COLUMN_NAME IN (
    'delivery_type',
    'payment_method',
    'payment_confirmed',
    'proof_of_delivery',
    'buyer_confirmed_receipt',
    'seller_confirmed_delivery'
)
ORDER BY ORDINAL_POSITION;
