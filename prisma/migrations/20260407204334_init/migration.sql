-- CreateTable
CREATE TABLE "affiliates" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "affiliates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "affiliate_profiles" (
    "id" TEXT NOT NULL,
    "affiliateId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "source" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "lockedAt" TIMESTAMP(3),
    "lockedBy" TEXT,
    "role" TEXT,
    "seniority" TEXT,
    "industries" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "skills" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "authoritySignal" TEXT,
    "painPoint" TEXT,
    "directness" DOUBLE PRECISION NOT NULL DEFAULT 0.6,
    "provocation" DOUBLE PRECISION NOT NULL DEFAULT 0.3,
    "humor" DOUBLE PRECISION NOT NULL DEFAULT 0.2,
    "ctaStrength" TEXT NOT NULL DEFAULT 'soft',
    "desiredEmotion" TEXT NOT NULL DEFAULT 'curiosity',
    "goal" TEXT NOT NULL DEFAULT 'signups',
    "format" TEXT NOT NULL DEFAULT 'framework',
    "voice" TEXT NOT NULL DEFAULT 'operator',
    "controversy" TEXT NOT NULL DEFAULT 'balanced',
    "platforms" TEXT[] DEFAULT ARRAY['linkedin']::TEXT[],
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "extractionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "affiliate_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profile_assets" (
    "id" TEXT NOT NULL,
    "affiliateId" TEXT NOT NULL,
    "assetType" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSizeBytes" INTEGER NOT NULL,
    "zohoFileId" TEXT,
    "zohoFolderId" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "profile_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resume_processing_jobs" (
    "id" TEXT NOT NULL,
    "affiliateId" TEXT NOT NULL,
    "assetId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "parseResult" JSONB,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "resume_processing_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profile_extractions" (
    "id" TEXT NOT NULL,
    "affiliateId" TEXT NOT NULL,
    "resumeJobId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "rawResponse" TEXT,
    "normalizedOutput" JSONB,
    "repairAttempted" BOOLEAN NOT NULL DEFAULT false,
    "errorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "profile_extractions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_generation_runs" (
    "id" TEXT NOT NULL,
    "affiliateId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "inputBrief" JSONB,
    "outputContent" TEXT,
    "personalizationSummary" JSONB,
    "flaggedAt" TIMESTAMP(3),
    "flagReason" TEXT,
    "flagNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "content_generation_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_scores" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "qualityScore" INTEGER NOT NULL,
    "riskScore" INTEGER NOT NULL,
    "conversionScore" INTEGER NOT NULL,
    "qualityBreakdown" JSONB NOT NULL DEFAULT '{}',
    "riskBreakdown" JSONB NOT NULL DEFAULT '{}',
    "conversionBreakdown" JSONB NOT NULL DEFAULT '{}',
    "label" TEXT NOT NULL,
    "scoredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_media_assets" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "affiliateId" TEXT NOT NULL,
    "assetType" TEXT NOT NULL,
    "zohoFileId" TEXT,
    "zohoBrowseUrl" TEXT,
    "mimeType" TEXT,
    "aspectRatio" TEXT,
    "attachedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_media_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_generation_jobs" (
    "id" TEXT NOT NULL,
    "affiliateId" TEXT NOT NULL,
    "generationRunId" TEXT,
    "prompt" TEXT NOT NULL,
    "aspectRatio" TEXT NOT NULL,
    "numberOfImages" INTEGER NOT NULL DEFAULT 4,
    "candidatesBase64" JSONB,
    "status" TEXT NOT NULL,
    "selectedCandidateId" TEXT,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "media_generation_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversion_events" (
    "id" TEXT NOT NULL,
    "affiliateId" TEXT NOT NULL,
    "generationRunId" TEXT,
    "eventType" TEXT NOT NULL,
    "channel" TEXT,
    "campaignId" TEXT,
    "visitorId" TEXT,
    "sessionId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "conversion_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "changes" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "affiliates_code_key" ON "affiliates"("code");

-- CreateIndex
CREATE UNIQUE INDEX "affiliates_email_key" ON "affiliates"("email");

-- AddForeignKey
ALTER TABLE "affiliate_profiles" ADD CONSTRAINT "affiliate_profiles_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES "affiliates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_assets" ADD CONSTRAINT "profile_assets_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES "affiliates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resume_processing_jobs" ADD CONSTRAINT "resume_processing_jobs_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES "affiliates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_generation_runs" ADD CONSTRAINT "content_generation_runs_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES "affiliates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_generation_runs" ADD CONSTRAINT "content_generation_runs_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "affiliate_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_scores" ADD CONSTRAINT "content_scores_runId_fkey" FOREIGN KEY ("runId") REFERENCES "content_generation_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_media_assets" ADD CONSTRAINT "content_media_assets_runId_fkey" FOREIGN KEY ("runId") REFERENCES "content_generation_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_generation_jobs" ADD CONSTRAINT "media_generation_jobs_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES "affiliates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_generation_jobs" ADD CONSTRAINT "media_generation_jobs_generationRunId_fkey" FOREIGN KEY ("generationRunId") REFERENCES "content_generation_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversion_events" ADD CONSTRAINT "conversion_events_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES "affiliates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
