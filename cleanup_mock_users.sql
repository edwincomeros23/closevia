-- ============================================================================
-- CLEANUP: k6 performance-test "Performance Test User" rows
-- ============================================================================
-- Source of the rows: closevia/clovia-performance-test.js
--   - Name:  'Performance Test User'  (clovia-performance-test.js:167)
--   - Email: 'testuser-<ms>-<rand>@test.com'  (clovia-performance-test.js:65)
--   - All rows are created via POST /auth/register and remain verified=false
--     because k6 never runs the OTP flow.
--
-- Identification rule (BOTH must match — defense in depth):
--   name  = 'Performance Test User'
--   email LIKE 'testuser-%@test.com'
--   verified = 0           -- never verified
--   role  = 'user'         -- never an admin
--
-- ⚠️  PRODUCTION SAFETY:
--   1. Run the DRY-RUN block first and confirm the counts look right
--      (~3,000-3,300 rows on the screenshot you sent).
--   2. The DELETE block is wrapped in a TRANSACTION. After the deletes run,
--      review the row-counts that come back. If anything looks wrong, run
--      ROLLBACK; otherwise run COMMIT.
--   3. Take a backup/snapshot of the hosted DB before running the COMMIT.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- STEP 1 — DRY RUN (read-only). Run this first and inspect.
-- ----------------------------------------------------------------------------

-- 1a. How many users will be targeted?
SELECT COUNT(*) AS will_delete_users
FROM users
WHERE name = 'Performance Test User'
  AND email LIKE 'testuser-%@test.com'
  AND verified = 0
  AND role = 'user';

-- 1b. Sanity check: any matching row that is NOT one of those things?
--     (Should return 0. If it returns >0, STOP and inspect — don't run DELETE.)
SELECT COUNT(*) AS suspicious_matches
FROM users
WHERE name = 'Performance Test User'
  AND email LIKE 'testuser-%@test.com'
  AND (verified = 1 OR role <> 'user');

-- 1c. Show 10 sample rows so you can eyeball them
SELECT id, name, email, verified, role, created_at
FROM users
WHERE name = 'Performance Test User'
  AND email LIKE 'testuser-%@test.com'
  AND verified = 0
  AND role = 'user'
ORDER BY id DESC
LIMIT 10;

-- 1d. How much downstream data will get cascaded?
SELECT
  (SELECT COUNT(*) FROM products       WHERE seller_id IN (SELECT id FROM users WHERE name='Performance Test User' AND email LIKE 'testuser-%@test.com' AND verified=0 AND role='user')) AS products_to_delete,
  (SELECT COUNT(*) FROM trades         WHERE buyer_id  IN (SELECT id FROM users WHERE name='Performance Test User' AND email LIKE 'testuser-%@test.com' AND verified=0 AND role='user')
                                          OR seller_id IN (SELECT id FROM users WHERE name='Performance Test User' AND email LIKE 'testuser-%@test.com' AND verified=0 AND role='user')) AS trades_to_delete,
  (SELECT COUNT(*) FROM notifications  WHERE user_id   IN (SELECT id FROM users WHERE name='Performance Test User' AND email LIKE 'testuser-%@test.com' AND verified=0 AND role='user')) AS notifications_to_delete;


-- ----------------------------------------------------------------------------
-- STEP 2 — DELETE (transactional). Only run after STEP 1 looks correct.
-- ----------------------------------------------------------------------------
-- This mirrors the explicit cleanup that handlers/user_handler.go DeleteUser
-- does for a single user — replicated here in case the hosted DB is missing
-- some ON DELETE CASCADE constraints (we already know the hosted schema
-- diverges from local in places).
-- ----------------------------------------------------------------------------

START TRANSACTION;

-- Stage the target IDs into a temporary table (faster than re-running the
-- WHERE on every DELETE, and locks the set so it can't drift mid-transaction).
DROP TEMPORARY TABLE IF EXISTS _mock_user_ids;
CREATE TEMPORARY TABLE _mock_user_ids (id INT PRIMARY KEY) ENGINE=MEMORY;

INSERT INTO _mock_user_ids (id)
SELECT id FROM users
WHERE name = 'Performance Test User'
  AND email LIKE 'testuser-%@test.com'
  AND verified = 0
  AND role = 'user';

SELECT COUNT(*) AS staged_user_ids FROM _mock_user_ids;

-- 2a. trade_items belonging to products owned by these users
DELETE ti FROM trade_items ti
JOIN products p ON p.id = ti.product_id
WHERE p.seller_id IN (SELECT id FROM _mock_user_ids);

-- 2b. multiway_trades involving these users (any role)
DELETE FROM multiway_trades
WHERE user1_id           IN (SELECT id FROM _mock_user_ids)
   OR user2_id           IN (SELECT id FROM _mock_user_ids)
   OR user3_id           IN (SELECT id FROM _mock_user_ids)
   OR initiator_user_id  IN (SELECT id FROM _mock_user_ids);

-- 2c. trade_loop_agreements
DELETE FROM trade_loop_agreements
WHERE user_id IN (SELECT id FROM _mock_user_ids);

-- 2d. trades
DELETE FROM trades
WHERE buyer_id  IN (SELECT id FROM _mock_user_ids)
   OR seller_id IN (SELECT id FROM _mock_user_ids);

-- 2e. products
DELETE FROM products
WHERE seller_id IN (SELECT id FROM _mock_user_ids);

-- 2f. notifications
DELETE FROM notifications
WHERE user_id IN (SELECT id FROM _mock_user_ids);

-- 2g. finally, the users themselves. Anything else (chat, offers, reviews,
--     org membership, etc.) should auto-cascade via ON DELETE CASCADE — every
--     other FK to users.id in database.go uses CASCADE or SET NULL.
DELETE FROM users
WHERE id IN (SELECT id FROM _mock_user_ids);

-- Report final state
SELECT
  (SELECT COUNT(*) FROM users WHERE name='Performance Test User' AND email LIKE 'testuser-%@test.com') AS remaining_mock_users,
  (SELECT COUNT(*) FROM users) AS total_users_after;

DROP TEMPORARY TABLE IF EXISTS _mock_user_ids;

-- ⚠️  REVIEW THE TWO COUNTS ABOVE.
--   - remaining_mock_users should be 0
--   - total_users_after should be (previous total) - (staged_user_ids)
--
-- If both look right:
--    COMMIT;
-- If anything looks wrong:
--    ROLLBACK;
-- ----------------------------------------------------------------------------
