ALTER TABLE trades ADD COLUMN first_completion_at TIMESTAMP NULL DEFAULT NULL AFTER completed_at;

-- Optional: Add index for queries filtering by this column
CREATE INDEX idx_trades_first_completion_at ON trades(first_completion_at);
