import { Pool } from 'pg';
import { loadEnv } from '../env';
import * as crypto from 'crypto';
import { ContactSummary } from './searchContacts';

let pool: Pool | null = null;
function getPool(): Pool {
  if (!pool) {
    pool = new Pool({ connectionString: loadEnv().DATABASE_URL, max: 3 });
  }
  return pool;
}

export interface SaveLeadsInput {
  businessSlug: string;
  contacts: ContactSummary[];
}

export interface SaveLeadsResult {
  saved: number;
  skipped: number;
  errors: number;
  note: string;
}

export async function saveLeads(input: SaveLeadsInput): Promise<SaveLeadsResult> {
  const { businessSlug, contacts } = input;

  // Resolve businessId
  const bizResult = await getPool().query<{ id: string }>(
    `SELECT id FROM businesses WHERE slug = $1 AND active = true LIMIT 1`,
    [businessSlug],
  );
  if (!bizResult.rows[0]) throw new Error(`Tenant not found: ${businessSlug}`);
  const businessId = bizResult.rows[0].id;

  let saved = 0, skipped = 0, errors = 0;

  for (const c of contacts) {
    try {
      await getPool().query(
        `INSERT INTO leads
           (id, "businessId", source, "apolloId", "firstName", "lastName", email, phone,
            title, company, location, "linkedinUrl", "openToWork", status, "createdAt")
         VALUES ($1,$2,'apollo',$3,$4,$5,$6,$7,$8,$9,$10,$11,true,'new',NOW())
         ON CONFLICT ("apolloId") DO UPDATE SET
           email       = COALESCE(EXCLUDED.email, leads.email),
           phone       = COALESCE(EXCLUDED.phone, leads.phone),
           title       = COALESCE(EXCLUDED.title, leads.title),
           company     = COALESCE(EXCLUDED.company, leads.company),
           location    = COALESCE(EXCLUDED.location, leads.location),
           "linkedinUrl" = COALESCE(EXCLUDED."linkedinUrl", leads."linkedinUrl")`,
        [
          crypto.randomUUID(),
          businessId,
          c.apolloId,
          c.name.split(' ')[0] ?? null,
          c.name.split(' ').slice(1).join(' ') || null,
          c.email,
          c.phone,
          c.title,
          c.company,
          c.location,
          c.linkedinUrl,
        ],
      );
      saved++;
    } catch {
      errors++;
    }
  }

  return {
    saved,
    skipped,
    errors,
    note: `Saved ${saved} leads to tenant "${businessSlug}". ${errors > 0 ? `${errors} errors.` : ''}`,
  };
}
