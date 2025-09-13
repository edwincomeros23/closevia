-- Manual fix for products that should be marked as sold
-- Run this to fix the current issue with products 186 and 187

USE clovia;

-- Mark products as sold that are involved in completed trades
UPDATE products 
SET status = 'sold', updated_at = CURRENT_TIMESTAMP 
WHERE id IN (
    -- Get target products from completed trades
    SELECT DISTINCT target_product_id 
    FROM trades 
    WHERE status = 'completed'
    
    UNION
    
    -- Get offered products from completed trades
    SELECT DISTINCT ti.product_id
    FROM trade_items ti
    JOIN trades t ON ti.trade_id = t.id
    WHERE t.status = 'completed'
) 
AND status = 'available';

-- Check the results
SELECT id, title, status, updated_at 
FROM products 
WHERE id IN (186, 187);
