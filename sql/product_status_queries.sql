-- SQL Queries for Product Status Management with Race Condition Protection
-- These queries ensure products are properly marked as unavailable after trades/sales

-- 1. SAFE PRODUCT SALE COMPLETION
-- This query atomically updates a product to unavailable status with version check
UPDATE products 
SET status = 'unavailable', 
    version = version + 1, 
    reserved_until = NULL, 
    updated_at = CURRENT_TIMESTAMP 
WHERE id = ? 
  AND version = ? 
  AND status = 'available';

-- Check if update was successful (should return 1 row affected)
-- If 0 rows affected, product was modified by another transaction

-- 2. SAFE TRADE COMPLETION (Multiple Products)
-- Lock all products involved in a trade before updating
START TRANSACTION;

-- Lock target product
SELECT status, version FROM products WHERE id = ? FOR UPDATE;

-- Lock all offered products
SELECT p.status, p.version 
FROM products p 
JOIN trade_items ti ON p.id = ti.product_id 
WHERE ti.trade_id = ? 
FOR UPDATE;

-- Update target product if available
UPDATE products 
SET status = 'unavailable', version = version + 1, updated_at = CURRENT_TIMESTAMP 
WHERE id = ? AND status = 'available';

-- Update all offered products if available
UPDATE products p
JOIN trade_items ti ON p.id = ti.product_id
SET p.status = 'unavailable', 
    p.version = p.version + 1, 
    p.updated_at = CURRENT_TIMESTAMP
WHERE ti.trade_id = ? 
  AND p.status = 'available';

-- Update trade status to completed (with additional safety check)
UPDATE trades 
SET status = 'completed', 
    completed_at = CURRENT_TIMESTAMP, 
    updated_at = CURRENT_TIMESTAMP 
WHERE id = ? 
  AND status = 'active' 
  AND buyer_completed = TRUE 
  AND seller_completed = TRUE;

COMMIT;

-- 3. PREVENT DUPLICATE TRADES ON SAME PRODUCT
-- Check if product is available before creating new trade
SELECT id, status, seller_id 
FROM products 
WHERE id = ? 
  AND status = 'available' 
FOR UPDATE;

-- Only proceed with trade creation if product is available

-- 4. CLEANUP EXPIRED RESERVATIONS
-- Remove expired product reservations (run periodically)
UPDATE products 
SET reserved_until = NULL, 
    version = version + 1, 
    updated_at = CURRENT_TIMESTAMP 
WHERE reserved_until IS NOT NULL 
  AND reserved_until < CURRENT_TIMESTAMP;

-- 5. GET TRULY AVAILABLE PRODUCTS
-- Query that returns only products that are available and not reserved
SELECT p.id, p.title, p.description, p.price, p.seller_id, 
       p.premium, p.allow_buying, p.barter_only, p.location, 
       p.created_at, p.updated_at, u.name as seller_name
FROM products p
JOIN users u ON p.seller_id = u.id
WHERE p.status = 'available' 
  AND (p.reserved_until IS NULL OR p.reserved_until < CURRENT_TIMESTAMP)
ORDER BY p.created_at DESC;

-- 6. RESERVE PRODUCT TEMPORARILY (e.g., during checkout)
UPDATE products 
SET reserved_until = DATE_ADD(CURRENT_TIMESTAMP, INTERVAL ? MINUTE),
    version = version + 1,
    updated_at = CURRENT_TIMESTAMP
WHERE id = ? 
  AND version = ?
  AND status = 'available'
  AND (reserved_until IS NULL OR reserved_until < CURRENT_TIMESTAMP);

-- 7. CHECK PRODUCT AVAILABILITY BEFORE TRADE/SALE
-- Use this query to verify product is still available
SELECT id, status, version, seller_id,
       CASE 
         WHEN reserved_until IS NOT NULL AND reserved_until > CURRENT_TIMESTAMP 
         THEN 'reserved' 
         ELSE 'available' 
       END as availability_status
FROM products 
WHERE id = ?;

-- 8. ATOMIC TRADE VALIDATION AND COMPLETION
-- Complete stored procedure approach for maximum safety
DELIMITER //
CREATE PROCEDURE CompleteTradeAtomic(IN trade_id INT)
BEGIN
    DECLARE target_product_id INT;
    DECLARE trade_status VARCHAR(20);
    DECLARE buyer_completed BOOLEAN DEFAULT FALSE;
    DECLARE seller_completed BOOLEAN DEFAULT FALSE;
    DECLARE product_count INT DEFAULT 0;
    DECLARE available_count INT DEFAULT 0;
    
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;
    
    START TRANSACTION;
    
    -- Lock and validate trade
    SELECT t.target_product_id, t.status, t.buyer_completed, t.seller_completed
    INTO target_product_id, trade_status, buyer_completed, seller_completed
    FROM trades t
    WHERE t.id = trade_id
    FOR UPDATE;
    
    -- Validate trade can be completed
    IF trade_status != 'active' OR NOT buyer_completed OR NOT seller_completed THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Trade cannot be completed';
    END IF;
    
    -- Count total products in trade
    SELECT COUNT(*) + 1 INTO product_count
    FROM trade_items ti
    WHERE ti.trade_id = trade_id;
    
    -- Count available products (target + offered)
    SELECT 
        (SELECT CASE WHEN status = 'available' THEN 1 ELSE 0 END FROM products WHERE id = target_product_id) +
        (SELECT COUNT(*) FROM products p JOIN trade_items ti ON p.id = ti.product_id 
         WHERE ti.trade_id = trade_id AND p.status = 'available')
    INTO available_count;
    
    -- All products must be available
    IF available_count != product_count THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'One or more products are no longer available';
    END IF;
    
    -- Update target product
    UPDATE products 
    SET status = 'unavailable', version = version + 1, updated_at = CURRENT_TIMESTAMP
    WHERE id = target_product_id AND status = 'available';
    
    -- Update offered products
    UPDATE products p
    JOIN trade_items ti ON p.id = ti.product_id
    SET p.status = 'unavailable', p.version = p.version + 1, p.updated_at = CURRENT_TIMESTAMP
    WHERE ti.trade_id = trade_id AND p.status = 'available';
    
    -- Complete trade
    UPDATE trades 
    SET status = 'completed', completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
    WHERE id = trade_id;
    
    COMMIT;
END //
DELIMITER ;
