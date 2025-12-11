-- Add delivery state fields to trades table for persistence
ALTER TABLE trades
  ADD COLUMN delivery_type VARCHAR(20) NULL DEFAULT 'standard' AFTER trade_option,
  ADD COLUMN payment_method VARCHAR(20) NULL DEFAULT 'gcash' AFTER delivery_type,
  ADD COLUMN payment_confirmed BOOLEAN DEFAULT FALSE AFTER payment_method,
  ADD COLUMN proof_of_delivery LONGTEXT NULL AFTER payment_confirmed,
  ADD COLUMN buyer_confirmed_receipt BOOLEAN DEFAULT FALSE AFTER proof_of_delivery,
  ADD COLUMN seller_confirmed_delivery BOOLEAN DEFAULT FALSE AFTER buyer_confirmed_receipt;

-- Add index for delivery_type for faster queries
CREATE INDEX idx_trades_delivery_type ON trades (delivery_type);

-- Add index for payment_confirmed for filtering
CREATE INDEX idx_trades_payment_confirmed ON trades (payment_confirmed);
