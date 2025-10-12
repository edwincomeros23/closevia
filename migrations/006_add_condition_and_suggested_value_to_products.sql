-- Add condition and suggested_value columns to products table
ALTER TABLE products
ADD COLUMN `condition` VARCHAR(255) DEFAULT 'Used',
ADD COLUMN `suggested_value` INT DEFAULT 0;