/**
 * Orders API
 * GET /api/v1/orders - Get user's orders
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { orderService } from "@/domain/orders/orderService.js";
import { extractApiKey } from "@/sse/services/auth.js";

export async function GET(request: NextRequest) {
  try {
    const apiKey = extractApiKey(request);
    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 }
      );
    }

    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get("limit") || "20");
    const offset = parseInt(url.searchParams.get("offset") || "0");
    const status = url.searchParams.get("status");

    const result = await orderService.getUserOrders(apiKey.userId || "anonymous", {
      limit,
      offset,
      status: status as any,
    });

    return NextResponse.json({
      success: true,
      orders: result.orders.map((order) => ({
        id: order.id,
        orderNumber: order.orderNumber,
        packageId: order.packageId,
        amount: order.amountCents / 100,
        currency: order.currency,
        tokens: order.tokens,
        status: order.status,
        paymentMethod: order.paymentMethod,
        createdAt: order.createdAt,
        paidAt: order.paidAt,
        expiredAt: order.expiredAt,
      })),
      total: result.total,
      limit,
      offset,
    });
  } catch (error) {
    console.error("Get orders error:", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to get orders",
      },
      { status: 500 }
    );
  }
}
