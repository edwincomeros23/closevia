-- Optimize products queries to reduce connection pool exhaustion

-- 1. Index on seller_id for user joins
ALTER TABLE products ADD INDEX idx_seller_id (seller_id);

-- 2. Index on target_product_id for trades subquery
ALTER TABLE trades ADD INDEX idx_target_product_id (target_product_id, status);

-- 3. Index on product_id for wishlists count
ALTER TABLE wishlists ADD INDEX idx_product_id (product_id);

-- 4. Composite index for verified sellers
ALTER TABLE users ADD INDEX idx_verified_tier (verified, premium_tier);

-- 5. Index for status filtering (most common filter)
ALTER TABLE products ADD INDEX idx_status_created (status, created_at DESC);

-- 6. Index for boosted products (used in sorting)
ALTER TABLE products ADD INDEX idx_boosted_at (boosted_at DESC);

-- 7. Index for category filtering
ALTER TABLE products ADD INDEX idx_category (category);

-- 8. Composite index for organization tag queries
ALTER TABLE product_organization_tags ADD INDEX idx_product_org (product_id, organization_id);
ALTER TABLE organizations ADD INDEX idx_deleted (is_deleted);

-- Verify indexes were created
SHOW INDEXES FROM products;
SHOW INDEXES FROM users;
SHOW INDEXES FROM trades;
SHOW INDEXES FROM wishlists;
SHOW INDEXES FROM organizations;
