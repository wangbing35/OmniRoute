/**
 * Quota Management Service
 * Enhanced quota service with balance management, credit/debit operations, and transaction history
 */

import { getDbInstance } from "@/lib/db/core.js";
import { orderService } from "../orders/orderService.js";

export interface QuotaBalance {
  id: string;
  userId: string;
  freeQuotaRemaining: number;
  freeQuotaTotal: number;
  purchasedQuotaRemaining: number;
  purchasedQuotaTotal: number;
  resetDate: Date;
  updatedAt: Date;
  createdAt: Date;
}

export interface QuotaStatus {
  userId: string;
  tier: string;
  freeRemaining: number;
  freeTotal: number;
  purchasedRemaining: number;
  purchasedTotal: number;
  totalRemaining: number;
  resetDate: Date;
  usagePercentage: number;
  isOverQuota: boolean;
}

export interface QuotaTransaction {
  id: string;
  userId: string;
  orderId?: string;
  amount: number;
  balanceAfter: number;
  type: "purchase" | "usage" | "reset" | "adjustment" | "refund";
  description?: string;
  metadata?: Record<string, any>;
  createdAt: Date;
}

export interface QuotaPackage {
  id: string;
  name: string;
  description?: string;
  tokens: number;
  priceCents: number;
  currency: string;
  popular: boolean;
  active: boolean;
  displayOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

export class QuotaManagementService {
  /**
   * Get user's quota balance, creating if not exists
   */
  async getOrCreateQuotaBalance(userId: string): Promise<QuotaBalance> {
    const db = getDbInstance();

    let balance = await db.get("SELECT * FROM user_quota_balances WHERE user_id = ?", [userId]);

    if (!balance) {
      // Create new balance with default free quota
      const now = new Date();
      const resetDate = this.calculateNextMonthReset();

      await db.run(
        `INSERT INTO user_quota_balances (
          id, user_id, free_quota_remaining, free_quota_total,
          purchased_quota_remaining, purchased_quota_total, reset_date
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          this.generateBalanceId(),
          userId,
          100000, // 100K free tokens
          100000,
          0,
          0,
          resetDate.toISOString(),
        ]
      );

      balance = await db.get("SELECT * FROM user_quota_balances WHERE user_id = ?", [userId]);
    }

    return this.mapRowToBalance(balance!);
  }

  /**
   * Get user's quota status with computed fields
   */
  async getQuotaStatus(userId: string): Promise<QuotaStatus> {
    const balance = await this.getOrCreateQuotaBalance(userId);

    // Check if reset is needed
    await this.checkAndResetMonthlyQuota(userId, balance);

    // Refresh balance after potential reset
    const updatedBalance = await this.getOrCreateQuotaBalance(userId);

    const totalRemaining =
      updatedBalance.freeQuotaRemaining + updatedBalance.purchasedQuotaRemaining;
    const totalTotal = updatedBalance.freeQuotaTotal + updatedBalance.purchasedQuotaTotal;
    const usagePercentage = totalTotal > 0 ? (1 - totalRemaining / totalTotal) * 100 : 0;

    return {
      userId: updatedBalance.userId,
      tier: "free", // Can be enhanced to determine from subscription
      freeRemaining: updatedBalance.freeQuotaRemaining,
      freeTotal: updatedBalance.freeQuotaTotal,
      purchasedRemaining: updatedBalance.purchasedQuotaRemaining,
      purchasedTotal: updatedBalance.purchasedQuotaTotal,
      totalRemaining,
      resetDate: updatedBalance.resetDate,
      usagePercentage,
      isOverQuota: totalRemaining <= 0,
    };
  }

  /**
   * Credit quota (add tokens) - typically after successful purchase
   */
  async creditQuota(userId: string, amount: number, orderId?: string): Promise<QuotaTransaction> {
    const db = getDbInstance();

    const balance = await this.getOrCreateQuotaBalance(userId);
    const newBalance = balance.purchasedQuotaRemaining + amount;
    const newTotal = balance.purchasedQuotaTotal + amount;

    // Update balance
    await db.run(
      `UPDATE user_quota_balances
       SET purchased_quota_remaining = ?, purchased_quota_total = ?, updated_at = CURRENT_TIMESTAMP
       WHERE user_id = ?`,
      [newBalance, newTotal, userId]
    );

    // Create transaction record
    const transactionId = this.generateTransactionId();
    await db.run(
      `INSERT INTO quota_transactions (
        id, user_id, order_id, amount, balance_after, type, description
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        transactionId,
        userId,
        orderId || null,
        amount,
        newBalance + balance.freeQuotaRemaining,
        "purchase",
        `充值 ${amount} tokens`,
      ]
    );

    return {
      id: transactionId,
      userId,
      orderId,
      amount,
      balanceAfter: newBalance + balance.freeQuotaRemaining,
      type: "purchase",
      description: `充值 ${amount} tokens`,
      createdAt: new Date(),
    };
  }

  /**
   * Debit quota (consume tokens) - typically after API usage
   */
  async debitQuota(
    userId: string,
    amount: number,
    metadata?: Record<string, any>
  ): Promise<QuotaTransaction> {
    const db = getDbInstance();

    const balance = await this.getOrCreateQuotaBalance(userId);

    // Check if sufficient quota
    const totalAvailable = balance.freeQuotaRemaining + balance.purchasedQuotaRemaining;
    if (totalAvailable < amount) {
      throw new Error("Insufficient quota");
    }

    // Determine which quota to deduct (free first, then purchased)
    let newFreeRemaining = balance.freeQuotaRemaining;
    let newPurchasedRemaining = balance.purchasedQuotaRemaining;

    if (amount <= balance.freeQuotaRemaining) {
      newFreeRemaining -= amount;
    } else {
      const remainingFromFree = balance.freeQuotaRemaining;
      const remainingFromPurchased = amount - remainingFromFree;
      newFreeRemaining = 0;
      newPurchasedRemaining -= remainingFromPurchased;
    }

    // Update balance
    await db.run(
      `UPDATE user_quota_balances
       SET free_quota_remaining = ?, purchased_quota_remaining = ?, updated_at = CURRENT_TIMESTAMP
       WHERE user_id = ?`,
      [newFreeRemaining, newPurchasedRemaining, userId]
    );

    // Create transaction record
    const transactionId = this.generateTransactionId();
    const balanceAfter = newFreeRemaining + newPurchasedRemaining;

    await db.run(
      `INSERT INTO quota_transactions (
        id, user_id, amount, balance_after, type, description, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        transactionId,
        userId,
        -amount,
        balanceAfter,
        "usage",
        `使用 ${amount} tokens`,
        metadata ? JSON.stringify(metadata) : null,
      ]
    );

    return {
      id: transactionId,
      userId,
      amount: -amount,
      balanceAfter,
      type: "usage",
      description: `使用 ${amount} tokens`,
      metadata,
      createdAt: new Date(),
    };
  }

  /**
   * Reset monthly free quota
   */
  async resetMonthlyQuota(userId: string): Promise<void> {
    const db = getDbInstance();

    const balance = await this.getOrCreateQuotaBalance(userId);
    const resetDate = this.calculateNextMonthReset();

    await db.run(
      `UPDATE user_quota_balances
       SET free_quota_remaining = ?, free_quota_total = ?, reset_date = ?, updated_at = CURRENT_TIMESTAMP
       WHERE user_id = ?`,
      [100000, 100000, resetDate.toISOString(), userId]
    );

    // Create transaction record
    const transactionId = this.generateTransactionId();
    await db.run(
      `INSERT INTO quota_transactions (
        id, user_id, amount, balance_after, type, description
      ) VALUES (?, ?, ?, ?, ?, ?)`,
      [
        transactionId,
        userId,
        100000,
        100000 + balance.purchasedQuotaRemaining,
        "reset",
        "月度免费额度重置",
      ]
    );
  }

  /**
   * Manual quota adjustment (admin function)
   */
  async adjustQuota(userId: string, amount: number, reason: string): Promise<QuotaTransaction> {
    const db = getDbInstance();

    const balance = await this.getOrCreateQuotaBalance(userId);

    if (amount >= 0) {
      // Add to purchased quota
      const newBalance = balance.purchasedQuotaRemaining + amount;
      const newTotal = balance.purchasedQuotaTotal + amount;

      await db.run(
        `UPDATE user_quota_balances
         SET purchased_quota_remaining = ?, purchased_quota_total = ?, updated_at = CURRENT_TIMESTAMP
         WHERE user_id = ?`,
        [newBalance, newTotal, userId]
      );

      const transactionId = this.generateTransactionId();
      await db.run(
        `INSERT INTO quota_transactions (
          id, user_id, amount, balance_after, type, description
        ) VALUES (?, ?, ?, ?, ?, ?)`,
        [
          transactionId,
          userId,
          amount,
          newBalance + balance.freeQuotaRemaining,
          "adjustment",
          reason || "管理员调整",
        ]
      );

      return {
        id: transactionId,
        userId,
        amount,
        balanceAfter: newBalance + balance.freeQuotaRemaining,
        type: "adjustment",
        description: reason || "管理员调整",
        createdAt: new Date(),
      };
    } else {
      // Deduct from quota
      return await this.debitQuota(userId, Math.abs(amount), {
        reason: reason || "管理员调整",
      });
    }
  }

  /**
   * Get available quota packages
   */
  async getQuotaPackages(): Promise<QuotaPackage[]> {
    const db = getDbInstance();

    const rows = await db.all(
      "SELECT * FROM quota_packages WHERE active = 1 ORDER BY display_order ASC, popular DESC"
    );

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      tokens: row.tokens,
      priceCents: row.price_cents,
      currency: row.currency,
      popular: row.popular === 1,
      active: row.active === 1,
      displayOrder: row.display_order,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    }));
  }

  /**
   * Get quota package by ID
   */
  async getQuotaPackage(packageId: string): Promise<QuotaPackage | null> {
    const db = getDbInstance();

    const row = await db.get("SELECT * FROM quota_packages WHERE id = ?", [packageId]);

    if (!row) return null;

    return {
      id: row.id,
      name: row.name,
      description: row.description,
      tokens: row.tokens,
      priceCents: row.price_cents,
      currency: row.currency,
      popular: row.popular === 1,
      active: row.active === 1,
      displayOrder: row.display_order,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  /**
   * Get user's quota transaction history
   */
  async getQuotaTransactions(
    userId: string,
    options: {
      limit?: number;
      offset?: number;
      type?: QuotaTransaction["type"];
    } = {}
  ): Promise<{ transactions: QuotaTransaction[]; total: number }> {
    const db = getDbInstance();

    const conditions = ["user_id = ?"];
    const params: any[] = [userId];

    if (options.type) {
      conditions.push("type = ?");
      params.push(options.type);
    }

    const whereClause = conditions.join(" AND ");

    // Get total count
    const countResult = await db.get(
      `SELECT COUNT(*) as total FROM quota_transactions WHERE ${whereClause}`,
      params
    );
    const total = countResult?.total || 0;

    // Get paginated transactions
    const limit = options.limit || 20;
    const offset = options.offset || 0;

    params.push(limit, offset);

    const rows = await db.all(
      `SELECT * FROM quota_transactions WHERE ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      params
    );

    const transactions = rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      orderId: row.order_id,
      amount: row.amount,
      balanceAfter: row.balance_after,
      type: row.type,
      description: row.description,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      createdAt: new Date(row.created_at),
    }));

    return { transactions, total };
  }

  /**
   * Check and reset monthly quota if needed
   */
  private async checkAndResetMonthlyQuota(userId: string, balance: QuotaBalance): Promise<void> {
    const now = new Date();
    const resetDate = new Date(balance.resetDate);

    if (now >= resetDate) {
      await this.resetMonthlyQuota(userId);
    }
  }

  /**
   * Calculate next month reset date (1st of next month)
   */
  private calculateNextMonthReset(): Date {
    const now = new Date();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0);
    return nextMonth;
  }

  /**
   * Generate balance ID
   */
  private generateBalanceId(): string {
    return `BAL-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generate transaction ID
   */
  private generateTransactionId(): string {
    return `TXN-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Map database row to QuotaBalance object
   */
  private mapRowToBalance(row: any): QuotaBalance {
    return {
      id: row.id,
      userId: row.user_id,
      freeQuotaRemaining: row.free_quota_remaining,
      freeQuotaTotal: row.free_quota_total,
      purchasedQuotaRemaining: row.purchased_quota_remaining,
      purchasedQuotaTotal: row.purchased_quota_total,
      resetDate: new Date(row.reset_date),
      updatedAt: new Date(row.updated_at),
      createdAt: new Date(row.created_at),
    };
  }
}

// Singleton instance
export const quotaManagementService = new QuotaManagementService();
