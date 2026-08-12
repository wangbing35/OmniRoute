/**
 * Quota Status API
 * GET /api/v1/quota/status - Get user's current quota status
 */

import { NextRequest, NextResponse } from "next/server";
import { quotaManagementService } from "@/domain/quotas/quotaManagementService.js";
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

    const userId = apiKey.userId || "anonymous";
    const quotaStatus = await quotaManagementService.getQuotaStatus(userId);

    return NextResponse.json({
      success: true,
      quota: {
        userId: quotaStatus.userId,
        tier: quotaStatus.tier,
        free: {
          remaining: quotaStatus.freeRemaining,
          total: quotaStatus.freeTotal,
        },
        purchased: {
          remaining: quotaStatus.purchasedRemaining,
          total: quotaStatus.purchasedTotal,
        },
        total: {
          remaining: quotaStatus.totalRemaining,
          total: quotaStatus.freeTotal + quotaStatus.purchasedTotal,
        },
        resetDate: quotaStatus.resetDate,
        usagePercentage: quotaStatus.usagePercentage,
        isOverQuota: quotaStatus.isOverQuota,
      },
    });
  } catch (error) {
    console.error("Get quota status error:", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to get quota status",
      },
      { status: 500 }
    );
  }
}
