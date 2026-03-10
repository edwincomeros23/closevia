-- Migration: Add Fraud Detection Columns
-- Run this migration to add fraud detection tracking to your database

-- Add fraud detection columns to products table
ALTER TABLE products ADD COLUMN fraud_risk_level VARCHAR(50) DEFAULT NULL;
ALTER TABLE products ADD COLUMN fraud_probability FLOAT DEFAULT NULL;
ALTER TABLE products ADD COLUMN last_fraud_check_at TIMESTAMP DEFAULT NULL;

-- Add fraud detection columns to trades table  
ALTER TABLE trades ADD COLUMN fraud_risk_level VARCHAR(50) DEFAULT NULL;
ALTER TABLE trades ADD COLUMN fraud_probability FLOAT DEFAULT NULL;
ALTER TABLE trades ADD COLUMN last_fraud_check_at TIMESTAMP DEFAULT NULL;

-- Create an index for quick fraud lookups
CREATE INDEX idx_fraud_risk_level ON products(fraud_risk_level);
CREATE INDEX idx_fraud_probability ON products(fraud_probability DESC);

-- Optional: Create a fraud audit table for compliance
CREATE TABLE IF NOT EXISTS fraud_audit_log (
    id INT AUTO_INCREMENT PRIMARY KEY,
    product_id INT,
    trade_id INT,
    user_id INT,
    fraud_probability FLOAT,
    risk_level VARCHAR(50),
    action_taken VARCHAR(255),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL,
    FOREIGN KEY (trade_id) REFERENCES trades(id) ON DELETE SET NULL,
    
    INDEX idx_user_id (user_id),
    INDEX idx_fraud_probability (fraud_probability),
    INDEX idx_risk_level (risk_level),
    INDEX idx_created_at (created_at)
);

-- Optional: View for fraud monitoring dashboard
CREATE OR REPLACE VIEW fraud_monitoring_dashboard AS
SELECT 
    DATE(created_at) as date,
    COUNT(*) as total_listings,
    SUM(CASE WHEN fraud_risk_level = 'high' THEN 1 ELSE 0 END) as high_risk_count,
    SUM(CASE WHEN fraud_risk_level = 'medium' THEN 1 ELSE 0 END) as medium_risk_count,
    AVG(fraud_probability) as avg_fraud_probability,
    MAX(fraud_probability) as max_fraud_probability
FROM products
WHERE last_fraud_check_at IS NOT NULL
GROUP BY DATE(created_at)
ORDER BY date DESC;

-- Optional: View for flagged products
CREATE OR REPLACE VIEW flagged_products_view AS
SELECT 
    p.id,
    p.title,
    p.seller_id,
    u.name as seller_name,
    p.price,
    p.fraud_risk_level,
    p.fraud_probability,
    p.created_at,
    p.last_fraud_check_at
FROM products p
LEFT JOIN users u ON p.seller_id = u.id
WHERE fraud_probability IS NOT NULL 
  AND fraud_probability > 0.5
ORDER BY fraud_probability DESC;

-- Add helpful comment to tables
ALTER TABLE products MODIFY COLUMN fraud_risk_level VARCHAR(50) COMMENT 'Risk level: low, medium, high (from fraud detection ML model)';
ALTER TABLE products MODIFY COLUMN fraud_probability FLOAT COMMENT 'Fraud probability from 0.0 to 1.0';

-- Migration completed successfully!
SELECT 'Fraud detection migration completed successfully!' as status;
