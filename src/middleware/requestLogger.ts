/**
 * Request Logger Middleware
 * Logs API requests for analytics and monitoring
 */

import type { NextRequest } from "next/server";
import { logger } from "@/lib/logging/logger.js";

export interface RequestLog {
  timestamp: Date;
  userId?: string;
  apiKeyId?: string;
  method: string;
  path: string;
  query: Record<string, string>;
  headers: Record<string, string>;
  ip: string;
  userAgent: string;
  responseStatus: number;
  responseTime: number;
  model?: string;
  provider?: string;
  tokensUsed?: number;
  cost?: number;
}

/**
 * Log request details
 */
export function logRequest(
  request: NextRequest,
  details: {
    userId?: string;
    apiKeyId?: string;
    responseStatus: number;
    responseTime: number;
    model?: string;
    provider?: string;
    tokensUsed?: number;
    cost?: number;
  }
): void {
  const log: RequestLog = {
    timestamp: new Date(),
    userId: details.userId,
    apiKeyId: details.apiKeyId,
    method: request.method,
    path: request.nextUrl.pathname,
    query: Object.fromEntries(request.nextUrl.searchParams),
    headers: extractRelevantHeaders(request),
    ip: getClientIp(request),
    userAgent: request.headers.get("user-agent") || "unknown",
    responseStatus: details.responseStatus,
    responseTime: details.responseTime,
    model: details.model,
    provider: details.provider,
    tokensUsed: details.tokensUsed,
    cost: details.cost,
  };

  // Log to appropriate level based on status
  if (details.responseStatus >= 500) {
    logger.error("API request error", log);
  } else if (details.responseStatus >= 400) {
    logger.warn("API request warning", log);
  } else {
    logger.info("API request", log);
  }
}

/**
 * Extract relevant headers for logging
 */
function extractRelevantHeaders(request: NextRequest): Record<string, string> {
  const relevantHeaders = [
    "authorization",
    "content-type",
    "user-agent",
    "x-api-key",
    "x-request-id",
    "x-forwarded-for",
    "x-real-ip",
  ];

  const headers: Record<string, string> = {};
  for (const header of relevantHeaders) {
    const value = request.headers.get(header);
    if (value) {
      headers[header] = maskSensitiveValue(header, value);
    }
  }

  return headers;
}

/**
 * Mask sensitive values in logs
 */
function maskSensitiveValue(header: string, value: string): string {
  if (header === "authorization" || header === "x-api-key") {
    if (value.startsWith("Bearer ")) {
      return "Bearer ****";
    }
    return "****";
  }
  return value;
}

/**
 * Get client IP address
 */
function getClientIp(request: NextRequest): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  const realIp = request.headers.get("x-real-ip");
  const cfConnectingIp = request.headers.get("cf-connecting-ip");

  return forwardedFor?.split(",")[0].trim() || realIp || cfConnectingIp || "unknown";
}

/**
 * Generate request ID
 */
export function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Add request timing
 */
export function withRequestTiming<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  onRequestStart?: (requestId: string) => void,
  onRequestEnd?: (requestId: string, duration: number) => void
): T {
  return (async (...args: any[]) => {
    const requestId = generateRequestId();
    const startTime = Date.now();

    onRequestStart?.(requestId);

    try {
      const result = await fn(...args);
      const duration = Date.now() - startTime;
      onRequestEnd?.(requestId, duration);
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      onRequestEnd?.(requestId, duration);
      throw error;
    }
  }) as T;
}
