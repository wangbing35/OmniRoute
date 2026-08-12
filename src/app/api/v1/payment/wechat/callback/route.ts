/**
 * WeChat Pay Payment Callback API
 * POST /api/v1/payment/wechat/callback - Handle WeChat payment notifications
 */

import { NextRequest, NextResponse } from "next/server";
import { paymentService } from "@/domain/payment/paymentService.js";
import { orderService } from "@/domain/orders/orderService.js";
import { quotaManagementService } from "@/domain/quotas/quotaManagementService.js";
import { logger } from "@/lib/logging/logger.js";

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();

    logger.info("WeChat Pay callback received");

    // Verify signature
    const verification = paymentService.verifyWechatCallback(request.headers, body);

    if (!verification.valid) {
      logger.error("WeChat callback verification failed:", verification.error);
      return NextResponse.json({ code: "FAIL", message: verification.error }, { status: 400 });
    }

    // Get order by order number (WeChat uses different format)
    const orderNumber = verification.orderId?.replace(/^WX/, "ORD");
    const order = await orderService.getOrderByOrderNumber(orderNumber!);

    if (!order) {
      logger.error("Order not found for callback:", orderNumber);
      return NextResponse.json({ code: "FAIL", message: "Order not found" }, { status: 404 });
    }

    // Check if already paid
    if (order.status === "paid") {
      logger.info("Order already paid:", order.orderNumber);
      return NextResponse.json({ code: "SUCCESS", message: "OK" });
    }

    // Verify amount (WeChat uses integer amount in fen)
    if (verification.amount !== order.amountCents) {
      logger.error(
        "Amount mismatch for order:",
        order.orderNumber,
        "Expected:",
        order.amountCents,
        "Received:",
        verification.amount
      );
      return NextResponse.json({ code: "FAIL", message: "Amount mismatch" }, { status: 400 });
    }

    // Update order status
    await orderService.updateOrderStatus(order.id, "paid", {
      paymentProviderOrderId: verification.providerTransactionId,
      paidAt: new Date(),
    });

    // Credit quota to user
    await quotaManagementService.creditQuota(order.userId, order.tokens, order.id);

    logger.info("WeChat order paid successfully:", order.orderNumber);

    return NextResponse.json({ code: "SUCCESS", message: "OK" });
  } catch (error) {
    logger.error("WeChat callback processing error:", error);

    return NextResponse.json(
      {
        code: "FAIL",
        message: error instanceof Error ? error.message : "Callback processing failed",
      },
      { status: 500 }
    );
  }
}
