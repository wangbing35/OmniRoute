/**
 * Rate Limiting Middleware
 * Implements token bucket rate limiting for API requests
 */

import type { NextRequest, NextResponse } from "next/server";

interface RateLimitStore {
  tokens: number;
  lastRefill: number;
}

// In-memory store (in production, use Redis)
const rateLimitStore = new Map<string, RateLimitStore>();

export interface RateLimitOptions {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Max requests per window
  keyPrefix?: string; // Prefix for store keys
}

const DEFAULT_OPTIONS: RateLimitOptions = {
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 100,
  keyPrefix: "ratelimit",
};

/**
 * Rate limit middleware
 */
export function rateLimit(options: Partial<RateLimitOptions> = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  return async (
    request: NextRequest,
    userId?: string
  ): Promise<{
    allowed: boolean;
    limit: number;
    remaining: number;
    reset: number;
  }> => {
    const key = `${opts.keyPrefix}:${userId || "anonymous"}:${getClientIdentifier(request)}`;

    const now = Date.now();
    const store = rateLimitStore.get(key);

    if (!store || now - store.lastRefill >= opts.windowMs) {
      // Refill tokens
      rateLimitStore.set(key, {
        tokens: opts.maxRequests,
        lastRefill: now,
      });
    }

    const current = rateLimitStore.get(key)!;

    if (current.tokens > 0) {
      current.tokens--;
      return {
        allowed: true,
        limit: opts.maxRequests,
        remaining: current.tokens,
        reset: current.lastRefill + opts.windowMs,
      };
    }

    return {
      allowed: false,
      limit: opts.maxRequests,
      remaining: 0,
      reset: current.lastRefill + opts.windowMs,
    };
  };
}

/**
 * Get client identifier from request
 */
function getClientIdentifier(request: NextRequest): string {
  // Try to get IP from various headers
  const forwardedFor = request.headers.get("x-forwarded-for");
  const realIp = request.headers.get("x-real-ip");
  const cfConnectingIp = request.headers.get("cf-connecting-ip");

  const ip = forwardedFor?.split(",")[0].trim() || realIp || cfConnectingIp || "unknown";

  // Add user agent for better uniqueness
  const userAgent = request.headers.get("user-agent") || "unknown";

  // Create hash of IP + UA for privacy
  return Buffer.from(`${ip}:${userAgent}`).toString("base64").substring(0, 32);
}

/**
 * Add rate limit headers to response
 */
export function addRateLimitHeaders(
  response: NextResponse,
  rateLimitInfo: { limit: number; remaining: number; reset: number }
): NextResponse {
  response.headers.set("X-RateLimit-Limit", rateLimitInfo.limit.toString());
  response.headers.set("X-RateLimit-Remaining", rateLimitInfo.remaining.toString());
  response.headers.set("X-RateLimit-Reset", new Date(rateLimitInfo.reset).toISOString());

  return response;
}

/**
 * Create rate limit exceeded response
 */
export function createRateLimitResponse(reset: number): NextResponse {
  return new NextResponse(
    JSON.stringify({
      error: {
        message: "Too many requests. Please try again later.",
        type: "rate_limit_exceeded",
        retry_after: Math.ceil((reset - Date.now()) / 1000),
      },
    }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": Math.ceil((reset - Date.now()) / 1000).toString(),
        "X-RateLimit-Reset": new Date(reset).toISOString(),
      },
    }
  );
}

/**
 * Clean up expired rate limit entries
 */
export function cleanupRateLimitStore(): void {
  const now = Date.now();
  const windowMs = DEFAULT_OPTIONS.windowMs;

  for (const [key, store] of rateLimitStore.entries()) {
    if (now - store.lastRefill > windowMs * 2) {
      rateLimitStore.delete(key);
    }
  }
}

// Run cleanup every 5 minutes
if (typeof setInterval !== "undefined") {
  setInterval(cleanupRateLimitStore, 5 * 60 * 1000);
}
