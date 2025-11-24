-- Migration: Add image_urls column to products table for multiple images
ALTER TABLE products ADD COLUMN image_urls JSON NULL;

-- Optional: Migrate existing image_url data to image_urls as a single-item array
UPDATE products SET image_urls = JSON_ARRAY(image_url) WHERE image_url IS NOT NULL;

-- Optional: Remove old image_url column if no longer needed
-- ALTER TABLE products DROP COLUMN image_url;
