/**
 * Database Initialization Script
 * Initializes the database schema and seeds default data
 */

import { initializeSchema } from "../src/domain/database/database.js";
import { analyticsService } from "../src/domain/analytics/analyticsServiceImplementation.js";
import { quotaService } from "../src/domain/quotas/quotaServiceImplementation.js";
import { billingService } from "../src/domain/billing/billingServiceImplementation.js";

async function initializeDatabase() {
  console.log("🔧 Initializing database...");

  try {
    // Initialize schema
    initializeSchema();
    console.log("✅ Database schema created");

    // Seed pricing data
    await analyticsService.updatePricingInfo();
    console.log("✅ Pricing data seeded");

    // Seed quota packages (done automatically on first access)
    await quotaService.getQuotaPackages();
    console.log("✅ Quota packages seeded");

    // Seed plans (done automatically on first access)
    await billingService.getPlans();
    console.log("✅ Plans seeded");

    console.log("🎉 Database initialization complete!");
  } catch (error) {
    console.error("❌ Database initialization failed:", error);
    process.exit(1);
  }
}

// Run initialization
initializeDatabase();
