ALTER TABLE trades ADD COLUMN auto_completed_at TIMESTAMP NULL DEFAULT NULL AFTER first_completion_at;

-- Optional: Add index for queries filtering by this column
CREATE INDEX idx_trades_auto_completed_at ON trades(auto_completed_at);
