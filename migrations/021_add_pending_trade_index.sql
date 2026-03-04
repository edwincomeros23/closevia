-- Add index for efficient pending trade duplicate check
-- This index supports the query: WHERE buyer_id = ? AND target_product_id = ? AND status = 'pending'
-- Used in trade handler to prevent users from sending multiple offers on the same product

ALTER TABLE trades ADD INDEX idx_buyer_pending_product 
(buyer_id, target_product_id, status(20));

-- Additional index for seller queries (when checking incoming trades)
ALTER TABLE trades ADD INDEX idx_seller_target_status 
(seller_id, target_product_id, status(20));
