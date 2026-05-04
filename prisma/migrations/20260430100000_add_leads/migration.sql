CREATE TABLE IF NOT EXISTS "leads" (
  "id"          TEXT NOT NULL PRIMARY KEY,
  "businessId"  TEXT NOT NULL,
  "source"      TEXT NOT NULL DEFAULT 'apollo',
  "apolloId"    TEXT,
  "firstName"   TEXT,
  "lastName"    TEXT,
  "email"       TEXT,
  "phone"       TEXT,
  "title"       TEXT,
  "company"     TEXT,
  "location"    TEXT,
  "linkedinUrl" TEXT,
  "openToWork"  BOOLEAN NOT NULL DEFAULT false,
  "status"      TEXT NOT NULL DEFAULT 'new',
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "leads_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "leads_apolloId_key" ON "leads"("apolloId");
CREATE INDEX IF NOT EXISTS "leads_businessId_idx" ON "leads"("businessId");
CREATE INDEX IF NOT EXISTS "leads_status_idx" ON "leads"("status");
CREATE INDEX IF NOT EXISTS "leads_openToWork_idx" ON "leads"("openToWork");

CREATE TABLE IF NOT EXISTS "lead_pull_jobs" (
  "id"          TEXT NOT NULL PRIMARY KEY,
  "businessId"  TEXT NOT NULL,
  "status"      TEXT NOT NULL DEFAULT 'pending',
  "titles"      TEXT[] NOT NULL DEFAULT '{}',
  "targetCount" INTEGER NOT NULL DEFAULT 1000,
  "fetched"     INTEGER NOT NULL DEFAULT 0,
  "saved"       INTEGER NOT NULL DEFAULT 0,
  "page"        INTEGER NOT NULL DEFAULT 1,
  "error"       TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "lead_pull_jobs_businessId_idx" ON "lead_pull_jobs"("businessId");
