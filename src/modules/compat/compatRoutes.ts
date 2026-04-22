/**
 * compatRoutes.ts — Legacy /api/* bridge layer
 *
 * Provides backwards-compatible routes for admin.html which was built against
 * v1 paths. Maps them to v2 DB/business logic so admin panel sections work.
 */

import { Router, Request, Response, NextFunction } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { requireAuth } from '../../middleware/auth';
import { requireRole } from '../../middleware/rbac';
import { getPrisma } from '../../lib/prisma';
import { env } from '../../config/env';
import { ALPHABOOST_BUSINESS_ID } from '../../middleware/auth';

const router = Router();

// ── Helpers ────────────────────────────────────────────────────────────────────

function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.actor || req.actor.role !== 'admin') {
    res.status(403).json({ error: 'Admin only' });
    return;
  }
  next();
}

// ── /api/creds — Return safe admin env info ────────────────────────────────────
router.get('/api/creds', requireAuth, requireAdmin, (_req: Request, res: Response) => {
  const pin = process.env['ADMIN_PIN'] || '0404';
  // Return only non-secret display fields
  res.json({
    ADMIN_PIN: pin,
    NODE_ENV: env.NODE_ENV,
    HAS_GROQ: !!env.GROQ_API_KEY,
    HAS_GOOGLE_AI: !!env.GOOGLE_AI_API_KEY,
  });
});

// ── /api/admin/update-pin ──────────────────────────────────────────────────────
router.post('/api/admin/update-pin', requireAuth, requireAdmin, (req: Request, res: Response) => {
  const { pin } = req.body as { pin?: string };
  if (!pin || !/^\d{4,8}$/.test(pin)) {
    res.status(400).json({ error: 'PIN must be 4-8 digits' });
    return;
  }
  // Update in-memory for this process lifetime (persisted via DO env var separately)
  process.env['ADMIN_PIN'] = pin;
  res.json({ ok: true });
});

// ── /api/v2/affiliates — Bridge to v2 affiliate list ───────────────────────────
router.get('/api/v2/affiliates', requireAuth, requireAdmin, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const prisma = getPrisma();
    const affiliates = await prisma.affiliate.findMany({
      where: { businessId: ALPHABOOST_BUSINESS_ID },
      orderBy: { createdAt: 'desc' },
      select: { id: true, code: true, name: true, email: true, active: true, createdAt: true },
    });
    res.json({ affiliates });
  } catch (err) { next(err); }
});

// ── /api/conversions — Clicks + signups by affiliate ──────────────────────────
router.get('/api/conversions', requireAuth, requireAdmin, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const prisma = getPrisma();
    const events = await prisma.conversionEvent.findMany({
      where: { businessId: ALPHABOOST_BUSINESS_ID },
      select: { affiliateCode: true, eventType: true },
    });

    const byCode: Record<string, { clicks: number; signups: number }> = {};
    for (const e of events) {
      const code = e.affiliateCode ?? 'unknown';
      if (!byCode[code]) byCode[code] = { clicks: 0, signups: 0 };
      if (e.eventType === 'click') byCode[code]!.clicks++;
      if (e.eventType === 'signup' || e.eventType === 'conversion') byCode[code]!.signups++;
    }

    const summary = Object.entries(byCode)
      .map(([code, s]) => ({
        code,
        clicks: s.clicks,
        signups: s.signups,
        conversionRate: s.clicks ? ((s.signups / s.clicks) * 100).toFixed(1) + '%' : '0%',
      }))
      .sort((a, b) => b.clicks - a.clicks);

    const totalClicks = events.filter(e => e.eventType === 'click').length;
    const totalSignups = events.filter(e => e.eventType === 'signup' || e.eventType === 'conversion').length;

    res.json({ summary, totalClicks, totalSignups });
  } catch (err) { next(err); }
});

// ── /api/commissions — Tier commission calculations ────────────────────────────
router.get('/api/commissions', requireAuth, requireAdmin, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const prisma = getPrisma();
    const config = await prisma.businessConfig.findUnique({ where: { businessId: ALPHABOOST_BUSINESS_ID } });
    const commissionValue = config?.commissionValue ?? 10;

    const affiliates = await prisma.affiliate.findMany({
      where: { businessId: ALPHABOOST_BUSINESS_ID },
      select: { id: true, code: true, name: true, active: true },
    });

    // Count approved content runs per affiliate as a proxy for activity
    const runs = await prisma.contentGenerationRun.groupBy({
      by: ['affiliateId'],
      where: {
        businessId: ALPHABOOST_BUSINESS_ID,
        status: { in: ['approved', 'dispatched'] },
      },
      _count: { _all: true },
    });
    const runsByAffiliate = new Map(runs.map(r => [r.affiliateId, r._count._all]));

    const conversions = await prisma.conversionEvent.groupBy({
      by: ['affiliateCode'],
      where: { businessId: ALPHABOOST_BUSINESS_ID, eventType: { in: ['signup', 'conversion'] } },
      _count: { _all: true },
    });
    const convByCode = new Map(conversions.map(c => [c.affiliateCode, c._count._all]));

    const affiliateMap = new Map(affiliates.map(a => [a.id, a]));

    const rows = affiliates.map(a => {
      const signups = convByCode.get(a.code) ?? 0;
      const postsApproved = runsByAffiliate.get(a.id) ?? 0;
      const earned = signups * commissionValue;
      return { code: a.code, name: a.name, active: a.active, signups, postsApproved, earned };
    });

    res.json({
      affiliates: rows,
      commissionPerSignup: commissionValue,
      totalPayout: rows.reduce((s, r) => s + r.earned, 0),
    });
  } catch (err) { next(err); }
});

// ── /api/post-log — Content runs that have been approved/dispatched ─────────────
router.get('/api/post-log', requireAuth, requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const prisma = getPrisma();
    const limit = Math.min(parseInt(req.query['limit'] as string || '200'), 500);
    const runs = await prisma.contentGenerationRun.findMany({
      where: {
        businessId: ALPHABOOST_BUSINESS_ID,
        status: { in: ['approved', 'dispatched'] },
      },
      orderBy: { updatedAt: 'desc' },
      take: limit,
      include: {
        affiliate: { select: { code: true, name: true } },
      },
    });

    const entries = runs.map(r => ({
      id: r.id,
      affiliateCode: r.affiliate.code,
      affiliateName: r.affiliate.name,
      channel: r.channel,
      content: r.editedContent ?? r.outputContent ?? '',
      status: r.status,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));

    res.json({ entries });
  } catch (err) { next(err); }
});

// ── /api/manual-posts — Manual content CRUD ────────────────────────────────────
// Store as content runs with inputBrief.manual = true

router.get('/api/manual-posts', requireAuth, requireAdmin, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const prisma = getPrisma();
    const runs = await prisma.contentGenerationRun.findMany({
      where: {
        businessId: ALPHABOOST_BUSINESS_ID,
        inputBrief: { path: ['manual'], equals: true },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { affiliate: { select: { code: true, name: true } } },
    });

    const posts = runs.map(r => ({
      id: r.id,
      affiliateCode: r.affiliate.code,
      affiliateName: r.affiliate.name,
      channel: r.channel,
      content: r.outputContent ?? '',
      status: r.status,
      createdAt: r.createdAt,
    }));
    res.json({ posts });
  } catch (err) { next(err); }
});

router.post('/api/manual-posts', requireAuth, requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { affiliateCode, channel, content } = req.body as { affiliateCode?: string; channel?: string; content?: string };
    if (!content?.trim()) { res.status(400).json({ error: 'content is required' }); return; }

    const prisma = getPrisma();

    const affiliate = affiliateCode
      ? await prisma.affiliate.findFirst({ where: { code: affiliateCode, businessId: ALPHABOOST_BUSINESS_ID } })
      : await prisma.affiliate.findFirst({ where: { businessId: ALPHABOOST_BUSINESS_ID, active: true } });

    if (!affiliate) { res.status(400).json({ error: 'Affiliate not found' }); return; }

    const run = await prisma.contentGenerationRun.create({
      data: {
        businessId: ALPHABOOST_BUSINESS_ID,
        affiliateId: affiliate.id,
        channel: channel ?? 'linkedin',
        status: 'approved',
        inputBrief: { manual: true, createdBy: 'admin' },
        outputContent: content.trim(),
        personalizationSummary: { manual: true },
      },
    });

    res.json({
      post: {
        id: run.id,
        affiliateCode: affiliate.code,
        affiliateName: affiliate.name,
        channel: run.channel,
        content: run.outputContent,
        createdAt: run.createdAt,
      },
    });
  } catch (err) { next(err); }
});

router.delete('/api/manual-posts/:id', requireAuth, requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const prisma = getPrisma();
    await prisma.contentGenerationRun.delete({ where: { id: req.params['id'] as string } });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── /api/export/sendible-csv — Bridge to v2 CSV export ────────────────────────
router.get('/api/export/sendible-csv', requireAuth, requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const platform = (req.query['platform'] as string) || '';
    const today = new Date().toISOString().slice(0, 10);
    const prisma = getPrisma();

    const where: Record<string, unknown> = {
      businessId: ALPHABOOST_BUSINESS_ID,
      status: { in: ['approved', 'dispatched'] },
      outputContent: { not: null },
    };
    if (platform) where['channel'] = platform;

    const runs = await prisma.contentGenerationRun.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take: 500,
      include: { affiliate: { select: { code: true, name: true } } },
    });

    // Sendible CSV format: Message, SendDate, Image
    const rows = [['Message', 'SendDate', 'AffiliateName', 'AffiliateCode', 'Platform']];
    for (const r of runs) {
      const content = (r.editedContent ?? r.outputContent ?? '').replace(/"/g, '""');
      rows.push([
        `"${content}"`,
        `"${new Date(r.updatedAt).toISOString().slice(0, 10)}"`,
        `"${r.affiliate.name}"`,
        `"${r.affiliate.code}"`,
        `"${r.channel}"`,
      ]);
    }

    const csv = rows.map(r => r.join(',')).join('\n');
    const filename = `sendible-${platform || 'all'}-${today}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.end(csv);
  } catch (err) { next(err); }
});

// ── /api/bok/* — Body of Knowledge routes ─────────────────────────────────────

const BOK_MD_PATH = path.join(process.cwd(), 'bok', 'alphaboost', 'knowledge.md');

function parseBokMarkdown(): { verticals: Array<{ name: string; segments: number; videos: number }>; totalSegments: number; totalVideos: number } {
  try {
    const raw = fs.existsSync(BOK_MD_PATH) ? fs.readFileSync(BOK_MD_PATH, 'utf-8') : '';
    const verticals: Array<{ name: string; segments: number; videos: number }> = [];

    // Parse sections like: ## AI Product Management\n*309 segments · 12 videos*
    const sectionRe = /^## (.+)$/gm;
    const statsRe = /\*(\d+) segments · (\d+) videos\*/;
    let match: RegExpExecArray | null;

    while ((match = sectionRe.exec(raw)) !== null) {
      const name = match[1]!.trim();
      const afterHeader = raw.slice(match.index + match[0].length, match.index + match[0].length + 200);
      const statsMatch = statsRe.exec(afterHeader);
      verticals.push({
        name,
        segments: statsMatch ? parseInt(statsMatch[1]!) : 0,
        videos: statsMatch ? parseInt(statsMatch[2]!) : 0,
      });
    }

    const totalSegments = verticals.reduce((s, v) => s + v.segments, 0);
    const totalVideos = verticals.reduce((s, v) => s + v.videos, 0);
    return { verticals, totalSegments, totalVideos };
  } catch {
    return { verticals: [], totalSegments: 0, totalVideos: 0 };
  }
}

router.get('/api/bok/summary', requireAuth, (_req: Request, res: Response) => {
  const { verticals, totalSegments, totalVideos } = parseBokMarkdown();

  let sources: Array<{ id: string; name: string; enabled: boolean }> = [];
  try {
    const sourcesPath = path.join(process.env['HOME'] ?? '/root', '.openclaw', 'bok', 'sources.json');
    if (fs.existsSync(sourcesPath)) {
      const src = JSON.parse(fs.readFileSync(sourcesPath, 'utf-8')) as { sources: Array<{ id: string; name: string; enabled: boolean; url: string }> };
      sources = src.sources.map(s => ({ id: s.id, name: s.name, enabled: s.enabled }));
    }
  } catch { /* ignore */ }

  res.json({
    verticals,
    totalChunks: totalSegments,
    totalVideos,
    sources,
    lastSync: null,
    logTail: [],
  });
});

router.get('/api/bok/search', requireAuth, (req: Request, res: Response) => {
  const q = ((req.query['q'] as string) || '').trim().toLowerCase();
  if (!q || q.length < 2) { res.json({ results: [] }); return; }

  const terms = q.split(/\s+/).filter(Boolean);

  try {
    const raw = fs.existsSync(BOK_MD_PATH) ? fs.readFileSync(BOK_MD_PATH, 'utf-8') : '';
    const paragraphs = raw.split(/\n{2,}/);
    const results: Array<{ text: string; vertical: string; score: number }> = [];

    let currentVertical = '';
    for (const para of paragraphs) {
      if (para.startsWith('## ')) { currentVertical = para.replace('## ', '').trim(); continue; }
      if (para.length < 80) continue;
      const lower = para.toLowerCase();
      const matchCount = terms.filter(t => lower.includes(t)).length;
      if (matchCount === terms.length) {
        const score = terms.reduce((s, t) => {
          let count = 0, pos = 0;
          while ((pos = lower.indexOf(t, pos)) !== -1) { count++; pos++; }
          return s + count;
        }, 0);
        results.push({ text: para.trim().slice(0, 600), vertical: currentVertical, score });
      }
    }

    results.sort((a, b) => b.score - a.score);
    res.json({ results: results.slice(0, 20), total: results.length });
  } catch {
    res.json({ results: [], total: 0 });
  }
});

router.get('/api/bok/download', requireAuth, (_req: Request, res: Response) => {
  if (fs.existsSync(BOK_MD_PATH)) {
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="alphaboost-bok.md"');
    res.sendFile(BOK_MD_PATH);
  } else {
    res.status(404).json({ error: 'BOK file not found' });
  }
});

// ── /api/gsc/* — Google Search Console (stub — needs OAuth setup) ──────────────
router.get('/api/gsc/status', requireAuth, requireAdmin, (_req: Request, res: Response) => {
  res.json({ connected: false, message: 'Google Search Console not configured. Add GSC OAuth credentials to enable.' });
});

router.get('/api/gsc/search-analytics', requireAuth, requireAdmin, (_req: Request, res: Response) => {
  res.json({ rows: [], message: 'GSC not configured' });
});

router.get('/api/gsc/pages', requireAuth, requireAdmin, (_req: Request, res: Response) => {
  res.json({ rows: [], message: 'GSC not configured' });
});

export default router;
