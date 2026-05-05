import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export interface McpEnv {
  DATABASE_URL: string;
  APOLLO_API_KEY: string;
  APP_URL: string;
  V2_JWT_SECRET: string;
}

function parseDotEnv(filePath: string): void {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
    if (key && !(key in process.env)) process.env[key] = val;
  }
}

let _env: McpEnv | null = null;

export function loadEnv(): McpEnv {
  if (_env) return _env;

  // Try env files in priority order
  const candidates = [
    path.join(os.homedir(), '.openclaw', 'v2', '.env'),
    path.resolve(__dirname, '../../../../.env'),  // project root from dist/
    path.resolve(__dirname, '../../../.env'),
  ];
  for (const p of candidates) parseDotEnv(p);

  const DATABASE_URL = process.env['DATABASE_URL'];
  const APOLLO_API_KEY = process.env['APOLLO_API_KEY'];
  const APP_URL = process.env['APP_URL'] ?? 'https://alphanoetic.me';
  const V2_JWT_SECRET = process.env['V2_JWT_SECRET'] ?? '';

  if (!DATABASE_URL) throw new Error('DATABASE_URL not set — check ~/.openclaw/v2/.env');
  if (!APOLLO_API_KEY) throw new Error('APOLLO_API_KEY not set — add it to ~/.openclaw/v2/.env');

  _env = { DATABASE_URL, APOLLO_API_KEY, APP_URL, V2_JWT_SECRET };
  return _env;
}
