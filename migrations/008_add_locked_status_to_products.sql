-- Add 'locked' to the possible values for the status column in products table
ALTER TABLE products
MODIFY COLUMN `status` ENUM('available', 'sold', 'traded', 'locked') DEFAULT 'available';