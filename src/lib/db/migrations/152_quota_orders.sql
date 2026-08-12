-- Migration 152: quota_orders table for storing purchase orders
--
-- Stores quota purchase orders with payment status and details.
-- Order format: ORD-{timestamp}-{random}
--
CREATE TABLE IF NOT EXISTS quota_orders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  package_id TEXT NOT NULL,
  order_number TEXT UNIQUE NOT NULL,
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'CNY',
  tokens INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','paid','failed','cancelled','expired')),
  payment_method TEXT CHECK (payment_method IN ('alipay','wechat')),
  payment_provider_order_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  paid_at TEXT,
  expired_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  metadata TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_quota_orders_user_id ON quota_orders(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_quota_orders_status ON quota_orders(status);
CREATE INDEX IF NOT EXISTS idx_quota_orders_order_number ON quota_orders(order_number);
CREATE INDEX IF NOT EXISTS idx_quota_orders_created_at ON quota_orders(created_at DESC);
