-- Migration 154: quota_transactions table for tracking quota changes
--
-- Records all quota credit/debit operations for auditing and history.
-- Positive amounts = credits (purchases), Negative amounts = debits (usage)
--
CREATE TABLE IF NOT EXISTS quota_transactions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  order_id TEXT,
  amount INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('purchase','usage','reset','adjustment','refund')),
  description TEXT,
  metadata TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (order_id) REFERENCES quota_orders(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_quota_transactions_user_id ON quota_transactions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_quota_transactions_order_id ON quota_transactions(order_id);
CREATE INDEX IF NOT EXISTS idx_quota_transactions_type ON quota_transactions(type);
