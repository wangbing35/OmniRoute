-- Migration 151: quota_packages table for storing available quota packages
--
-- Defines purchasable quota packages with token amounts and pricing.
-- Prices are stored in CNY fen (1 CNY = 100 fen) to avoid floating point issues.
--
CREATE TABLE IF NOT EXISTS quota_packages (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  tokens INTEGER NOT NULL CHECK (tokens > 0),
  price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
  currency TEXT NOT NULL DEFAULT 'CNY',
  popular BOOLEAN DEFAULT 0,
  active BOOLEAN DEFAULT 1,
  display_order INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_quota_packages_active_order ON quota_packages(active DESC, display_order ASC, popular DESC);

-- Insert default quota packages
INSERT OR IGNORE INTO quota_packages (id, name, description, tokens, price_cents, popular, display_order) VALUES
  ('pkg_starter', '入门套餐', '100K tokens - 适合轻度使用', 100000, 500, 0, 1),
  ('pkg_basic', '基础套餐', '500K tokens - 适合个人用户', 500000, 2000, 0, 2),
  ('pkg_pro', '专业套餐', '2M tokens - 适合专业开发者', 2000000, 7500, 1, 3),
  ('pkg_business', '商业套餐', '5M tokens - 适合小型团队', 5000000, 18000, 0, 4),
  ('pkg_enterprise', '企业套餐', '10M tokens - 适合大型项目', 10000000, 35000, 0, 5);
