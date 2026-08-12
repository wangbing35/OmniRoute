/**
 * API Key Management API
 * GET /api/v1/user/keys - List API keys
 * POST /api/v1/user/keys - Create new API key
 */

import { NextRequest, NextResponse } from "next/server";
import { authService } from "../../../../domain/auth/authService.js";
import { withAuth, type AuthContext } from "../../../../middleware/authMiddleware.js";
import { z } from "zod";

// Validation schema for creating API key
const createKeySchema = z.object({
  name: z.string().min(1).max(100),
  scopes: z.array(z.string()).optional().default(["read", "write"]),
});

// GET /api/v1/user/keys - List API keys
async function GET(request: NextRequest, context: AuthContext): Promise<NextResponse> {
  try {
    const apiKeys = await authService.listApiKeys(context.user.id);

    return NextResponse.json({
      success: true,
      keys: apiKeys.map((key) => ({
        id: key.id,
        name: key.name,
        prefix: key.keyPrefix,
        scopes: key.scopes,
        isActive: key.isActive,
        createdAt: key.createdAt,
        expiresAt: key.expiresAt,
        lastUsedAt: key.lastUsedAt,
        usageCount: key.usageCount,
      })),
    });
  } catch (error) {
    console.error("List API keys error:", error);

    return NextResponse.json(
      {
        error: {
          message: "Failed to retrieve API keys",
          type: "api_error",
        },
      },
      { status: 500 }
    );
  }
}

// POST /api/v1/user/keys - Create new API key
async function POST(request: NextRequest, context: AuthContext): Promise<NextResponse> {
  try {
    const body = await request.json();

    // Validate request body
    const validation = createKeySchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        {
          error: {
            message: "Invalid request body",
            details: validation.error.errors,
          },
        },
        { status: 400 }
      );
    }

    const { name, scopes } = validation.data;

    // Create API key
    const apiKey = await authService.createApiKey(context.user.id, name, scopes);

    return NextResponse.json(
      {
        success: true,
        key: {
          id: apiKey.id,
          name: apiKey.name,
          key: apiKey.keyHash, // This should be the full key shown only once
          prefix: apiKey.keyPrefix,
          scopes: apiKey.scopes,
          createdAt: apiKey.createdAt,
          expiresAt: apiKey.expiresAt,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Create API key error:", error);

    return NextResponse.json(
      {
        error: {
          message: error instanceof Error ? error.message : "Failed to create API key",
          type: "api_error",
        },
      },
      { status: 500 }
    );
  }
}

// Export route handlers with auth middleware
export const GET = withAuth(GET);
export const POST = withAuth(POST);
