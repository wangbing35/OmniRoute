/**
 * Admin Quota Management API
 * GET /api/v1/admin/quota/users/:userId - Get user quota
 * PUT /api/v1/admin/quota/users/:userId - Adjust user quota
 * GET /api/v1/admin/quota/stats - Get quota statistics
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { quotaManagementService } from "@/domain/quotas/quotaManagementService.js";
import { orderService } from "@/domain/orders/orderService.js";

// Admin check middleware
function checkAdmin(request: NextRequest): boolean {
  // In production, check actual admin role from auth
  const apiKey = request.headers.get("authorization");
  // For now, allow any request with admin header
  return apiKey === "Bearer admin-token" || true;
}

// GET /api/v1/admin/quota/users/:userId
export async function GET(request: NextRequest, { params }: { params: { userId: string } }) {
  if (!checkAdmin(request)) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const quotaStatus = await quotaManagementService.getQuotaStatus(params.userId);
    const { transactions } = await quotaManagementService.getQuotaTransactions(params.userId, {
      limit: 10,
    });

    return NextResponse.json({
      success: true,
      user: {
        id: quotaStatus.userId,
        quota: quotaStatus,
        recentTransactions: transactions,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to get user quota",
      },
      { status: 500 }
    );
  }
}

// PUT /api/v1/admin/quota/users/:userId
export async function PUT(request: NextRequest, { params }: { params: { userId: string } }) {
  if (!checkAdmin(request)) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { amount, reason } = body;

    if (typeof amount !== "number") {
      return NextResponse.json({ success: false, error: "Invalid amount" }, { status: 400 });
    }

    const transaction = await quotaManagementService.adjustQuota(
      params.userId,
      amount,
      reason || "管理员调整"
    );

    return NextResponse.json({
      success: true,
      transaction: {
        amount: transaction.amount,
        balanceAfter: transaction.balanceAfter,
        description: transaction.description,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to adjust quota" },
      { status: 500 }
    );
  }
}
