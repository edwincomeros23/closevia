ALTER TABLE trades ADD COLUMN awaiting_confirmation_since TIMESTAMP NULL DEFAULT NULL AFTER status;

-- Optional: Add index for queries filtering by this column
CREATE INDEX idx_trades_awaiting_confirmation_since ON trades(awaiting_confirmation_since);
