/**
 * Order Detail API
 * GET /api/v1/orders/:id - Get order details
 * POST /api/v1/orders/:id/cancel - Cancel order
 */

import { NextRequest, NextResponse } from "next/server";
import { orderService } from "@/domain/orders/orderService.js";
import { extractApiKey } from "@/sse/services/auth.js";

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const apiKey = extractApiKey(request);
    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 }
      );
    }

    const order = await orderService.getOrder(params.id, apiKey.userId || "anonymous");

    if (!order) {
      return NextResponse.json({ success: false, error: "Order not found" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      order: {
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
      },
    });
  } catch (error) {
    console.error("Get order error:", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to get order",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const apiKey = extractApiKey(request);
    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const action = body.action;

    if (action === "cancel") {
      const success = await orderService.cancelOrder(params.id, apiKey.userId || "anonymous");

      if (success) {
        return NextResponse.json({ success: true });
      } else {
        return NextResponse.json(
          { success: false, error: "Failed to cancel order" },
          { status: 400 }
        );
      }
    }

    return NextResponse.json({ success: false, error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("Order action error:", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Order action failed",
      },
      { status: 500 }
    );
  }
}
