/**
 * Analytics Service Implementation
 * Provides price comparison, latency monitoring, and analytics
 */

import { getDb, generateId } from "../database/database.js";
import type { PricingInfo } from "../auth/authTypes.js";
import { quotaService } from "../quotas/quotaServiceImplementation.js";
import { logger } from "@/lib/logging/logger.js";

export interface ProviderMetrics {
  provider: string;
  model: string;
  avgLatency: number;
  p95Latency: number;
  p99Latency: number;
  successRate: number;
  requestCount: number;
  lastUpdated: Date;
}

export interface PriceComparison {
  model: string;
  providers: Array<{
    provider: string;
    inputPrice: number;
    outputPrice: number;
    avgLatency: number;
    successRate: number;
    availability: "available" | "degraded" | "unavailable";
    rank: number;
  }>;
  cheapestProvider: string;
  fastestProvider: string;
  mostReliable: string;
}

export interface LatencyHistory {
  provider: string;
  model: string;
  timestamps: Date[];
  latencies: number[];
  period: {
    start: Date;
    end: Date;
  };
}

/**
 * Default pricing data for popular models
 */
const DEFAULT_PRICING = {
  "claude-3-5-sonnet": {
    anthropic: { input: 3.0, output: 15.0 },
    openrouter: { input: 3.15, output: 15.75 },
    cheaperinference: { input: 2.9, output: 14.5 },
  },
  "claude-3-5-haiku": {
    anthropic: { input: 0.8, output: 4.0 },
    openrouter: { input: 0.85, output: 4.2 },
    cheaperinference: { input: 0.75, output: 3.8 },
  },
  "gpt-4o": {
    openai: { input: 5.0, output: 15.0 },
    openrouter: { input: 5.25, output: 15.75 },
    cheaperinference: { input: 4.9, output: 14.7 },
  },
  "gpt-4o-mini": {
    openai: { input: 0.15, output: 0.6 },
    openrouter: { input: 0.16, output: 0.63 },
    cheaperinference: { input: 0.14, output: 0.56 },
  },
  "gemini-2.0-flash-exp": {
    google: { input: 0.075, output: 0.3 },
    openrouter: { input: 0.08, output: 0.32 },
    vertex: { input: 0.07, output: 0.28 },
  },
  "deepseek-chat": {
    deepseek: { input: 0.14, output: 0.28 },
    openrouter: { input: 0.15, output: 0.3 },
    together: { input: 0.13, output: 0.26 },
  },
  "llama-3.3-70b": {
    groq: { input: 0.59, output: 0.79 },
    together: { input: 0.89, output: 0.89 },
    openrouter: { input: 0.6, output: 0.8 },
  },
};

export class AnalyticsService {
  private pricingCache: Map<string, any> = new Map();
  private lastCacheUpdate: Date | null = null;
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  /**
   * Get real-time price comparison for a specific model
   */
  async getPriceComparison(model: string): Promise<PriceComparison> {
    const db = getDb();

    // Get pricing info
    const pricingRows = db
      .prepare(
        `
      SELECT provider, model, input_price_per_million, output_price_per_million, last_updated
      FROM pricing_info
      WHERE model = ?
    `
      )
      .all(model) as any[];

    // If no pricing in DB, use defaults
    let providers = pricingRows;
    if (providers.length === 0) {
      const defaults = DEFAULT_PRICING[model as keyof typeof DEFAULT_PRICING];
      if (defaults) {
        providers = Object.entries(defaults).map(([provider, prices]: [string, any]) => ({
          provider,
          model,
          input_price_per_million: prices.input,
          output_price_per_million: prices.output,
          last_updated: new Date().toISOString(),
        }));
        // Save to database
        await this.seedPricingData(db, model, providers);
      } else {
        throw new Error(`No pricing data available for model: ${model}`);
      }
    }

    // Get metrics for each provider
    const providersWithMetrics = await Promise.all(
      providers.map(async (p: any) => {
        const metrics = await this.getProviderMetrics(p.provider, model);
        return {
          provider: p.provider,
          inputPrice: p.input_price_per_million,
          outputPrice: p.output_price_per_million,
          avgLatency: metrics[0]?.avgLatency || 0,
          successRate: metrics[0]?.successRate || 1.0,
          availability: this.getAvailability(metrics[0]),
          rank: 0,
        };
      })
    );

    // Calculate rankings
    const cheapest = [...providersWithMetrics].sort(
      (a, b) => a.inputPrice + a.outputPrice - (b.inputPrice + b.outputPrice)
    )[0];
    const fastest = [...providersWithMetrics]
      .filter((p) => p.avgLatency > 0)
      .sort((a, b) => a.avgLatency - b.avgLatency)[0];
    const mostReliable = [...providersWithMetrics].sort((a, b) => b.successRate - a.successRate)[0];

    // Calculate overall rank (weighted average of price, latency, reliability)
    const weighted = providersWithMetrics.map((p) => {
      const priceScore = (1 / (p.inputPrice + p.outputPrice)) * 100;
      const latencyScore = p.avgLatency > 0 ? (1 / p.avgLatency) * 1000 : 0;
      const reliabilityScore = p.successRate * 100;
      const totalScore = priceScore * 0.4 + latencyScore * 0.3 + reliabilityScore * 0.3;
      return { ...p, rank: totalScore };
    });

    const sorted = weighted.sort((a, b) => b.rank - a.rank);
    sorted.forEach((p, i) => (p.rank = i + 1));

    return {
      model,
      providers: sorted,
      cheapestProvider: cheapest.provider,
      fastestProvider: fastest?.provider || sorted[0].provider,
      mostReliable: mostReliable.provider,
    };
  }

  /**
   * Get all models with price comparisons
   */
  async getAllPriceComparisons(): Promise<PriceComparison[]> {
    const models = Object.keys(DEFAULT_PRICING);
    const comparisons: PriceComparison[] = [];

    for (const model of models) {
      try {
        const comparison = await this.getPriceComparison(model);
        comparisons.push(comparison);
      } catch (error) {
        logger.warn(`Failed to get price comparison for ${model}:`, error);
      }
    }

    return comparisons;
  }

  /**
   * Get provider metrics
   */
  async getProviderMetrics(provider: string, model?: string): Promise<ProviderMetrics[]> {
    const db = getDb();

    let query = "SELECT * FROM provider_metrics WHERE provider = ?";
    const params: any[] = [provider];

    if (model) {
      query += " AND model = ?";
      params.push(model);
    }

    const rows = db.prepare(query).all(...params) as any[];

    if (rows.length === 0) {
      // Return default metrics
      return [
        {
          provider,
          model: model || "default",
          avgLatency: 500,
          p95Latency: 1000,
          p99Latency: 2000,
          successRate: 1.0,
          requestCount: 0,
          lastUpdated: new Date(),
        },
      ];
    }

    return rows.map((row) => ({
      provider: row.provider,
      model: row.model,
      avgLatency: row.avg_latency,
      p95Latency: row.p95_latency,
      p99Latency: row.p99_latency,
      successRate: row.success_rate,
      requestCount: row.request_count,
      lastUpdated: new Date(row.last_updated),
    }));
  }

  /**
   * Get latency history for a provider/model
   */
  async getLatencyHistory(
    provider: string,
    model: string,
    period: {
      start: Date;
      end: Date;
    }
  ): Promise<LatencyHistory> {
    const db = getDb();

    const rows = db
      .prepare(
        `
      SELECT timestamp, latency
      FROM usage_records
      WHERE provider = ? AND model = ?
        AND timestamp >= ? AND timestamp <= ?
      ORDER BY timestamp ASC
    `
      )
      .all(provider, model, period.start.toISOString(), period.end.toISOString()) as any[];

    return {
      provider,
      model,
      timestamps: rows.map((r) => new Date(r.timestamp)),
      latencies: rows.map((r) => r.latency),
      period,
    };
  }

  /**
   * Record latency data point
   */
  async recordLatency(
    provider: string,
    model: string,
    latency: number,
    success: boolean
  ): Promise<void> {
    const db = getDb();

    // Get existing metrics
    const existing = db
      .prepare(
        `
      SELECT * FROM provider_metrics
      WHERE provider = ? AND model = ?
    `
      )
      .get(provider, model) as any;

    if (existing) {
      // Update metrics with new data point (exponential moving average)
      const alpha = 0.1; // Smoothing factor
      const newAvgLatency =
        existing.avg_latency === 0 ? latency : alpha * latency + (1 - alpha) * existing.avg_latency;
      const newSuccessRate = alpha * (success ? 1 : 0) + (1 - alpha) * existing.success_rate;
      const newRequestCount = existing.request_count + 1;

      db.prepare(
        `
        UPDATE provider_metrics
        SET avg_latency = ?,
            success_rate = ?,
            request_count = ?,
            last_updated = CURRENT_TIMESTAMP
        WHERE provider = ? AND model = ?
      `
      ).run(newAvgLatency, newSuccessRate, newRequestCount, provider, model);
    } else {
      // Create new metrics record
      db.prepare(
        `
        INSERT INTO provider_metrics (id, provider, model, avg_latency, success_rate, request_count)
        VALUES (?, ?, ?, ?, ?, ?)
      `
      ).run(generateId("metrics"), provider, model, latency, success ? 1 : 0, 1);
    }
  }

  /**
   * Get optimal provider for a model based on criteria
   */
  async getOptimalProvider(
    model: string,
    criteria: {
      prioritizeCost?: boolean;
      prioritizeLatency?: boolean;
      prioritizeReliability?: boolean;
      maxLatency?: number;
      maxCost?: number;
    }
  ): Promise<{
    provider: string;
    reason: string;
    estimatedCost: number;
    estimatedLatency: number;
  }> {
    const comparison = await this.getPriceComparison(model);

    let providers = comparison.providers;

    // Apply filters
    if (criteria.maxCost) {
      providers = providers.filter((p) => p.inputPrice + p.outputPrice <= criteria.maxCost);
    }

    if (criteria.maxLatency && providers.length > 0) {
      providers = providers.filter((p) => p.avgLatency > 0 && p.avgLatency <= criteria.maxLatency);
    }

    if (providers.length === 0) {
      // Fallback to all providers if filters are too restrictive
      providers = comparison.providers;
    }

    // Sort based on priority
    if (criteria.prioritizeCost) {
      providers.sort((a, b) => a.inputPrice + a.outputPrice - (b.inputPrice + b.outputPrice));
    } else if (criteria.prioritizeLatency) {
      providers.sort((a, b) => a.avgLatency - b.avgLatency);
    } else if (criteria.prioritizeReliability) {
      providers.sort((a, b) => b.successRate - a.successRate);
    } else {
      // Balanced approach (use rank)
      providers.sort((a, b) => a.rank - b.rank);
    }

    const optimal = providers[0];

    return {
      provider: optimal.provider,
      reason: this.getSelectionReason(optimal, criteria),
      estimatedCost: (optimal.inputPrice + optimal.outputPrice) / 2, // Average estimate
      estimatedLatency: optimal.avgLatency,
    };
  }

  /**
   * Get cost estimate for a request
   */
  async getCostEstimate(
    model: string,
    inputTokens: number,
    outputTokens: number
  ): Promise<{
    providers: Array<{
      provider: string;
      estimatedCost: number;
      currency: string;
    }>;
    cheapest: {
      provider: string;
      cost: number;
    };
  }> {
    const comparison = await this.getPriceComparison(model);

    const providers = comparison.providers.map((p) => {
      const inputCost = (inputTokens / 1000000) * p.inputPrice;
      const outputCost = (outputTokens / 1000000) * p.outputPrice;
      return {
        provider: p.provider,
        estimatedCost: inputCost + outputCost,
        currency: "USD",
      };
    });

    const cheapest = providers.reduce((min, p) => (p.estimatedCost < min.estimatedCost ? p : min));

    return { providers, cheapest };
  }

  /**
   * Get aggregate analytics dashboard data
   */
  async getDashboardData(
    userId: string,
    period: {
      start: Date;
      end: Date;
    }
  ): Promise<{
    totalRequests: number;
    totalTokens: number;
    totalCost: number;
    avgLatency: number;
    topModels: Array<{
      model: string;
      requests: number;
      tokens: number;
      cost: number;
    }>;
    topProviders: Array<{
      provider: string;
      requests: number;
      avgLatency: number;
      successRate: number;
    }>;
    costByProvider: Array<{
      provider: string;
      cost: number;
      percentage: number;
    }>;
  }> {
    const db = getDb();

    // Overall stats
    const overall = db
      .prepare(
        `
      SELECT
        COUNT(*) as totalRequests,
        COALESCE(SUM(tokens_used), 0) as totalTokens,
        COALESCE(SUM(cost), 0) as totalCost,
        COALESCE(AVG(latency), 0) as avgLatency
      FROM usage_records
      WHERE user_id = ? AND timestamp >= ? AND timestamp <= ?
    `
      )
      .get(userId, period.start.toISOString(), period.end.toISOString()) as any;

    // Top models
    const topModels = db
      .prepare(
        `
      SELECT
        model,
        COUNT(*) as requests,
        SUM(tokens_used) as tokens,
        SUM(cost) as cost
      FROM usage_records
      WHERE user_id = ? AND timestamp >= ? AND timestamp <= ?
      GROUP BY model
      ORDER BY requests DESC
      LIMIT 10
    `
      )
      .all(userId, period.start.toISOString(), period.end.toISOString()) as any[];

    // Top providers
    const topProviders = db
      .prepare(
        `
      SELECT
        provider,
        COUNT(*) as requests,
        AVG(latency) as avgLatency,
        CAST(SUM(CASE WHEN latency > 0 THEN 1 ELSE 0 END) AS FLOAT) / COUNT(*) as successRate
      FROM usage_records
      WHERE user_id = ? AND timestamp >= ? AND timestamp <= ?
      GROUP BY provider
      ORDER BY requests DESC
      LIMIT 10
    `
      )
      .all(userId, period.start.toISOString(), period.end.toISOString()) as any[];

    // Cost by provider
    const costByProvider = db
      .prepare(
        `
      SELECT
        provider,
        SUM(cost) as cost
      FROM usage_records
      WHERE user_id = ? AND timestamp >= ? AND timestamp <= ?
      GROUP BY provider
      ORDER BY cost DESC
    `
      )
      .all(userId, period.start.toISOString(), period.end.toISOString()) as any[];

    const totalCost = costByProvider.reduce((sum: number, p: any) => sum + p.cost, 0);

    return {
      totalRequests: overall.totalRequests || 0,
      totalTokens: overall.totalTokens || 0,
      totalCost: overall.totalCost || 0,
      avgLatency: Math.round(overall.avgLatency || 0),
      topModels: topModels.map((m) => ({
        model: m.model,
        requests: m.requests,
        tokens: m.tokens,
        cost: m.cost,
      })),
      topProviders: topProviders.map((p) => ({
        provider: p.provider,
        requests: p.requests,
        avgLatency: Math.round(p.avgLatency),
        successRate: p.successRate,
      })),
      costByProvider: costByProvider.map((p) => ({
        provider: p.provider,
        cost: p.cost,
        percentage: totalCost > 0 ? (p.cost / totalCost) * 100 : 0,
      })),
    };
  }

  /**
   * Update pricing information from providers
   */
  async updatePricingInfo(): Promise<void> {
    const db = getDb();

    for (const [model, providers] of Object.entries(DEFAULT_PRICING)) {
      for (const [provider, prices] of Object.entries(providers)) {
        db.prepare(
          `
          INSERT OR REPLACE INTO pricing_info (id, provider, model, input_price_per_million, output_price_per_million, last_updated)
          VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `
        ).run(generateId("pricing"), provider, model, prices.input, prices.output);
      }
    }

    this.lastCacheUpdate = new Date();
    logger.info("Updated pricing information from providers");
  }

  /**
   * Get price history for a model/provider
   */
  async getPriceHistory(
    model: string,
    provider: string,
    period: {
      start: Date;
      end: Date;
    }
  ): Promise<{
    timestamps: Date[];
    inputPrices: number[];
    outputPrices: number[];
  }> {
    // This would require a price history table
    // For now, return current pricing
    const db = getDb();
    const pricing = db
      .prepare(
        `
      SELECT input_price_per_million, output_price_per_million, last_updated
      FROM pricing_info
      WHERE provider = ? AND model = ?
    `
      )
      .get(provider, model) as any;

    if (!pricing) {
      return {
        timestamps: [],
        inputPrices: [],
        outputPrices: [],
      };
    }

    return {
      timestamps: [new Date(pricing.last_updated)],
      inputPrices: [pricing.input_price_per_million],
      outputPrices: [pricing.output_price_per_million],
    };
  }

  /**
   * Get availability status based on metrics
   */
  private getAvailability(
    metrics: ProviderMetrics | undefined
  ): "available" | "degraded" | "unavailable" {
    if (!metrics || metrics.requestCount === 0) {
      return "available"; // Unknown status
    }

    if (metrics.successRate < 0.95) {
      return "degraded";
    }

    if (metrics.successRate < 0.5) {
      return "unavailable";
    }

    return "available";
  }

  /**
   * Get selection reason text
   */
  private getSelectionReason(provider: any, criteria: any): string {
    if (criteria.prioritizeCost) {
      return `Lowest price ($${provider.inputPrice + provider.outputPrice} per 1M tokens)`;
    }
    if (criteria.prioritizeLatency) {
      return `Lowest latency (${provider.avgLatency}ms average)`;
    }
    if (criteria.prioritizeReliability) {
      return `Highest reliability (${(provider.successRate * 100).toFixed(1)}% success rate)`;
    }
    return `Best overall (#${provider.rank} ranked provider)`;
  }

  /**
   * Seed pricing data
   */
  private async seedPricingData(db: any, model: string, providers: any[]): Promise<void> {
    for (const provider of providers) {
      db.prepare(
        `
        INSERT OR REPLACE INTO pricing_info (id, provider, model, input_price_per_million, output_price_per_million, last_updated)
        VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `
      ).run(
        generateId("pricing"),
        provider.provider,
        model,
        provider.input_price_per_million,
        provider.output_price_per_million
      );
    }
  }
}

// Singleton instance
export const analyticsService = new AnalyticsService();
