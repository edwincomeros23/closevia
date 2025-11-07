-- Migration: Add saved_products table for user watchlist functionality
-- Created: 2025-01-15

-- Create saved_products table
CREATE TABLE IF NOT EXISTS saved_products (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    product_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    -- Foreign key constraints
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    
    -- Unique constraint to prevent duplicate saves
    UNIQUE KEY unique_user_product (user_id, product_id),
    
    -- Indexes for better performance
    INDEX idx_user_id (user_id),
    INDEX idx_product_id (product_id),
    INDEX idx_created_at (created_at)
);

-- Add soft delete support
ALTER TABLE saved_products ADD COLUMN deleted_at TIMESTAMP NULL DEFAULT NULL;
ALTER TABLE saved_products ADD INDEX idx_deleted_at (deleted_at);
