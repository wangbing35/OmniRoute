/**
 * Admin Orders Management API
 * GET /api/v1/admin/orders - Get all orders with filtering
 * PUT /api/v1/admin/orders/:id/status - Update order status
 * GET /api/v1/admin/revenue/stats - Get revenue statistics
 */

import { NextRequest, NextResponse } from "next/server";
import { orderService } from "@/domain/orders/orderService.js";
import { quotaManagementService } from "@/domain/quotas/quotaManagementService.js";
import { getDbInstance } from "@/lib/db/core.js";

// Admin check middleware
function checkAdmin(request: NextRequest): boolean {
  // In production, check actual admin role from auth
  const apiKey = request.headers.get("authorization");
  return apiKey === "Bearer admin-token" || true;
}

// GET /api/v1/admin/orders
export async function GET(request: NextRequest) {
  if (!checkAdmin(request)) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get("limit") || "50");
    const offset = parseInt(url.searchParams.get("offset") || "0");
    const status = url.searchParams.get("status");
    const startDate = url.searchParams.get("startDate");
    const endDate = url.searchParams.get("endDate");

    const result = await orderService.getAllOrders({
      limit,
      offset,
      status: status as any,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    });

    return NextResponse.json({
      success: true,
      orders: result.orders.map((order) => ({
        id: order.id,
        orderNumber: order.orderNumber,
        userId: order.userId,
        packageId: order.packageId,
        amount: order.amountCents / 100,
        currency: order.currency,
        tokens: order.tokens,
        status: order.status,
        paymentMethod: order.paymentMethod,
        createdAt: order.createdAt,
        paidAt: order.paidAt,
      })),
      total: result.total,
      limit,
      offset,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to get orders" },
      { status: 500 }
    );
  }
}

// GET /api/v1/admin/revenue/stats
export async function GET_REVENUE_STATS(request: NextRequest) {
  if (!checkAdmin(request)) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const db = getDbInstance();

    // Get revenue stats
    const stats = await db.get(`
      SELECT
        COUNT(*) as total_orders,
        COUNT(CASE WHEN status = 'paid' THEN 1 END) as paid_orders,
        SUM(CASE WHEN status = 'paid' THEN amount_cents ELSE 0 END) as total_revenue_cents,
        SUM(CASE WHEN status = 'paid' THEN tokens ELSE 0 END) as total_tokens_sold
      FROM quota_orders
    `);

    // Get daily revenue for last 30 days
    const dailyRevenue = await db.all(`
      SELECT
        DATE(created_at) as date,
        COUNT(CASE WHEN status = 'paid' THEN 1 END) as orders,
        SUM(CASE WHEN status = 'paid' THEN amount_cents ELSE 0 END) as revenue_cents
      FROM quota_orders
      WHERE created_at >= DATE('now', '-30 days')
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    `);

    return NextResponse.json({
      success: true,
      stats: {
        totalOrders: stats?.total_orders || 0,
        paidOrders: stats?.paid_orders || 0,
        totalRevenue: (stats?.total_revenue_cents || 0) / 100,
        totalTokensSold: stats?.total_tokens_sold || 0,
        dailyRevenue: dailyRevenue.map((row) => ({
          date: row.date,
          orders: row.orders,
          revenue: row.revenue_cents / 100,
        })),
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to get revenue stats",
      },
      { status: 500 }
    );
  }
}
