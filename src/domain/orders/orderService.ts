/**
 * Order Service
 * Handles order creation, status updates, and order management
 */

import { getDbInstance } from "@/lib/db/core.js";

export interface CreateOrderRequest {
  userId: string;
  packageId: string;
  paymentMethod: "alipay" | "wechat";
}

export interface Order {
  id: string;
  userId: string;
  packageId: string;
  orderNumber: string;
  amountCents: number;
  currency: string;
  tokens: number;
  status: "pending" | "paid" | "failed" | "cancelled" | "expired";
  paymentMethod: "alipay" | "wechat";
  paymentProviderOrderId?: string;
  createdAt: Date;
  paidAt?: Date;
  expiredAt?: Date;
  updatedAt: Date;
  metadata?: Record<string, any>;
}

export interface OrderListOptions {
  limit?: number;
  offset?: number;
  status?: Order["status"];
  startDate?: Date;
  endDate?: Date;
}

export class OrderService {
  /**
   * Create a new quota purchase order
   */
  async createOrder(request: CreateOrderRequest): Promise<Order> {
    const db = getDbInstance();

    // Get package details
    const pkg = await db.get(
      "SELECT id, name, tokens, price_cents FROM quota_packages WHERE id = ? AND active = 1",
      [request.packageId]
    );

    if (!pkg) {
      throw new Error("Package not found or inactive");
    }

    // Generate order ID and order number
    const orderId = this.generateOrderId();
    const orderNumber = this.generateOrderNumber();
    const now = new Date();
    const expiredAt = new Date(now.getTime() + 30 * 60 * 1000); // 30 minutes

    // Create order
    await db.run(
      `INSERT INTO quota_orders (
        id, user_id, package_id, order_number, amount_cents, currency,
        tokens, status, payment_method, created_at, expired_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        orderId,
        request.userId,
        request.packageId,
        orderNumber,
        pkg.price_cents,
        "CNY",
        pkg.tokens,
        "pending",
        request.paymentMethod,
        now.toISOString(),
        expiredAt.toISOString(),
        now.toISOString(),
      ]
    );

    return {
      id: orderId,
      userId: request.userId,
      packageId: request.packageId,
      orderNumber,
      amountCents: pkg.price_cents,
      currency: "CNY",
      tokens: pkg.tokens,
      status: "pending",
      paymentMethod: request.paymentMethod,
      createdAt: now,
      expiredAt,
      updatedAt: now,
    };
  }

  /**
   * Get order by ID
   */
  async getOrder(orderId: string, userId?: string): Promise<Order | null> {
    const db = getDbInstance();

    let query = "SELECT * FROM quota_orders WHERE id = ?";
    const params: any[] = [orderId];

    if (userId) {
      query += " AND user_id = ?";
      params.push(userId);
    }

    const row = await db.get(query, params);
    if (!row) return null;

    return this.mapRowToOrder(row);
  }

  /**
   * Get order by order number
   */
  async getOrderByOrderNumber(orderNumber: string): Promise<Order | null> {
    const db = getDbInstance();
    const row = await db.get("SELECT * FROM quota_orders WHERE order_number = ?", [orderNumber]);

    if (!row) return null;
    return this.mapRowToOrder(row);
  }

  /**
   * Get user's orders with filtering
   */
  async getUserOrders(
    userId: string,
    options: OrderListOptions = {}
  ): Promise<{ orders: Order[]; total: number }> {
    const db = getDbInstance();

    const conditions = ["user_id = ?"];
    const params: any[] = [userId];

    if (options.status) {
      conditions.push("status = ?");
      params.push(options.status);
    }

    if (options.startDate) {
      conditions.push("created_at >= ?");
      params.push(options.startDate.toISOString());
    }

    if (options.endDate) {
      conditions.push("created_at <= ?");
      params.push(options.endDate.toISOString());
    }

    const whereClause = conditions.join(" AND ");

    // Get total count
    const countResult = await db.get(
      `SELECT COUNT(*) as total FROM quota_orders WHERE ${whereClause}`,
      params
    );
    const total = countResult?.total || 0;

    // Get paginated orders
    const limit = options.limit || 20;
    const offset = options.offset || 0;

    params.push(limit, offset);

    const rows = await db.all(
      `SELECT * FROM quota_orders WHERE ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      params
    );

    const orders = rows.map((row) => this.mapRowToOrder(row));

    return { orders, total };
  }

  /**
   * Update order status
   */
  async updateOrderStatus(
    orderId: string,
    status: Order["status"],
    additionalData?: {
      paymentProviderOrderId?: string;
      paidAt?: Date;
    }
  ): Promise<void> {
    const db = getDbInstance();

    const updates: string[] = ["status = ?", "updated_at = ?"];
    const params: any[] = [status, new Date().toISOString()];

    if (additionalData?.paymentProviderOrderId) {
      updates.push("payment_provider_order_id = ?");
      params.push(additionalData.paymentProviderOrderId);
    }

    if (additionalData?.paidAt) {
      updates.push("paid_at = ?");
      params.push(additionalData.paidAt.toISOString());
    }

    params.push(orderId);

    await db.run(`UPDATE quota_orders SET ${updates.join(", ")} WHERE id = ?`, params);
  }

  /**
   * Cancel pending order
   */
  async cancelOrder(orderId: string, userId: string): Promise<boolean> {
    const order = await this.getOrder(orderId, userId);
    if (!order) return false;

    if (order.status !== "pending") {
      throw new Error("Only pending orders can be cancelled");
    }

    await this.updateOrderStatus(orderId, "cancelled");
    return true;
  }

  /**
   * Expire pending orders
   */
  async expirePendingOrders(): Promise<number> {
    const db = getDbInstance();

    const result = await db.run(
      `UPDATE quota_orders
       SET status = 'expired', updated_at = CURRENT_TIMESTAMP
       WHERE status = 'pending' AND expired_at < CURRENT_TIMESTAMP`
    );

    return result.changes || 0;
  }

  /**
   * Get all orders (admin function)
   */
  async getAllOrders(options: OrderListOptions = {}): Promise<{
    orders: Order[];
    total: number;
  }> {
    const db = getDbInstance();

    const conditions: string[] = [];
    const params: any[] = [];

    if (options.status) {
      conditions.push("status = ?");
      params.push(options.status);
    }

    if (options.startDate) {
      conditions.push("created_at >= ?");
      params.push(options.startDate.toISOString());
    }

    if (options.endDate) {
      conditions.push("created_at <= ?");
      params.push(options.endDate.toISOString());
    }

    const whereClause = conditions.length > 0 ? conditions.join(" AND ") : "1=1";

    // Get total count
    const countResult = await db.get(
      `SELECT COUNT(*) as total FROM quota_orders WHERE ${whereClause}`,
      params
    );
    const total = countResult?.total || 0;

    // Get paginated orders
    const limit = options.limit || 50;
    const offset = options.offset || 0;

    params.push(limit, offset);

    const rows = await db.all(
      `SELECT * FROM quota_orders WHERE ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      params
    );

    const orders = rows.map((row) => this.mapRowToOrder(row));

    return { orders, total };
  }

  /**
   * Generate unique order ID
   */
  private generateOrderId(): string {
    return `ORD-${Date.now()}-${randomBytes(8).toString("hex")}`;
  }

  /**
   * Generate human-readable order number
   */
  private generateOrderNumber(): string {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 10000)
      .toString()
      .padStart(4, "0");
    return `ORD${timestamp}${random}`;
  }

  /**
   * Map database row to Order object
   */
  private mapRowToOrder(row: any): Order {
    return {
      id: row.id,
      userId: row.user_id,
      packageId: row.package_id,
      orderNumber: row.order_number,
      amountCents: row.amount_cents,
      currency: row.currency,
      tokens: row.tokens,
      status: row.status,
      paymentMethod: row.payment_method,
      paymentProviderOrderId: row.payment_provider_order_id,
      createdAt: new Date(row.created_at),
      paidAt: row.paid_at ? new Date(row.paid_at) : undefined,
      expiredAt: row.expired_at ? new Date(row.expired_at) : undefined,
      updatedAt: new Date(row.updated_at),
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    };
  }
}

// Singleton instance
export const orderService = new OrderService();
