"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAffiliatePerformance = getAffiliatePerformance;
const express_1 = require("express");
const prisma_js_1 = require("../../lib/prisma.js");
const auth_js_1 = require("../../middleware/auth.js");
const dashboardWorker_js_1 = require("../../queues/workers/dashboardWorker.js");
const env_js_1 = require("../../config/env.js");
const https_1 = __importDefault(require("https"));
const router = (0, express_1.Router)();
// GET /v2/api/admin/dashboard?days=30
router.get('/', auth_js_1.requireAuth, async (req, res) => {
    const prisma = (0, prisma_js_1.getPrisma)();
    const { businessId } = req.actor;
    const days = parseInt(req.query.days) || 30;
    const snapshot = await prisma.dashboardSnapshot.findFirst({ where: { businessId }, orderBy: { createdAt: 'desc' } });
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    if (!snapshot || snapshot.createdAt < twoHoursAgo) {
        if (dashboardWorker_js_1.dashboardQueue)
            await dashboardWorker_js_1.dashboardQueue.add('snapshot-immediate', {}, { priority: 1 });
        return res.json(await (0, dashboardWorker_js_1.computeDashboardData)(businessId, days));
    }
    res.json(snapshot.data);
});
// GET /v2/api/admin/dashboard/content-performance?days=30&channel=linkedin
router.get('/content-performance', auth_js_1.requireAuth, async (req, res) => {
    const prisma = (0, prisma_js_1.getPrisma)();
    const { businessId } = req.actor;
    const days = parseInt(req.query.days) || 30;
    const channel = typeof req.query.channel === 'string' ? req.query.channel : undefined;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    // Use raw-ish approach to avoid Prisma groupBy overload issues
    const where = { businessId, timestamp: { gte: since }, contentRunId: { not: null }, eventType: 'click' };
    if (channel)
        where.channel = channel;
    const raw = await prisma.funnelEvent.groupBy({ by: ['contentRunId'], where, _count: { id: true }, orderBy: { _count: { id: 'desc' } }, take: 20 });
    const eligible = raw.filter((g) => g._count.id >= 10);
    const runIds = eligible.map((g) => g.contentRunId);
    if (runIds.length === 0)
        return res.json({ content: [] });
    const runs = await prisma.contentGenerationRun.findMany({ where: { id: { in: runIds } }, select: { id: true, channel: true, inputBrief: true } });
    const runMap = new Map(runs.map(r => [r.id, r]));
    const content = runIds.map(id => {
        const run = runMap.get(id);
        const brief = run?.inputBrief;
        const entry = eligible.find((g) => g.contentRunId === id);
        return { contentRunId: id, channel: run?.channel ?? channel ?? 'unknown', preview: (brief?.topic ?? brief?.keyword ?? 'Content').slice(0, 100), clicks: (entry?._count.id ?? 0) };
    });
    res.json({ content });
});
// GET /v2/api/admin/dashboard/channel-performance?days=30
router.get('/channel-performance', auth_js_1.requireAuth, async (req, res) => {
    const prisma = (0, prisma_js_1.getPrisma)();
    const { businessId } = req.actor;
    const days = parseInt(req.query.days) || 30;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const [clicksRaw, convsRaw] = await Promise.all([
        prisma.funnelEvent.groupBy({ by: ['channel'], where: { businessId, timestamp: { gte: since }, eventType: 'click' }, _count: { id: true } }),
        prisma.conversionEvent.groupBy({ by: ['channel'], where: { businessId, occurredAt: { gte: since } }, _count: { id: true } }),
    ]);
    const convMap = new Map(convsRaw.map((c) => [c.channel, c._count.id]));
    const channels = clicksRaw
        .filter((c) => c.channel && c._count.id >= 5)
        .map((c) => ({ channel: c.channel, clicks: c._count.id, conversions: convMap.get(c.channel) ?? 0, cvr: c._count.id > 0 ? +((convMap.get(c.channel) ?? 0) / c._count.id * 100).toFixed(2) : 0 }))
        .sort((a, b) => b.cvr - a.cvr);
    res.json({ channels });
});
// GET /v2/api/admin/dashboard/affiliate-leaderboard?days=30
router.get('/affiliate-leaderboard', auth_js_1.requireAuth, async (req, res) => {
    const prisma = (0, prisma_js_1.getPrisma)();
    const { businessId } = req.actor;
    const days = parseInt(req.query.days) || 30;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const [clicksRaw, convsRaw, affiliates] = await Promise.all([
        prisma.funnelEvent.groupBy({ by: ['affiliateCode'], where: { businessId, timestamp: { gte: since }, eventType: 'click', affiliateCode: { not: null } }, _count: { id: true } }),
        prisma.conversionEvent.groupBy({ by: ['affiliateCode'], where: { businessId, occurredAt: { gte: since }, affiliateCode: { not: null } }, _count: { id: true } }),
        prisma.affiliate.findMany({ where: { businessId }, select: { code: true, name: true } }),
    ]);
    const convMap = new Map(convsRaw.map((c) => [c.affiliateCode, c._count.id]));
    const nameMap = new Map(affiliates.map(a => [a.code, a.name]));
    const leaderboard = clicksRaw
        .filter((c) => c.affiliateCode)
        .map((c) => { const code = c.affiliateCode; const cl = c._count.id; const cv = convMap.get(code) ?? 0; return { affiliateCode: code, name: nameMap.get(code) ?? code, clicks: cl, conversions: cv, cvr: cl > 0 ? +(cv / cl * 100).toFixed(2) : 0 }; })
        .sort((a, b) => b.conversions - a.conversions);
    res.json({ leaderboard });
});
// GET /v2/api/admin/dashboard/funnel?days=30
router.get('/funnel', auth_js_1.requireAuth, async (req, res) => {
    const prisma = (0, prisma_js_1.getPrisma)();
    const { businessId } = req.actor;
    const days = parseInt(req.query.days) || 30;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const raw = await prisma.funnelEvent.groupBy({ by: ['funnelStage'], where: { businessId, timestamp: { gte: since } }, _count: { id: true } });
    const stageMap = new Map(raw.map((f) => [f.funnelStage, f._count.id]));
    const stages = ['awareness', 'interest', 'consideration', 'conversion'];
    const funnel = stages.map((stage, i) => {
        const count = stageMap.get(stage) ?? 0;
        const prevCount = i > 0 ? (stageMap.get(stages[i - 1]) ?? 0) : count;
        return { stage, count, dropoffFromPrevious: prevCount > 0 ? +(100 - (count / prevCount) * 100).toFixed(1) : 0 };
    });
    res.json({ funnel });
});
// GET /v2/api/affiliate/:code/performance
async function getAffiliatePerformance(req, res) {
    const prisma = (0, prisma_js_1.getPrisma)();
    const code = req.params['code'];
    const { businessId } = req.actor;
    const days = parseInt(req.query.days) || 30;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const affiliate = await prisma.affiliate.findFirst({ where: { code, businessId } });
    if (!affiliate)
        return res.status(404).json({ error: 'Not found' });
    const [clickGroupsRaw, convCount, allClicks, allConvs] = await Promise.all([
        prisma.funnelEvent.groupBy({ by: ['channel'], where: { businessId, affiliateCode: code, eventType: 'click', timestamp: { gte: since } }, _count: { id: true } }),
        prisma.conversionEvent.count({ where: { businessId, affiliateCode: code, occurredAt: { gte: since } } }),
        prisma.funnelEvent.count({ where: { businessId, eventType: 'click', timestamp: { gte: since } } }),
        prisma.conversionEvent.count({ where: { businessId, occurredAt: { gte: since } } }),
    ]);
    const clickGroups = clickGroupsRaw;
    const totalClicks = clickGroups.reduce((sum, g) => sum + g._count.id, 0);
    const byPlatform = {};
    for (const g of clickGroups) {
        byPlatform[g.channel] = g._count.id;
    }
    const cvr = totalClicks > 0 ? +(convCount / totalClicks * 100).toFixed(2) : 0;
    const platformAvgCvr = allClicks > 0 ? +(allConvs / allClicks * 100).toFixed(2) : 0;
    const topContentRaw = await prisma.funnelEvent.groupBy({
        by: ['contentRunId'],
        where: { businessId, affiliateCode: code, eventType: 'click', timestamp: { gte: since }, contentRunId: { not: null } },
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: 1,
    });
    const topContent = topContentRaw;
    let bestPost = null;
    if (topContent[0]?.contentRunId) {
        const run = await prisma.contentGenerationRun.findUnique({ where: { id: topContent[0].contentRunId }, select: { channel: true, inputBrief: true } });
        if (run) {
            const brief = run.inputBrief;
            bestPost = { channel: run.channel, preview: (brief?.topic ?? 'Content').slice(0, 100), clicks: topContent[0]._count.id };
        }
    }
    let recommendation = 'Keep posting consistently and focus on your best-performing platform.';
    if (totalClicks >= 20 && env_js_1.env.GROQ_API_KEY) {
        try {
            const body = JSON.stringify({ model: 'llama-3.1-8b-instant', messages: [{ role: 'user', content: `Affiliate has ${cvr}% CVR across ${totalClicks} clicks. Platforms: ${JSON.stringify(byPlatform)}. Platform avg CVR: ${platformAvgCvr}%. One sentence: what to focus on next week?` }], max_tokens: 80 });
            recommendation = await new Promise((resolve, reject) => {
                const r = https_1.default.request({ hostname: 'api.groq.com', path: '/openai/v1/chat/completions', method: 'POST', headers: { 'Authorization': `Bearer ${env_js_1.env.GROQ_API_KEY}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, res2 => {
                    let d = '';
                    res2.on('data', (c) => { d += c; });
                    res2.on('end', () => { try {
                        resolve(JSON.parse(d).choices[0].message.content?.trim() ?? '');
                    }
                    catch {
                        reject(new Error('parse'));
                    } });
                });
                r.on('error', reject);
                r.write(body);
                r.end();
            });
        }
        catch { /* keep default */ }
    }
    res.json({ clicks: { total: totalClicks, byPlatform }, conversions: { total: convCount }, cvr, platformAvgCvr, bestPost, recommendation });
}
exports.default = router;
//# sourceMappingURL=dashboardRoutes.js.map