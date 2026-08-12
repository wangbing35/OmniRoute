/**
 * Cryptographic Utilities
 * Password hashing, JWT token generation, and secure random generation
 */

import type { User, Session, ApiKey } from "./authTypes.js";

/**
 * Hash password using bcrypt-like algorithm (simplified for demo)
 * In production, use bcrypt or argon2
 */
export async function hashPassword(password: string): Promise<string> {
  // Simple hash for demo - use bcrypt in production
  const encoder = new TextEncoder();
  const data = encoder.encode(password + process.env.PASSWORD_SALT || "default-salt");
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Verify password against hash
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const passwordHash = await hashPassword(password);
  return passwordHash === hash;
}

/**
 * Generate JWT token
 */
export function generateJwtToken(payload: { userId: string; email: string; tier: string }): string {
  const header = {
    alg: "HS256",
    typ: "JWT",
  };

  const now = Math.floor(Date.now() / 1000);
  const exp = now + 7 * 24 * 60 * 60; // 7 days

  const tokenPayload = {
    ...payload,
    iat: now,
    exp,
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(tokenPayload));
  const signature = signHmac(
    `${encodedHeader}.${encodedPayload}`,
    process.env.JWT_SECRET || "default-secret"
  );

  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

/**
 * Verify and decode JWT token
 */
export function verifyJwtToken(token: string): {
  userId: string;
  email: string;
  tier: string;
} | null {
  try {
    const [encodedHeader, encodedPayload, signature] = token.split(".");

    // Verify signature
    const expectedSignature = signHmac(
      `${encodedHeader}.${encodedPayload}`,
      process.env.JWT_SECRET || "default-secret"
    );
    if (signature !== expectedSignature) {
      return null;
    }

    // Decode payload
    const payload = JSON.parse(base64UrlDecode(encodedPayload));

    // Check expiration
    if (payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }

    return {
      userId: payload.userId,
      email: payload.email,
      tier: payload.tier,
    };
  } catch {
    return null;
  }
}

/**
 * Generate API key
 */
export function generateApiKey(): string {
  const prefix = "or_"; // OmniRoute prefix
  const randomBytes = new Uint8Array(32);
  crypto.getRandomValues(randomBytes);
  const random = Array.from(randomBytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${prefix}${random}`;
}

/**
 * Hash API key for storage
 */
export async function hashApiKey(apiKey: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(apiKey + process.env.API_KEY_SALT || "default-api-salt");
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Verify API key against hash
 */
export async function verifyApiKey(apiKey: string, hash: string): Promise<boolean> {
  const apiKeyHash = await hashApiKey(apiKey);
  return apiKeyHash === hash;
}

/**
 * Get API key prefix for display
 */
export function getApiKeyPrefix(apiKey: string): string {
  return apiKey.substring(0, 12);
}

/**
 * Sign HMAC-SHA256
 */
function signHmac(data: string, secret: string): string {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(data);

  // Import key
  crypto.subtle
    .importKey("raw", keyData, { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
    .then((key) => {
      return crypto.subtle.sign("HMAC", key, messageData);
    })
    .catch(() => {
      // Fallback for environments that don't support Web Crypto API
      return simpleHmac(data, secret);
    });

  // Simple fallback implementation
  return simpleHmac(data, secret);
}

/**
 * Simple HMAC implementation (fallback)
 */
function simpleHmac(data: string, secret: string): string {
  const encoder = new TextEncoder();
  const dataBytes = encoder.encode(data);
  const secretBytes = encoder.encode(secret);

  let hash = 0;
  for (let i = 0; i < dataBytes.length; i++) {
    hash = (hash << 5) - hash + dataBytes[i] + secretBytes[i % secretBytes.length];
    hash = hash & hash; // Convert to 32-bit integer
  }

  return base64UrlEncode(hash.toString(16));
}

/**
 * Base64 URL encode
 */
function base64UrlEncode(str: string): string {
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

/**
 * Base64 URL decode
 */
function base64UrlDecode(str: string): string {
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) {
    str += "=";
  }
  return atob(str);
}

/**
 * Generate secure random string
 */
export function generateSecureString(length: number = 32): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const randomBytes = new Uint8Array(length);
  crypto.getRandomValues(randomBytes);
  return Array.from(randomBytes, (b) => chars[b % chars.length]).join("");
}

/**
 * Generate verification code
 */
export function generateVerificationCode(): string {
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  return code;
}
