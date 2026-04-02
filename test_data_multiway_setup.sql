-- ========================================================================
-- MULTIWAY LOOP TEST DATA
-- Complete test scenario with 3 products forming a perfect loop
-- ========================================================================

-- User IDs (using existing users or creating new ones)
-- User 100: TestAlice (has iPhone, wants MacBook)
-- User 101: TestBob (has MacBook, wants PS5)
-- User 102: TestCharlie (has PS5, wants iPhone)

-- ========================================================================
-- 1. CREATE TEST USERS (if they don't exist)
-- ========================================================================
INSERT INTO users (id, name, email, email_verified_at, password, slug, bio, avatar, location, is_premium, created_at, updated_at)
VALUES 
  (100, 'Test Alice', 'alice@test.local', NOW(), '$2y$10$test', 'test-alice', 'Test user Alice', 'https://i.pravatar.cc/150?img=1', 'Test City', 1, NOW(), NOW()),
  (101, 'Test Bob', 'bob@test.local', NOW(), '$2y$10$test', 'test-bob', 'Test user Bob', 'https://i.pravatar.cc/150?img=2', 'Test City', 1, NOW(), NOW()),
  (102, 'Test Charlie', 'charlie@test.local', NOW(), '$2y$10$test', 'test-charlie', 'Test user Charlie', 'https://i.pravatar.cc/150?img=3', 'Test City', 1, NOW(), NOW())
ON DUPLICATE KEY UPDATE updated_at=NOW();

-- ========================================================================
-- 2. CREATE TEST PRODUCTS
-- ========================================================================

-- Product 1: iPhone (Alice's product)
-- She wants: MacBook, laptop
INSERT INTO products (seller_id, title, slug, description, category, price, wants, wanted_categories, desired_product, image, status, condition, created_at, updated_at)
VALUES (
  100,
  'iPhone 15 Pro Max - Test',
  'iphone-15-pro-max-test-' || UNIX_TIMESTAMP(),
  'Brand new iPhone 15 Pro Max, sealed in box. Perfect condition, ready to trade.',
  'Electronics',
  75000,
  'MacBook Pro, MacBook Air, laptop, computer',
  '["Electronics", "Computers"]',
  'MacBook',
  'https://images.unsplash.com/photo-1592286927505-1def25115558?w=500&q=80',
  'available',
  'new',
  NOW(),
  NOW()
)
ON DUPLICATE KEY UPDATE updated_at=NOW();

-- Product 2: MacBook (Bob's product)
-- He wants: PS5, gaming console, PlayStation
INSERT INTO products (seller_id, title, slug, description, category, price, wants, wanted_categories, desired_product, image, status, condition, created_at, updated_at)
VALUES (
  101,
  'MacBook Pro 14 M3 Max - Test',
  'macbook-pro-14-m3-max-test-' || UNIX_TIMESTAMP(),
  'MacBook Pro 14-inch with M3 Max chip. Excellent condition, barely used.',
  'Electronics',
  120000,
  'PS5, PlayStation 5, gaming console, Xbox, PS5 Console',
  '["Electronics", "Gaming"]',
  'PS5',
  'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=500&q=80',
  'available',
  'like_new',
  NOW(),
  NOW()
)
ON DUPLICATE KEY UPDATE updated_at=NOW();

-- Product 3: PlayStation 5 (Charlie's product)
-- He wants: iPhone, phone, mobile
INSERT INTO products (seller_id, title, slug, description, category, price, wants, wanted_categories, desired_product, image, status, condition, created_at, updated_at)
VALUES (
  102,
  'PlayStation 5 Console - Test',
  'playstation-5-console-test-' || UNIX_TIMESTAMP(),
  'PS5 Console with 2 controllers and Astro\'s Playroom. Fully functional, like new condition.',
  'Electronics',
  35000,
  'iPhone, iPhone 15, iPhone 15 Pro, phone, mobile, smartphone',
  '["Electronics", "Mobile Phones"]',
  'iPhone',
  'https://images.unsplash.com/photo-1607623814075-e51df1bdc82f?w=500&q=80',
  'available',
  'like_new',
  NOW(),
  NOW()
)
ON DUPLICATE KEY UPDATE updated_at=NOW();

-- ========================================================================
-- 3. VERIFY DATA WAS INSERTED
-- ========================================================================
SELECT 'Products Created:' as Status;
SELECT 
  id, 
  seller_id, 
  title, 
  price, 
  wants, 
  desired_product, 
  status,
  (SELECT name FROM users WHERE id = products.seller_id) as seller_name
FROM products 
WHERE seller_id IN (100, 101, 102)
ORDER BY seller_id;

SELECT '' as '';
SELECT 'Prices Added:' as Status;
SELECT 
  (SELECT name FROM users WHERE id = 100) as alice, 
  75000 as iphone_price,
  (SELECT name FROM users WHERE id = 101) as bob,
  120000 as macbook_price,
  (SELECT name FROM users WHERE id = 102) as charlie,
  35000 as ps5_price;

SELECT '' as '';
SELECT 'Expected Loop:' as Status;
SELECT 'Alice (iPhone 75K) → wants → MacBook (Bob 120K)' as step1
UNION ALL
SELECT 'Bob (MacBook 120K) → wants → PS5 (Charlie 35K)' as step1
UNION ALL
SELECT 'Charlie (PS5 35K) → wants → iPhone (Alice 75K)' as step1;

-- ========================================================================
-- SUMMARY
-- ========================================================================
SELECT '' as '';
SELECT '✓ TEST DATA READY FOR MULTIWAY DETECTION' as Status;
SELECT 'Users: Alice (100), Bob (101), Charlie (102)' as Info
UNION ALL
SELECT 'Alice has iPhone (75K), wants MacBook'
UNION ALL
SELECT 'Bob has MacBook (120K), wants PS5'
UNION ALL
SELECT 'Charlie has PS5 (35K), wants iPhone'
UNION ALL
SELECT ''
UNION ALL
SELECT 'To test: Create a trade from Alice wanting MacBook from Bob'
UNION ALL
SELECT 'Expected: System detects Charlie as User3 and creates multiway loop';
