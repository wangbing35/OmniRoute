/**
 * Billing Service Implementation
 * Handles billing, invoicing, and payment processing
 */

import { getDb, generateId } from "../database/database.js";
import type { Invoice, InvoiceItem, PaymentMethod, Subscription, Plan } from "./billingService.js";
import { logger } from "@/lib/logging/logger.js";

export class BillingService {
  /**
   * Create invoice for quota purchase
   */
  async createInvoice(userId: string, items: InvoiceItem[]): Promise<Invoice> {
    const db = getDb();

    // Calculate totals
    const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    const tax = subtotal * 0.1; // 10% tax (simplified)
    const total = subtotal + tax;

    // Generate invoice number
    const invoiceNumber = `INV-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

    const invoiceId = generateId("invoice");
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 30); // 30 days from now

    db.prepare(
      `
      INSERT INTO invoices (id, user_id, invoice_number, amount, currency, status, due_date, items, tax, total)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
      invoiceId,
      userId,
      invoiceNumber,
      subtotal,
      "USD",
      "pending",
      dueDate.toISOString(),
      JSON.stringify(items),
      tax,
      total
    );

    logger.info(`Created invoice ${invoiceNumber} for user ${userId}`);

    return (await this.getInvoice(invoiceId, userId)) as Invoice;
  }

  /**
   * Get user invoices
   */
  async getUserInvoices(
    userId: string,
    options: {
      limit?: number;
      status?: Invoice["status"];
    } = {}
  ): Promise<Invoice[]> {
    const db = getDb();

    let query = "SELECT * FROM invoices WHERE user_id = ?";
    const params: any[] = [userId];

    if (options.status) {
      query += " AND status = ?";
      params.push(options.status);
    }

    query += " ORDER BY created_at DESC";

    if (options.limit) {
      query += " LIMIT ?";
      params.push(options.limit);
    }

    const rows = db.prepare(query).all(...params) as any[];

    return rows.map((row) => this.mapRowToInvoice(row));
  }

  /**
   * Get invoice by ID
   */
  async getInvoice(invoiceId: string, userId: string): Promise<Invoice | null> {
    const db = getDb();

    const row = db
      .prepare(
        `
      SELECT * FROM invoices
      WHERE id = ? AND user_id = ?
    `
      )
      .get(invoiceId, userId) as any;

    return row ? this.mapRowToInvoice(row) : null;
  }

  /**
   * Process payment for invoice (simulated)
   */
  async processPayment(
    invoiceId: string,
    paymentMethodId: string
  ): Promise<{
    success: boolean;
    transactionId?: string;
    error?: string;
  }> {
    const db = getDb();

    try {
      // Get invoice
      const invoice = await this.getInvoice(invoiceId, "");
      if (!invoice) {
        return { success: false, error: "Invoice not found" };
      }

      if (invoice.status === "paid") {
        return { success: false, error: "Invoice already paid" };
      }

      // In production, this would integrate with Stripe/Alipay/WeChat
      // For demo, we'll simulate payment processing
      const transactionId = generateId("txn");

      // Simulate payment delay
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Simulate occasional payment failure
      if (Math.random() < 0.05) {
        // Update invoice status to failed
        db.prepare("UPDATE invoices SET status = ? WHERE id = ?").run("failed", invoiceId);
        return { success: false, error: "Payment declined by payment provider" };
      }

      // Update invoice to paid
      db.prepare(
        `
        UPDATE invoices
        SET status = ?, paid_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `
      ).run("paid", invoiceId);

      logger.info(`Payment processed successfully for invoice ${invoice.invoiceNumber}`);

      return {
        success: true,
        transactionId,
      };
    } catch (error) {
      logger.error("Payment processing error:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Payment processing failed",
      };
    }
  }

  /**
   * Add payment method for user (simulated)
   */
  async addPaymentMethod(
    userId: string,
    paymentDetails: {
      type: "card" | "alipay" | "wechat";
      token: string;
      isDefault?: boolean;
    }
  ): Promise<PaymentMethod> {
    const db = getDb();

    // If setting as default, remove default flag from others
    if (paymentDetails.isDefault) {
      db.prepare("UPDATE payment_methods SET is_default = 0 WHERE user_id = ?").run(userId);
    }

    const paymentMethodId = generateId("pm");

    // Extract details based on type (simplified)
    let lastFour: string | undefined;
    let expiryMonth: number | undefined;
    let expiryYear: number | undefined;

    if (paymentDetails.type === "card") {
      // In production, parse from token
      lastFour = "****"; // Placeholder
    }

    db.prepare(
      `
      INSERT INTO payment_methods (id, user_id, type, provider, provider_payment_method_id, last_four, expiry_month, expiry_year, is_default)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
      paymentMethodId,
      userId,
      paymentDetails.type,
      paymentDetails.type === "alipay"
        ? "alipay"
        : paymentDetails.type === "wechat"
          ? "wechat"
          : "stripe",
      paymentDetails.token,
      lastFour || null,
      expiryMonth || null,
      expiryYear || null,
      paymentDetails.isDefault ? 1 : 0
    );

    return (await this.getPaymentMethod(paymentMethodId, userId)) as PaymentMethod;
  }

  /**
   * Get user payment methods
   */
  async getPaymentMethods(userId: string): Promise<PaymentMethod[]> {
    const db = getDb();

    const rows = db
      .prepare(
        `
      SELECT * FROM payment_methods
      WHERE user_id = ?
      ORDER BY is_default DESC, created_at DESC
    `
      )
      .all(userId) as any[];

    return rows.map((row) => this.mapRowToPaymentMethod(row));
  }

  /**
   * Get payment method by ID
   */
  async getPaymentMethod(paymentMethodId: string, userId: string): Promise<PaymentMethod | null> {
    const db = getDb();

    const row = db
      .prepare(
        `
      SELECT * FROM payment_methods
      WHERE id = ? AND user_id = ?
    `
      )
      .get(paymentMethodId, userId) as any;

    return row ? this.mapRowToPaymentMethod(row) : null;
  }

  /**
   * Remove payment method
   */
  async removePaymentMethod(paymentMethodId: string, userId: string): Promise<void> {
    const db = getDb();

    const result = db
      .prepare(
        `
      DELETE FROM payment_methods
      WHERE id = ? AND user_id = ?
    `
      )
      .run(paymentMethodId, userId);

    if (result.changes === 0) {
      throw new Error("Payment method not found");
    }

    logger.info(`Removed payment method ${paymentMethodId} for user ${userId}`);
  }

  /**
   * Create subscription for user (simulated)
   */
  async createSubscription(userId: string, planId: string): Promise<Subscription> {
    const db = getDb();

    // Get plan details
    const plan = await this.getPlan(planId);
    if (!plan) {
      throw new Error("Plan not found");
    }

    // Check if user already has active subscription
    const existing = db
      .prepare(
        `
      SELECT * FROM subscriptions
      WHERE user_id = ? AND status IN ('active', 'past_due')
    `
      )
      .get(userId) as any;

    if (existing) {
      throw new Error("User already has an active subscription");
    }

    const subscriptionId = generateId("sub");
    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    db.prepare(
      `
      INSERT INTO subscriptions (id, user_id, plan_id, status, current_period_start, current_period_end)
      VALUES (?, ?, ?, ?, ?, ?)
    `
    ).run(subscriptionId, userId, planId, "active", now.toISOString(), periodEnd.toISOString());

    // Update user tier based on plan
    const tier = this.getTierForPlan(planId);
    db.prepare("UPDATE users SET tier = ? WHERE id = ?").run(tier, userId);

    logger.info(`Created subscription ${subscriptionId} for user ${userId} with plan ${planId}`);

    return (await this.getSubscription(subscriptionId, userId)) as Subscription;
  }

  /**
   * Cancel subscription
   */
  async cancelSubscription(subscriptionId: string, userId: string): Promise<void> {
    const db = getDb();

    const result = db
      .prepare(
        `
      UPDATE subscriptions
      SET cancel_at_period_end = 1
      WHERE id = ? AND user_id = ?
    `
      )
      .run(subscriptionId, userId);

    if (result.changes === 0) {
      throw new Error("Subscription not found");
    }

    logger.info(`Cancelled subscription ${subscriptionId} for user ${userId}`);
  }

  /**
   * Get available plans
   */
  async getPlans(): Promise<Plan[]> {
    const db = getDb();

    // Seed default plans if empty
    const count = db.prepare("SELECT COUNT(*) as count FROM plans").get() as any;
    if (count.count === 0) {
      await this.seedDefaultPlans(db);
    }

    const rows = db.prepare("SELECT * FROM plans ORDER BY price ASC").all() as any[];
    return rows.map((row) => this.mapRowToPlan(row));
  }

  /**
   * Get plan by ID
   */
  async getPlan(planId: string): Promise<Plan | null> {
    const db = getDb();

    const row = db.prepare("SELECT * FROM plans WHERE id = ?").get(planId) as any;
    return row ? this.mapRowToPlan(row) : null;
  }

  /**
   * Get subscription by ID
   */
  async getSubscription(subscriptionId: string, userId: string): Promise<Subscription | null> {
    const db = getDb();

    const row = db
      .prepare(
        `
      SELECT * FROM subscriptions
      WHERE id = ? AND user_id = ?
    `
      )
      .get(subscriptionId, userId) as any;

    return row ? this.mapRowToSubscription(row) : null;
  }

  /**
   * Generate invoice PDF (placeholder)
   */
  async generateInvoicePdf(invoiceId: string): Promise<Buffer> {
    // In production, use a PDF library like pdfkit or puppeteer
    // For now, return a placeholder
    const invoice = await this.getInvoice(invoiceId, "");
    if (!invoice) {
      throw new Error("Invoice not found");
    }

    const html = `
      <html>
        <head><title>Invoice ${invoice.invoiceNumber}</title></head>
        <body>
          <h1>Invoice ${invoice.invoiceNumber}</h1>
          <p>Status: ${invoice.status}</p>
          <p>Amount: $${invoice.total.toFixed(2)}</p>
          <p>Due Date: ${invoice.dueDate.toLocaleDateString()}</p>
        </body>
      </html>
    `;

    return Buffer.from(html);
  }

  /**
   * Get billing summary for user
   */
  async getBillingSummary(userId: string): Promise<{
    currentMonthSpend: number;
    lastMonthSpend: number;
    yearToDateSpend: number;
    pendingInvoices: number;
    activeSubscription: boolean;
  }> {
    const db = getDb();

    const currentMonth = db
      .prepare(
        `
      SELECT COALESCE(SUM(total), 0) as spend
      FROM invoices
      WHERE user_id = ? AND status = 'paid'
        AND strftime('%Y-%m', paid_at) = strftime('%Y-%m', 'now')
    `
      )
      .get(userId) as any;

    const lastMonth = db
      .prepare(
        `
      SELECT COALESCE(SUM(total), 0) as spend
      FROM invoices
      WHERE user_id = ? AND status = 'paid'
        AND strftime('%Y-%m', paid_at) = strftime('%Y-%m', 'now', '-1 month')
    `
      )
      .get(userId) as any;

    const yearToDate = db
      .prepare(
        `
      SELECT COALESCE(SUM(total), 0) as spend
      FROM invoices
      WHERE user_id = ? AND status = 'paid'
        AND strftime('%Y', paid_at) = strftime('%Y', 'now')
    `
      )
      .get(userId) as any;

    const pending = db
      .prepare(
        `
      SELECT COUNT(*) as count
      FROM invoices
      WHERE user_id = ? AND status = 'pending'
    `
      )
      .get(userId) as any;

    const activeSubscription = db
      .prepare(
        `
      SELECT COUNT(*) as count
      FROM subscriptions
      WHERE user_id = ? AND status = 'active'
    `
      )
      .get(userId) as any;

    return {
      currentMonthSpend: currentMonth.spend || 0,
      lastMonthSpend: lastMonth.spend || 0,
      yearToDateSpend: yearToDate.spend || 0,
      pendingInvoices: pending.count || 0,
      activeSubscription: (activeSubscription.count || 0) > 0,
    };
  }

  /**
   * Process expired subscriptions (cron job)
   */
  async processExpiredSubscriptions(): Promise<void> {
    const db = getDb();

    // Find subscriptions that have ended
    const expired = db
      .prepare(
        `
      SELECT * FROM subscriptions
      WHERE status = 'active' AND current_period_end < CURRENT_TIMESTAMP
    `
      )
      .all() as any[];

    for (const sub of expired) {
      if (sub.cancel_at_period_end) {
        // Cancel the subscription
        db.prepare(
          `
          UPDATE subscriptions
          SET status = 'cancelled'
          WHERE id = ?
        `
        ).run(sub.id);

        // Reset user tier to free
        db.prepare("UPDATE users SET tier = ? WHERE id = ?").run("free", sub.user_id);
        logger.info(`Expired subscription ${sub.id} cancelled for user ${sub.user_id}`);
      } else {
        // Renew the subscription
        const newPeriodEnd = new Date();
        newPeriodEnd.setMonth(newPeriodEnd.getMonth() + 1);

        db.prepare(
          `
          UPDATE subscriptions
          SET current_period_start = CURRENT_TIMESTAMP,
              current_period_end = ?,
              status = 'active'
          WHERE id = ?
        `
        ).run(newPeriodEnd.toISOString(), sub.id);

        // Create invoice for renewal
        const plan = await this.getPlan(sub.plan_id);
        if (plan) {
          await this.createInvoice(sub.user_id, [
            {
              description: `Renewal: ${plan.name}`,
              quantity: 1,
              unitPrice: plan.price,
              amount: plan.price,
            },
          ]);
        }

        logger.info(`Renewed subscription ${sub.id} for user ${sub.user_id}`);
      }
    }
  }

  /**
   * Map database row to Invoice
   */
  private mapRowToInvoice(row: any): Invoice {
    return {
      id: row.id,
      userId: row.user_id,
      invoiceNumber: row.invoice_number,
      amount: row.amount,
      currency: row.currency,
      status: row.status,
      createdAt: new Date(row.created_at),
      dueDate: new Date(row.due_date),
      paidAt: row.paid_at ? new Date(row.paid_at) : undefined,
      items: JSON.parse(row.items || "[]"),
      tax: row.tax,
      total: row.total,
    };
  }

  /**
   * Map database row to PaymentMethod
   */
  private mapRowToPaymentMethod(row: any): PaymentMethod {
    return {
      id: row.id,
      userId: row.user_id,
      type: row.type,
      provider: row.provider,
      isDefault: Boolean(row.is_default),
      createdAt: new Date(row.created_at),
      lastFour: row.last_four,
      expiryMonth: row.expiry_month,
      expiryYear: row.expiry_year,
    };
  }

  /**
   * Map database row to Subscription
   */
  private mapRowToSubscription(row: any): Subscription {
    return {
      id: row.id,
      userId: row.user_id,
      planId: row.plan_id,
      status: row.status,
      currentPeriodStart: new Date(row.current_period_start),
      currentPeriodEnd: new Date(row.current_period_end),
      cancelAtPeriodEnd: Boolean(row.cancel_at_period_end),
      quantity: row.quantity,
    };
  }

  /**
   * Map database row to Plan
   */
  private mapRowToPlan(row: any): Plan {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      monthlyTokens: row.monthly_tokens,
      price: row.price,
      currency: row.currency,
      features: JSON.parse(row.features || "[]"),
      popular: Boolean(row.popular),
    };
  }

  /**
   * Get tier for plan
   */
  private getTierForPlan(planId: string): string {
    if (planId === "plan_free") return "free";
    if (planId === "plan_pro") return "pro";
    return "enterprise";
  }

  /**
   * Seed default plans
   */
  private async seedDefaultPlans(db: any): Promise<void> {
    const plans = [
      {
        id: "plan_free",
        name: "Free",
        description: "Get started with our free tier",
        monthlyTokens: 100000,
        price: 0,
        currency: "USD",
        features: ["100K tokens per month", "Basic support", "Standard latency"],
        popular: false,
      },
      {
        id: "plan_pro",
        name: "Pro",
        description: "Best for individual developers",
        monthlyTokens: 1000000,
        price: 20,
        currency: "USD",
        features: [
          "1M tokens per month",
          "Priority support",
          "Reduced latency",
          "Access to all models",
        ],
        popular: true,
      },
      {
        id: "plan_enterprise",
        name: "Enterprise",
        description: "For teams and businesses",
        monthlyTokens: 10000000,
        price: 200,
        currency: "USD",
        features: [
          "10M tokens per month",
          "24/7 support",
          "Lowest latency",
          "Custom integrations",
          "SLA guarantee",
        ],
        popular: false,
      },
    ];

    const insert = db.prepare(`
      INSERT INTO plans (id, name, description, monthly_tokens, price, currency, features, popular)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const plan of plans) {
      insert.run(
        plan.id,
        plan.name,
        plan.description,
        plan.monthlyTokens,
        plan.price,
        plan.currency,
        JSON.stringify(plan.features),
        plan.popular ? 1 : 0
      );
    }

    logger.info("Seeded default plans");
  }
}

// Singleton instance
export const billingService = new BillingService();
