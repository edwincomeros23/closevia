-- Update Products Table Schema for Barter-First Marketplace
-- Run this file to update the existing database structure

USE clovia;

-- Add new columns to products table
ALTER TABLE products 
ADD COLUMN allow_buying BOOLEAN DEFAULT FALSE AFTER premium,
ADD COLUMN barter_only BOOLEAN DEFAULT TRUE AFTER allow_buying,
ADD COLUMN location VARCHAR(255) AFTER barter_only;

-- Update existing products to have default values
UPDATE products SET 
    allow_buying = TRUE,
    barter_only = FALSE,
    location = 'Unknown'
WHERE id > 0;

-- Create indexes for new columns
CREATE INDEX idx_products_allow_buying ON products(allow_buying);
CREATE INDEX idx_products_barter_only ON products(barter_only);
CREATE INDEX idx_products_location ON products(location);

-- Add sample data with new fields
INSERT INTO products (title, description, price, image_url, seller_id, premium, allow_buying, barter_only, location, status) VALUES
('Vintage Camera', 'Beautiful vintage camera in excellent condition. Looking for electronics or books in exchange.', NULL, 'https://example.com/camera.jpg', 1, FALSE, FALSE, TRUE, 'New York, NY', 'available'),
('Guitar Lessons', 'Professional guitar lessons. Will trade for photography services or home repair work.', NULL, 'https://example.com/guitar.jpg', 2, FALSE, FALSE, TRUE, 'Los Angeles, CA', 'available'),
('Handmade Jewelry', 'Unique handmade jewelry pieces. Accepting cash or trade for art supplies.', 150.00, 'https://example.com/jewelry.jpg', 1, TRUE, TRUE, FALSE, 'Chicago, IL', 'available'),
('Bicycle', 'Mountain bike in good condition. Looking for laptop or tablet in exchange.', NULL, 'https://example.com/bike.jpg', 2, FALSE, FALSE, TRUE, 'Miami, FL', 'available'),
('Web Design Services', 'Professional web design services. Will trade for graphic design or marketing services.', NULL, 'https://example.com/webdesign.jpg', 1, FALSE, FALSE, TRUE, 'Seattle, WA', 'available');
