"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = require("../../lib/prisma");
const errorHandler_1 = require("../../middleware/errorHandler");
const auth_1 = require("../../middleware/auth");
const rbac_1 = require("../../middleware/rbac");
const rateLimit_1 = require("../../middleware/rateLimit");
const llmPresenceWorker_1 = require("../../queues/workers/llmPresenceWorker");
const seoContentGenerator_1 = require("../seo/seoContentGenerator");
const router = (0, express_1.Router)();
// POST /v2/api/admin/llm-presence/audit
router.post('/audit', auth_1.requireAuth, (0, rbac_1.requireRole)('admin'), rateLimit_1.adminLimit, async (req, res, next) => {
    try {
        const prisma = (0, prisma_1.getPrisma)();
        const { competitors = [], customQueries = [] } = req.body;
        const audit = await prisma.llmPresenceAudit.create({
            data: {
                businessId: req.actor.businessId,
                competitors,
                queries: customQueries,
                status: 'pending',
            },
        });
        if (!llmPresenceWorker_1.llmPresenceQueue)
            throw new errorHandler_1.AppError('NOT_FOUND', 'LLM presence worker not started.', 503);
        await llmPresenceWorker_1.llmPresenceQueue.add('llm-presence', {
            auditId: audit.id,
            businessId: req.actor.businessId,
        });
        res.status(202).json({ auditId: audit.id, message: 'Audit queued — poll /llm-presence/audit/:id for results' });
    }
    catch (err) {
        next(err);
    }
});
// GET /v2/api/admin/llm-presence/audits
router.get('/audits', auth_1.requireAuth, (0, rbac_1.requireRole)('admin'), rateLimit_1.adminLimit, async (req, res, next) => {
    try {
        const prisma = (0, prisma_1.getPrisma)();
        const audits = await prisma.llmPresenceAudit.findMany({
            where: { businessId: req.actor.businessId },
            orderBy: { createdAt: 'desc' },
            take: 10,
            select: {
                id: true, status: true, competitors: true,
                summary: true, createdAt: true, completedAt: true,
                _count: { select: { results: true } },
            },
        });
        res.json({ audits });
    }
    catch (err) {
        next(err);
    }
});
// GET /v2/api/admin/llm-presence/audit/:id
router.get('/audit/:id', auth_1.requireAuth, (0, rbac_1.requireRole)('admin'), rateLimit_1.adminLimit, async (req, res, next) => {
    try {
        const prisma = (0, prisma_1.getPrisma)();
        const audit = await prisma.llmPresenceAudit.findFirst({
            where: { id: req.params['id'], businessId: req.actor.businessId },
            include: {
                results: {
                    orderBy: [{ query: 'asc' }, { llmName: 'asc' }],
                },
            },
        });
        if (!audit)
            throw new errorHandler_1.AppError('NOT_FOUND', 'Audit not found.', 404);
        res.json({ audit });
    }
    catch (err) {
        next(err);
    }
});
// POST /v2/api/admin/llm-presence/generate-content/:resultId
router.post('/generate-content/:resultId', auth_1.requireAuth, (0, rbac_1.requireRole)('admin'), rateLimit_1.adminLimit, async (req, res, next) => {
    try {
        const prisma = (0, prisma_1.getPrisma)();
        const result = await prisma.llmPresenceResult.findFirst({
            where: { id: req.params['resultId'], businessId: req.actor.businessId },
        });
        if (!result)
            throw new errorHandler_1.AppError('NOT_FOUND', 'Result not found.', 404);
        // Generate blog post targeting the gap query
        const content = await (0, seoContentGenerator_1.generateSeoContent)(result.query, req.actor.businessId, 'blog-post');
        res.status(201).json({ content });
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
//# sourceMappingURL=llmPresenceRoutes.js.map