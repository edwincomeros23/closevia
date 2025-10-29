-- Add columns to support two-stage trade completion timeouts
ALTER TABLE trades
  ADD COLUMN first_completion_at DATETIME NULL AFTER updated_at,
  ADD COLUMN awaiting_confirmation_since DATETIME NULL AFTER first_completion_at,
  ADD COLUMN auto_completed_at DATETIME NULL AFTER awaiting_confirmation_since;

-- Optional helper index for scheduler scans
CREATE INDEX idx_trades_first_completion ON trades (first_completion_at);
CREATE INDEX idx_trades_awaiting_since ON trades (awaiting_confirmation_since);

