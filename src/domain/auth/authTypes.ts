/**
 * User Authentication Domain Types
 * Defines user authentication, session management, and authorization structures
 */

export interface User {
  id: string;
  email: string;
  emailVerified: boolean;
  name?: string;
  avatar?: string;
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt?: Date;
  preferences: UserPreferences;
  quota: UserQuota;
  tier: UserTier;
}

export interface UserPreferences {
  language: string;
  theme: "light" | "dark" | "system";
  notifications: boolean;
  timezone: string;
}

export interface UserQuota {
  freeQuotaMonthly: number; // Free tokens per month
  usedQuotaCurrent: number; // Used tokens in current month
  purchasedQuota: number; // Additional purchased tokens
  quotaResetDate: Date;
}

export type UserTier = "free" | "pro" | "enterprise";

export interface ApiKey {
  id: string;
  userId: string;
  name: string;
  keyHash: string;
  keyPrefix: string; // First 8 characters for identification
  scopes: string[];
  isActive: boolean;
  createdAt: Date;
  expiresAt?: Date;
  lastUsedAt?: Date;
  usageCount: number;
}

export interface Session {
  id: string;
  userId: string;
  token: string;
  expiresAt: Date;
  createdAt: Date;
  lastActiveAt: Date;
  ipAddress?: string;
  userAgent?: string;
}

export interface AuthProvider {
  id: string;
  type: "email" | "oauth" | "api_key";
  provider: "email" | "google" | "github" | "microsoft";
  providerAccountId: string;
}

export interface AuthToken {
  accessToken: string;
  refreshToken?: string;
  expiresAt: Date;
  tokenType: "bearer";
}

export interface UsageRecord {
  id: string;
  userId: string;
  apiKeyId?: string;
  model: string;
  provider: string;
  tokensUsed: number;
  cost: number;
  latency: number;
  timestamp: Date;
  requestMetadata?: Record<string, unknown>;
}

export interface PricingInfo {
  provider: string;
  model: string;
  inputPricePerMillion: number;
  outputPricePerMillion: number;
  currency: string;
  lastUpdated: Date;
  avgLatency?: number;
  successRate?: number;
}
