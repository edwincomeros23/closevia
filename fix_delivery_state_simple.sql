-- Quick fix for delivery state columns
-- Execute each statement individually if needed

-- Add missing columns to trades table
ALTER TABLE trades ADD COLUMN delivery_type VARCHAR(20) NULL DEFAULT 'standard';
ALTER TABLE trades ADD COLUMN payment_method VARCHAR(20) NULL DEFAULT 'gcash';
ALTER TABLE trades ADD COLUMN payment_confirmed BOOLEAN DEFAULT FALSE;
ALTER TABLE trades ADD COLUMN proof_of_delivery LONGTEXT NULL;
ALTER TABLE trades ADD COLUMN buyer_confirmed_receipt BOOLEAN DEFAULT FALSE;
ALTER TABLE trades ADD COLUMN seller_confirmed_delivery BOOLEAN DEFAULT FALSE;

-- Verify columns exist
DESCRIBE trades;
