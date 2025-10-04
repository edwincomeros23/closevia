-- Fix the products table schema to support unavailable status
USE closevia;

-- Update the status column to support 'unavailable'
ALTER TABLE products MODIFY COLUMN status ENUM('available', 'sold', 'unavailable') DEFAULT 'available';

-- Add version column for optimistic locking if it doesn't exist
ALTER TABLE products ADD COLUMN IF NOT EXISTS version INT DEFAULT 1 AFTER updated_at;

-- Add reserved_until column if it doesn't exist  
ALTER TABLE products ADD COLUMN IF NOT EXISTS reserved_until TIMESTAMP NULL AFTER version;

-- Update existing products to have version 1
UPDATE products SET version = 1 WHERE version IS NULL;

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_products_status_version ON products(status, version);
CREATE INDEX IF NOT EXISTS idx_products_reserved ON products(reserved_until);
