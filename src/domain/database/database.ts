/**
 * Database Connection and Schema Management
 * SQLite database setup with better-sqlite3
 */

import Database from "better-sqlite3";
import { path } from "@/lib/utils/path.js";
import { logger } from "@/lib/logging/logger.js";

const DB_PATH =
  process.env.DATABASE_URL?.replace("sqlite:", "") || "./data/omniroute-enterprise.db";

let db: Database.Database | null = null;

/**
 * Get database connection (singleton)
 */
export function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");

    // Enable performance optimizations
    db.pragma("cache_size = -64000"); // 64MB cache
    db.pragma("temp_store = MEMORY");

    logger.info(`Database connected: ${DB_PATH}`);
  }
  return db;
}

/**
 * Close database connection
 */
export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
    logger.info("Database connection closed");
  }
}

/**
 * Initialize database schema
 */
export function initializeSchema(): void {
  const database = getDb();

  // Create tables in dependency order
  createUsersTable(database);
  createAuthProvidersTable(database);
  createSessionsTable(database);
  createApiKeysTable(database);
  createQuotaPackagesTable(database);
  createUsageRecordsTable(database);
  createPricingInfoTable(database);
  createProviderMetricsTable(database);
  createPaymentMethodsTable(database);
  createInvoicesTable(database);
  createSubscriptionsTable(database);
  createPlansTable(database);

  logger.info("Database schema initialized");
}

/**
 * Users table
 */
function createUsersTable(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      email_verified BOOLEAN DEFAULT 0,
      password_hash TEXT,
      name TEXT,
      avatar TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_login_at DATETIME,
      preferences TEXT DEFAULT '{"language":"en","theme":"system","notifications":true,"timezone":"UTC"}',
      tier TEXT DEFAULT 'free' CHECK(tier IN ('free', 'pro', 'enterprise')),
      free_quota_monthly INTEGER DEFAULT 100000,
      purchased_quota INTEGER DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_users_tier ON users(tier);
  `);
}

/**
 * Authentication providers table (OAuth)
 */
function createAuthProvidersTable(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS auth_providers (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('email', 'oauth', 'api_key')),
      provider TEXT NOT NULL,
      provider_account_id TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_auth_providers_user_id ON auth_providers(user_id);
    CREATE INDEX IF NOT EXISTS idx_auth_providers_provider ON auth_providers(provider);
  `);
}

/**
 * Sessions table
 */
function createSessionsTable(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token TEXT UNIQUE NOT NULL,
      expires_at DATETIME NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_active_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      ip_address TEXT,
      user_agent TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
    CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
  `);
}

/**
 * API Keys table
 */
function createApiKeysTable(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS api_keys (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      key_hash TEXT UNIQUE NOT NULL,
      key_prefix TEXT NOT NULL,
      scopes TEXT DEFAULT '["read","write"]',
      is_active BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME,
      last_used_at DATETIME,
      usage_count INTEGER DEFAULT 0,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys(user_id);
    CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys(key_hash);
    CREATE INDEX IF NOT EXISTS idx_api_keys_is_active ON api_keys(is_active);
  `);
}

/**
 * Quota packages table (purchasable quota packages)
 */
function createQuotaPackagesTable(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS quota_packages (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      tokens INTEGER NOT NULL,
      price NUMERIC(10,2) NOT NULL,
      currency TEXT DEFAULT 'USD',
      popular BOOLEAN DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

/**
 * Usage records table
 */
function createUsageRecordsTable(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS usage_records (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      api_key_id TEXT,
      model TEXT NOT NULL,
      provider TEXT NOT NULL,
      tokens_used INTEGER NOT NULL,
      cost NUMERIC(10,4) NOT NULL,
      latency INTEGER NOT NULL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      request_metadata TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (api_key_id) REFERENCES api_keys(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_usage_records_user_id ON usage_records(user_id);
    CREATE INDEX IF NOT EXISTS idx_usage_records_timestamp ON usage_records(timestamp);
    CREATE INDEX IF NOT EXISTS idx_usage_records_model ON usage_records(model);
    CREATE INDEX IF NOT EXISTS idx_usage_records_user_timestamp ON usage_records(user_id, timestamp);
  `);
}

/**
 * Pricing information table
 */
function createPricingInfoTable(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS pricing_info (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      input_price_per_million NUMERIC(10,4) NOT NULL,
      output_price_per_million NUMERIC(10,4) NOT NULL,
      currency TEXT DEFAULT 'USD',
      last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(provider, model)
    );

    CREATE INDEX IF NOT EXISTS idx_pricing_info_provider_model ON pricing_info(provider, model);
    CREATE INDEX IF NOT EXISTS idx_pricing_info_model ON pricing_info(model);
  `);
}

/**
 * Provider metrics table
 */
function createProviderMetricsTable(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS provider_metrics (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      avg_latency NUMERIC(10,2) DEFAULT 0,
      p95_latency NUMERIC(10,2) DEFAULT 0,
      p99_latency NUMERIC(10,2) DEFAULT 0,
      success_rate NUMERIC(5,4) DEFAULT 1.0000,
      request_count INTEGER DEFAULT 0,
      last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(provider, model)
    );

    CREATE INDEX IF NOT EXISTS idx_provider_metrics_provider_model ON provider_metrics(provider, model);
  `);
}

/**
 * Payment methods table
 */
function createPaymentMethodsTable(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS payment_methods (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('card', 'bank_account', 'alipay', 'wechat')),
      provider TEXT NOT NULL,
      is_default BOOLEAN DEFAULT 0,
      provider_payment_method_id TEXT,
      last_four TEXT,
      expiry_month INTEGER,
      expiry_year INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_payment_methods_user_id ON payment_methods(user_id);
    CREATE INDEX IF NOT EXISTS idx_payment_methods_is_default ON payment_methods(user_id, is_default);
  `);
}

/**
 * Invoices table
 */
function createInvoicesTable(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS invoices (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      invoice_number TEXT UNIQUE NOT NULL,
      amount NUMERIC(10,2) NOT NULL,
      currency TEXT DEFAULT 'USD',
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'paid', 'failed', 'cancelled')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      due_date DATETIME NOT NULL,
      paid_at DATETIME,
      items TEXT NOT NULL,
      tax NUMERIC(10,2) DEFAULT 0,
      total NUMERIC(10,2) NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_invoices_user_id ON invoices(user_id);
    CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
    CREATE INDEX IF NOT EXISTS idx_invoices_user_status ON invoices(user_id, status);
  `);
}

/**
 * Subscriptions table
 */
function createSubscriptionsTable(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS subscriptions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      plan_id TEXT NOT NULL,
      status TEXT DEFAULT 'active' CHECK(status IN ('active', 'past_due', 'cancelled', 'expired')),
      current_period_start DATETIME NOT NULL,
      current_period_end DATETIME NOT NULL,
      cancel_at_period_end BOOLEAN DEFAULT 0,
      quantity INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
    CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
  `);
}

/**
 * Plans table
 */
function createPlansTable(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS plans (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      monthly_tokens INTEGER NOT NULL,
      price NUMERIC(10,2) NOT NULL,
      currency TEXT DEFAULT 'USD',
      features TEXT DEFAULT '[]',
      popular BOOLEAN DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

/**
 * Generate unique ID
 */
export function generateId(prefix: string): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 11);
  return `${prefix}_${timestamp}${random}`;
}

/**
 * Generate secure random token
 */
export function generateSecureToken(length: number = 32): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const randomBytes = new Uint8Array(length);
  crypto.getRandomValues(randomBytes);
  return Array.from(randomBytes, (byte) => chars[byte % chars.length]).join("");
}

/**
 * Hash API key prefix (first 8 chars for identification)
 */
export function generateKeyPrefix(fullKey: string): string {
  return fullKey.substring(0, 8);
}

/**
 * Simple hash function for API keys (for demo - use proper hashing in production)
 */
export function hashApiKey(apiKey: string): string {
  // In production, use proper crypto like SHA-256
  return apiKey
    .split("")
    .reduce((hash, char) => {
      return (hash << 5) - hash + char.charCodeAt(0);
    }, 0)
    .toString(36);
}
