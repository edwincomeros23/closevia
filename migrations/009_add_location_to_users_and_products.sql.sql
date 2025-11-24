-- Add latitude and longitude columns to users and products tables
ALTER TABLE users
ADD COLUMN `latitude` DECIMAL(10, 8),
ADD COLUMN `longitude` DECIMAL(11, 8);

ALTER TABLE products
ADD COLUMN `latitude` DECIMAL(10, 8),
ADD COLUMN `longitude` DECIMAL(11, 8);
