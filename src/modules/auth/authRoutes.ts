import { Router, Request, Response } from 'express';
import * as fs from 'fs';
import * as jwt from 'jsonwebtoken';
import { env } from '../../config/env';
import { requireAuth } from '../../middleware/auth';
import { ALPHABOOST_BUSINESS_ID } from '../../middleware/auth';

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
  businessId?: string;
  tier?: number;
}): string {
  return jwt.sign(
    {
      username: payload.username,
      role: payload.role,
      affiliateCode: payload.affiliateCode,
      businessId: payload.businessId || ALPHABOOST_BUSINESS_ID,
      tier: payload.tier || 1,
    },
    env.V2_JWT_SECRET,
    { expiresIn: '30d' },
  );
}

// POST /api/login
router.post('/api/login', (req: Request, res: Response) => {
  const { username, password } = req.body as { username?: string; password?: string };
  if (!username || !password) {
    res.status(400).json({ error: 'username and password required' });
    return;
  }

  // Temporary debug — remove after confirming auth works
  console.log('[login] attempt', { username, hasAdminUsers: !!env.ADMIN_USERS, hasConsolePassword: !!env.CONSOLE_PASSWORD });

  const affiliates = readAffiliates();
  const creds = readCreds();

  // Check affiliate users
  const affiliateUser = affiliates.find(
    (a) => a.username === username && a.password === password,
  );
  if (affiliateUser) {
    const affiliateCode = affiliateUser.affiliateCode || affiliateUser.code || username.toUpperCase();
    const token = issueSessionToken({
      username: affiliateUser.name || username,
      role: 'affiliate',
      affiliateCode,
      tier: affiliateUser.tier || 1,
    });
    res.json({
      ok: true,
      token,
      username: affiliateUser.name || username,
      role: 'affiliate',
      tier: affiliateUser.tier || 1,
      affiliateCode,
    });
    return;
  }

  // Check ADMIN_USERS env var first (format: "user1:pass1,user2:pass2")
  if (env.ADMIN_USERS) {
    const adminUsers = env.ADMIN_USERS.split(',').map((entry) => {
      const idx = entry.indexOf(':');
      return { username: entry.slice(0, idx).trim(), password: entry.slice(idx + 1).trim() };
    });
    const adminMatch = adminUsers.find((u) => u.username === username && u.password === password);
    if (adminMatch) {
      const token = issueSessionToken({ username, role: 'admin' });
      res.json({ ok: true, token, username, role: 'leadership' });
      return;
    }
  }

  // Check CONSOLE_PASSWORD env var
  if (env.CONSOLE_PASSWORD && password === env.CONSOLE_PASSWORD) {
    const token = issueSessionToken({ username, role: 'admin' });
    res.json({ ok: true, token, username, role: 'leadership' });
    return;
  }

  // Check TEAM_USER_* entries from CREDS.md (local dev fallback)
  const teamUsers = Object.entries(creds)
    .filter(([k]) => k.startsWith('TEAM_USER_'))
    .map(([, v]) => { const idx = v.indexOf(':'); return { username: v.slice(0, idx), password: v.slice(idx + 1) }; });

  const teamMatch = teamUsers.find((u) => u.username === username && u.password === password);
  if (teamMatch) {
    const token = issueSessionToken({ username, role: 'admin' });
    res.json({ ok: true, token, username, role: 'leadership' });
    return;
  }

  // Check CONSOLE_PASSWORD from CREDS.md (local dev fallback)
  if (creds.CONSOLE_PASSWORD && password === creds.CONSOLE_PASSWORD) {
    const token = issueSessionToken({ username, role: 'admin' });
    res.json({ ok: true, token, username, role: 'leadership' });
    return;
  }

  res.status(401).json({ error: 'Invalid username or password' });
});

// POST /api/admin/verify-pin — PIN gate for admin.html
router.post('/api/admin/verify-pin', requireAuth, (req: Request, res: Response) => {
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

export default router;
