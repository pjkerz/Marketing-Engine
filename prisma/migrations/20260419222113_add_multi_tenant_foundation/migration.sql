-- Multi-Tenant Foundation Migration
-- Creates Business/EmailList/EmailSubscriber models
-- Backfills AlphaBoost as first tenant before adding NOT NULL constraints

-- CreateTable: businesses
CREATE TABLE "businesses" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "plan" TEXT NOT NULL DEFAULT 'starter',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "businesses_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "businesses_slug_key" ON "businesses"("slug");

-- CreateTable: business_configs
CREATE TABLE "business_configs" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "brandName" TEXT NOT NULL DEFAULT 'AlphaNoetics',
    "brandColor" TEXT NOT NULL DEFAULT '#0D1B2A',
    "accentColor" TEXT NOT NULL DEFAULT '#E87A2A',
    "logoUrl" TEXT,
    "customDomain" TEXT,
    "brandVoice" TEXT,
    "toneKeywords" TEXT[],
    "avoidPhrases" TEXT[],
    "commissionType" TEXT NOT NULL DEFAULT 'none',
    "commissionValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sendingDomain" TEXT,
    "fromName" TEXT,
    "fromEmail" TEXT,
    "dailySendCap" INTEGER NOT NULL DEFAULT 500,
    "warmupComplete" BOOLEAN NOT NULL DEFAULT false,
    "conversionTypes" JSONB NOT NULL DEFAULT '[]',
    "landingPageUrl" TEXT,
    "pricingPageUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "business_configs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "business_configs_businessId_key" ON "business_configs"("businessId");

-- CreateTable: email_lists
CREATE TABLE "email_lists" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "tags" TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "email_lists_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "email_lists_businessId_name_key" ON "email_lists"("businessId", "name");

-- CreateTable: email_subscribers
CREATE TABLE "email_subscribers" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "listId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "affiliateCode" TEXT,
    "tags" TEXT[],
    "status" TEXT NOT NULL DEFAULT 'active',
    "source" TEXT NOT NULL DEFAULT 'manual',
    "subscribedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unsubscribedAt" TIMESTAMP(3),
    "bouncedAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    CONSTRAINT "email_subscribers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "email_subscribers_listId_email_key" ON "email_subscribers"("listId", "email");

-- Seed AlphaBoost as first tenant
INSERT INTO "businesses" ("id", "name", "slug", "type", "plan", "active", "createdAt", "updatedAt")
VALUES ('00000000-0000-0000-0000-000000000001', 'AlphaBoost', 'alphaboost', 'saas', 'starter', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("slug") DO NOTHING;

INSERT INTO "business_configs" (
    "id", "businessId", "brandName", "brandColor", "accentColor",
    "commissionType", "commissionValue", "dailySendCap", "warmupComplete",
    "conversionTypes", "landingPageUrl", "pricingPageUrl",
    "toneKeywords", "avoidPhrases", "createdAt", "updatedAt"
)
VALUES (
    '00000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000001',
    'AlphaBoost', '#0D1B2A', '#E87A2A',
    'none', 0, 500, false,
    '[{"type":"subscription","value":39,"label":"Monthly subscription"}]',
    'https://alphaboost.app', 'https://alphaboost.app/pricing',
    ARRAY[]::TEXT[], ARRAY[]::TEXT[],
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
)
ON CONFLICT ("businessId") DO NOTHING;

-- Add businessId columns as nullable first (to allow backfill)
ALTER TABLE "affiliates" ADD COLUMN "businessId" TEXT;
ALTER TABLE "content_generation_runs" ADD COLUMN "businessId" TEXT;
ALTER TABLE "conversion_events" ADD COLUMN "businessId" TEXT;

-- Backfill all existing rows with AlphaBoost businessId
UPDATE "affiliates" SET "businessId" = '00000000-0000-0000-0000-000000000001' WHERE "businessId" IS NULL;
UPDATE "content_generation_runs" SET "businessId" = '00000000-0000-0000-0000-000000000001' WHERE "businessId" IS NULL;
UPDATE "conversion_events" SET "businessId" = '00000000-0000-0000-0000-000000000001' WHERE "businessId" IS NULL;

-- Now enforce NOT NULL
ALTER TABLE "affiliates" ALTER COLUMN "businessId" SET NOT NULL;
ALTER TABLE "content_generation_runs" ALTER COLUMN "businessId" SET NOT NULL;
ALTER TABLE "conversion_events" ALTER COLUMN "businessId" SET NOT NULL;

-- AddForeignKeys
ALTER TABLE "business_configs" ADD CONSTRAINT "business_configs_businessId_fkey"
    FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "email_lists" ADD CONSTRAINT "email_lists_businessId_fkey"
    FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "email_subscribers" ADD CONSTRAINT "email_subscribers_listId_fkey"
    FOREIGN KEY ("listId") REFERENCES "email_lists"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "affiliates" ADD CONSTRAINT "affiliates_businessId_fkey"
    FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "content_generation_runs" ADD CONSTRAINT "content_generation_runs_businessId_fkey"
    FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "conversion_events" ADD CONSTRAINT "conversion_events_businessId_fkey"
    FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
