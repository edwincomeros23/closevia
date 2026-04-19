-- Add location_type column to products table
-- Values: 'current_location', 'pickup_location', 'no_location'
-- This determines whether the product has a fixed pickup location or users must meet anywhere

ALTER TABLE products 
ADD COLUMN location_type VARCHAR(20) DEFAULT 'no_location' 
AFTER location;

-- Create index for faster queries
CREATE INDEX idx_products_location_type ON products(location_type);
