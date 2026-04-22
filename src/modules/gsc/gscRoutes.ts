/**
 * gscRoutes.ts — Google Search Console integration
 *
 * OAuth flow:  GET /api/gsc/connect   → redirects to Google
 *              GET /auth/google/callback → exchanges code, stores tokens in DB businessConfig
 * Data:        GET /api/gsc/status
 *              GET /api/gsc/search-analytics
 *              GET /api/gsc/pages
 */

import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from '../../middleware/auth';
import { getPrisma } from '../../lib/prisma';
import { env } from '../../config/env';
import { ALPHABOOST_BUSINESS_ID } from '../../middleware/auth';

const router = Router();

const REDIRECT_URI = 'https://alphanoetic.me/auth/google/callback';
const SCOPES = 'https://www.googleapis.com/auth/webmasters.readonly';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

// ── Helpers ────────────────────────────────────────────────────────────────────

function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.actor || req.actor.role !== 'admin') {
    res.status(403).json({ error: 'Admin only' });
    return;
  }
  next();
}

async function getStoredTokens(): Promise<{ access_token?: string; refresh_token?: string; expires_at?: number } | null> {
  try {
    const prisma = getPrisma();
    const config = await prisma.businessConfig.findUnique({ where: { businessId: ALPHABOOST_BUSINESS_ID } });
    const tokens = (config as Record<string, unknown>)['gscTokens'] as { access_token?: string; refresh_token?: string; expires_at?: number } | null;
    return tokens ?? null;
  } catch { return null; }
}

async function saveTokens(tokens: { access_token: string; refresh_token?: string; expires_in?: number }): Promise<void> {
  const prisma = getPrisma();
  const expires_at = Date.now() + ((tokens.expires_in ?? 3600) - 60) * 1000;
  await prisma.$executeRaw`
    UPDATE "business_configs"
    SET "gscTokens" = ${JSON.stringify({ access_token: tokens.access_token, refresh_token: tokens.refresh_token, expires_at })}::jsonb
    WHERE "businessId" = ${ALPHABOOST_BUSINESS_ID}
  `;
}

async function getAccessToken(): Promise<string> {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    throw new Error('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are not configured');
  }

  const stored = await getStoredTokens();
  if (!stored?.refresh_token) throw new Error('Not connected to Google Search Console. Visit /admin and use GSC → Connect.');

  // Return cached token if still valid
  if (stored.access_token && stored.expires_at && Date.now() < stored.expires_at) {
    return stored.access_token;
  }

  // Refresh
  const resp = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      refresh_token: stored.refresh_token,
      grant_type: 'refresh_token',
    }).toString(),
  });

  if (!resp.ok) throw new Error('Failed to refresh Google token');
  const data = await resp.json() as { access_token: string; expires_in: number };
  await saveTokens({ access_token: data.access_token, refresh_token: stored.refresh_token, expires_in: data.expires_in });
  return data.access_token;
}

// ── GET /api/gsc/connect — Start OAuth flow ────────────────────────────────────
router.get('/api/gsc/connect', requireAuth, requireAdmin, (_req: Request, res: Response) => {
  if (!env.GOOGLE_CLIENT_ID) {
    res.status(503).json({ error: 'GOOGLE_CLIENT_ID not set in environment' });
    return;
  }
  const url = `https://accounts.google.com/o/oauth2/v2/auth?` +
    `client_id=${encodeURIComponent(env.GOOGLE_CLIENT_ID)}` +
    `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
    `&response_type=code` +
    `&scope=${encodeURIComponent(SCOPES)}` +
    `&access_type=offline&prompt=consent`;
  res.redirect(url);
});

// ── GET /auth/google/callback — OAuth callback ─────────────────────────────────
router.get('/auth/google/callback', async (req: Request, res: Response) => {
  const { code, error } = req.query as { code?: string; error?: string };

  if (error || !code) {
    res.send(`<html><body style="font-family:monospace;background:#020617;color:#f87171;padding:40px">
      <h2>Google OAuth Failed</h2><p>${error || 'No authorization code received'}</p>
      <p><a href="/admin" style="color:#00C8FF">← Back to Admin</a></p>
    </body></html>`);
    return;
  }

  try {
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) throw new Error('Google credentials not configured');

    const resp = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code',
      }).toString(),
    });

    if (!resp.ok) {
      const txt = await resp.text();
      throw new Error(`Token exchange failed: ${txt}`);
    }

    const tokens = await resp.json() as { access_token: string; refresh_token?: string; expires_in: number };
    await saveTokens(tokens);

    res.send(`<html><body style="font-family:monospace;background:#020617;color:#34d399;padding:40px">
      <h2>✓ Google Search Console Connected</h2>
      <p>Tokens saved. You can close this tab.</p>
      <p><a href="/admin" style="color:#00C8FF">← Back to Admin</a></p>
      <script>setTimeout(() => window.close(), 2000)</script>
    </body></html>`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.send(`<html><body style="font-family:monospace;background:#020617;color:#f87171;padding:40px">
      <h2>OAuth Error</h2><p>${msg}</p>
      <p><a href="/admin" style="color:#00C8FF">← Back to Admin</a></p>
    </body></html>`);
  }
});

// ── GET /api/gsc/status ────────────────────────────────────────────────────────
router.get('/api/gsc/status', requireAuth, requireAdmin, async (_req: Request, res: Response) => {
  const tokens = await getStoredTokens();
  res.json({
    connected: !!tokens?.refresh_token,
    hasRefreshToken: !!tokens?.refresh_token,
    configured: !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
    connectUrl: '/api/gsc/connect',
  });
});

// ── GET /api/gsc/disconnect ────────────────────────────────────────────────────
router.post('/api/gsc/disconnect', requireAuth, requireAdmin, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const prisma = getPrisma();
    await prisma.$executeRaw`
      UPDATE "business_configs" SET "gscTokens" = NULL WHERE "businessId" = ${ALPHABOOST_BUSINESS_ID}
    `;
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── GET /api/gsc/search-analytics ─────────────────────────────────────────────
router.get('/api/gsc/search-analytics', requireAuth, requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const accessToken = await getAccessToken();
    const days = parseInt(req.query['days'] as string || '28');
    const rowLimit = parseInt(req.query['rowLimit'] as string || '25');
    const dimension = (req.query['dimension'] as string) || 'query';

    const startDate = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
    const endDate = new Date().toISOString().slice(0, 10);

    const siteUrl = encodeURIComponent(env.GSC_SITE_URL);
    const gscResp = await fetch(
      `https://searchconsole.googleapis.com/webmasters/v3/sites/${siteUrl}/searchAnalytics/query`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          startDate, endDate,
          dimensions: [dimension],
          rowLimit,
          orderBy: [{ fieldName: 'clicks', sortOrder: 'DESCENDING' }],
        }),
      }
    );

    const data = await gscResp.json() as { rows?: unknown[]; error?: { message: string } };
    if (!gscResp.ok) { res.status(502).json({ error: data.error?.message || 'GSC API error' }); return; }
    res.json({ rows: data.rows ?? [], startDate, endDate, dimension });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(503).json({ error: msg, rows: [] });
  }
});

// ── GET /api/gsc/pages ─────────────────────────────────────────────────────────
router.get('/api/gsc/pages', requireAuth, requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const accessToken = await getAccessToken();
    const days = parseInt(req.query['days'] as string || '28');

    const startDate = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
    const endDate = new Date().toISOString().slice(0, 10);

    const siteUrl = encodeURIComponent(env.GSC_SITE_URL);
    const gscResp = await fetch(
      `https://searchconsole.googleapis.com/webmasters/v3/sites/${siteUrl}/searchAnalytics/query`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          startDate, endDate,
          dimensions: ['page'],
          rowLimit: 25,
          orderBy: [{ fieldName: 'clicks', sortOrder: 'DESCENDING' }],
        }),
      }
    );

    const data = await gscResp.json() as { rows?: unknown[]; error?: { message: string } };
    if (!gscResp.ok) { res.status(502).json({ error: data.error?.message || 'GSC API error' }); return; }
    res.json({ rows: data.rows ?? [], startDate, endDate });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(503).json({ error: msg, rows: [] });
  }
});

export default router;
