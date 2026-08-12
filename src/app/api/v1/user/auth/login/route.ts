/**
 * User Login API
 * POST /api/v1/user/auth/login
 */

import { NextRequest, NextResponse } from "next/server";
import { authService } from "@/domain/auth/authService";
import { z } from "zod";

// Validation schema
const loginSchema = z.object({
  email: z.string().email("Invalid email format"),
  password: z.string(),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();

    // Validate request body
    const validation = loginSchema.safeParse(body);
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

    const { email, password } = validation.data;

    // Authenticate user
    const result = await authService.loginWithEmail(email, password);

    // Set session cookie
    const response = NextResponse.json({
      success: true,
      user: {
        id: result.user.id,
        email: result.user.email,
        emailVerified: result.user.emailVerified,
        name: result.user.name,
        tier: result.user.tier,
      },
    });

    // Set session cookie
    response.cookies.set("session", result.session.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      expires: result.session.expiresAt,
    });

    return response;
  } catch (error) {
    console.error("Login error:", error);

    return NextResponse.json(
      {
        error: {
          message: error instanceof Error ? error.message : "Login failed",
          type: "authentication_error",
        },
      },
      { status: 401 }
    );
  }
}
