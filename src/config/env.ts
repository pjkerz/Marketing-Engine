import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';

// Load .env file manually (no dotenv dependency)
function loadDotEnv(): void {
  const envPath = path.resolve(__dirname, '../../.env');
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    if (key && !(key in process.env)) {
      process.env[key] = val;
    }
  }
}

loadDotEnv();

const EnvSchema = z.object({
  PORT: z.coerce.number().default(3457),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('production'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),

  V2_JWT_SECRET: z.string().min(32, 'V2_JWT_SECRET must be at least 32 chars'),
  V2_ENCRYPTION_KEY: z.string().length(64, 'V2_ENCRYPTION_KEY must be exactly 64 hex chars (32 bytes)'),

  GROQ_API_KEY: z.string().min(1, 'GROQ_API_KEY is required'),
  GROQ_MODEL_EXTRACT: z.string().default('llama-3.1-8b-instant'),
  GROQ_MODEL_CONTENT: z.string().default('llama-3.3-70b-versatile'),

  GOOGLE_AI_API_KEY: z.string().min(1, 'GOOGLE_AI_API_KEY is required'),
  GOOGLE_AI_IMAGE_BATCH_MODE: z.coerce.boolean().default(true),
  GOOGLE_AI_IMAGE_MAX_GENERATIONS_PER_RUN: z.coerce.number().default(3),

  // Zoho WorkDrive (file storage)
  ZOHO_CLIENT_ID: z.string().min(1),
  ZOHO_CLIENT_SECRET: z.string().min(1),
  ZOHO_REFRESH_TOKEN: z.string().min(1),
  ZOHO_FOLDER_ID: z.string().min(1),
  ZOHO_AFFILIATES_FOLDER_ID: z.string().min(1),

  CREDS_MD_PATH: z.string().default('/Users/macmini/.openclaw/workspace/CREDS.md'),
  AFFILIATES_JSON_PATH: z.string().default('/Users/macmini/.openclaw/businesses/alphaboost/affiliates.json'),

  // Make.com webhook — fires when content is approved for Sendible
  MAKE_WEBHOOK_URL: z.string().url().optional(),

  // Resend email sending
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default('AlphaBoost <noreply@alphaboost.app>'),
  RESEND_WEBHOOK_SECRET: z.string().optional(),

  // Tracking pixel
  TRACKING_PIXEL_SECRET: z.string().optional(),
  SESSION_STITCH_SECRET: z.string().optional(),
});

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('❌ Invalid environment variables:\n', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
