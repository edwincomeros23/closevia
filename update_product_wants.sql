-- UPDATE Francis's MacBook to be CLEARER about wanting gaming console
UPDATE products SET 
  wants = 'PS5,gaming console,xbox,game console',
  desired_product = 'PS5'
WHERE id = 178 AND seller_id = 55;

-- UPDATE Charlie's PS5 to be clearer about wanting iPhone  
UPDATE products SET
  wants = 'iphone,phone,iphone 15',
  desired_product = 'iphone 15 pro'
WHERE id = 179 AND seller_id = 59;

-- UPDATE Alice's iPhone to be clearer
UPDATE products SET
  wants = 'MacBook Pro,MacBook,laptop',
  desired_product = 'MacBook'
WHERE id = 177 AND seller_id = 52;

SELECT id, title, seller_id, wants, desired_product FROM products WHERE id IN (177, 178, 179);
