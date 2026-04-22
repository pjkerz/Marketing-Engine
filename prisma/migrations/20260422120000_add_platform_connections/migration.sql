-- CreateTable: platform_connections (social OAuth tokens per affiliate)
CREATE TABLE IF NOT EXISTS "platform_connections" (
  "id"           TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "affiliateId"  TEXT NOT NULL,
  "platform"     TEXT NOT NULL,
  "tokens"       JSONB NOT NULL,
  "connectedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "platform_connections_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "platform_connections_affiliateId_fkey"
    FOREIGN KEY ("affiliateId") REFERENCES "affiliates"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "platform_connections_affiliateId_platform_key"
  ON "platform_connections"("affiliateId", "platform");
