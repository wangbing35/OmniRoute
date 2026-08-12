/**
 * Quota Packages API
 * GET /api/v1/quota/packages - Get available quota packages
 */

import { NextRequest, NextResponse } from "next/server";
import { quotaManagementService } from "@/domain/quotas/quotaManagementService.js";

export async function GET(request: NextRequest) {
  try {
    const packages = await quotaManagementService.getQuotaPackages();

    return NextResponse.json({
      success: true,
      packages: packages.map((pkg) => ({
        id: pkg.id,
        name: pkg.name,
        description: pkg.description,
        tokens: pkg.tokens,
        price: pkg.priceCents / 100, // Convert to yuan
        currency: pkg.currency,
        popular: pkg.popular,
      })),
    });
  } catch (error) {
    console.error("Get quota packages error:", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to get quota packages",
      },
      { status: 500 }
    );
  }
}
