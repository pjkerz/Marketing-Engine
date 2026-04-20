"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = require("../../lib/prisma");
const errorHandler_1 = require("../../middleware/errorHandler");
const auth_1 = require("../../middleware/auth");
const rbac_1 = require("../../middleware/rbac");
const rateLimit_1 = require("../../middleware/rateLimit");
const googleAdsClient_1 = require("../../integrations/googleAds/googleAdsClient");
const microsoftAdsClient_1 = require("../../integrations/microsoftAds/microsoftAdsClient");
const opportunityScorer_1 = require("./opportunityScorer");
const router = (0, express_1.Router)();
// POST /v2/api/admin/keywords/research
router.post('/research', auth_1.requireAuth, (0, rbac_1.requireRole)('admin'), rateLimit_1.adminLimit, async (req, res, next) => {
    try {
        const prisma = (0, prisma_1.getPrisma)();
        const { seedKeywords } = req.body;
        if (!seedKeywords?.length)
            throw new errorHandler_1.AppError('NOT_FOUND', 'seedKeywords array required.', 422);
        const seeds = seedKeywords.slice(0, 10); // cap at 10 seeds
        // Fetch from both APIs in parallel
        const [googleIdeas, microsoftIdeas] = await Promise.all([
            (0, googleAdsClient_1.getKeywordIdeas)(seeds),
            (0, microsoftAdsClient_1.getKeywordIdeas)(seeds),
        ]);
        const merged = (0, opportunityScorer_1.mergeKeywordIdeas)([googleIdeas, microsoftIdeas]);
        // Score and upsert all keywords
        const businessId = req.actor.businessId;
        let upserted = 0;
        for (const kw of merged) {
            if (!kw.keyword)
                continue;
            const opportunityScore = (0, opportunityScorer_1.scoreKeyword)(kw);
            const intentScore = getIntentScore(kw.keyword);
            await prisma.keywordTarget.upsert({
                where: { businessId_keyword: { businessId, keyword: kw.keyword.toLowerCase() } },
                create: {
                    businessId,
                    keyword: kw.keyword.toLowerCase(),
                    source: kw.source,
                    monthlyVolume: kw.monthlyVolume,
                    cpcEstimate: kw.cpcEstimate,
                    competition: kw.competition,
                    trend: kw.trend ?? null,
                    intentScore,
                    opportunityScore,
                    matchType: 'broad',
                    status: 'research',
                },
                update: {
                    monthlyVolume: kw.monthlyVolume,
                    cpcEstimate: kw.cpcEstimate,
                    competition: kw.competition,
                    trend: kw.trend ?? undefined,
                    intentScore,
                    opportunityScore,
                },
            });
            upserted++;
        }
        // Return top 50 by opportunity score
        const top = await prisma.keywordTarget.findMany({
            where: { businessId },
            orderBy: { opportunityScore: 'desc' },
            take: 50,
        });
        res.json({ keywords: top, total: upserted, message: `Researched ${upserted} keywords` });
    }
    catch (err) {
        next(err);
    }
});
// GET /v2/api/admin/keywords
router.get('/', auth_1.requireAuth, (0, rbac_1.requireRole)('admin'), rateLimit_1.adminLimit, async (req, res, next) => {
    try {
        const prisma = (0, prisma_1.getPrisma)();
        const { status, competition, minVolume, sort = 'opportunityScore' } = req.query;
        const where = { businessId: req.actor.businessId };
        if (status)
            where['status'] = status;
        if (competition)
            where['competition'] = competition;
        if (minVolume)
            where['monthlyVolume'] = { gte: parseInt(minVolume) };
        const validSorts = ['opportunityScore', 'monthlyVolume', 'cpcEstimate', 'addedAt'];
        const orderBy = validSorts.includes(sort) ? { [sort]: 'desc' } : { opportunityScore: 'desc' };
        const keywords = await prisma.keywordTarget.findMany({ where, orderBy, take: 200 });
        res.json({ keywords, total: keywords.length });
    }
    catch (err) {
        next(err);
    }
});
// PATCH /v2/api/admin/keywords/:id
router.patch('/:id', auth_1.requireAuth, (0, rbac_1.requireRole)('admin'), rateLimit_1.adminLimit, async (req, res, next) => {
    try {
        const prisma = (0, prisma_1.getPrisma)();
        const kw = await prisma.keywordTarget.findFirst({
            where: { id: req.params['id'], businessId: req.actor.businessId },
        });
        if (!kw)
            throw new errorHandler_1.AppError('NOT_FOUND', 'Keyword not found.', 404);
        const { status, matchType, notes } = req.body;
        const updated = await prisma.keywordTarget.update({
            where: { id: kw.id },
            data: { ...(status ? { status } : {}), ...(matchType ? { matchType } : {}) },
        });
        res.json({ keyword: updated });
    }
    catch (err) {
        next(err);
    }
});
// POST /v2/api/admin/keywords/sync-content
router.post('/sync-content', auth_1.requireAuth, (0, rbac_1.requireRole)('admin'), rateLimit_1.adminLimit, async (req, res, next) => {
    try {
        const prisma = (0, prisma_1.getPrisma)();
        const businessId = req.actor.businessId;
        const topKeywords = await prisma.keywordTarget.findMany({
            where: { businessId, status: 'targeted' },
            orderBy: { opportunityScore: 'desc' },
            take: 10,
        });
        if (!topKeywords.length)
            throw new errorHandler_1.AppError('NOT_FOUND', 'No targeted keywords found. Mark keywords as targeted first.', 422);
        const contentRunIds = [];
        for (const kw of topKeywords) {
            const defaultAffiliate = await prisma.affiliate.findFirst({ where: { businessId } });
            if (!defaultAffiliate)
                continue;
            const run = await prisma.contentGenerationRun.create({
                data: {
                    businessId,
                    affiliateId: defaultAffiliate.id,
                    profileId: defaultAffiliate.id,
                    channel: 'blog',
                    status: 'pending',
                    inputBrief: { topic: kw.keyword, keyword: kw.keyword, source: 'keyword-intelligence' },
                },
            });
            contentRunIds.push(run.id);
        }
        res.json({ synced: contentRunIds.length, contentRunIds });
    }
    catch (err) {
        next(err);
    }
});
// GET /v2/api/admin/keywords/report
router.get('/report', auth_1.requireAuth, (0, rbac_1.requireRole)('admin'), rateLimit_1.adminLimit, async (req, res, next) => {
    try {
        const prisma = (0, prisma_1.getPrisma)();
        const businessId = req.actor.businessId;
        const keywords = await prisma.keywordTarget.findMany({ where: { businessId }, orderBy: { opportunityScore: 'desc' } });
        const totalVolume = keywords.reduce((n, k) => n + (k.monthlyVolume ?? 0), 0);
        const avgCpc = keywords.length > 0 ? keywords.reduce((n, k) => n + (k.cpcEstimate ?? 0), 0) / keywords.length : 0;
        const byStatus = keywords.reduce((acc, k) => { acc[k.status] = (acc[k.status] ?? 0) + 1; return acc; }, {});
        const byCompetition = keywords.reduce((acc, k) => { const c = k.competition ?? 'unknown'; acc[c] = (acc[c] ?? 0) + 1; return acc; }, {});
        res.json({
            summary: { total: keywords.length, totalVolume, avgCpc: Math.round(avgCpc * 100) / 100, byStatus, byCompetition },
            topOpportunities: keywords.slice(0, 20),
            highIntent: keywords.filter(k => (k.intentScore ?? 0) >= 0.7).slice(0, 10),
            lowCompetition: keywords.filter(k => k.competition === 'low').slice(0, 10),
        });
    }
    catch (err) {
        next(err);
    }
});
// GET /v2/api/admin/keywords/export.csv
router.get('/export.csv', auth_1.requireAuth, (0, rbac_1.requireRole)('admin'), async (req, res, next) => {
    try {
        const prisma = (0, prisma_1.getPrisma)();
        const keywords = await prisma.keywordTarget.findMany({
            where: { businessId: req.actor.businessId },
            orderBy: { opportunityScore: 'desc' },
        });
        const rows = ['Keyword,Monthly Volume,CPC Estimate,Competition,Opportunity Score,Intent Score,Status,Match Type'];
        for (const k of keywords) {
            rows.push([k.keyword, k.monthlyVolume ?? '', k.cpcEstimate ?? '', k.competition ?? '', k.opportunityScore ?? '', k.intentScore ?? '', k.status, k.matchType ?? 'broad'].join(','));
        }
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="keywords.csv"');
        res.send(rows.join('\n'));
    }
    catch (err) {
        next(err);
    }
});
function getIntentScore(keyword) {
    const kw = keyword.toLowerCase();
    if (/\b(buy|purchase|price|cost|hire|pricing|plans)\b/.test(kw))
        return 0.9;
    if (/\b(best|top|review|compare|vs|versus|alternative)\b/.test(kw))
        return 0.7;
    if (/\b(how to|what is|what are|guide|tutorial|tips)\b/.test(kw))
        return 0.4;
    return 0.5;
}
exports.default = router;
//# sourceMappingURL=keywordRoutes.js.map