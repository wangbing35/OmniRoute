/**
 * Chat Completions API with Enterprise Features
 * POST /api/v2/chat/completions
 * OpenAI-compatible chat completions with quota management, rate limiting, and usage tracking
 */

import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, type AuthContext } from "../../../../middleware/authMiddleware.js";
import { quotaService } from "../../../../domain/quotas/quotaServiceImplementation.js";
import { analyticsService } from "../../../../domain/analytics/analyticsServiceImplementation.js";
import {
  rateLimit,
  addRateLimitHeaders,
  createRateLimitResponse,
} from "../../../../middleware/rateLimit.js";
import { logRequest, generateRequestId } from "../../../../middleware/requestLogger.js";
import { logger } from "@/lib/logging/logger.js";

// Rate limiter (100 requests per minute per user)
const limiter = rateLimit({
  windowMs: 60 * 1000,
  maxRequests: 100,
  keyPrefix: "chat_completions_v2",
});

/**
 * Handle CORS preflight
 */
export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-API-Key",
    },
  });
}

/**
 * Handle chat completion request
 */
async function POST(request: NextRequest, context: AuthContext): Promise<NextResponse> {
  const requestId = generateRequestId();
  const startTime = Date.now();

  try {
    // Parse request body
    const body = await request.json();
    const { model, messages, stream = false } = body;

    if (!model) {
      return NextResponse.json(
        { error: { message: "Model is required", type: "invalid_request_error" } },
        { status: 400 }
      );
    }

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json(
        { error: { message: "Messages array is required", type: "invalid_request_error" } },
        { status: 400 }
      );
    }

    // Rate limiting
    const rateLimitResult = await limiter(request, context.user.id);
    if (!rateLimitResult.allowed) {
      logRequest(request, {
        userId: context.user.id,
        responseStatus: 429,
        responseTime: Date.now() - startTime,
        model,
      });
      return createRateLimitResponse(rateLimitResult.reset);
    }

    // Estimate tokens (rough estimation)
    const inputTokens = estimateInputTokens(messages);
    const estimatedOutputTokens = 1000; // Conservative estimate
    const totalEstimatedTokens = inputTokens + estimatedOutputTokens;

    // Check quota
    const quotaCheck = await quotaService.checkQuota(context.user.id, totalEstimatedTokens);
    if (!quotaCheck.allowed) {
      // Handle quota exceeded
      const overageHandling = await quotaService.handleQuotaExceeded(context.user.id, {
        model,
        estimatedTokens: totalEstimatedTokens,
      });

      if (overageHandling.action === "block") {
        logRequest(request, {
          userId: context.user.id,
          responseStatus: 402,
          responseTime: Date.now() - startTime,
          model,
        });

        return NextResponse.json(
          {
            error: {
              message: overageHandling.message,
              type: "insufficient_quota",
              upgrade_url: overageHandling.upgradeUrl,
            },
          },
          { status: 402 }
        );
      }
    }

    // Get optimal provider for the model
    const optimalProvider = await analyticsService.getOptimalProvider(model, {
      prioritizeCost: context.user.tier === "free",
      prioritizeLatency: context.user.tier === "enterprise",
    });

    logger.info(
      `Routing ${model} request to ${optimalProvider.provider} for user ${context.user.id}`
    );

    // Make the actual API call (this would be implemented by calling the provider's API)
    const apiResponse = await callProviderAPI({
      provider: optimalProvider.provider,
      model,
      messages,
      stream,
      requestId,
    });

    // Calculate actual usage
    const actualInputTokens = apiResponse.usage?.prompt_tokens || inputTokens;
    const actualOutputTokens = apiResponse.usage?.completion_tokens || estimatedOutputTokens;
    const totalTokens = actualInputTokens + actualOutputTokens;

    // Calculate cost
    const cost = await analyticsService.calculateCost(
      model,
      optimalProvider.provider,
      actualInputTokens,
      actualOutputTokens
    );

    // Record usage and deduct quota
    await quotaService.deductQuota(context.user.id, totalTokens, {
      apiKeyId: context.apiKey?.id,
      model,
      provider: optimalProvider.provider,
      tokensUsed: totalTokens,
      cost,
      latency: apiResponse.latency || Date.now() - startTime,
      requestMetadata: {
        requestId,
        tier: context.user.tier,
      },
    });

    // Record latency metrics
    await analyticsService.recordLatency(
      optimalProvider.provider,
      model,
      apiResponse.latency || Date.now() - startTime,
      true
    );

    // Create response
    const response = NextResponse.json({
      id: requestId,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model,
      choices: apiResponse.choices || [],
      usage: {
        prompt_tokens: actualInputTokens,
        completion_tokens: actualOutputTokens,
        total_tokens: totalTokens,
      },
      provider: optimalProvider.provider,
      routing: {
        provider: optimalProvider.provider,
        reason: optimalProvider.reason,
        latency: apiResponse.latency || Date.now() - startTime,
      },
    });

    // Add usage headers
    response.headers.set("X-Request-ID", requestId);
    response.headers.set("X-Model-Used", model);
    response.headers.set("X-Provider-Used", optimalProvider.provider);
    response.headers.set("X-Tokens-Used", totalTokens.toString());
    response.headers.set("X-Cost-USD", cost.toFixed(6));
    response.headers.set("X-Quota-Remaining", quotaCheck.quotaStatus.freeRemaining.toString());

    // Add rate limit headers
    addRateLimitHeaders(response, rateLimitResult);

    // Log request
    logRequest(request, {
      userId: context.user.id,
      apiKeyId: context.apiKey?.id,
      responseStatus: 200,
      responseTime: Date.now() - startTime,
      model,
      provider: optimalProvider.provider,
      tokensUsed: totalTokens,
      cost,
    });

    return response;
  } catch (error) {
    const responseTime = Date.now() - startTime;

    logger.error("Chat completion error", {
      requestId,
      userId: context.user.id,
      error: error instanceof Error ? error.message : "Unknown error",
      responseTime,
    });

    logRequest(request, {
      userId: context.user.id,
      responseStatus: 500,
      responseTime,
    });

    return NextResponse.json(
      {
        error: {
          message: "Internal server error",
          type: "server_error",
          request_id: requestId,
        },
      },
      { status: 500 }
    );
  }
}

/**
 * Estimate input tokens from messages (rough estimation)
 */
function estimateInputTokens(messages: any[]): number {
  const text = JSON.stringify(messages);
  // Rough estimation: ~4 characters per token
  return Math.ceil(text.length / 4);
}

/**
 * Call provider API (placeholder - would integrate with actual provider)
 */
async function callProviderAPI(params: {
  provider: string;
  model: string;
  messages: any[];
  stream: boolean;
  requestId: string;
}): Promise<{
  choices: any[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
  };
  latency: number;
}> {
  const startTime = Date.now();

  // In production, this would make actual API calls to providers
  // For now, return a mock response
  await new Promise((resolve) => setTimeout(resolve, 500 + Math.random() * 1000));

  return {
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: "This is a mock response. In production, this would be the actual AI response.",
        },
        finish_reason: "stop",
      },
    ],
    usage: {
      prompt_tokens: estimateInputTokens(params.messages),
      completion_tokens: 100,
    },
    latency: Date.now() - startTime,
  };
}

// Export with auth middleware
export const POST = authenticateRequest(POST);
