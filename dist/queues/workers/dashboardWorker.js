"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.dashboardQueue = void 0;
exports.computeDashboardData = computeDashboardData;
exports.detectAnomalies = detectAnomalies;
exports.startDashboardWorker = startDashboardWorker;
exports.stopDashboardWorker = stopDashboardWorker;
const bullmq_1 = require("bullmq");
const redis_js_1 = require("../../lib/redis.js");
const prisma_js_1 = require("../../lib/prisma.js");
const QUEUE_NAME = 'v2-dashboard';
let worker = null;
exports.dashboardQueue = null;
async function computeDashboardData(businessId, days = 30) {
    const prisma = (0, prisma_js_1.getPrisma)();
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const prevSince = new Date(Date.now() - 2 * days * 24 * 60 * 60 * 1000);
    const [funnelCounts, prevFunnelCounts, channelClicks, channelConvs, affiliateClicks, affiliateConvs, contentClicks, insights, activeTests] = await Promise.all([
        prisma.funnelEvent.groupBy({ by: ['funnelStage'], where: { businessId, timestamp: { gte: since } }, _count: { id: true } }),
        prisma.funnelEvent.groupBy({ by: ['funnelStage'], where: { businessId, timestamp: { gte: prevSince, lt: since } }, _count: { id: true } }),
        prisma.funnelEvent.groupBy({ by: ['channel'], where: { businessId, timestamp: { gte: since }, eventType: 'click' }, _count: { id: true } }),
        prisma.conversionEvent.groupBy({ by: ['channel'], where: { businessId, occurredAt: { gte: since } }, _count: { id: true } }),
        prisma.funnelEvent.groupBy({ by: ['affiliateCode'], where: { businessId, timestamp: { gte: since }, eventType: 'click', affiliateCode: { not: null } }, _count: { id: true } }),
        prisma.conversionEvent.groupBy({ by: ['affiliateCode'], where: { businessId, occurredAt: { gte: since }, affiliateCode: { not: null } }, _count: { id: true } }),
        prisma.funnelEvent.groupBy({ by: ['contentRunId'], where: { businessId, timestamp: { gte: since }, eventType: 'click', contentRunId: { not: null } }, _count: { id: true } }),
        prisma.optimisationInsight.findMany({ where: { businessId, status: 'new' }, orderBy: { impact: 'asc' }, take: 5 }),
        prisma.abTest.findMany({ where: { businessId, status: 'running' }, take: 5 }),
    ]);
    const stageOrder = ['awareness', 'interest', 'consideration', 'conversion'];
    const stageMap = new Map(funnelCounts.map(f => [f.funnelStage, f._count.id]));
    const prevMap = new Map(prevFunnelCounts.map(f => [f.funnelStage, f._count.id]));
    const funnelSummary = {};
    for (const stage of stageOrder) {
        const cur = stageMap.get(stage) ?? 0;
        const prev = prevMap.get(stage) ?? 0;
        funnelSummary[stage] = { count: cur, change: prev > 0 ? Math.round(((cur - prev) / prev) * 100) : 0 };
    }
    const awarenessCount = funnelSummary['awareness']?.count ?? 1;
    const conversionCount = funnelSummary['conversion']?.count ?? 0;
    const overallCvr = awarenessCount > 0 ? +(conversionCount / awarenessCount * 100).toFixed(2) : 0;
    const convByChannel = new Map(channelConvs.map(c => [c.channel, c._count.id]));
    const channelPerformance = channelClicks
        .filter(c => c.channel && c._count.id >= 5)
        .map(c => ({
        channel: c.channel,
        clicks: c._count.id,
        conversions: convByChannel.get(c.channel) ?? 0,
        cvr: c._count.id > 0 ? +((convByChannel.get(c.channel) ?? 0) / c._count.id * 100).toFixed(2) : 0,
    }))
        .sort((a, b) => b.cvr - a.cvr);
    const affConvMap = new Map(affiliateConvs.map(a => [a.affiliateCode, a._count.id]));
    const affCodes = affiliateClicks.filter(a => a.affiliateCode).map(a => a.affiliateCode);
    const affProfiles = affCodes.length > 0
        ? await prisma.affiliate.findMany({ where: { businessId, code: { in: affCodes } }, select: { code: true, name: true } })
        : [];
    const affNameMap = new Map(affProfiles.map(a => [a.code, a.name]));
    const affiliateLeaderboard = affiliateClicks
        .filter(a => a.affiliateCode)
        .map(a => {
        const code = a.affiliateCode;
        const clicks = a._count.id;
        const convs = affConvMap.get(code) ?? 0;
        return { affiliateCode: code, name: affNameMap.get(code) ?? code, clicks, conversions: convs, cvr: clicks > 0 ? +(convs / clicks * 100).toFixed(2) : 0 };
    })
        .sort((a, b) => b.conversions - a.conversions)
        .slice(0, 10);
    const topContentRunIds = contentClicks
        .filter(c => c.contentRunId && c._count.id >= 10)
        .sort((a, b) => b._count.id - a._count.id)
        .slice(0, 5)
        .map(c => c.contentRunId);
    const runs = topContentRunIds.length > 0
        ? await prisma.contentGenerationRun.findMany({ where: { id: { in: topContentRunIds } }, select: { id: true, channel: true, inputBrief: true } })
        : [];
    const runMap = new Map(runs.map(r => [r.id, r]));
    const topContent = topContentRunIds.map(id => {
        const run = runMap.get(id);
        const brief = run?.inputBrief;
        const clickEntry = contentClicks.find(c => c.contentRunId === id);
        return { contentRunId: id, channel: run?.channel ?? 'unknown', preview: (brief?.topic ?? brief?.keyword ?? 'Content').slice(0, 100), clicks: (clickEntry?._count.id ?? 0) };
    });
    return { funnelSummary, overallCvr, channelPerformance, affiliateLeaderboard, topContent, insights, activeTests, generatedAt: new Date().toISOString(), days };
}
async function detectAnomalies(businessId, context) {
    const prisma = (0, prisma_js_1.getPrisma)();
    const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);
    const events = [];
    const [top, second] = context.channelPerformance;
    if (top && second && top.cvr > second.cvr * 2 && top.clicks >= 50) {
        events.push({ businessId, eventType: 'opportunity', channel: top.channel, title: `${top.channel} converting at ${top.cvr}% CVR — 2x other channels`, detail: `${top.channel} outperforms ${second.channel} (${second.cvr}% CVR). Shift more content here.`, actionLabel: 'View breakdown', actionEndpoint: '/v2/api/admin/dashboard/channel-performance' });
    }
    const topAff = context.affiliateLeaderboard[0];
    if (topAff && topAff.cvr > 5 && topAff.clicks >= 50) {
        events.push({ businessId, eventType: 'milestone', channel: 'affiliate', title: `${topAff.name} achieving ${topAff.cvr}% CVR`, detail: `${topAff.name} converted ${topAff.conversions} of ${topAff.clicks} clicks.` });
    }
    const highInsights = context.insights.filter((i) => i.impact === 'high');
    if (highInsights.length > 0) {
        events.push({ businessId, eventType: 'alert', channel: 'optimisation', title: `${highInsights.length} high-impact insight${highInsights.length > 1 ? 's' : ''} available`, detail: highInsights[0].finding, actionLabel: 'View insights', actionEndpoint: '/v2/api/admin/optimisation/insights' });
    }
    for (const evt of events) {
        const existing = await prisma.intelligenceFeedEvent.findFirst({ where: { businessId, eventType: evt.eventType, channel: evt.channel, createdAt: { gte: sixHoursAgo } } });
        if (!existing)
            await prisma.intelligenceFeedEvent.create({ data: evt });
    }
}
async function runDashboardSnapshot() {
    const prisma = (0, prisma_js_1.getPrisma)();
    const businesses = await prisma.business.findMany({ where: { active: true } });
    for (const biz of businesses) {
        try {
            const data = await computeDashboardData(biz.id);
            const snapshotDate = new Date();
            snapshotDate.setMinutes(0, 0, 0);
            await prisma.dashboardSnapshot.upsert({ where: { businessId_snapshotDate: { businessId: biz.id, snapshotDate } }, create: { businessId: biz.id, snapshotDate, data: data }, update: { data: data } });
            await detectAnomalies(biz.id, data);
            console.log(`[dashboardWorker] Snapshot saved for ${biz.slug}`);
        }
        catch (err) {
            console.error(`[dashboardWorker] Failed for ${biz.id}:`, err);
        }
    }
}
function startDashboardWorker() {
    const connection = (0, redis_js_1.getBullRedis)();
    exports.dashboardQueue = new bullmq_1.Queue(QUEUE_NAME, { connection });
    exports.dashboardQueue.add('snapshot', {}, { repeat: { every: 60 * 60 * 1000 }, jobId: 'dashboard-snapshot-repeat' });
    worker = new bullmq_1.Worker(QUEUE_NAME, async (_job) => { await runDashboardSnapshot(); }, { connection, concurrency: 1 });
    worker.on('failed', (job, err) => { console.error(`[dashboardWorker] Job ${job?.id} failed:`, err.message); });
    console.log('[dashboardWorker] Started');
}
function stopDashboardWorker() {
    worker?.close();
    exports.dashboardQueue?.close();
}
//# sourceMappingURL=dashboardWorker.js.map