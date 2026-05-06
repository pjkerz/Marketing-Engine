import { Router, Request, Response } from 'express';
import * as fs from 'fs';
import * as jwt from 'jsonwebtoken';
import { env } from '../../config/env';
import { requireAuth } from '../../middleware/auth';
import { ALPHABOOST_BUSINESS_ID } from '../../middleware/auth'; // compat only
import { getPrisma } from '../../lib/prisma';

const router = Router();

interface Affiliate {
  username?: string;
  password?: string;
  name?: string;
  affiliateCode?: string;
  code?: string;
  tier?: number;
  role?: string;
}

function readAffiliates(): Affiliate[] {
  try {
    return JSON.parse(fs.readFileSync(env.AFFILIATES_JSON_PATH, 'utf8'));
  } catch {
    return [];
  }
}

function readCreds(): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    const lines = fs.readFileSync(env.CREDS_MD_PATH, 'utf8').split('\n');
    for (const line of lines) {
      const eq = line.indexOf('=');
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      const val = line.slice(eq + 1).trim();
      if (key && !key.startsWith('#')) out[key] = val;
    }
  } catch { /* ignore */ }
  return out;
}

function issueSessionToken(payload: {
  username: string;
  role: string;
  affiliateCode?: string;
  businessId: string;
  tier?: number;
}): string {
  return jwt.sign(
    {
      username: payload.username,
      role: payload.role,
      affiliateCode: payload.affiliateCode,
      businessId: payload.businessId,
      tier: payload.tier || 1,
    },
    env.V2_JWT_SECRET,
    { expiresIn: '30d' },
  );
}

// POST /api/login
router.post('/api/login', async (req: Request, res: Response) => {
  const { username, password, businessSlug } = req.body as { username?: string; password?: string; businessSlug?: string };
  if (!username || !password) {
    res.status(400).json({ error: 'username and password required' });
    return;
  }

  // Temporary debug — remove after confirming auth works
  console.log('[login] attempt', { username, hasAdminUsers: !!env.ADMIN_USERS, hasConsolePassword: !!env.CONSOLE_PASSWORD });

  const affiliates = readAffiliates();
  const creds = readCreds();

  const prisma = getPrisma();

  // Resolve businessId from slug if provided (needed for team user lookups)
  let resolvedBusinessId: string | null = null;
  if (businessSlug) {
    try {
      const biz = await prisma.business.findFirst({ where: { slug: businessSlug, active: true }, select: { id: true } });
      resolvedBusinessId = biz?.id ?? null;
      if (!resolvedBusinessId) {
        res.status(400).json({ error: `Unknown business: ${businessSlug}` });
        return;
      }
    } catch { /* fall through */ }
  }

  // Check affiliate users in database first
  try {
    const dbAffiliate = await prisma.affiliate.findFirst({
      where: { email: username, active: true },
    });
    if (!dbAffiliate) {
      const byCode = await prisma.affiliate.findFirst({
        where: { code: username.toUpperCase(), active: true },
      });
      if (byCode?.password && byCode.password === password) {
        const token = issueSessionToken({ username: byCode.name, role: 'affiliate', affiliateCode: byCode.code, businessId: byCode.businessId });
        res.json({ ok: true, token, username: byCode.name, role: 'affiliate', tier: 1, affiliateCode: byCode.code });
        return;
      }
    }
    if (dbAffiliate?.password && dbAffiliate.password === password) {
      const token = issueSessionToken({ username: dbAffiliate.name, role: 'affiliate', affiliateCode: dbAffiliate.code, businessId: dbAffiliate.businessId });
      res.json({ ok: true, token, username: dbAffiliate.name, role: 'affiliate', tier: 1, affiliateCode: dbAffiliate.code });
      return;
    }
  } catch { /* fall through to file-based auth */ }

  // Check affiliate users in affiliates.json (legacy)
  const affiliateUser = affiliates.find(
    (a) => a.username === username && a.password === password,
  );
  if (affiliateUser) {
    const affiliateCode = affiliateUser.affiliateCode || affiliateUser.code || username.toUpperCase();
    const token = issueSessionToken({
      username: affiliateUser.name || username,
      role: 'affiliate',
      affiliateCode,
      businessId: resolvedBusinessId ?? ALPHABOOST_BUSINESS_ID,
      tier: affiliateUser.tier || 1,
    });
    res.json({ ok: true, token, username: affiliateUser.name || username, role: 'affiliate', tier: affiliateUser.tier || 1, affiliateCode });
    return;
  }

  // Admin credential checks — all require a businessSlug to scope the session
  const adminBusinessId = resolvedBusinessId ?? ALPHABOOST_BUSINESS_ID;

  // Check ADMIN_USERS env var first (format: "user1:pass1,user2:pass2")
  if (env.ADMIN_USERS) {
    const adminUsers = env.ADMIN_USERS.split(',').map((entry) => {
      const idx = entry.indexOf(':');
      return { username: entry.slice(0, idx).trim(), password: entry.slice(idx + 1).trim() };
    });
    const adminMatch = adminUsers.find((u) => u.username === username && u.password === password);
    if (adminMatch) {
      const token = issueSessionToken({ username, role: 'admin', businessId: adminBusinessId });
      res.json({ ok: true, token, username, role: 'leadership' });
      return;
    }
  }

  // Check CONSOLE_PASSWORD env var
  if (env.CONSOLE_PASSWORD && password === env.CONSOLE_PASSWORD) {
    const token = issueSessionToken({ username, role: 'admin', businessId: adminBusinessId });
    res.json({ ok: true, token, username, role: 'leadership' });
    return;
  }

  // Check TEAM_USER_* entries from CREDS.md (local dev fallback)
  const teamUsers = Object.entries(creds)
    .filter(([k]) => k.startsWith('TEAM_USER_'))
    .map(([, v]) => { const idx = v.indexOf(':'); return { username: v.slice(0, idx), password: v.slice(idx + 1) }; });

  const teamMatch = teamUsers.find((u) => u.username === username && u.password === password);
  if (teamMatch) {
    const token = issueSessionToken({ username, role: 'admin', businessId: adminBusinessId });
    res.json({ ok: true, token, username, role: 'leadership' });
    return;
  }

  // Check CONSOLE_PASSWORD from CREDS.md (local dev fallback)
  if (creds.CONSOLE_PASSWORD && password === creds.CONSOLE_PASSWORD) {
    const token = issueSessionToken({ username, role: 'admin', businessId: adminBusinessId });
    res.json({ ok: true, token, username, role: 'leadership' });
    return;
  }

  // Check team users stored in BusinessConfig.teamUsers (per-tenant)
  try {
    const config = await prisma.businessConfig.findUnique({ where: { businessId: adminBusinessId } });
    const dbTeamUsers = (config?.teamUsers as Array<{ username: string; password: string }> | null) ?? [];
    const dbTeamMatch = dbTeamUsers.find(u => u.username === username && u.password === password);
    if (dbTeamMatch) {
      const token = issueSessionToken({ username, role: 'admin', businessId: adminBusinessId });
      res.json({ ok: true, token, username, role: 'leadership' });
      return;
    }
  } catch { /* fall through */ }

  res.status(401).json({ error: 'Invalid username or password' });
});

// POST /api/admin/verify-pin — PIN gate for admin.html (no auth required, PIN is the factor)
router.post('/api/admin/verify-pin', (req: Request, res: Response) => {
  const { pin } = req.body as { pin?: string };
  const correctPin = (process.env.ADMIN_PIN || '0404').toString().trim();
  if (pin && pin.toString().trim() === correctPin) {
    res.json({ ok: true });
  } else {
    res.status(401).json({ error: 'Incorrect PIN' });
  }
});

// POST /api/logout
router.post('/api/logout', (_req: Request, res: Response) => {
  res.clearCookie('session');
  res.json({ ok: true });
});

// GET /api/me
router.get('/api/me', requireAuth, (req: Request, res: Response) => {
  const actor = req.actor!;
  const affiliates = readAffiliates();
  const aff = affiliates.find(
    (a) => a.affiliateCode === actor.affiliateCode || a.username === actor.affiliateCode,
  );
  res.json({
    username: actor.affiliateCode || 'admin',
    role: actor.role === 'admin' ? 'leadership' : actor.role,
    affiliateCode: actor.affiliateCode || null,
    tier: aff?.tier || (actor.role === 'admin' ? null : 1),
  });
});

// GET /api/my/connected-platforms — returns platforms with active DB connections
router.get('/api/my/connected-platforms', requireAuth, async (req: Request, res: Response) => {
  try {
    const actor = req.actor;
    if (!actor?.affiliateCode) { res.json({ platforms: [] }); return; }

    const prisma = getPrisma();
    const affiliate = await prisma.affiliate.findUnique({ where: { code: actor.affiliateCode } });
    if (!affiliate) { res.json({ platforms: [] }); return; }

    const connections = await prisma.platformConnection.findMany({
      where: { affiliateId: affiliate.id },
      select: { platform: true, connectedAt: true },
    });

    res.json({ platforms: connections.map(c => ({ id: c.platform, connectedAt: c.connectedAt })) });
  } catch {
    res.json({ platforms: [] });
  }
});

// GET /api/welcome — stub for affiliate.html
router.get('/api/welcome', requireAuth, (_req: Request, res: Response) => {
  res.json({ ok: true });
});

// GET /api/terms — stub for affiliate.html
router.get('/api/terms', (_req: Request, res: Response) => {
  res.json({ ok: true });
});

export default router;
