"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = require("../../lib/prisma");
const errorHandler_1 = require("../../middleware/errorHandler");
const auth_1 = require("../../middleware/auth");
const rbac_1 = require("../../middleware/rbac");
const rateLimit_1 = require("../../middleware/rateLimit");
const seoContentGenerator_1 = require("./seoContentGenerator");
const seoAuditWorker_1 = require("../../queues/workers/seoAuditWorker");
const router = (0, express_1.Router)();
// POST /v2/api/admin/seo/audit — start new audit
router.post('/audit', auth_1.requireAuth, (0, rbac_1.requireRole)('admin'), rateLimit_1.adminLimit, async (req, res, next) => {
    try {
        const prisma = (0, prisma_1.getPrisma)();
        const { clientUrl, competitorUrl } = req.body;
        if (!clientUrl || !competitorUrl)
            throw new errorHandler_1.AppError('NOT_FOUND', 'clientUrl and competitorUrl required.', 422);
        const audit = await prisma.seoAudit.create({
            data: { businessId: req.actor.businessId, clientUrl, competitorUrl, status: 'pending' },
        });
        if (!seoAuditWorker_1.seoAuditQueue)
            throw new errorHandler_1.AppError('NOT_FOUND', 'SEO audit worker not started.', 503);
        await seoAuditWorker_1.seoAuditQueue.add('seo-audit', {
            auditId: audit.id,
            clientUrl,
            competitorUrl,
            businessId: req.actor.businessId,
        });
        res.status(202).json({ auditId: audit.id, message: 'Audit queued — poll /seo/audit/:id for results' });
    }
    catch (err) {
        next(err);
    }
});
// GET /v2/api/admin/seo/audits
router.get('/audits', auth_1.requireAuth, (0, rbac_1.requireRole)('admin'), rateLimit_1.adminLimit, async (req, res, next) => {
    try {
        const prisma = (0, prisma_1.getPrisma)();
        const audits = await prisma.seoAudit.findMany({
            where: { businessId: req.actor.businessId },
            orderBy: { createdAt: 'desc' },
            take: 20,
            select: { id: true, clientUrl: true, competitorUrl: true, status: true, completedAt: true, createdAt: true },
        });
        res.json({ audits });
    }
    catch (err) {
        next(err);
    }
});
// GET /v2/api/admin/seo/audit/:id
router.get('/audit/:id', auth_1.requireAuth, (0, rbac_1.requireRole)('admin'), rateLimit_1.adminLimit, async (req, res, next) => {
    try {
        const prisma = (0, prisma_1.getPrisma)();
        const audit = await prisma.seoAudit.findFirst({
            where: { id: req.params['id'], businessId: req.actor.businessId },
        });
        if (!audit)
            throw new errorHandler_1.AppError('NOT_FOUND', 'Audit not found.', 404);
        res.json({ audit });
    }
    catch (err) {
        next(err);
    }
});
// POST /v2/api/admin/seo/generate
router.post('/generate', auth_1.requireAuth, (0, rbac_1.requireRole)('admin'), rateLimit_1.adminLimit, async (req, res, next) => {
    try {
        const { keyword, type = 'blog-post', auditId } = req.body;
        if (!keyword)
            throw new errorHandler_1.AppError('NOT_FOUND', 'keyword required.', 422);
        const validTypes = ['blog-post', 'meta', 'page-copy', 'faq'];
        if (!validTypes.includes(type))
            throw new errorHandler_1.AppError('NOT_FOUND', `type must be one of: ${validTypes.join(', ')}`, 422);
        const content = await (0, seoContentGenerator_1.generateSeoContent)(keyword, req.actor.businessId, type, auditId);
        res.status(201).json({ content });
    }
    catch (err) {
        next(err);
    }
});
// GET /v2/api/admin/seo/content
router.get('/content', auth_1.requireAuth, (0, rbac_1.requireRole)('admin'), rateLimit_1.adminLimit, async (req, res, next) => {
    try {
        const prisma = (0, prisma_1.getPrisma)();
        const { status } = req.query;
        const content = await prisma.seoContent.findMany({
            where: { businessId: req.actor.businessId, ...(status ? { status } : {}) },
            orderBy: { createdAt: 'desc' },
            take: 50,
        });
        res.json({ content });
    }
    catch (err) {
        next(err);
    }
});
// GET /v2/api/admin/seo/content/:id/preview
router.get('/content/:id/preview', auth_1.requireAuth, (0, rbac_1.requireRole)('admin'), rateLimit_1.adminLimit, async (req, res, next) => {
    try {
        const prisma = (0, prisma_1.getPrisma)();
        const content = await prisma.seoContent.findFirst({
            where: { id: req.params['id'], businessId: req.actor.businessId },
        });
        if (!content)
            throw new errorHandler_1.AppError('NOT_FOUND', 'Content not found.', 404);
        res.json({ content });
    }
    catch (err) {
        next(err);
    }
});
// POST /v2/api/admin/seo/content/:id/approve
router.post('/content/:id/approve', auth_1.requireAuth, (0, rbac_1.requireRole)('admin'), rateLimit_1.adminLimit, async (req, res, next) => {
    try {
        const prisma = (0, prisma_1.getPrisma)();
        const content = await prisma.seoContent.findFirst({
            where: { id: req.params['id'], businessId: req.actor.businessId },
        });
        if (!content)
            throw new errorHandler_1.AppError('NOT_FOUND', 'Content not found.', 404);
        const updated = await prisma.seoContent.update({
            where: { id: content.id },
            data: { status: 'approved' },
        });
        // Fire CMS webhook if configured
        const config = await prisma.businessConfig.findUnique({ where: { businessId: req.actor.businessId } });
        if (config?.cmsWebhookUrl) {
            fetch(config.cmsWebhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    keyword: content.keyword,
                    title: content.title,
                    metaTitle: content.metaTitle,
                    metaDescription: content.metaDescription,
                    html: content.html,
                    businessId: req.actor.businessId,
                    contentId: content.id,
                }),
            }).catch(() => { });
        }
        res.json({ content: updated });
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
//# sourceMappingURL=seoRoutes.js.map