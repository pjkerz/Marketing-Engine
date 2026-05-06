"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildBusinessContext = buildBusinessContext;
const prisma_1 = require("../../lib/prisma");
async function buildBusinessContext(businessId) {
    const prisma = (0, prisma_1.getPrisma)();
    const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const results = await Promise.allSettled([
        /* 0 */ prisma.business.findUnique({ where: { id: businessId }, include: { config: true } }),
        /* 1 */ prisma.funnelEvent.count({ where: { businessId, eventType: 'click', timestamp: { gte: since30 } } }),
        /* 2 */ prisma.conversionEvent.count({ where: { businessId, occurredAt: { gte: since30 } } }),
        /* 3 */ prisma.funnelEvent.groupBy({ by: ['channel'], where: { businessId, eventType: 'click', timestamp: { gte: since30 } }, _count: { id: true }, orderBy: { _count: { id: 'desc' } }, take: 1 }),
        /* 4 */ prisma.contentGenerationRun.count({ where: { businessId, status: 'pending' } }),
        /* 5 */ prisma.emailSubscriber.count({ where: { businessId, status: 'active' } }),
        /* 6 */ prisma.emailCampaign.findFirst({ where: { businessId, status: 'sent' }, orderBy: { sentAt: 'desc' }, select: { totalOpened: true, totalSent: true } }),
        /* 7 */ prisma.seoAudit.findFirst({ where: { businessId, status: 'completed' }, orderBy: { createdAt: 'desc' }, select: { gapKeywords: true } }),
        /* 8 */ prisma.keywordTarget.findMany({ where: { businessId, status: 'targeted' }, orderBy: { opportunityScore: 'desc' }, take: 5, select: { keyword: true } }),
        /* 9 */ prisma.llmPresenceAudit.findFirst({ where: { businessId, status: 'completed' }, orderBy: { createdAt: 'desc' }, select: { summary: true } }),
        /* 10 */ prisma.optimisationInsight.findMany({ where: { businessId, status: 'new', impact: 'high' }, take: 5, select: { finding: true } }),
        /* 11 */ prisma.funnelEvent.groupBy({ by: ['funnelStage'], where: { businessId, timestamp: { gte: since30 } }, _count: { id: true } }),
    ]);
    const biz = results[0].status === 'fulfilled' ? results[0].value : null;
    const clicks = results[1].status === 'fulfilled' ? results[1].value : 0;
    const convs = results[2].status === 'fulfilled' ? results[2].value : 0;
    const channels = results[3].status === 'fulfilled' ? results[3].value : [];
    const pending = results[4].status === 'fulfilled' ? results[4].value : 0;
    const emailCount = results[5].status === 'fulfilled' ? results[5].value : 0;
    const campaign = results[6].status === 'fulfilled' ? results[6].value : null;
    const seoAudit = results[7].status === 'fulfilled' ? results[7].value : null;
    const kwTargets = results[8].status === 'fulfilled' ? results[8].value : [];
    const llmAudit = results[9].status === 'fulfilled' ? results[9].value : null;
    const insights = results[10].status === 'fulfilled' ? results[10].value : [];
    const stageCounts = results[11].status === 'fulfilled' ? results[11].value : [];
    const funnelCvr = clicks > 0 ? +(convs / clicks * 100).toFixed(2) : 0;
    const topChannel = channels[0]?.channel ?? 'unknown';
    const stageMap = new Map(stageCounts.map((s) => [s.funnelStage, s._count.id]));
    const stageOrder = ['awareness', 'interest', 'consideration'];
    let weakest = 'consideration';
    let maxDropoff = 0;
    for (let i = 0; i < stageOrder.length - 1; i++) {
        const cur = stageMap.get(stageOrder[i]) ?? 0;
        const next = stageMap.get(stageOrder[i + 1]) ?? 0;
        const dropoff = cur > 0 ? (cur - next) / cur : 0;
        if (dropoff > maxDropoff) {
            maxDropoff = dropoff;
            weakest = stageOrder[i + 1];
        }
    }
    const totalSent = campaign?.totalSent ?? 0;
    const totalOpened = campaign?.totalOpened ?? 0;
    const lastCampaignOpenRate = totalSent > 0 ? +(totalOpened / totalSent * 100).toFixed(1) : 0;
    const gapKws = seoAudit?.gapKeywords;
    const topKeywordGaps = gapKws?.slice(0, 5).map(g => g.keyword) ?? [];
    const topOpportunityKeywords = kwTargets.map(k => k.keyword);
    const llmSummary = llmAudit?.summary;
    const brandMentionRate = llmSummary?.overallMentionRate ?? 0;
    const topLlmGapQueries = llmSummary?.topGapQueries ?? [];
    return {
        businessId,
        businessName: biz?.name ?? 'Unknown',
        businessType: biz?.type ?? 'saas',
        funnelCvr, topChannel, weakestFunnelStage: weakest,
        pendingApprovals: pending,
        bestPerformingFormat: 'unknown',
        emailListSize: emailCount,
        lastCampaignOpenRate,
        topKeywordGaps, topOpportunityKeywords,
        brandMentionRate, topLlmGapQueries,
        pendingHighInsights: insights.length,
        pendingInsightSummaries: insights.map(i => i.finding),
    };
}
//# sourceMappingURL=contextBuilder.js.map