-- Update Products Status Column to Support More States
-- Run this file to update the product status enum

USE clovia;

-- First, update the status column to support 'unavailable'
ALTER TABLE products MODIFY COLUMN status ENUM('available', 'unavailable') DEFAULT 'available';

-- Add a version column for optimistic locking (prevents race conditions)
ALTER TABLE products ADD COLUMN version INT DEFAULT 1 AFTER updated_at;

-- Add indexes for better performance on status queries
CREATE INDEX idx_products_status_version ON products(status, version);

-- Add a reserved_until column for temporary reservations during checkout
ALTER TABLE products ADD COLUMN reserved_until TIMESTAMP NULL AFTER version;
CREATE INDEX idx_products_reserved ON products(reserved_until);

-- Update existing products to have version 1
UPDATE products SET version = 1 WHERE version IS NULL;
