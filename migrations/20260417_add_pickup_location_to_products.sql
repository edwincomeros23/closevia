-- Add pickup location fields to products
ALTER TABLE products
ADD COLUMN pickup_latitude DECIMAL(10, 8) NULL AFTER location_type,
ADD COLUMN pickup_longitude DECIMAL(11, 8) NULL AFTER pickup_latitude,
ADD COLUMN pickup_address TEXT NULL AFTER pickup_longitude;
