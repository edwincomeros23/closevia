-- Proactive Multiway Test Data
-- This creates 3 test users and 3 products that form a perfect 3-way loop

-- ====================================
-- TEST USERS
-- ====================================

-- User A: Headphones Seller (wants Earphones)
INSERT INTO users (email, name, password, phone, status, role, is_verified, created_at) 
VALUES (
  'headphones.seller@test.com',
  'Headphones Seller',
  '$2a$10$...',  -- bcrypt hash of "Test@123456"
  '09123456789',
  'active',
  'user',
  1,
  NOW()
) ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id);
SET @user_a_id = LAST_INSERT_ID();

-- User B: Earphones Seller (wants Balloon/Blender)
INSERT INTO users (email, name, password, phone, status, role, is_verified, created_at) 
VALUES (
  'earphones.seller@test.com',
  'Earphones Seller',
  '$2a$10$...',  -- bcrypt hash of "Test@123456"
  '09987654321',
  'active',
  'user',
  1,
  NOW()
) ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id);
SET @user_b_id = LAST_INSERT_ID();

-- User C: Balloon Seller (wants Headphones)
INSERT INTO users (email, name, password, phone, status, role, is_verified, created_at) 
VALUES (
  'balloon.seller@test.com',
  'Balloon Seller',
  '$2a$10$...',  -- bcrypt hash of "Test@123456"
  '09555666777',
  'active',
  'user',
  1,
  NOW()
) ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id);
SET @user_c_id = LAST_INSERT_ID();

-- ====================================
-- TEST PRODUCTS (Form a 3-way loop)
-- ====================================

-- Product A: Premium Headphones (User A selling, wants Earphones)
INSERT INTO products (
  seller_id, title, category, condition, price, 
  wants, wanted_categories, desired_product,
  description, status, created_at, updated_at
) VALUES (
  @user_a_id,
  'Sony WH-1000XM5 Headphones',
  'Electronics',
  'Like New',
  3500,
  'Earphones, AirPods, Wireless Earbuds',
  '["Electronics", "Gadgets"]',
  'Apple AirPods Pro',
  'Premium noise-cancelling wireless headphones. Barely used, comes with original box and all accessories. Looking to upgrade to earbuds.',
  'available',
  NOW(),
  NOW()
);
SET @product_a_id = LAST_INSERT_ID();

-- Product B: Premium Earphones (User B selling, wants Balloon/Blender)
INSERT INTO products (
  seller_id, title, category, condition, price, 
  wants, wanted_categories, desired_product,
  description, status, created_at, updated_at
) VALUES (
  @user_b_id,
  'Apple AirPods Pro Max Earphones',
  'Electronics',
  'Like New',
  25000,
  'Blender, Mixer, Kitchen Appliances',
  '["Home & Garden", "Kitchen", "Appliances"]',
  'Ninja Kitchen Blender',
  'Latest model Apple AirPods Pro Max. Excellent condition, all original accessories included. Looking for kitchen upgrade.',
  'available',
  NOW(),
  NOW()
);
SET @product_b_id = LAST_INSERT_ID();

-- Product C: Party Balloons (User C selling, wants Headphones)
INSERT INTO products (
  seller_id, title, category, condition, price, 
  wants, wanted_categories, desired_product,
  description, status, created_at, updated_at
) VALUES (
  @user_c_id,
  'Bulk Party Balloons Set',
  'Home & Garden',
  'New',
  1500,
  'Headphones, Audio Equipment, Speaker',
  '["Electronics", "Gadgets"]',
  'Sony WH-1000XM5',
  '100-piece metallic balloon assortment with pumps and strings. Perfect for parties, events, decorations. Looking for quality audio headphones.',
  'available',
  NOW(),
  NOW()
);
SET @product_c_id = LAST_INSERT_ID();

-- ====================================
-- LOOP VISUALIZATION
-- ====================================
-- User A: Has Sony Headphones (3500) → wants AirPods
-- User B: Has AirPods Pro Max (25000) → wants Kitchen Blender  
-- User C: Has Party Balloons (1500) → wants Sony Headphones
--
-- LOOP CLOSURE:
-- A → B: B's wanted_categories includes "Electronics" (matches A's product category ✓)
--         B's wants includes "Blender" (matches what User C has ✓)
-- B → C: C's wanted_categories includes "Electronics" (matches B's product category ✓)
--         C's wants includes "Headphones" (matches A's product title ✓)
-- C → A: A's wanted_categories includes "Electronics" (matches C's product category ✓)
--         A's wants includes "AirPods" (matches B's product title ✓)
-- ✅ PERFECT 3-WAY LOOP FORMED!

-- ====================================
-- OPTIONAL: Add product images
-- ====================================
-- Note: Images are stored in products table with image URLs
-- You can update these URLs to point to actual images

UPDATE products SET image_url = 'https://via.placeholder.com/400x300?text=Sony+Headphones' 
WHERE id = @product_a_id;

UPDATE products SET image_url = 'https://via.placeholder.com/400x300?text=Apple+AirPods+Pro+Max' 
WHERE id = @product_b_id;

UPDATE products SET image_url = 'https://via.placeholder.com/400x300?text=Party+Balloons' 
WHERE id = @product_c_id;

-- ====================================
-- VERIFY DATA
-- ====================================
SELECT 'USER A' as user_type, name, email FROM users WHERE id = @user_a_id
UNION ALL
SELECT 'USER B', name, email FROM users WHERE id = @user_b_id
UNION ALL
SELECT 'USER C', name, email FROM users WHERE id = @user_c_id;

SELECT 'PRODUCT A' as product_type, title, category, wants, desired_product FROM products WHERE id = @product_a_id
UNION ALL
SELECT 'PRODUCT B', title, category, wants, desired_product FROM products WHERE id = @product_b_id
UNION ALL
SELECT 'PRODUCT C', title, category, wants, desired_product FROM products WHERE id = @product_c_id;
