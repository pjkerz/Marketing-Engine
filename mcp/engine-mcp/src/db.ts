import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

function parseDotEnv(): void {
  const candidates = [
    path.join(os.homedir(), '.openclaw', 'v2', '.env'),
    path.resolve(__dirname, '../../../../.env'),
    path.resolve(__dirname, '../../../.env'),
  ];
  for (const p of candidates) {
    if (!fs.existsSync(p)) continue;
    const lines = fs.readFileSync(p, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
      if (key && !(key in process.env)) process.env[key] = val;
    }
    break;
  }
}

parseDotEnv();

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    const url = process.env['DATABASE_URL'];
    if (!url) throw new Error('DATABASE_URL not set');
    pool = new Pool({ connectionString: url, max: 5 });
  }
  return pool;
}

export function getEnv(key: string, fallback?: string): string {
  const val = process.env[key] ?? fallback;
  if (!val) throw new Error(`${key} not set`);
  return val;
}

export async function resolveBusinessId(slug: string): Promise<string> {
  const res = await getPool().query<{ id: string }>(
    `SELECT id FROM businesses WHERE slug = $1 AND active = true LIMIT 1`,
    [slug],
  );
  if (!res.rows[0]) throw new Error(`Tenant not found: "${slug}". Valid slugs: alphaboost, dolce, alphanoetic`);
  return res.rows[0].id;
}
