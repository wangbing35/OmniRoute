/**
 * Quota Management Service Implementation
 * Handles user quotas, usage tracking, and overage handling
 */

import { getDb, generateId } from "../database/database.js";
import { authService } from "../auth/authServiceImplementation.js";
import type { User, UsageRecord, PricingInfo } from "../auth/authTypes.js";
import { logger } from "@/lib/logging/logger.js";

export interface QuotaStatus {
  userId: string;
  tier: string;
  freeRemaining: number;
  freeTotal: number;
  purchasedRemaining: number;
  purchasedTotal: number;
  resetDate: Date;
  usagePercentage: number;
  isOverQuota: boolean;
}

export interface QuotaPackage {
  id: string;
  name: string;
  description: string;
  tokens: number;
  price: number;
  currency: string;
  popular?: boolean;
}

export class QuotaService {
  /**
   * Get user's current quota status
   */
  async getQuotaStatus(userId: string): Promise<QuotaStatus> {
    const db = getDb();

    // Get user quota info
    const userRow = db
      .prepare(
        `
      SELECT
        u.id,
        u.tier,
        u.free_quota_monthly,
        u.purchased_quota,
        COALESCE(SUM(ur.tokens_used), 0) as used_this_month
      FROM users u
      LEFT JOIN usage_records ur ON u.id = ur.user_id
        AND ur.timestamp >= datetime('now', 'start of month')
    WHERE u.id = ?
      GROUP BY u.id
    `
      )
      .get(userId) as any;

    if (!userRow) {
      throw new Error("User not found");
    }

    const usedThisMonth = userRow.used_this_month || 0;
    const freeTotal = userRow.free_quota_monthly;
    const purchasedTotal = userRow.purchased_quota;

    // Calculate remaining
    let freeRemaining = Math.max(0, freeTotal - usedThisMonth);
    let purchasedRemaining = purchasedTotal;

    // If free quota exceeded, use purchased quota
    if (usedThisMonth > freeTotal) {
      const overage = usedThisMonth - freeTotal;
      purchasedRemaining = Math.max(0, purchasedTotal - overage);
    }

    // Calculate reset date (next month 1st)
    const resetDate = new Date();
    resetDate.setMonth(resetDate.getMonth() + 1);
    resetDate.setDate(1);
    resetDate.setHours(0, 0, 0, 0);

    const totalQuota = freeTotal + purchasedTotal;
    const usagePercentage = totalQuota > 0 ? (usedThisMonth / totalQuota) * 100 : 0;
    const isOverQuota = usedThisMonth >= totalQuota;

    return {
      userId,
      tier: userRow.tier,
      freeRemaining,
      freeTotal,
      purchasedRemaining,
      purchasedTotal,
      resetDate,
      usagePercentage: Math.round(usagePercentage * 100) / 100,
      isOverQuota,
    };
  }

  /**
   * Check if user has sufficient quota for a request
   */
  async checkQuota(
    userId: string,
    estimatedTokens: number
  ): Promise<{
    allowed: boolean;
    quotaStatus: QuotaStatus;
    error?: string;
  }> {
    const quotaStatus = await this.getQuotaStatus(userId);

    const totalAvailable = quotaStatus.freeRemaining + quotaStatus.purchasedRemaining;

    if (totalAvailable >= estimatedTokens) {
      return { allowed: true, quotaStatus };
    }

    return {
      allowed: false,
      quotaStatus,
      error: `Insufficient quota. Required: ${estimatedTokens.toLocaleString()}, Available: ${totalAvailable.toLocaleString()} tokens. Please upgrade your plan.`,
    };
  }

  /**
   * Deduct quota after successful API call
   */
  async deductQuota(
    userId: string,
    tokensUsed: number,
    record: Omit<UsageRecord, "id" | "timestamp" | "userId">
  ): Promise<UsageRecord> {
    // Record usage - this automatically affects quota calculations
    return await authService.recordUsage({
      userId,
      ...record,
      tokensUsed,
    });
  }

  /**
   * Reset monthly free quota for all users (cron job)
   */
  async resetMonthlyQuota(userId?: string): Promise<void> {
    const db = getDb();

    if (userId) {
      // Reset for specific user
      db.prepare(
        `
        UPDATE users
        SET updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `
      ).run(userId);
      logger.info(`Reset monthly quota for user ${userId}`);
    } else {
      // Reset for all users (cron job)
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      db.prepare(
        `
        UPDATE users
        SET updated_at = CURRENT_TIMESTAMP
        WHERE updated_at < ?
      `
      ).run(startOfMonth.toISOString());
      logger.info("Reset monthly quota for all users");
    }
  }

  /**
   * Purchase additional quota
   */
  async purchaseQuota(
    userId: string,
    packageId: string
  ): Promise<{
    success: boolean;
    newQuotaTotal: number;
    transactionId?: string;
    error?: string;
  }> {
    const db = getDb();

    try {
      // Get package details
      const packageRow = db
        .prepare("SELECT * FROM quota_packages WHERE id = ?")
        .get(packageId) as any;
      if (!packageRow) {
        return {
          success: false,
          newQuotaTotal: 0,
          error: "Package not found",
        };
      }

      // Generate transaction ID
      const transactionId = generateId("txn");

      // Add purchased quota to user
      db.prepare(
        `
        UPDATE users
        SET purchased_quota = purchased_quota + ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `
      ).run(packageRow.tokens, userId);

      // Create usage record for the purchase
      const purchaseRecord = await authService.recordUsage({
        userId,
        model: "quota_purchase",
        provider: "system",
        tokensUsed: 0,
        cost: packageRow.price,
        latency: 0,
        requestMetadata: {
          type: "quota_purchase",
          packageId,
          tokens: packageRow.tokens,
          transactionId,
        },
      });

      // Get new total
      const userRow = db
        .prepare("SELECT purchased_quota FROM users WHERE id = ?")
        .get(userId) as any;

      logger.info(`User ${userId} purchased ${packageRow.tokens} tokens (package: ${packageId})`);

      return {
        success: true,
        newQuotaTotal: userRow.purchased_quota,
        transactionId,
      };
    } catch (error) {
      logger.error("Quota purchase error:", error);
      return {
        success: false,
        newQuotaTotal: 0,
        error: error instanceof Error ? error.message : "Purchase failed",
      };
    }
  }

  /**
   * Get available quota packages
   */
  async getQuotaPackages(): Promise<QuotaPackage[]> {
    const db = getDb();

    // Seed default packages if empty
    const count = db.prepare("SELECT COUNT(*) as count FROM quota_packages").get() as any;
    if (count.count === 0) {
      await this.seedDefaultPackages(db);
    }

    const rows = db.prepare("SELECT * FROM quota_packages ORDER BY price ASC").all() as any[];
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      tokens: row.tokens,
      price: row.price,
      currency: row.currency,
      popular: Boolean(row.popular),
    }));
  }

  /**
   * Handle quota exceeded scenario
   */
  async handleQuotaExceeded(
    userId: string,
    requestDetails: {
      model: string;
      estimatedTokens: number;
    }
  ): Promise<{
    action: "block" | "queue" | "allow_with_warning";
    message: string;
    upgradeUrl?: string;
  }> {
    const quotaStatus = await this.getQuotaStatus(userId);

    // Check if user has just exceeded quota (within 1000 tokens)
    const recentlyExceeded =
      quotaStatus.usagePercentage >= 100 && quotaStatus.usagePercentage <= 101;

    if (recentlyExceeded) {
      // Allow with warning for first few overages
      return {
        action: "allow_with_warning",
        message:
          "You have exceeded your quota. This request will be processed, but please upgrade your plan to continue service.",
        upgradeUrl: "/dashboard/plans",
      };
    }

    // Block if significantly over quota
    return {
      action: "block",
      message: `Quota exceeded. You have used ${quotaStatus.usagePercentage.toFixed(1)}% of your monthly quota. Please upgrade your plan to continue.`,
      upgradeUrl: "/dashboard/plans",
    };
  }

  /**
   * Get user's usage history
   */
  async getUsageHistory(
    userId: string,
    options: {
      startDate?: Date;
      endDate?: Date;
      model?: string;
      limit?: number;
    } = {}
  ): Promise<UsageRecord[]> {
    const db = getDb();

    let query = "SELECT * FROM usage_records WHERE user_id = ?";
    const params: any[] = [userId];

    if (options.model) {
      query += " AND model = ?";
      params.push(options.model);
    }

    if (options.startDate) {
      query += " AND timestamp >= ?";
      params.push(options.startDate.toISOString());
    }

    if (options.endDate) {
      query += " AND timestamp <= ?";
      params.push(options.endDate.toISOString());
    }

    query += " ORDER BY timestamp DESC";

    if (options.limit) {
      query += " LIMIT ?";
      params.push(options.limit);
    }

    const rows = db.prepare(query).all(...params) as any[];

    return rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      apiKeyId: row.api_key_id,
      model: row.model,
      provider: row.provider,
      tokensUsed: row.tokens_used,
      cost: row.cost,
      latency: row.latency,
      timestamp: new Date(row.timestamp),
      requestMetadata: row.request_metadata ? JSON.parse(row.request_metadata) : undefined,
    }));
  }

  /**
   * Calculate cost for a request
   */
  async calculateCost(
    model: string,
    provider: string,
    inputTokens: number,
    outputTokens: number
  ): Promise<number> {
    const db = getDb();

    const pricing = db
      .prepare(
        `
      SELECT input_price_per_million, output_price_per_million
      FROM pricing_info
      WHERE provider = ? AND model = ?
    `
      )
      .get(provider, model) as any;

    if (!pricing) {
      // Default pricing if not found
      logger.warn(`Pricing not found for ${provider}/${model}, using defaults`);
      return ((inputTokens + outputTokens) / 1000000) * 0.001; // $0.001 per 1K tokens default
    }

    const inputCost = (inputTokens / 1000000) * pricing.input_price_per_million;
    const outputCost = (outputTokens / 1000000) * pricing.output_price_per_million;

    return inputCost + outputCost;
  }

  /**
   * Seed default quota packages
   */
  private async seedDefaultPackages(db: any): Promise<void> {
    const packages = [
      {
        id: "pkg_starter",
        name: "Starter",
        description: "Perfect for small projects and testing",
        tokens: 100000,
        price: 5.0,
        currency: "USD",
        popular: false,
      },
      {
        id: "pkg_pro",
        name: "Pro",
        description: "Best for individual developers and small teams",
        tokens: 500000,
        price: 20.0,
        currency: "USD",
        popular: true,
      },
      {
        id: "pkg_business",
        name: "Business",
        description: "For growing teams and production workloads",
        tokens: 2000000,
        price: 75.0,
        currency: "USD",
        popular: false,
      },
      {
        id: "pkg_enterprise",
        name: "Enterprise",
        description: "High-volume usage with dedicated support",
        tokens: 10000000,
        price: 300.0,
        currency: "USD",
        popular: false,
      },
    ];

    const insert = db.prepare(`
      INSERT INTO quota_packages (id, name, description, tokens, price, currency, popular)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    for (const pkg of packages) {
      insert.run(
        pkg.id,
        pkg.name,
        pkg.description,
        pkg.tokens,
        pkg.price,
        pkg.currency,
        pkg.popular ? 1 : 0
      );
    }

    logger.info("Seeded default quota packages");
  }
}

// Singleton instance
export const quotaService = new QuotaService();
