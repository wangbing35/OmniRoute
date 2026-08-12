-- Migration 153: user_quota_balances table for tracking user quota
--
-- Stores user quota balances including free monthly quota and purchased quota.
-- Automatically resets free quota monthly based on reset_date.
--
CREATE TABLE IF NOT EXISTS user_quota_balances (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  free_quota_remaining INTEGER DEFAULT 100000,
  free_quota_total INTEGER DEFAULT 100000,
  purchased_quota_remaining INTEGER DEFAULT 0,
  purchased_quota_total INTEGER DEFAULT 0,
  reset_date TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_user_quota_balances_user_id ON user_quota_balances(user_id);
CREATE INDEX IF NOT EXISTS idx_user_quota_balances_reset_date ON user_quota_balances(reset_date);
