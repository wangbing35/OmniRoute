/**
 * Price Comparison API
 * GET /api/v1/pricing/compare - Get price comparisons for models
 */

import { NextRequest, NextResponse } from "next/server";
import { analyticsService } from "../../../../domain/analytics/analyticsService.js";

// GET /api/v1/pricing/compare?model=claude-3-5-sonnet
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const searchParams = request.nextUrl.searchParams;
    const model = searchParams.get("model");

    if (model) {
      // Get price comparison for specific model
      const comparison = await analyticsService.getPriceComparison(model);

      return NextResponse.json({
        success: true,
        model: comparison.model,
        providers: comparison.providers.map((p) => ({
          ...p,
          rank: p.rank,
          isCheapest: p.provider === comparison.cheapestProvider,
          isFastest: p.provider === comparison.fastestProvider,
          isMostReliable: p.provider === comparison.mostReliable,
        })),
        summary: {
          cheapestProvider: comparison.cheapestProvider,
          fastestProvider: comparison.fastestProvider,
          mostReliable: comparison.mostReliable,
        },
      });
    } else {
      // Get all price comparisons
      const comparisons = await analyticsService.getAllPriceComparisons();

      return NextResponse.json({
        success: true,
        models: comparisons.map((comp) => ({
          model: comp.model,
          providerCount: comp.providers.length,
          cheapestProvider: comp.cheapestProvider,
          priceRange: {
            min: Math.min(...comp.providers.map((p) => p.inputPrice)),
            max: Math.max(...comp.providers.map((p) => p.inputPrice)),
          },
          latencyRange: {
            min: Math.min(...comp.providers.map((p) => p.avgLatency || 0)),
            max: Math.max(...comp.providers.map((p) => p.avgLatency || 0)),
          },
        })),
      });
    }
  } catch (error) {
    console.error("Price comparison error:", error);

    return NextResponse.json(
      {
        error: {
          message: "Failed to retrieve price comparison",
          type: "api_error",
        },
      },
      { status: 500 }
    );
  }
}
