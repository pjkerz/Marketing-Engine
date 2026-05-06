"use strict";
/**
 * compatRoutes.ts — Legacy /api/* bridge layer
 *
 * Provides backwards-compatible routes for admin.html which was built against
 * v1 paths. Maps them to v2 DB/business logic so admin panel sections work.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const auth_1 = require("../../middleware/auth");
const prisma_1 = require("../../lib/prisma");
const env_1 = require("../../config/env");
const auth_2 = require("../../middleware/auth");
const router = (0, express_1.Router)();
// ── Helpers ────────────────────────────────────────────────────────────────────
function requireAdmin(req, res, next) {
    if (!req.actor || req.actor.role !== 'admin') {
        res.status(403).json({ error: 'Admin only' });
        return;
    }
    next();
}
// ── /api/creds — Return safe admin env info ────────────────────────────────────
router.get('/api/creds', auth_1.requireAuth, requireAdmin, (_req, res) => {
    const pin = process.env['ADMIN_PIN'] || '0404';
    // Return only non-secret display fields
    res.json({
        ADMIN_PIN: pin,
        NODE_ENV: env_1.env.NODE_ENV,
        HAS_GROQ: !!env_1.env.GROQ_API_KEY,
        HAS_GOOGLE_AI: !!env_1.env.GOOGLE_AI_API_KEY,
    });
});
// ── /api/admin/update-pin ──────────────────────────────────────────────────────
router.post('/api/admin/update-pin', auth_1.requireAuth, requireAdmin, (req, res) => {
    const { pin } = req.body;
    if (!pin || !/^\d{4,8}$/.test(pin)) {
        res.status(400).json({ error: 'PIN must be 4-8 digits' });
        return;
    }
    // Update in-memory for this process lifetime (persisted via DO env var separately)
    process.env['ADMIN_PIN'] = pin;
    res.json({ ok: true });
});
// ── /api/v2/affiliates — Bridge to v2 affiliate list ───────────────────────────
router.get('/api/v2/affiliates', auth_1.requireAuth, requireAdmin, async (_req, res, next) => {
    try {
        const prisma = (0, prisma_1.getPrisma)();
        const affiliates = await prisma.affiliate.findMany({
            where: { businessId: auth_2.ALPHABOOST_BUSINESS_ID },
            orderBy: { createdAt: 'desc' },
            select: { id: true, code: true, name: true, email: true, active: true, createdAt: true },
        });
        res.json({ affiliates });
    }
    catch (err) {
        next(err);
    }
});
// ── /api/conversions — Clicks + signups by affiliate ──────────────────────────
router.get('/api/conversions', auth_1.requireAuth, requireAdmin, async (_req, res, next) => {
    try {
        const prisma = (0, prisma_1.getPrisma)();
        const events = await prisma.conversionEvent.findMany({
            where: { businessId: auth_2.ALPHABOOST_BUSINESS_ID },
            select: { affiliateCode: true, eventType: true },
        });
        const byCode = {};
        for (const e of events) {
            const code = e.affiliateCode ?? 'unknown';
            if (!byCode[code])
                byCode[code] = { clicks: 0, signups: 0 };
            if (e.eventType === 'click')
                byCode[code].clicks++;
            if (e.eventType === 'signup' || e.eventType === 'conversion')
                byCode[code].signups++;
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
    }
    catch (err) {
        next(err);
    }
});
// ── /api/commissions — Tier commission calculations ────────────────────────────
router.get('/api/commissions', auth_1.requireAuth, requireAdmin, async (_req, res, next) => {
    try {
        const prisma = (0, prisma_1.getPrisma)();
        const config = await prisma.businessConfig.findUnique({ where: { businessId: auth_2.ALPHABOOST_BUSINESS_ID } });
        const commissionValue = config?.commissionValue ?? 10;
        const affiliates = await prisma.affiliate.findMany({
            where: { businessId: auth_2.ALPHABOOST_BUSINESS_ID },
            select: { id: true, code: true, name: true, active: true },
        });
        // Count approved content runs per affiliate as a proxy for activity
        const runs = await prisma.contentGenerationRun.groupBy({
            by: ['affiliateId'],
            where: {
                businessId: auth_2.ALPHABOOST_BUSINESS_ID,
                status: { in: ['approved', 'dispatched'] },
            },
            _count: { _all: true },
        });
        const runsByAffiliate = new Map(runs.map(r => [r.affiliateId, r._count._all]));
        const conversions = await prisma.conversionEvent.groupBy({
            by: ['affiliateCode'],
            where: { businessId: auth_2.ALPHABOOST_BUSINESS_ID, eventType: { in: ['signup', 'conversion'] } },
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
    }
    catch (err) {
        next(err);
    }
});
// ── /api/post-log — Content runs that have been approved/dispatched ─────────────
router.get('/api/post-log', auth_1.requireAuth, requireAdmin, async (req, res, next) => {
    try {
        const prisma = (0, prisma_1.getPrisma)();
        const limit = Math.min(parseInt(req.query['limit'] || '200'), 500);
        const runs = await prisma.contentGenerationRun.findMany({
            where: {
                businessId: auth_2.ALPHABOOST_BUSINESS_ID,
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
    }
    catch (err) {
        next(err);
    }
});
// ── /api/manual-posts — Manual content CRUD ────────────────────────────────────
// Store as content runs with inputBrief.manual = true
router.get('/api/manual-posts', auth_1.requireAuth, requireAdmin, async (_req, res, next) => {
    try {
        const prisma = (0, prisma_1.getPrisma)();
        const runs = await prisma.contentGenerationRun.findMany({
            where: {
                businessId: auth_2.ALPHABOOST_BUSINESS_ID,
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
    }
    catch (err) {
        next(err);
    }
});
router.post('/api/manual-posts', auth_1.requireAuth, requireAdmin, async (req, res, next) => {
    try {
        const { affiliateCode, channel, content } = req.body;
        if (!content?.trim()) {
            res.status(400).json({ error: 'content is required' });
            return;
        }
        const prisma = (0, prisma_1.getPrisma)();
        const affiliate = affiliateCode
            ? await prisma.affiliate.findFirst({ where: { code: affiliateCode, businessId: auth_2.ALPHABOOST_BUSINESS_ID } })
            : await prisma.affiliate.findFirst({ where: { businessId: auth_2.ALPHABOOST_BUSINESS_ID, active: true } });
        if (!affiliate) {
            res.status(400).json({ error: 'Affiliate not found' });
            return;
        }
        const run = await prisma.contentGenerationRun.create({
            data: {
                businessId: auth_2.ALPHABOOST_BUSINESS_ID,
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
    }
    catch (err) {
        next(err);
    }
});
router.delete('/api/manual-posts/:id', auth_1.requireAuth, requireAdmin, async (req, res, next) => {
    try {
        const prisma = (0, prisma_1.getPrisma)();
        await prisma.contentGenerationRun.delete({ where: { id: req.params['id'] } });
        res.json({ ok: true });
    }
    catch (err) {
        next(err);
    }
});
// ── /api/export/sendible-csv — Bridge to v2 CSV export ────────────────────────
router.get('/api/export/sendible-csv', auth_1.requireAuth, requireAdmin, async (req, res, next) => {
    try {
        const platform = req.query['platform'] || '';
        const today = new Date().toISOString().slice(0, 10);
        const prisma = (0, prisma_1.getPrisma)();
        const where = {
            businessId: auth_2.ALPHABOOST_BUSINESS_ID,
            status: { in: ['approved', 'dispatched'] },
            outputContent: { not: null },
        };
        if (platform)
            where['channel'] = platform;
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
    }
    catch (err) {
        next(err);
    }
});
// ── /api/bok/* — Body of Knowledge routes ─────────────────────────────────────
const BOK_MD_PATH = path.join(process.cwd(), 'bok', 'alphaboost', 'knowledge.md');
function parseBokMarkdown() {
    try {
        const raw = fs.existsSync(BOK_MD_PATH) ? fs.readFileSync(BOK_MD_PATH, 'utf-8') : '';
        const verticals = [];
        // Parse sections like: ## AI Product Management\n*309 segments · 12 videos*
        const sectionRe = /^## (.+)$/gm;
        const statsRe = /\*(\d+) segments · (\d+) videos\*/;
        let match;
        while ((match = sectionRe.exec(raw)) !== null) {
            const name = match[1].trim();
            const afterHeader = raw.slice(match.index + match[0].length, match.index + match[0].length + 200);
            const statsMatch = statsRe.exec(afterHeader);
            verticals.push({
                name,
                segments: statsMatch ? parseInt(statsMatch[1]) : 0,
                videos: statsMatch ? parseInt(statsMatch[2]) : 0,
            });
        }
        const totalSegments = verticals.reduce((s, v) => s + v.segments, 0);
        const totalVideos = verticals.reduce((s, v) => s + v.videos, 0);
        return { verticals, totalSegments, totalVideos };
    }
    catch {
        return { verticals: [], totalSegments: 0, totalVideos: 0 };
    }
}
router.get('/api/bok/summary', auth_1.requireAuth, (_req, res) => {
    const { verticals, totalSegments, totalVideos } = parseBokMarkdown();
    let sources = [];
    try {
        const sourcesPath = path.join(process.env['HOME'] ?? '/root', '.openclaw', 'bok', 'sources.json');
        if (fs.existsSync(sourcesPath)) {
            const src = JSON.parse(fs.readFileSync(sourcesPath, 'utf-8'));
            sources = src.sources.map(s => ({ id: s.id, name: s.name, enabled: s.enabled }));
        }
    }
    catch { /* ignore */ }
    res.json({
        verticals,
        totalChunks: totalSegments,
        totalVideos,
        sources,
        lastSync: null,
        logTail: [],
    });
});
router.get('/api/bok/search', auth_1.requireAuth, (req, res) => {
    const q = (req.query['q'] || '').trim().toLowerCase();
    if (!q || q.length < 2) {
        res.json({ results: [] });
        return;
    }
    const terms = q.split(/\s+/).filter(Boolean);
    try {
        const raw = fs.existsSync(BOK_MD_PATH) ? fs.readFileSync(BOK_MD_PATH, 'utf-8') : '';
        const paragraphs = raw.split(/\n{2,}/);
        const results = [];
        let currentVertical = '';
        for (const para of paragraphs) {
            if (para.startsWith('## ')) {
                currentVertical = para.replace('## ', '').trim();
                continue;
            }
            if (para.length < 80)
                continue;
            const lower = para.toLowerCase();
            const matchCount = terms.filter(t => lower.includes(t)).length;
            if (matchCount === terms.length) {
                const score = terms.reduce((s, t) => {
                    let count = 0, pos = 0;
                    while ((pos = lower.indexOf(t, pos)) !== -1) {
                        count++;
                        pos++;
                    }
                    return s + count;
                }, 0);
                results.push({ text: para.trim().slice(0, 600), vertical: currentVertical, score });
            }
        }
        results.sort((a, b) => b.score - a.score);
        res.json({ results: results.slice(0, 20), total: results.length });
    }
    catch {
        res.json({ results: [], total: 0 });
    }
});
router.get('/api/bok/download', auth_1.requireAuth, (_req, res) => {
    if (fs.existsSync(BOK_MD_PATH)) {
        res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="alphaboost-bok.md"');
        res.sendFile(BOK_MD_PATH);
    }
    else {
        res.status(404).json({ error: 'BOK file not found' });
    }
});
async function getTeamUsers(businessId) {
    const prisma = (0, prisma_1.getPrisma)();
    const config = await prisma.businessConfig.findUnique({ where: { businessId } });
    return config?.teamUsers ?? [];
}
async function saveTeamUsers(businessId, users) {
    const prisma = (0, prisma_1.getPrisma)();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const json = JSON.parse(JSON.stringify(users));
    await prisma.businessConfig.upsert({
        where: { businessId },
        update: { teamUsers: json },
        create: { businessId, teamUsers: json },
    });
}
router.get('/api/team/passwords', auth_1.requireAuth, requireAdmin, async (req, res, next) => {
    try {
        const users = await getTeamUsers(req.actor.businessId || auth_2.ALPHABOOST_BUSINESS_ID);
        res.json(users);
    }
    catch (err) {
        next(err);
    }
});
router.post('/api/team', auth_1.requireAuth, requireAdmin, async (req, res, next) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            res.status(400).json({ error: 'username and password required' });
            return;
        }
        const businessId = req.actor.businessId || auth_2.ALPHABOOST_BUSINESS_ID;
        const users = await getTeamUsers(businessId);
        if (users.find(u => u.username.toLowerCase() === username.toLowerCase())) {
            res.status(409).json({ error: 'Username already exists' });
            return;
        }
        users.push({ username, password });
        await saveTeamUsers(businessId, users);
        res.json({ ok: true });
    }
    catch (err) {
        next(err);
    }
});
router.delete('/api/team/:username', auth_1.requireAuth, requireAdmin, async (req, res, next) => {
    try {
        const { username } = req.params;
        const businessId = req.actor.businessId || auth_2.ALPHABOOST_BUSINESS_ID;
        const users = await getTeamUsers(businessId);
        const filtered = users.filter(u => u.username !== username);
        await saveTeamUsers(businessId, filtered);
        res.json({ ok: true });
    }
    catch (err) {
        next(err);
    }
});
router.patch('/api/team/:username/email', auth_1.requireAuth, requireAdmin, async (req, res, next) => {
    try {
        const { username } = req.params;
        const { email } = req.body;
        const businessId = req.actor.businessId || auth_2.ALPHABOOST_BUSINESS_ID;
        const users = await getTeamUsers(businessId);
        const user = users.find(u => u.username === username);
        if (!user) {
            res.status(404).json({ error: 'User not found' });
            return;
        }
        user.email = email || '';
        await saveTeamUsers(businessId, users);
        res.json({ ok: true });
    }
    catch (err) {
        next(err);
    }
});
router.patch('/api/team/:username/password', auth_1.requireAuth, requireAdmin, async (req, res, next) => {
    try {
        const { username } = req.params;
        const { password } = req.body;
        if (!password) {
            res.status(400).json({ error: 'password required' });
            return;
        }
        const businessId = req.actor.businessId || auth_2.ALPHABOOST_BUSINESS_ID;
        const users = await getTeamUsers(businessId);
        const user = users.find(u => u.username === username);
        if (!user) {
            res.status(404).json({ error: 'User not found' });
            return;
        }
        user.password = password;
        await saveTeamUsers(businessId, users);
        res.json({ ok: true });
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
//# sourceMappingURL=compatRoutes.js.map