"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = require("../../lib/prisma");
const auth_1 = require("../../middleware/auth");
const contextBuilder_1 = require("./contextBuilder");
const recommendationEngine_1 = require("./recommendationEngine");
const autoExecutor_1 = require("./autoExecutor");
const router = (0, express_1.Router)();
// POST /v2/api/admin/intelligence/generate
router.post('/generate', auth_1.requireAuth, async (req, res) => {
    const prisma = (0, prisma_1.getPrisma)();
    const { businessId } = req.actor;
    const force = req.query.force === 'true';
    if (!force) {
        const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);
        const recent = await prisma.crossChannelRecommendation.findFirst({ where: { businessId, status: 'new', createdAt: { gte: sixHoursAgo } } });
        if (recent) {
            const all = await prisma.crossChannelRecommendation.findMany({ where: { businessId, status: 'new' }, orderBy: { createdAt: 'desc' }, take: 5 });
            return res.json({ recommendations: all, cached: true });
        }
    }
    const context = await (0, contextBuilder_1.buildBusinessContext)(businessId);
    const recs = await (0, recommendationEngine_1.generateRecommendations)(context, businessId);
    res.json({ recommendations: recs, cached: false });
});
// GET /v2/api/admin/intelligence/recommendations
router.get('/recommendations', auth_1.requireAuth, async (req, res) => {
    const prisma = (0, prisma_1.getPrisma)();
    const { businessId } = req.actor;
    const status = typeof req.query.status === 'string' ? req.query.status : 'new';
    const recs = await prisma.crossChannelRecommendation.findMany({
        where: { businessId, status },
        orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }],
        take: 10,
    });
    res.json({ recommendations: recs });
});
// POST /v2/api/admin/intelligence/recommendations/:id/execute
router.post('/recommendations/:id/execute', auth_1.requireAuth, async (req, res) => {
    const { businessId } = req.actor;
    try {
        const results = await (0, autoExecutor_1.executeRecommendation)(req.params['id'], businessId);
        res.json({ results });
    }
    catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : 'Failed' });
    }
});
// POST /v2/api/admin/intelligence/recommendations/:id/dismiss
router.post('/recommendations/:id/dismiss', auth_1.requireAuth, async (req, res) => {
    const prisma = (0, prisma_1.getPrisma)();
    const { businessId } = req.actor;
    const id = req.params['id'];
    const rec = await prisma.crossChannelRecommendation.findFirst({ where: { id, businessId } });
    if (!rec)
        return res.status(404).json({ error: 'Not found' });
    await prisma.crossChannelRecommendation.update({ where: { id }, data: { status: 'dismissed' } });
    res.json({ ok: true });
});
// GET /v2/api/admin/intelligence/feed?limit=20
router.get('/feed', auth_1.requireAuth, async (req, res) => {
    const prisma = (0, prisma_1.getPrisma)();
    const { businessId } = req.actor;
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);
    const events = await prisma.intelligenceFeedEvent.findMany({
        where: { businessId },
        orderBy: [{ read: 'asc' }, { createdAt: 'desc' }],
        take: limit,
    });
    res.json({ events });
});
// POST /v2/api/admin/intelligence/feed/:id/read
router.post('/feed/:id/read', auth_1.requireAuth, async (req, res) => {
    const prisma = (0, prisma_1.getPrisma)();
    const { businessId } = req.actor;
    await prisma.intelligenceFeedEvent.updateMany({ where: { id: req.params['id'], businessId }, data: { read: true } });
    res.json({ ok: true });
});
// POST /v2/api/admin/intelligence/feed/read-all
router.post('/feed/read-all', auth_1.requireAuth, async (req, res) => {
    const prisma = (0, prisma_1.getPrisma)();
    const { businessId } = req.actor;
    await prisma.intelligenceFeedEvent.updateMany({ where: { businessId, read: false }, data: { read: true } });
    res.json({ ok: true });
});
// GET /v2/api/admin/intelligence/context
router.get('/context', auth_1.requireAuth, async (req, res) => {
    const { businessId } = req.actor;
    const context = await (0, contextBuilder_1.buildBusinessContext)(businessId);
    res.json({ context });
});
exports.default = router;
//# sourceMappingURL=intelligenceRoutes.js.map