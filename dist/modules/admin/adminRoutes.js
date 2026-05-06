"use strict";
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
const prisma_1 = require("../../lib/prisma");
const errorHandler_1 = require("../../middleware/errorHandler");
const auth_1 = require("../../middleware/auth");
const rbac_1 = require("../../middleware/rbac");
const rateLimit_1 = require("../../middleware/rateLimit");
const profileRoutes_1 = require("../profile/profileRoutes");
const logger_1 = require("../../lib/logger");
const makeWebhook_1 = require("../../lib/makeWebhook");
const env_1 = require("../../config/env");
const router = (0, express_1.Router)();
async function findAffiliateScoped(prisma, code, businessId) {
    const affiliate = await prisma.affiliate.findFirst({ where: { code, businessId } });
    if (!affiliate)
        throw new errorHandler_1.AppError('NOT_FOUND', 'Affiliate not found.', 404);
    return affiliate;
}
// All admin routes require auth + admin role
router.use(auth_1.requireAuth, (0, rbac_1.requireRole)('admin'), rateLimit_1.adminLimit);
// GET /v2/api/admin/affiliates
router.get('/affiliates', async (req, res, next) => {
    try {
        const prisma = (0, prisma_1.getPrisma)();
        const affiliates = await prisma.affiliate.findMany({
            where: { businessId: req.actor.businessId },
            include: {
                profile: { orderBy: { version: 'desc' }, take: 1 },
                _count: { select: { generationRuns: true } },
            },
            orderBy: { createdAt: 'desc' },
        });
        await prisma.auditLog.create({
            data: { actorType: 'admin', actorId: req.requestId, action: 'admin_viewed', entityType: 'Affiliate', entityId: 'all' },
        });
        res.json({ affiliates });
    }
    catch (err) {
        next(err);
    }
});
// POST /v2/api/admin/affiliates
router.post('/affiliates', async (req, res, next) => {
    try {
        const body = req.body;
        if (!body.code || !body.name || !body.email) {
            throw new errorHandler_1.AppError('NOT_FOUND', 'code, name, and email are required.', 422);
        }
        const prisma = (0, prisma_1.getPrisma)();
        const existing = await prisma.affiliate.findUnique({ where: { code: body.code } });
        if (existing)
            throw new errorHandler_1.AppError('PROFILE_SAVE_CONFLICT', 'Affiliate code already exists.', 409);
        // Note: code is globally unique so no businessId filter needed here
        const businessId = req.actor.businessId;
        const affiliate = await prisma.affiliate.create({
            data: { businessId, code: body.code, name: body.name, email: body.email, password: body.password || null },
        });
        // Create initial profile
        await prisma.affiliateProfile.create({
            data: { affiliateId: affiliate.id, source: 'manual', status: 'active', version: 1 },
        });
        const onboardingToken = (0, auth_1.issueOnboardingToken)(body.code, businessId);
        const onboardingLink = `${process.env.APP_URL || 'https://alphanoetic.me'}/v2/connect?token=${onboardingToken}`;
        await prisma.auditLog.create({
            data: {
                actorType: 'admin',
                actorId: req.requestId,
                action: 'affiliate_created',
                entityType: 'Affiliate',
                entityId: affiliate.id,
                changes: { code: body.code, name: body.name },
            },
        });
        logger_1.logger.info({ module: 'adminRoutes', action: 'affiliateCreated', affiliateCode: body.code }, 'Affiliate created');
        res.status(201).json({ affiliate, onboardingLink });
    }
    catch (err) {
        next(err);
    }
});
// GET /v2/api/admin/affiliates/:code/onboarding-link
router.get('/affiliates/:code/onboarding-link', async (req, res, next) => {
    try {
        const prisma = (0, prisma_1.getPrisma)();
        const affiliate = await findAffiliateScoped(prisma, req.params["code"], req.actor.businessId);
        const config = await prisma.businessConfig.findUnique({ where: { businessId: req.actor.businessId }, select: { landingPageUrl: true } });
        const appUrl = config?.landingPageUrl ?? env_1.env.APP_URL;
        const token = (0, auth_1.issueOnboardingToken)(affiliate.code, affiliate.businessId);
        const link = `${appUrl}/v2/connect?token=${token}`;
        res.json({ code: affiliate.code, name: affiliate.name, link });
    }
    catch (err) {
        next(err);
    }
});
// GET /v2/api/admin/affiliates/:code/profile
router.get('/affiliates/:code/profile', async (req, res, next) => {
    try {
        const prisma = (0, prisma_1.getPrisma)();
        const affiliate = await findAffiliateScoped(prisma, req.params["code"], req.actor.businessId);
        const profiles = await prisma.affiliateProfile.findMany({
            where: { affiliateId: affiliate.id },
            orderBy: { version: 'desc' },
        });
        await prisma.auditLog.create({
            data: { actorType: 'admin', actorId: req.requestId, action: 'admin_viewed', entityType: 'AffiliateProfile', entityId: affiliate.id },
        });
        res.json({ affiliate, profiles });
    }
    catch (err) {
        next(err);
    }
});
// GET /v2/api/admin/affiliates/:code/resume
router.get('/affiliates/:code/resume', async (req, res, next) => {
    try {
        const prisma = (0, prisma_1.getPrisma)();
        const affiliate = await findAffiliateScoped(prisma, req.params["code"], req.actor.businessId);
        const asset = await prisma.profileAsset.findFirst({
            where: { affiliateId: affiliate.id, assetType: 'resume' },
            orderBy: { uploadedAt: 'desc' },
        });
        if (!asset)
            throw new errorHandler_1.AppError('NOT_FOUND', 'No resume found.', 404);
        await prisma.auditLog.create({
            data: { actorType: 'admin', actorId: req.requestId, action: 'admin_viewed', entityType: 'ProfileAsset', entityId: asset.id },
        });
        res.json({ assetId: asset.id, fileName: asset.fileName, zohoFileId: asset.zohoFileId, uploadedAt: asset.uploadedAt });
    }
    catch (err) {
        next(err);
    }
});
// GET /v2/api/admin/affiliates/:code/extractions
router.get('/affiliates/:code/extractions', async (req, res, next) => {
    try {
        const prisma = (0, prisma_1.getPrisma)();
        const affiliate = await findAffiliateScoped(prisma, req.params["code"], req.actor.businessId);
        const extractions = await prisma.profileExtraction.findMany({
            where: { affiliateId: affiliate.id },
            orderBy: { createdAt: 'desc' },
        });
        await prisma.auditLog.create({
            data: { actorType: 'admin', actorId: req.requestId, action: 'admin_viewed', entityType: 'ProfileExtraction', entityId: affiliate.id },
        });
        res.json({ extractions });
    }
    catch (err) {
        next(err);
    }
});
// GET /v2/api/admin/affiliates/:code/content
router.get('/affiliates/:code/content', async (req, res, next) => {
    try {
        const prisma = (0, prisma_1.getPrisma)();
        const affiliate = await findAffiliateScoped(prisma, req.params["code"], req.actor.businessId);
        const runs = await prisma.contentGenerationRun.findMany({
            where: { affiliateId: affiliate.id },
            include: { scores: true },
            orderBy: { createdAt: 'desc' },
        });
        await prisma.auditLog.create({
            data: { actorType: 'admin', actorId: req.requestId, action: 'admin_viewed', entityType: 'ContentGenerationRun', entityId: affiliate.id },
        });
        res.json({ runs });
    }
    catch (err) {
        next(err);
    }
});
// GET /v2/api/admin/affiliates/:code/content/:runId/scores
router.get('/affiliates/:code/content/:runId/scores', async (req, res, next) => {
    try {
        const prisma = (0, prisma_1.getPrisma)();
        const scores = await prisma.contentScore.findMany({ where: { runId: req.params["runId"] } });
        await prisma.auditLog.create({
            data: { actorType: 'admin', actorId: req.requestId, action: 'admin_viewed', entityType: 'ContentScore', entityId: req.params["runId"] },
        });
        res.json({ scores });
    }
    catch (err) {
        next(err);
    }
});
// GET /v2/api/admin/affiliates/:code/media
router.get('/affiliates/:code/media', async (req, res, next) => {
    try {
        const prisma = (0, prisma_1.getPrisma)();
        const affiliate = await findAffiliateScoped(prisma, req.params["code"], req.actor.businessId);
        const assets = await prisma.contentMediaAsset.findMany({ where: { affiliateId: affiliate.id } });
        const jobs = await prisma.mediaGenerationJob.findMany({
            where: { affiliateId: affiliate.id },
            select: { id: true, status: true, prompt: true, aspectRatio: true, createdAt: true, expiresAt: true, selectedCandidateId: true },
        });
        await prisma.auditLog.create({
            data: { actorType: 'admin', actorId: req.requestId, action: 'admin_viewed', entityType: 'ContentMediaAsset', entityId: affiliate.id },
        });
        res.json({ assets, generationJobs: jobs });
    }
    catch (err) {
        next(err);
    }
});
// GET /v2/api/admin/affiliates/:code/audit
router.get('/affiliates/:code/audit', async (req, res, next) => {
    try {
        const prisma = (0, prisma_1.getPrisma)();
        const affiliate = await findAffiliateScoped(prisma, req.params["code"], req.actor.businessId);
        const logs = await prisma.auditLog.findMany({
            where: { entityId: { in: [affiliate.id, affiliate.code] } },
            orderBy: { createdAt: 'desc' },
            take: 500,
        });
        res.json({ logs });
    }
    catch (err) {
        next(err);
    }
});
// POST /v2/api/admin/affiliates/:code/content/:runId/flag
router.post('/affiliates/:code/content/:runId/flag', async (req, res, next) => {
    try {
        const prisma = (0, prisma_1.getPrisma)();
        const body = req.body;
        if (!body.reason)
            throw new errorHandler_1.AppError('NOT_FOUND', 'reason is required.', 422);
        const run = await prisma.contentGenerationRun.findUnique({ where: { id: req.params["runId"] } });
        if (!run)
            throw new errorHandler_1.AppError('NOT_FOUND', 'Content run not found.', 404);
        await prisma.contentGenerationRun.update({
            where: { id: req.params["runId"] },
            data: { status: 'rejected', flaggedAt: new Date(), flagReason: body.reason, flagNote: body.note },
        });
        await prisma.auditLog.create({
            data: {
                actorType: 'admin',
                actorId: req.requestId,
                action: 'content_flagged',
                entityType: 'ContentGenerationRun',
                entityId: req.params["runId"],
                changes: { reason: body.reason, note: body.note },
            },
        });
        res.json({ flagged: true, runId: req.params["runId"] });
    }
    catch (err) {
        next(err);
    }
});
// POST /v2/api/admin/affiliates/:code/profiles/:profileId/lock
router.post('/affiliates/:code/profiles/:profileId/lock', async (req, res, next) => {
    try {
        const prisma = (0, prisma_1.getPrisma)();
        await prisma.affiliateProfile.update({
            where: { id: req.params["profileId"] },
            data: { status: 'locked', lockedAt: new Date(), lockedBy: req.requestId },
        });
        await prisma.auditLog.create({
            data: {
                actorType: 'admin',
                actorId: req.requestId,
                action: 'profile_locked',
                entityType: 'AffiliateProfile',
                entityId: req.params["profileId"],
                changes: { affiliateCode: req.params["code"] },
            },
        });
        res.json({ locked: true, profileId: req.params["profileId"] });
    }
    catch (err) {
        next(err);
    }
});
// POST /v2/api/admin/affiliates/:code/content/:runId/approve
// Approves content and fires a Make webhook → Sendible
router.post('/affiliates/:code/content/:runId/approve', async (req, res, next) => {
    try {
        const prisma = (0, prisma_1.getPrisma)();
        const affiliate = await findAffiliateScoped(prisma, req.params["code"], req.actor.businessId);
        const run = await prisma.contentGenerationRun.findUnique({ where: { id: req.params["runId"] } });
        if (!run)
            throw new errorHandler_1.AppError('NOT_FOUND', 'Content run not found.', 404);
        if (run.status === 'rejected')
            throw new errorHandler_1.AppError('FORBIDDEN', 'Run is flagged — cannot approve.', 403);
        if (run.affiliateId !== affiliate.id)
            throw new errorHandler_1.AppError('FORBIDDEN', 'Run does not belong to this affiliate.', 403);
        await prisma.contentGenerationRun.update({
            where: { id: run.id },
            data: { status: 'approved', updatedAt: new Date() },
        });
        await prisma.auditLog.create({
            data: {
                actorType: 'admin',
                actorId: req.requestId,
                action: 'content_approved',
                entityType: 'ContentGenerationRun',
                entityId: run.id,
                changes: { channel: run.channel },
            },
        });
        const bizConfig = await prisma.businessConfig.findUnique({ where: { businessId: req.actor.businessId }, select: { landingPageUrl: true } });
        const appUrl = bizConfig?.landingPageUrl ?? env_1.env.APP_URL;
        // Fire Make webhook (non-blocking — failure never breaks approval)
        await (0, makeWebhook_1.fireMakeWebhook)({
            event: 'content_approved',
            runId: run.id,
            affiliateCode: affiliate.code,
            affiliateName: affiliate.name,
            channel: run.channel,
            content: run.outputContent ?? '',
            refLink: `${appUrl}/ref/${affiliate.code}`,
            approvedAt: new Date().toISOString(),
        });
        logger_1.logger.info({ module: 'adminRoutes', action: 'contentApproved', runId: run.id }, 'Content approved');
        res.json({ approved: true, runId: run.id });
    }
    catch (err) {
        next(err);
    }
});
// DELETE /v2/api/admin/affiliates/:code
router.delete('/affiliates/:code', async (req, res, next) => {
    try {
        await (0, profileRoutes_1.hardDeleteAffiliate)(req.params["code"], req.requestId);
        res.status(204).send();
    }
    catch (err) {
        next(err);
    }
});
// ── Optimisation API ──────────────────────────────────────────────────────────
// GET /v2/api/admin/optimisation/insights
router.get('/optimisation/insights', async (req, res, next) => {
    try {
        const prisma = (0, prisma_1.getPrisma)();
        const status = req.query['status'];
        const impact = req.query['impact'];
        const insights = await prisma.optimisationInsight.findMany({
            where: {
                businessId: req.actor.businessId,
                ...(status ? { status } : {}),
                ...(impact ? { impact } : {}),
            },
            orderBy: [{ impact: 'asc' }, { createdAt: 'desc' }],
        });
        res.json({ insights });
    }
    catch (err) {
        next(err);
    }
});
// POST /v2/api/admin/optimisation/insights/:id/apply
router.post('/optimisation/insights/:id/apply', async (req, res, next) => {
    try {
        const prisma = (0, prisma_1.getPrisma)();
        const businessId = req.actor.businessId;
        const insight = await prisma.optimisationInsight.findFirst({
            where: { id: req.params['id'], businessId },
        });
        if (!insight)
            throw new errorHandler_1.AppError('NOT_FOUND', 'Insight not found.', 404);
        // Mark applied
        await prisma.optimisationInsight.update({
            where: { id: insight.id },
            data: { status: 'applied', appliedAt: new Date(), appliedBy: 'admin' },
        });
        // Create or update OptimisationRule from insight evidence
        const evidence = insight.evidence;
        let ruleConfig = {};
        if (insight.insightType === 'content_format' && evidence['winningFormat']) {
            const allFormats = evidence['allFormats'] ?? [];
            const weights = {};
            allFormats.forEach(f => { weights[f.format] = Math.max(0.1, f.rate); });
            ruleConfig = { preferredFormats: [evidence['winningFormat']], weights };
        }
        else if (insight.insightType === 'posting_time' && evidence['channel'] && evidence['bestHour'] !== undefined) {
            ruleConfig = { [evidence['channel']]: [`${evidence['bestHour']}:00`] };
        }
        else if (insight.insightType === 'channel_mix' && evidence['winningChannel']) {
            ruleConfig = { preferredChannel: evidence['winningChannel'], minimumAllocation: 0.4 };
        }
        else {
            ruleConfig = evidence;
        }
        const rule = await prisma.optimisationRule.upsert({
            where: { businessId_ruleType: { businessId, ruleType: insight.insightType } },
            update: { config: ruleConfig, active: true, updatedAt: new Date() },
            create: { businessId, ruleType: insight.insightType, config: ruleConfig, createdFrom: insight.id },
        });
        await prisma.auditLog.create({
            data: {
                actorType: 'admin', actorId: req.requestId,
                action: 'insight_applied', entityType: 'OptimisationInsight',
                entityId: insight.id, changes: { ruleType: insight.insightType, ruleId: rule.id },
            },
        });
        res.json({ insight, rule });
    }
    catch (err) {
        next(err);
    }
});
// POST /v2/api/admin/optimisation/insights/:id/dismiss
router.post('/optimisation/insights/:id/dismiss', async (req, res, next) => {
    try {
        const prisma = (0, prisma_1.getPrisma)();
        const insight = await prisma.optimisationInsight.findFirst({
            where: { id: req.params['id'], businessId: req.actor.businessId },
        });
        if (!insight)
            throw new errorHandler_1.AppError('NOT_FOUND', 'Insight not found.', 404);
        await prisma.optimisationInsight.update({ where: { id: insight.id }, data: { status: 'dismissed' } });
        res.json({ dismissed: true });
    }
    catch (err) {
        next(err);
    }
});
// GET /v2/api/admin/optimisation/rules
router.get('/optimisation/rules', async (req, res, next) => {
    try {
        const prisma = (0, prisma_1.getPrisma)();
        const rules = await prisma.optimisationRule.findMany({
            where: { businessId: req.actor.businessId },
            orderBy: { updatedAt: 'desc' },
        });
        res.json({ rules });
    }
    catch (err) {
        next(err);
    }
});
// PATCH /v2/api/admin/optimisation/rules/:type
router.patch('/optimisation/rules/:type', async (req, res, next) => {
    try {
        const prisma = (0, prisma_1.getPrisma)();
        const businessId = req.actor.businessId;
        const ruleType = req.params['type'];
        const { config, active } = req.body;
        const rule = await prisma.optimisationRule.upsert({
            where: { businessId_ruleType: { businessId, ruleType } },
            update: { ...(config !== undefined && { config }), ...(active !== undefined && { active }), updatedAt: new Date() },
            create: { businessId, ruleType, config: config ?? {}, active: active ?? true },
        });
        await prisma.auditLog.create({
            data: { actorType: 'admin', actorId: req.requestId, action: 'rule_updated', entityType: 'OptimisationRule', entityId: rule.id, changes: { ruleType, config, active } },
        });
        res.json({ rule });
    }
    catch (err) {
        next(err);
    }
});
// POST /v2/api/admin/optimisation/tests
router.post('/optimisation/tests', async (req, res, next) => {
    try {
        const prisma = (0, prisma_1.getPrisma)();
        const businessId = req.actor.businessId;
        const { name, type, variants } = req.body;
        if (!name || !type || !variants?.length)
            throw new errorHandler_1.AppError('NOT_FOUND', 'name, type, variants required.', 422);
        const test = await prisma.abTest.create({
            data: { businessId, name, type, variants },
        });
        // Create initial result records
        await prisma.abTestResult.createMany({
            data: variants.map(v => ({ testId: test.id, variantId: v.id })),
        });
        res.status(201).json({ test });
    }
    catch (err) {
        next(err);
    }
});
// GET /v2/api/admin/optimisation/tests
router.get('/optimisation/tests', async (req, res, next) => {
    try {
        const prisma = (0, prisma_1.getPrisma)();
        const tests = await prisma.abTest.findMany({
            where: { businessId: req.actor.businessId },
            include: { results: true },
            orderBy: { startedAt: 'desc' },
        });
        res.json({ tests });
    }
    catch (err) {
        next(err);
    }
});
// POST /v2/api/admin/optimisation/tests/:id/end
router.post('/optimisation/tests/:id/end', async (req, res, next) => {
    try {
        const prisma = (0, prisma_1.getPrisma)();
        const test = await prisma.abTest.findFirst({
            where: { id: req.params['id'], businessId: req.actor.businessId },
        });
        if (!test)
            throw new errorHandler_1.AppError('NOT_FOUND', 'Test not found.', 404);
        const results = await prisma.abTestResult.findMany({ where: { testId: test.id } });
        const winner = results.reduce((a, b) => a.conversionRate >= b.conversionRate ? a : b, results[0]);
        await prisma.abTest.update({
            where: { id: test.id },
            data: { status: 'completed', endedAt: new Date(), winnerVariantId: winner.variantId },
        });
        res.json({ test: { ...test, status: 'completed', winnerVariantId: winner.variantId } });
    }
    catch (err) {
        next(err);
    }
});
// GET /v2/api/admin/optimisation/report
router.get('/optimisation/report', async (req, res, next) => {
    try {
        const prisma = (0, prisma_1.getPrisma)();
        const businessId = req.actor.businessId;
        const since = new Date(Date.now() - 30 * 86400000);
        const [insights, rules, tests, funnelStageCounts, channelCounts] = await Promise.all([
            prisma.optimisationInsight.findMany({ where: { businessId, status: 'new' }, orderBy: { impact: 'asc' }, take: 10 }),
            prisma.optimisationRule.findMany({ where: { businessId, active: true } }),
            prisma.abTest.findMany({ where: { businessId, status: 'running' }, include: { results: true } }),
            prisma.funnelEvent.groupBy({ by: ['funnelStage'], where: { businessId, timestamp: { gte: since } }, _count: { id: true } }),
            prisma.funnelEvent.groupBy({ by: ['channel'], where: { businessId, timestamp: { gte: since }, eventType: 'click' }, _count: { id: true }, orderBy: { _count: { id: 'desc' } }, take: 8 }),
        ]);
        const stageMap = {};
        funnelStageCounts.forEach(s => { stageMap[s.funnelStage] = s._count.id; });
        res.json({
            funnelPerformance: stageMap,
            topInsights: insights,
            activeTests: tests,
            channelPerformance: channelCounts.map(c => ({ channel: c.channel, clicks: c._count.id })),
            activeRules: rules,
            recommendations: insights.filter(i => i.impact === 'high').map(i => i.recommendation),
        });
    }
    catch (err) {
        next(err);
    }
});
// POST /v2/api/admin/optimisation/run — on-demand trigger
router.post('/optimisation/run', async (req, res, next) => {
    try {
        const { runOptimisationForBusiness } = await Promise.resolve().then(() => __importStar(require('../../queues/workers/optimisationWorker')));
        await runOptimisationForBusiness(req.actor.businessId);
        res.json({ ok: true, message: 'Optimisation analysis complete' });
    }
    catch (err) {
        next(err);
    }
});
// ── Funnel API ────────────────────────────────────────────────────────────────
// GET /v2/api/admin/funnel/summary?days=30
router.get('/funnel/summary', async (req, res, next) => {
    try {
        const prisma = (0, prisma_1.getPrisma)();
        const businessId = req.actor.businessId;
        const days = Math.min(parseInt(req.query['days']) || 30, 90);
        const since = new Date(Date.now() - days * 86400000);
        const [events, conversions, sessions] = await Promise.all([
            prisma.funnelEvent.groupBy({
                by: ['funnelStage'],
                where: { businessId, timestamp: { gte: since } },
                _count: { id: true },
            }),
            prisma.conversionEvent.count({ where: { businessId, occurredAt: { gte: since } } }),
            prisma.visitorSession.count({ where: { businessId, firstSeenAt: { gte: since } } }),
        ]);
        const stageOrder = ['awareness', 'interest', 'consideration', 'conversion', 'retention'];
        const stageCounts = {};
        events.forEach(e => { stageCounts[e.funnelStage] = e._count.id; });
        const funnelBreakdown = stageOrder.map((stage, i) => {
            const count = stageCounts[stage] || 0;
            const next = stageCounts[stageOrder[i + 1]] || 0;
            return { stage, count, dropoffToNext: count > 0 ? Math.round((1 - next / count) * 100) : 0 };
        });
        const totalEvents = Object.values(stageCounts).reduce((a, b) => a + b, 0);
        const conversionRate = sessions > 0 ? Math.round((conversions / sessions) * 10000) / 100 : 0;
        const [topChannels, topAffiliates] = await Promise.all([
            prisma.funnelEvent.groupBy({
                by: ['channel'],
                where: { businessId, timestamp: { gte: since } },
                _count: { id: true },
                orderBy: { _count: { id: 'desc' } },
                take: 10,
            }),
            prisma.funnelEvent.groupBy({
                by: ['affiliateCode'],
                where: { businessId, timestamp: { gte: since }, affiliateCode: { not: null } },
                _count: { id: true },
                orderBy: { _count: { id: 'desc' } },
                take: 10,
            }),
        ]);
        res.json({
            totalEvents, uniqueVisitors: sessions, totalConversions: conversions, conversionRate,
            funnelBreakdown,
            topChannels: topChannels.map(c => ({ channel: c.channel, clicks: c._count.id })),
            topAffiliates: topAffiliates.map(a => ({ affiliateCode: a.affiliateCode, clicks: a._count.id })),
        });
    }
    catch (err) {
        next(err);
    }
});
// GET /v2/api/admin/funnel/sessions?limit=50&stage=consideration
router.get('/funnel/sessions', async (req, res, next) => {
    try {
        const prisma = (0, prisma_1.getPrisma)();
        const businessId = req.actor.businessId;
        const limit = Math.min(parseInt(req.query['limit']) || 50, 200);
        const stage = req.query['stage'];
        const sessions = await prisma.visitorSession.findMany({
            where: {
                businessId,
                ...(stage ? { stages: { has: stage } } : {}),
            },
            orderBy: { lastSeenAt: 'desc' },
            take: limit,
        });
        res.json({ sessions, total: sessions.length });
    }
    catch (err) {
        next(err);
    }
});
// GET /v2/api/admin/funnel/attribution?days=30
router.get('/funnel/attribution', async (req, res, next) => {
    try {
        const prisma = (0, prisma_1.getPrisma)();
        const businessId = req.actor.businessId;
        const days = Math.min(parseInt(req.query['days']) || 30, 90);
        const since = new Date(Date.now() - days * 86400000);
        const [clicks, conversions] = await Promise.all([
            prisma.funnelEvent.groupBy({
                by: ['affiliateCode'],
                where: { businessId, timestamp: { gte: since }, eventType: 'click', affiliateCode: { not: null } },
                _count: { id: true },
            }),
            prisma.conversionEvent.groupBy({
                by: ['affiliateCode'],
                where: { businessId, occurredAt: { gte: since }, affiliateCode: { not: null } },
                _count: { id: true },
            }),
        ]);
        const clickMap = {};
        clicks.forEach(c => { if (c.affiliateCode)
            clickMap[c.affiliateCode] = c._count.id; });
        const convMap = {};
        conversions.forEach(c => { if (c.affiliateCode)
            convMap[c.affiliateCode] = c._count.id; });
        const codes = [...new Set([...Object.keys(clickMap), ...Object.keys(convMap)])];
        const affiliates = await prisma.affiliate.findMany({
            where: { code: { in: codes }, businessId },
            select: { code: true, name: true },
        });
        const nameMap = {};
        affiliates.forEach(a => { nameMap[a.code] = a.name; });
        const attribution = codes.map(code => {
            const clicks2 = clickMap[code] || 0;
            const convs = convMap[code] || 0;
            return {
                affiliateCode: code,
                name: nameMap[code] || code,
                clicks: clicks2,
                conversions: convs,
                conversionRate: clicks2 > 0 ? Math.round((convs / clicks2) * 10000) / 100 : 0,
            };
        }).sort((a, b) => b.clicks - a.clicks);
        res.json({ attribution, days });
    }
    catch (err) {
        next(err);
    }
});
// GET /v2/api/admin/business — return current tenant's Business + BusinessConfig
router.get('/business', async (req, res, next) => {
    try {
        const prisma = (0, prisma_1.getPrisma)();
        const businessId = req.actor.businessId;
        const business = await prisma.business.findUnique({
            where: { id: businessId },
            include: { config: true },
        });
        if (!business)
            return res.status(404).json({ error: 'Business not found' });
        res.json({ business });
    }
    catch (err) {
        next(err);
    }
});
// PATCH /v2/api/admin/business/config — update BusinessConfig (partial)
router.patch('/business/config', async (req, res, next) => {
    try {
        const prisma = (0, prisma_1.getPrisma)();
        const businessId = req.actor.businessId;
        const { brandName, brandColor, accentColor, logoUrl, customDomain, brandVoice, toneKeywords, avoidPhrases, commissionType, commissionValue, sendingDomain, fromName, fromEmail, dailySendCap, conversionTypes, landingPageUrl, pricingPageUrl, } = req.body;
        const config = await prisma.businessConfig.upsert({
            where: { businessId },
            update: {
                ...(brandName !== undefined && { brandName }),
                ...(brandColor !== undefined && { brandColor }),
                ...(accentColor !== undefined && { accentColor }),
                ...(logoUrl !== undefined && { logoUrl }),
                ...(customDomain !== undefined && { customDomain }),
                ...(brandVoice !== undefined && { brandVoice }),
                ...(toneKeywords !== undefined && { toneKeywords }),
                ...(avoidPhrases !== undefined && { avoidPhrases }),
                ...(commissionType !== undefined && { commissionType }),
                ...(commissionValue !== undefined && { commissionValue }),
                ...(sendingDomain !== undefined && { sendingDomain }),
                ...(fromName !== undefined && { fromName }),
                ...(fromEmail !== undefined && { fromEmail }),
                ...(dailySendCap !== undefined && { dailySendCap }),
                ...(conversionTypes !== undefined && { conversionTypes }),
                ...(landingPageUrl !== undefined && { landingPageUrl }),
                ...(pricingPageUrl !== undefined && { pricingPageUrl }),
                updatedAt: new Date(),
            },
            create: {
                businessId,
                brandName: brandName ?? 'AlphaBoost',
                brandColor: brandColor ?? '#0D1B2A',
                accentColor: accentColor ?? '#E87A2A',
                toneKeywords: toneKeywords ?? [],
                avoidPhrases: avoidPhrases ?? [],
            },
        });
        res.json({ config });
    }
    catch (err) {
        next(err);
    }
});
// ── Content Studio — Content Run Listing ─────────────────────────────────────
// GET /v2/api/admin/content/runs?status=scored&affiliateCode=ABC
router.get('/content/runs', async (req, res, next) => {
    try {
        const prisma = (0, prisma_1.getPrisma)();
        const businessId = req.actor.businessId;
        const status = req.query['status'];
        const affiliateCode = req.query['affiliateCode'];
        const limit = Math.min(parseInt(req.query['limit']) || 40, 100);
        let affiliateId;
        if (affiliateCode) {
            const aff = await prisma.affiliate.findFirst({ where: { code: affiliateCode, businessId } });
            if (!aff)
                throw new errorHandler_1.AppError('NOT_FOUND', 'Affiliate not found.', 404);
            affiliateId = aff.id;
        }
        const runs = await prisma.contentGenerationRun.findMany({
            where: {
                businessId,
                ...(status ? { status } : {}),
                ...(affiliateId ? { affiliateId } : {}),
            },
            include: {
                affiliate: { select: { code: true, name: true } },
                scores: { orderBy: { scoredAt: 'desc' }, take: 1 },
            },
            orderBy: { createdAt: 'desc' },
            take: limit,
        });
        res.json({
            runs: runs.map(r => ({
                ...r,
                affiliateCode: r.affiliate.code,
                affiliateName: r.affiliate.name,
            })),
        });
    }
    catch (err) {
        next(err);
    }
});
// POST /v2/api/admin/affiliates/:code/content/:runId/flag
router.post('/affiliates/:code/content/:runId/flag', async (req, res, next) => {
    try {
        const prisma = (0, prisma_1.getPrisma)();
        const affiliate = await findAffiliateScoped(prisma, req.params['code'], req.actor.businessId);
        const run = await prisma.contentGenerationRun.findFirst({
            where: { id: req.params['runId'], affiliateId: affiliate.id },
        });
        if (!run)
            throw new errorHandler_1.AppError('NOT_FOUND', 'Content run not found.', 404);
        const { reason, note } = req.body;
        await prisma.contentGenerationRun.update({
            where: { id: run.id },
            data: { status: 'rejected', flaggedAt: new Date(), flagReason: reason ?? 'Flagged by admin', flagNote: note },
        });
        await prisma.auditLog.create({
            data: {
                actorType: 'admin', actorId: req.requestId,
                action: 'content_flagged', entityType: 'ContentGenerationRun',
                entityId: run.id, changes: { reason },
            },
        });
        res.json({ flagged: true, runId: run.id });
    }
    catch (err) {
        next(err);
    }
});
// ── Module 04 — Content Library Management ────────────────────────────────────
// POST /v2/api/admin/library/upload — admin uploads a media asset
const libraryUpload = (() => {
    const multer = require('multer');
    return multer({ dest: require('os').tmpdir(), limits: { fileSize: 50 * 1024 * 1024 } });
})();
router.post('/library/upload', libraryUpload.single('file'), async (req, res, next) => {
    try {
        const prisma = (0, prisma_1.getPrisma)();
        const file = req.file;
        if (!file)
            throw new errorHandler_1.AppError('NOT_FOUND', 'File is required.', 422);
        const { tags, type } = req.body;
        const assetType = type ?? (file.mimetype.startsWith('video') ? 'video' : 'image');
        const tagList = tags ? (Array.isArray(tags) ? tags : tags.split(',').map((t) => t.trim())) : [];
        // For now, use a local URL — when Zoho WorkDrive is integrated, upload there
        const url = `/uploads/${file.originalname}`;
        const asset = await prisma.contentLibraryAsset.create({
            data: {
                businessId: req.actor.businessId,
                type: assetType,
                url,
                filename: file.originalname,
                fileSize: file.size,
                tags: tagList,
                uploadedBy: 'admin',
            },
        });
        res.status(201).json({ asset });
    }
    catch (err) {
        next(err);
    }
});
// GET /v2/api/admin/library — list library assets
router.get('/library', async (req, res, next) => {
    try {
        const prisma = (0, prisma_1.getPrisma)();
        const type = req.query['type'];
        const tags = req.query['tags'];
        const page = Math.max(1, parseInt(req.query['page']) || 1);
        const take = 50;
        const skip = (page - 1) * take;
        const assets = await prisma.contentLibraryAsset.findMany({
            where: {
                businessId: req.actor.businessId,
                active: true,
                ...(type ? { type } : {}),
                ...(tags ? { tags: { hasSome: tags.split(',') } } : {}),
            },
            orderBy: [{ usageCount: 'desc' }, { createdAt: 'desc' }],
            take,
            skip,
        });
        res.json({ assets, page });
    }
    catch (err) {
        next(err);
    }
});
// DELETE /v2/api/admin/library/:assetId — soft delete
router.delete('/library/:assetId', async (req, res, next) => {
    try {
        const prisma = (0, prisma_1.getPrisma)();
        const asset = await prisma.contentLibraryAsset.findFirst({
            where: { id: req.params['assetId'], businessId: req.actor.businessId },
        });
        if (!asset)
            throw new errorHandler_1.AppError('NOT_FOUND', 'Asset not found.', 404);
        if (asset.usageCount > 0)
            throw new errorHandler_1.AppError('FORBIDDEN', 'Cannot delete an asset that is in use.', 409);
        await prisma.contentLibraryAsset.update({ where: { id: asset.id }, data: { active: false } });
        res.json({ deleted: true });
    }
    catch (err) {
        next(err);
    }
});
// ── Module 05 — Plans Overview ────────────────────────────────────────────────
// GET /v2/api/admin/plans/overview — all affiliates pipeline status
router.get('/plans/overview', async (req, res, next) => {
    try {
        const prisma = (0, prisma_1.getPrisma)();
        const businessId = req.actor.businessId;
        const affiliates = await prisma.affiliate.findMany({
            where: { businessId, active: true },
            select: { id: true, code: true, name: true },
        });
        const monday = (() => {
            const d = new Date();
            const day = d.getDay();
            const diff = day === 0 ? -6 : 1 - day;
            d.setDate(d.getDate() + diff);
            d.setHours(0, 0, 0, 0);
            return d;
        })();
        const overview = await Promise.all(affiliates.map(async (aff) => {
            const plan = await prisma.affiliateContentPlan.findUnique({
                where: { affiliateId_weekStartDate: { affiliateId: aff.id, weekStartDate: monday } },
                include: { slots: { select: { status: true } } },
            });
            if (!plan)
                return { affiliateCode: aff.code, name: aff.name, weekSlots: 0, filled: 0, pending: 0, approved: 0, posted: 0 };
            const slots = plan.slots;
            const count = (s) => slots.filter(sl => sl.status === s).length;
            return {
                affiliateCode: aff.code,
                name: aff.name,
                weekSlots: slots.length,
                filled: slots.filter(sl => sl.status !== 'empty').length,
                pending: count('submitted'),
                approved: count('approved'),
                posted: count('posted'),
            };
        }));
        overview.sort((a, b) => b.pending - a.pending);
        res.json({ overview, weekOf: monday.toISOString() });
    }
    catch (err) {
        next(err);
    }
});
// ── Module 06 — CSV Export ────────────────────────────────────────────────────
// GET /v2/api/admin/export/csv?platform=linkedin — per-platform CSV
router.get('/export/csv', async (req, res, next) => {
    try {
        const { generatePlatformCSV } = await Promise.resolve().then(() => __importStar(require('../../queues/workers/csvExportWorker')));
        const platform = req.query['platform'];
        const results = await generatePlatformCSV(req.actor.businessId, platform);
        if (results.length === 0) {
            const today = new Date().toISOString().slice(0, 10);
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename="sendible-${platform ?? 'all'}-${today}.csv"`);
            return res.status(200).send('Message,SendDate,URL,Image\n');
        }
        const csv = results[0];
        const today = new Date().toISOString().slice(0, 10);
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="sendible-${platform ?? csv.platform}-${today}.csv"`);
        res.send(csv.csvText);
    }
    catch (err) {
        next(err);
    }
});
// GET /v2/api/admin/export/csv/all — ZIP of all platform CSVs
router.get('/export/csv/all', async (req, res, next) => {
    try {
        const { generatePlatformCSV } = await Promise.resolve().then(() => __importStar(require('../../queues/workers/csvExportWorker')));
        const JSZip = (await Promise.resolve().then(() => __importStar(require('jszip')))).default;
        const results = await generatePlatformCSV(req.actor.businessId);
        if (results.length === 0) {
            return res.status(200).json({ message: 'No approved content to export.' });
        }
        const zip = new JSZip();
        const today = new Date().toISOString().slice(0, 10);
        for (const r of results) {
            zip.file(`sendible-${r.platform}-${today}.csv`, r.csvText);
        }
        const zipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="sendible-all-${today}.zip"`);
        res.send(zipBuffer);
    }
    catch (err) {
        next(err);
    }
});
// GET /v2/api/admin/export/summary — how many posts ready per platform
router.get('/export/summary', async (req, res, next) => {
    try {
        const prisma = (0, prisma_1.getPrisma)();
        const businessId = req.actor.businessId;
        const platforms = await prisma.contentSlot.groupBy({
            by: ['platform'],
            where: { businessId, status: 'approved', exportedAt: null },
            _count: { id: true },
        });
        const lastExported = await prisma.contentSlot.findMany({
            where: { businessId, exportedAt: { not: null } },
            orderBy: { exportedAt: 'desc' },
            distinct: ['platform'],
            select: { platform: true, exportedAt: true },
        });
        const lastExportMap = {};
        lastExported.forEach(s => { lastExportMap[s.platform] = s.exportedAt; });
        const summary = platforms.map(p => ({
            platform: p.platform,
            ready: p._count.id,
            lastExported: lastExportMap[p.platform] ?? null,
        }));
        const totalReady = platforms.reduce((a, p) => a + p._count.id, 0);
        res.json({ summary, totalReady });
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
//# sourceMappingURL=adminRoutes.js.map