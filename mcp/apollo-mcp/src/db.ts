import { Pool, PoolClient } from 'pg';
import { loadEnv } from './env';
import * as crypto from 'crypto';

let pool: Pool | null = null;

function getPool(): Pool {
  if (!pool) {
    const env = loadEnv();
    pool = new Pool({ connectionString: env.DATABASE_URL, max: 5 });
  }
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) { await pool.end(); pool = null; }
}

// ── Business lookup ────────────────────────────────────────────────────────────

export async function resolveBusinessId(slug: string): Promise<string> {
  const result = await getPool().query<{ id: string }>(
    `SELECT id FROM businesses WHERE slug = $1 AND active = true LIMIT 1`,
    [slug],
  );
  if (!result.rows[0]) throw new Error(`Tenant not found: ${slug}`);
  return result.rows[0].id;
}

// ── Email list operations ──────────────────────────────────────────────────────

export async function findOrCreateEmailList(businessId: string, listName: string): Promise<string> {
  const existing = await getPool().query<{ id: string }>(
    `SELECT id FROM email_lists WHERE business_id = $1 AND name = $2 AND active = true LIMIT 1`,
    [businessId, listName],
  );
  if (existing.rows[0]) return existing.rows[0].id;

  const created = await getPool().query<{ id: string }>(
    `INSERT INTO email_lists (id, business_id, name, tags, active, created_at, updated_at)
     VALUES ($1, $2, $3, '{}', true, NOW(), NOW())
     ON CONFLICT (business_id, name) DO UPDATE SET active = true
     RETURNING id`,
    [crypto.randomUUID(), businessId, listName],
  );
  return created.rows[0]!.id;
}

export interface SubscriberImportRecord {
  businessId: string;
  listId: string;
  email: string;
  name?: string;
  apolloId?: string;
  title?: string;
  company?: string;
  phone?: string;
  consentBasis: string;
  extraTags?: string[];
}

export interface UpsertResult {
  id: string;
  created: boolean;
  skipped: boolean;
  reason?: string;
}

export async function upsertSubscriberProspect(rec: SubscriberImportRecord): Promise<UpsertResult> {
  const tags = [
    'apollo_import',
    `consent:${rec.consentBasis}`,
    ...(rec.extraTags ?? []),
    ...(rec.title ? [`title:${rec.title.toLowerCase().replace(/\s+/g, '_')}`] : []),
    ...(rec.company ? [`company:${rec.company.toLowerCase().replace(/\s+/g, '_')}`] : []),
  ];

  const metadata = JSON.stringify({
    apolloId: rec.apolloId ?? null,
    phone: rec.phone ?? null,
    title: rec.title ?? null,
    company: rec.company ?? null,
    importedAt: new Date().toISOString(),
  });

  // Never overwrite an active/unsubscribed subscriber's status — only insert as prospect if new
  const result = await getPool().query<{ id: string; status: string }>(
    `INSERT INTO email_subscribers
       (id, business_id, list_id, email, name, tags, status, source, subscribed_at)
     VALUES ($1, $2, $3, $4, $5, $6, 'prospect', 'apollo', NOW())
     ON CONFLICT (list_id, email) DO UPDATE
       SET name    = COALESCE(EXCLUDED.name, email_subscribers.name),
           tags    = (
             SELECT ARRAY(
               SELECT DISTINCT unnest(email_subscribers.tags || EXCLUDED.tags)
             )
           )
     RETURNING id, status`,
    [
      crypto.randomUUID(),
      rec.businessId,
      rec.listId,
      rec.email.toLowerCase().trim(),
      rec.name ?? null,
      tags,
    ],
  );

  const row = result.rows[0];
  if (!row) return { id: '', created: false, skipped: true, reason: 'db error' };

  return {
    id: row.id,
    created: row.status === 'prospect',
    skipped: false,
  };

  void metadata; // stored in tags instead of a dedicated column
}

// ── Affiliate operations ───────────────────────────────────────────────────────

export interface AffiliateInsertRecord {
  businessId: string;
  name: string;
  email: string;
  code: string;
  title?: string;
  company?: string;
  linkedinUrl?: string;
  apolloId?: string;
  notes?: string;
}

export interface AffiliateInsertResult {
  id: string;
  code: string;
  created: boolean;
  alreadyExists: boolean;
  onboardingLink: string;
}

export async function insertAffiliateCandidateWithClient(
  client: PoolClient,
  rec: AffiliateInsertRecord,
): Promise<AffiliateInsertResult> {
  const env = loadEnv();
  const appUrl = env.APP_URL;

  // Check if affiliate already exists by email
  const existing = await client.query<{ id: string; code: string; active: boolean }>(
    `SELECT id, code, active FROM affiliates WHERE email = $1 LIMIT 1`,
    [rec.email.toLowerCase().trim()],
  );

  if (existing.rows[0]) {
    const row = existing.rows[0];
    const onboardingLink = `${appUrl}/v2/connect?code=${row.code}`;
    return { id: row.id, code: row.code, created: false, alreadyExists: true, onboardingLink };
  }

  // Ensure code uniqueness — retry once if collision
  let code = rec.code;
  const codeCheck = await client.query<{ id: string }>(
    `SELECT id FROM affiliates WHERE code = $1 LIMIT 1`,
    [code],
  );
  if (codeCheck.rows[0]) {
    code = `${code}${Math.floor(Math.random() * 90 + 10)}`;
  }

  const affiliateId = crypto.randomUUID();
  await client.query(
    `INSERT INTO affiliates (id, business_id, code, name, email, active, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, false, NOW(), NOW())`,
    [affiliateId, rec.businessId, code, rec.name, rec.email.toLowerCase().trim()],
  );

  // Initial profile — source 'apollo', inactive until onboarding
  await client.query(
    `INSERT INTO affiliate_profiles
       (id, affiliate_id, version, source, status, created_at, updated_at)
     VALUES ($1, $2, 1, 'apollo', 'active', NOW(), NOW())`,
    [crypto.randomUUID(), affiliateId],
  );

  // Audit trail
  await client.query(
    `INSERT INTO audit_logs (id, actor_type, action, entity_type, entity_id, changes, created_at)
     VALUES ($1, 'system', 'apollo_affiliate_candidate_created', 'Affiliate', $2, $3, NOW())`,
    [
      crypto.randomUUID(),
      affiliateId,
      JSON.stringify({
        code,
        name: rec.name,
        email: rec.email,
        title: rec.title ?? null,
        company: rec.company ?? null,
        linkedinUrl: rec.linkedinUrl ?? null,
        apolloId: rec.apolloId ?? null,
        notes: rec.notes ?? null,
      }),
    ],
  );

  const onboardingLink = `${appUrl}/v2/connect?code=${code}`;
  return { id: affiliateId, code, created: true, alreadyExists: false, onboardingLink };
}

export async function insertAffiliateCandidate(rec: AffiliateInsertRecord): Promise<AffiliateInsertResult> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await insertAffiliateCandidateWithClient(client, rec);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ── Utility ────────────────────────────────────────────────────────────────────

export function generateAffiliateCode(name: string): string {
  const parts = name.trim().toUpperCase().split(/\s+/);
  const first = (parts[0] ?? 'XXX').slice(0, 3).replace(/[^A-Z]/g, 'X');
  const last  = (parts[1] ?? parts[0] ?? 'XXX').slice(0, 3).replace(/[^A-Z]/g, 'X');
  const suffix = String(Math.floor(1000 + Math.random() * 9000));
  return `${first.padEnd(3, 'X')}${last.padEnd(3, 'X')}${suffix}`;
}
