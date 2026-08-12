/**
 * Quota Purchase API
 * POST /api/v1/quota/purchase - Create purchase order
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { quotaManagementService } from "@/domain/quotas/quotaManagementService.js";
import { orderService } from "@/domain/orders/orderService.js";
import { paymentService } from "@/domain/payment/paymentService.js";
import { extractApiKey } from "@/sse/services/auth.js";

// Validation schema
const purchaseSchema = z.object({
  packageId: z.string().min(1, "Package ID is required"),
  paymentMethod: z.enum(["alipay", "wechat"], {
    errorMap: () => ({ message: "Payment method must be alipay or wechat" }),
  }),
});

export async function POST(request: NextRequest) {
  try {
    // Extract user info from request
    const apiKey = extractApiKey(request);
    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 }
      );
    }

    // Validate request body
    const body = await request.json();
    const validation = purchaseSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid request body",
          details: validation.error.errors,
        },
        { status: 400 }
      );
    }

    const { packageId, paymentMethod } = validation.data;

    // Check if package exists
    const pkg = await quotaManagementService.getQuotaPackage(packageId);
    if (!pkg) {
      return NextResponse.json(
        { success: false, error: "Package not found or inactive" },
        { status: 404 }
      );
    }

    // Create order
    const order = await orderService.createOrder({
      userId: apiKey.userId || "anonymous", // Use actual user ID from auth
      packageId,
      paymentMethod,
    });

    // Create payment order
    const paymentResponse = await paymentService.createPaymentOrder(
      {
        userId: apiKey.userId || "anonymous",
        packageId,
        paymentMethod,
      },
      {
        orderId: order.id,
        orderNumber: order.orderNumber,
        amountCents: order.amountCents,
        tokens: order.tokens,
        expiredAt: order.expiredAt!,
      }
    );

    if (!paymentResponse.success) {
      // Mark order as failed
      await orderService.updateOrderStatus(order.id, "failed");
      return NextResponse.json(
        {
          success: false,
          error: paymentResponse.error || "Failed to create payment",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      order: {
        id: order.id,
        orderNumber: order.orderNumber,
        package: {
          id: pkg.id,
          name: pkg.name,
          tokens: pkg.tokens,
          price: pkg.priceCents / 100,
        },
        amount: order.amountCents / 100,
        currency: order.currency,
        status: order.status,
        createdAt: order.createdAt,
        expiredAt: order.expiredAt,
      },
      payment: paymentResponse.paymentParams,
    });
  } catch (error) {
    console.error("Quota purchase error:", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Purchase failed",
      },
      { status: 500 }
    );
  }
}
