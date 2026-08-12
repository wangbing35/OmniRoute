/**
 * Authentication Service Implementation
 * Complete implementation with database operations
 */

import { getDb, generateId, generateSecureToken } from "../database/database.js";
import {
  hashPassword,
  verifyPassword,
  generateJwtToken,
  verifyJwtToken,
  generateApiKey,
  hashApiKey as hashApiKeyFn,
  verifyApiKey as verifyApiKeyFn,
  getApiKeyPrefix,
} from "./cryptoUtils.js";
import type { User, Session, ApiKey, UsageRecord } from "./authTypes.js";
import { logger } from "@/lib/logging/logger.js";

export class AuthService {
  /**
   * Register a new user with email and password
   */
  async registerWithEmail(email: string, password: string, name?: string): Promise<User> {
    const db = getDb();

    // Check if user already exists
    const existingUser = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
    if (existingUser) {
      throw new Error("User already exists");
    }

    // Hash password
    const passwordHash = await hashPassword(password);

    // Generate user ID
    const userId = generateId("user");

    // Create user
    db.prepare(
      `
      INSERT INTO users (id, email, password_hash, name, tier, free_quota_monthly, purchased_quota)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
      userId,
      email.toLowerCase(),
      passwordHash,
      name || null,
      "free",
      100000, // Default free quota
      0
    );

    // Create auth provider record
    db.prepare(
      `
      INSERT INTO auth_providers (id, user_id, type, provider, provider_account_id)
      VALUES (?, ?, ?, ?, ?)
    `
    ).run(generateId("auth"), userId, "email", "email", email.toLowerCase());

    // Return created user
    return this.getUserById(userId) as Promise<User>;
  }

  /**
   * Authenticate user with email and password
   */
  async loginWithEmail(email: string, password: string): Promise<{ user: User; session: Session }> {
    const db = getDb();

    // Find user by email
    const userRow = db
      .prepare("SELECT * FROM users WHERE email = ?")
      .get(email.toLowerCase()) as any;
    if (!userRow) {
      throw new Error("Invalid credentials");
    }

    // Verify password
    const passwordValid = await verifyPassword(password, userRow.password_hash);
    if (!passwordValid) {
      throw new Error("Invalid credentials");
    }

    // Update last login
    db.prepare("UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?").run(userRow.id);

    // Create session
    const sessionToken = generateJwtToken({
      userId: userRow.id,
      email: userRow.email,
      tier: userRow.tier,
    });

    const sessionId = generateId("session");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    db.prepare(
      `
      INSERT INTO sessions (id, user_id, token, expires_at)
      VALUES (?, ?, ?, ?)
    `
    ).run(sessionId, userRow.id, sessionToken, expiresAt.toISOString());

    const session: Session = {
      id: sessionId,
      userId: userRow.id,
      token: sessionToken,
      expiresAt,
      createdAt: new Date(),
      lastActiveAt: new Date(),
    };

    return {
      user: this.mapRowToUser(userRow),
      session,
    };
  }

  /**
   * Create a new API key for user
   */
  async createApiKey(
    userId: string,
    name: string,
    scopes: string[] = ["read", "write"]
  ): Promise<ApiKey> {
    const db = getDb();

    // Generate API key
    const fullKey = generateApiKey();
    const keyHash = await hashApiKeyFn(fullKey);
    const keyPrefix = getApiKeyPrefix(fullKey);

    // Check user exists
    const user = await this.getUserById(userId);
    if (!user) {
      throw new Error("User not found");
    }

    // Create API key record
    const apiKeyId = generateId("key");

    db.prepare(
      `
      INSERT INTO api_keys (id, user_id, name, key_hash, key_prefix, scopes)
      VALUES (?, ?, ?, ?, ?, ?)
    `
    ).run(apiKeyId, userId, name, keyHash, keyPrefix, JSON.stringify(scopes));

    return {
      id: apiKeyId,
      userId,
      name,
      keyHash: fullKey, // Return full key only on creation
      keyPrefix,
      scopes,
      isActive: true,
      createdAt: new Date(),
      usageCount: 0,
    };
  }

  /**
   * Validate API key and return associated user
   */
  async validateApiKey(apiKey: string): Promise<{ user: User; apiKey: ApiKey } | null> {
    const db = getDb();

    // Try to find API key by hash
    const keyHash = await hashApiKeyFn(apiKey);

    const keyRow = db
      .prepare(
        `
      SELECT ak.*, u.email, u.tier
      FROM api_keys ak
      JOIN users u ON ak.user_id = u.id
      WHERE ak.key_hash = ? AND ak.is_active = 1
    `
      )
      .get(keyHash) as any;

    if (!keyRow) {
      return null;
    }

    // Check if expired
    if (keyRow.expires_at && new Date(keyRow.expires_at) < new Date()) {
      return null;
    }

    // Update last used
    db.prepare(
      `
      UPDATE api_keys
      SET last_used_at = CURRENT_TIMESTAMP, usage_count = usage_count + 1
      WHERE id = ?
    `
    ).run(keyRow.id);

    return {
      user: (await this.getUserById(keyRow.user_id)) as User,
      apiKey: this.mapRowToApiKey(keyRow),
    };
  }

  /**
   * Revoke an API key
   */
  async revokeApiKey(apiKeyId: string, userId: string): Promise<void> {
    const db = getDb();

    const result = db
      .prepare(
        `
      UPDATE api_keys
      SET is_active = 0
      WHERE id = ? AND user_id = ?
    `
      )
      .run(apiKeyId, userId);

    if (result.changes === 0) {
      throw new Error("API key not found or already revoked");
    }
  }

  /**
   * List API keys for user
   */
  async listApiKeys(userId: string): Promise<ApiKey[]> {
    const db = getDb();

    const rows = db
      .prepare(
        `
      SELECT * FROM api_keys
      WHERE user_id = ?
      ORDER BY created_at DESC
    `
      )
      .all(userId) as any[];

    return rows.map((row) => this.mapRowToApiKey(row));
  }

  /**
   * Validate session token
   */
  async validateSession(token: string): Promise<{ user: User; session: Session } | null> {
    // Verify JWT token
    const payload = verifyJwtToken(token);
    if (!payload) {
      return null;
    }

    // Check session exists in database
    const db = getDb();
    const sessionRow = db
      .prepare(
        `
      SELECT s.*, u.email, u.tier
      FROM sessions s
      JOIN users u ON s.user_id = u.id
      WHERE s.token = ? AND s.expires_at > CURRENT_TIMESTAMP
    `
      )
      .get(token) as any;

    if (!sessionRow) {
      return null;
    }

    // Update last active
    db.prepare(
      `
      UPDATE sessions
      SET last_active_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `
    ).run(sessionRow.id);

    return {
      user: (await this.getUserById(sessionRow.user_id)) as User,
      session: this.mapRowToSession(sessionRow),
    };
  }

  /**
   * Invalidate session (logout)
   */
  async invalidateSession(token: string): Promise<void> {
    const db = getDb();
    db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
  }

  /**
   * Record usage for billing and quota tracking
   */
  async recordUsage(record: Omit<UsageRecord, "id" | "timestamp">): Promise<UsageRecord> {
    const db = getDb();

    const usageId = generateId("usage");

    db.prepare(
      `
      INSERT INTO usage_records (
        id, user_id, api_key_id, model, provider,
        tokens_used, cost, latency, request_metadata
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
      usageId,
      record.userId,
      record.apiKeyId || null,
      record.model,
      record.provider,
      record.tokensUsed,
      record.cost,
      record.latency,
      JSON.stringify(record.requestMetadata || {})
    );

    return {
      id: usageId,
      ...record,
      timestamp: new Date(),
    };
  }

  /**
   * Get user by ID
   */
  async getUserById(userId: string): Promise<User | null> {
    const db = getDb();
    const row = db.prepare("SELECT * FROM users WHERE id = ?").get(userId) as any;
    return row ? this.mapRowToUser(row) : null;
  }

  /**
   * Get user's current usage statistics
   */
  async getUserUsageStats(
    userId: string,
    period: "day" | "week" | "month"
  ): Promise<{
    totalTokens: number;
    totalCost: number;
    requestCount: number;
    avgLatency: number;
  }> {
    const db = getDb();

    let timeCondition = "";
    switch (period) {
      case "day":
        timeCondition = "timestamp >= datetime('now', '-1 day')";
        break;
      case "week":
        timeCondition = "timestamp >= datetime('now', '-7 days')";
        break;
      case "month":
        timeCondition = "timestamp >= datetime('now', '-1 month')";
        break;
    }

    const stats = db
      .prepare(
        `
      SELECT
        COALESCE(SUM(tokens_used), 0) as totalTokens,
        COALESCE(SUM(cost), 0) as totalCost,
        COUNT(*) as requestCount,
        COALESCE(AVG(latency), 0) as avgLatency
      FROM usage_records
      WHERE user_id = ? AND ${timeCondition}
    `
      )
      .get(userId) as any;

    return {
      totalTokens: stats.totalTokens,
      totalCost: stats.totalCost,
      requestCount: stats.requestCount,
      avgLatency: Math.round(stats.avgLatency),
    };
  }

  /**
   * Map database row to User object
   */
  private mapRowToUser(row: any): User {
    return {
      id: row.id,
      email: row.email,
      emailVerified: Boolean(row.email_verified),
      name: row.name,
      avatar: row.avatar,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      lastLoginAt: row.last_login_at ? new Date(row.last_login_at) : undefined,
      preferences: JSON.parse(row.preferences || "{}"),
      quota: {
        freeQuotaMonthly: row.free_quota_monthly,
        usedQuotaCurrent: 0, // To be calculated
        purchasedQuota: row.purchased_quota,
        quotaResetDate: new Date(row.updated_at), // Simplified
      },
      tier: row.tier,
    };
  }

  /**
   * Map database row to ApiKey object
   */
  private mapRowToApiKey(row: any): ApiKey {
    return {
      id: row.id,
      userId: row.user_id,
      name: row.name,
      keyHash: row.key_hash,
      keyPrefix: row.key_prefix,
      scopes: JSON.parse(row.scopes || "[]"),
      isActive: Boolean(row.is_active),
      createdAt: new Date(row.created_at),
      expiresAt: row.expires_at ? new Date(row.expires_at) : undefined,
      lastUsedAt: row.last_used_at ? new Date(row.last_used_at) : undefined,
      usageCount: row.usage_count,
    };
  }

  /**
   * Map database row to Session object
   */
  private mapRowToSession(row: any): Session {
    return {
      id: row.id,
      userId: row.user_id,
      token: row.token,
      expiresAt: new Date(row.expires_at),
      createdAt: new Date(row.created_at),
      lastActiveAt: new Date(row.last_active_at),
      ipAddress: row.ip_address,
      userAgent: row.user_agent,
    };
  }
}

// Singleton instance
export const authService = new AuthService();
