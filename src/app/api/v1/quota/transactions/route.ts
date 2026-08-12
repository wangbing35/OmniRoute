/**
 * Quota Transactions API
 * GET /api/v1/quota/transactions - Get user's quota transaction history
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

    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get("limit") || "20");
    const offset = parseInt(url.searchParams.get("offset") || "0");
    const type = url.searchParams.get("type");

    const result = await quotaManagementService.getQuotaTransactions(apiKey.userId || "anonymous", {
      limit,
      offset,
      type: type as any,
    });

    return NextResponse.json({
      success: true,
      transactions: result.transactions.map((tx) => ({
        id: tx.id,
        amount: tx.amount,
        balanceAfter: tx.balanceAfter,
        type: tx.type,
        description: tx.description,
        createdAt: tx.createdAt,
      })),
      total: result.total,
      limit,
      offset,
    });
  } catch (error) {
    console.error("Get transactions error:", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to get transactions",
      },
      { status: 500 }
    );
  }
}
