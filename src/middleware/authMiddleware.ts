/**
 * Authentication Middleware
 * Handles API key and session authentication for API requests
 */

import type { NextRequest, NextResponse } from "next/server";
import { authService } from "../domain/auth/authService.js";

export interface AuthContext {
  user: {
    id: string;
    email: string;
    tier: string;
  };
  apiKey?: {
    id: string;
    name: string;
    scopes: string[];
  };
}

/**
 * Extract and validate authentication from request
 */
export async function authenticateRequest(request: NextRequest): Promise<{
  context: AuthContext | null;
  error?: {
    status: number;
    message: string;
  };
}> {
  // Try API key authentication first
  const apiKey = extractApiKey(request);
  if (apiKey) {
    const result = await authService.validateApiKey(apiKey);
    if (result) {
      return {
        context: {
          user: {
            id: result.user.id,
            email: result.user.email,
            tier: result.user.tier,
          },
          apiKey: {
            id: result.apiKey.id,
            name: result.apiKey.name,
            scopes: result.apiKey.scopes,
          },
        },
      };
    }
    return {
      error: {
        status: 401,
        message: "Invalid API key",
      },
    };
  }

  // Try session authentication
  const sessionToken = extractSessionToken(request);
  if (sessionToken) {
    const result = await authService.validateSession(sessionToken);
    if (result) {
      return {
        context: {
          user: {
            id: result.user.id,
            email: result.user.email,
            tier: result.user.tier,
          },
        },
      };
    }
    return {
      error: {
        status: 401,
        message: "Invalid or expired session",
      },
    };
  }

  // No authentication provided
  return {
    error: {
      status: 401,
      message: "Authentication required",
    },
  };
}

/**
 * Extract API key from request headers
 */
function extractApiKey(request: NextRequest): string | null {
  // Try Authorization header
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.substring(7);
  }

  // Try x-api-key header
  const apiKeyHeader = request.headers.get("x-api-key");
  if (apiKeyHeader) {
    return apiKeyHeader;
  }

  return null;
}

/**
 * Extract session token from request
 */
function extractSessionToken(request: NextRequest): string | null {
  // Try cookie
  const sessionCookie = request.cookies.get("session");
  if (sessionCookie) {
    return sessionCookie.value;
  }

  // Try Authorization header with Bearer
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.substring(7);
    // Check if it looks like a JWT (has dots)
    if (token.includes(".")) {
      return token;
    }
  }

  return null;
}

/**
 * Create authentication error response
 */
export function createAuthErrorResponse(error: { status: number; message: string }): NextResponse {
  return new NextResponse(
    JSON.stringify({
      error: {
        message: error.message,
        type: "authentication_error",
      },
    }),
    {
      status: error.status,
      headers: {
        "Content-Type": "application/json",
      },
    }
  );
}

/**
 * Middleware wrapper for Next.js route handlers
 */
export function withAuth(
  handler: (request: NextRequest, context: AuthContext) => Promise<NextResponse>
) {
  return async (request: NextRequest): Promise<NextResponse> => {
    const authResult = await authenticateRequest(request);

    if (authResult.error) {
      return createAuthErrorResponse(authResult.error);
    }

    return handler(request, authResult.context!);
  };
}

/**
 * Optional authentication middleware - doesn't require auth but includes it if present
 */
export function withOptionalAuth(
  handler: (request: NextRequest, context: AuthContext | null) => Promise<NextResponse>
) {
  return async (request: NextRequest): Promise<NextResponse> => {
    const authResult = await authenticateRequest(request);

    if (authResult.error) {
      // For optional auth, just proceed without context
      return handler(request, null);
    }

    return handler(request, authResult.context!);
  };
}
