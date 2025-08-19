-- Clovia Database Schema
-- Run this file to create the initial database structure

CREATE DATABASE IF NOT EXISTS clovia;
USE clovia;

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Products table
CREATE TABLE IF NOT EXISTS products (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    price DECIMAL(10,2) NOT NULL,
    image_url VARCHAR(500),
    seller_id INT NOT NULL,
    premium BOOLEAN DEFAULT FALSE,
    status ENUM('available', 'sold') DEFAULT 'available',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (seller_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Orders table
CREATE TABLE IF NOT EXISTS orders (
    id INT AUTO_INCREMENT PRIMARY KEY,
    product_id INT NOT NULL,
    buyer_id INT NOT NULL,
    status ENUM('pending', 'completed', 'cancelled') DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    FOREIGN KEY (buyer_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Transactions table
CREATE TABLE IF NOT EXISTS transactions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    order_id INT NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    payment_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);

-- Premium listings table
CREATE TABLE IF NOT EXISTS premium_listings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    product_id INT NOT NULL,
    start_date TIMESTAMP NOT NULL,
    end_date TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

-- Create indexes for better performance
CREATE INDEX idx_products_seller ON products(seller_id);
CREATE INDEX idx_products_status ON products(status);
CREATE INDEX idx_products_premium ON products(premium);
CREATE INDEX idx_orders_buyer ON orders(buyer_id);
CREATE INDEX idx_orders_product ON orders(product_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_transactions_order ON transactions(order_id);
CREATE INDEX idx_premium_listings_product ON premium_listings(product_id);
CREATE INDEX idx_premium_listings_dates ON premium_listings(start_date, end_date);

-- Insert sample data for testing
INSERT INTO users (name, email, password_hash, verified) VALUES
('John Doe', 'john@example.com', '$2a$10$example.hash.here', TRUE),
('Jane Smith', 'jane@example.com', '$2a$10$example.hash.here', TRUE);

INSERT INTO products (title, description, price, image_url, seller_id, premium, status) VALUES
('iPhone 13 Pro', 'Excellent condition iPhone 13 Pro, 256GB, Space Gray', 899.99, 'https://example.com/iphone.jpg', 1, TRUE, 'available'),
('MacBook Air M1', 'MacBook Air with M1 chip, 8GB RAM, 256GB SSD', 999.99, 'https://example.com/macbook.jpg', 2, FALSE, 'available'),
('Sony WH-1000XM4', 'Wireless noise-canceling headphones', 299.99, 'https://example.com/sony.jpg', 1, FALSE, 'available');
