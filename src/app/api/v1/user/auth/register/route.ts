/**
 * User Registration API
 * POST /api/v1/user/auth/register
 */

import { NextRequest, NextResponse } from "next/server";
import { authService } from "@/domain/auth/authService";
import { z } from "zod";

// Validation schema
const registerSchema = z.object({
  email: z.string().email("Invalid email format"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().optional(),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();

    // Validate request body
    const validation = registerSchema.safeParse(body);
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

    const { email, password, name } = validation.data;

    // Check if user already exists
    // TODO: Implement user existence check

    // Register user
    const user = await authService.registerWithEmail(email, password, name);

    return NextResponse.json(
      {
        success: true,
        user: {
          id: user.id,
          email: user.email,
          emailVerified: user.emailVerified,
          name: user.name,
          tier: user.tier,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Registration error:", error);

    return NextResponse.json(
      {
        error: {
          message: error instanceof Error ? error.message : "Registration failed",
          type: "registration_error",
        },
      },
      { status: 500 }
    );
  }
}
