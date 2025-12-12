-- Add delivery state fields to trades table for persistence
-- Safe to run multiple times - will skip if columns already exist

-- Add delivery_type column
SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'trades'
     AND COLUMN_NAME = 'delivery_type') = 0,
    'ALTER TABLE trades ADD COLUMN delivery_type VARCHAR(20) NULL DEFAULT \'standard\' AFTER trade_option',
    'SELECT "Column delivery_type already exists"'
));
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add payment_method column
SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'trades'
     AND COLUMN_NAME = 'payment_method') = 0,
    'ALTER TABLE trades ADD COLUMN payment_method VARCHAR(20) NULL DEFAULT \'gcash\' AFTER delivery_type',
    'SELECT "Column payment_method already exists"'
));
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add payment_confirmed column
SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'trades'
     AND COLUMN_NAME = 'payment_confirmed') = 0,
    'ALTER TABLE trades ADD COLUMN payment_confirmed BOOLEAN DEFAULT FALSE AFTER payment_method',
    'SELECT "Column payment_confirmed already exists"'
));
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add proof_of_delivery column
SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'trades'
     AND COLUMN_NAME = 'proof_of_delivery') = 0,
    'ALTER TABLE trades ADD COLUMN proof_of_delivery LONGTEXT NULL AFTER payment_confirmed',
    'SELECT "Column proof_of_delivery already exists"'
));
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add buyer_confirmed_receipt column
SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'trades'
     AND COLUMN_NAME = 'buyer_confirmed_receipt') = 0,
    'ALTER TABLE trades ADD COLUMN buyer_confirmed_receipt BOOLEAN DEFAULT FALSE AFTER proof_of_delivery',
    'SELECT "Column buyer_confirmed_receipt already exists"'
));
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add seller_confirmed_delivery column
SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'trades'
     AND COLUMN_NAME = 'seller_confirmed_delivery') = 0,
    'ALTER TABLE trades ADD COLUMN seller_confirmed_delivery BOOLEAN DEFAULT FALSE AFTER buyer_confirmed_receipt',
    'SELECT "Column seller_confirmed_delivery already exists"'
));
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Create indexes (only if they don't exist)
CREATE INDEX IF NOT EXISTS idx_trades_delivery_type ON trades (delivery_type);
CREATE INDEX IF NOT EXISTS idx_trades_payment_confirmed ON trades (payment_confirmed);
