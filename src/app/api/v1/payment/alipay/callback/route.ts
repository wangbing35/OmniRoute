/**
 * Alipay Payment Callback API
 * POST /api/v1/payment/alipay/callback - Handle Alipay payment notifications
 */

import { NextRequest, NextResponse } from "next/server";
import { paymentService } from "@/domain/payment/paymentService.js";
import { orderService } from "@/domain/orders/orderService.js";
import { quotaManagementService } from "@/domain/quotas/quotaManagementService.js";
import { logger } from "@/lib/logging/logger.js";

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const params = new URLSearchParams(body);
    const paramsObj: Record<string, any> = {};

    for (const [key, value] of params.entries()) {
      paramsObj[key] = value;
    }

    logger.info("Alipay callback received:", paramsObj);

    // Verify signature
    const verification = paymentService.verifyAlipayCallback(paramsObj);

    if (!verification.valid) {
      logger.error("Alipay callback verification failed:", verification.error);
      return NextResponse.json({ error: verification.error }, { status: 400 });
    }

    // Get order by order number
    const order = await orderService.getOrderByOrderNumber(verification.orderId!);

    if (!order) {
      logger.error("Order not found for callback:", verification.orderId);
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    // Check if already paid
    if (order.status === "paid") {
      logger.info("Order already paid:", order.orderNumber);
      return NextResponse.json({ success: true });
    }

    // Verify amount
    if (verification.amount !== order.amountCents) {
      logger.error(
        "Amount mismatch for order:",
        order.orderNumber,
        "Expected:",
        order.amountCents,
        "Received:",
        verification.amount
      );
      return NextResponse.json({ error: "Amount mismatch" }, { status: 400 });
    }

    // Update order status
    await orderService.updateOrderStatus(order.id, "paid", {
      paymentProviderOrderId: verification.providerTransactionId,
      paidAt: new Date(),
    });

    // Credit quota to user
    await quotaManagementService.creditQuota(order.userId, order.tokens, order.id);

    logger.info("Order paid successfully:", order.orderNumber);

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("Alipay callback processing error:", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Callback processing failed",
      },
      { status: 500 }
    );
  }
}
