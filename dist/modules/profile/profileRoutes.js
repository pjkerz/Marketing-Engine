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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.hardDeleteAffiliate = hardDeleteAffiliate;
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const prisma_1 = require("../../lib/prisma");
const logger_1 = require("../../lib/logger");
const errorHandler_1 = require("../../middleware/errorHandler");
const auth_1 = require("../../middleware/auth");
const rbac_1 = require("../../middleware/rbac");
const rateLimit_1 = require("../../middleware/rateLimit");
const idempotency_1 = require("../../lib/idempotency");
const resumeParser_1 = require("../../upload/resumeParser");
const queues_1 = require("../../queues");
const profileMapper_1 = require("./profileMapper");
const personalizationEngine_1 = require("../personalization/personalizationEngine");
const env_1 = require("../../config/env");
const planGenerator_1 = require("../../lib/planGenerator");
const contentScorer_1 = require("../scoring/contentScorer");
const bokReader_1 = require("../../lib/bokReader");
const router = (0, express_1.Router)();
async function findAffiliateScoped(prisma, code, businessId) {
    const affiliate = await prisma.affiliate.findFirst({ where: { code, businessId } });
    if (!affiliate)
        throw new errorHandler_1.AppError('NOT_FOUND', 'Affiliate not found.', 404);
    return affiliate;
}
const upload = (0, multer_1.default)({
    dest: os.tmpdir(),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, ['.pdf', '.docx'].includes(ext));
    },
});
// POST /v2/api/affiliate/:code/upload-resume
router.post('/:code/upload-resume', auth_1.requireAuth, rbac_1.requireOwnAffiliate, rateLimit_1.uploadResumeLimit, idempotency_1.idempotency, upload.single('resume'), async (req, res, next) => {
    try {
        const file = req.file;
        if (!file)
            throw new errorHandler_1.AppError('UPLOAD_INVALID_TYPE', 'No file uploaded.', 415);
        (0, resumeParser_1.validateResumeFile)(file);
        const prisma = (0, prisma_1.getPrisma)();
        const affiliate = await findAffiliateScoped(prisma, req.params["code"], req.actor.businessId);
        // Create asset record
        const asset = await prisma.profileAsset.create({
            data: {
                affiliateId: affiliate.id,
                assetType: 'resume',
                fileName: file.originalname,
                mimeType: file.mimetype,
                fileSizeBytes: file.size,
                metadata: {},
            },
        });
        // Create processing job
        const job = await prisma.resumeProcessingJob.create({
            data: { affiliateId: affiliate.id, assetId: asset.id, status: 'queued' },
        });
        // Enqueue parse job
        await (0, queues_1.getQueues)()['v2-resume-parse'].add('parse', {
            jobId: job.id,
            affiliateCode: req.params["code"],
            affiliateId: affiliate.id,
            assetId: asset.id,
            tempFilePath: file.path,
            fileName: file.originalname,
            mimeType: file.mimetype,
        });
        logger_1.logger.info({ module: 'profileRoutes', action: 'uploadQueued', requestId: req.requestId, affiliateId: affiliate.id, jobId: job.id }, 'Resume upload queued');
        res.status(202).json({ jobId: job.id, status: 'queued' });
    }
    catch (err) {
        next(err);
    }
});
// GET /v2/api/affiliate/:code/upload-status/:jobId
router.get('/:code/upload-status/:jobId', auth_1.requireAuth, rbac_1.requireOwnAffiliate, async (req, res, next) => {
    try {
        const prisma = (0, prisma_1.getPrisma)();
        const job = await prisma.resumeProcessingJob.findUnique({ where: { id: req.params["jobId"] } });
        if (!job)
            throw new errorHandler_1.AppError('NOT_FOUND', 'Job not found.', 404);
        res.json({ jobId: job.id, status: job.status, errorCode: job.errorCode });
    }
    catch (err) {
        next(err);
    }
});
// GET /v2/api/affiliate/:code/profile
router.get('/:code/profile', auth_1.requireAuth, rbac_1.requireOwnAffiliate, async (req, res, next) => {
    try {
        const prisma = (0, prisma_1.getPrisma)();
        const affiliate = await findAffiliateScoped(prisma, req.params["code"], req.actor.businessId);
        const profile = await prisma.affiliateProfile.findFirst({
            where: { affiliateId: affiliate.id, status: 'active' },
            orderBy: { version: 'desc' },
        });
        if (!profile) {
            res.json({ profile: null, defaults: (0, profileMapper_1.applyDefaults)({}) });
            return;
        }
        res.json({ profile: (0, profileMapper_1.applyDefaults)(profile), version: profile.version });
    }
    catch (err) {
        next(err);
    }
});
// POST /v2/api/affiliate/:code/profile
router.post('/:code/profile', auth_1.requireAuth, rbac_1.requireOwnAffiliate, idempotency_1.idempotency, async (req, res, next) => {
    try {
        const prisma = (0, prisma_1.getPrisma)();
        const affiliate = await findAffiliateScoped(prisma, req.params["code"], req.actor.businessId);
        const existing = await prisma.affiliateProfile.findFirst({
            where: { affiliateId: affiliate.id, status: 'active' },
            orderBy: { version: 'desc' },
        });
        if (existing?.status === 'locked') {
            throw new errorHandler_1.AppError('FORBIDDEN', 'Profile is locked by admin.', 403);
        }
        const newVersion = (existing?.version ?? 0) + 1;
        const body = req.body;
        const profile = await prisma.affiliateProfile.create({
            data: {
                affiliateId: affiliate.id,
                version: newVersion,
                source: 'manual',
                status: 'active',
                role: body.role,
                seniority: body.seniority,
                industries: body.industries ?? [],
                skills: body.skills ?? [],
                authoritySignal: body.authoritySignal,
                painPoint: body.painPoint,
                directness: body.directness ?? 0.6,
                provocation: body.provocation ?? 0.3,
                humor: body.humor ?? 0.2,
                ctaStrength: body.ctaStrength ?? 'soft',
                desiredEmotion: body.desiredEmotion ?? 'curiosity',
                goal: body.goal ?? 'signups',
                format: body.format ?? 'framework',
                voice: body.voice ?? 'operator',
                controversy: body.controversy ?? 'balanced',
                platforms: body.platforms ?? ['linkedin'],
                confidence: body.confidence ?? 0.5,
            },
        });
        await prisma.auditLog.create({
            data: {
                actorType: req.actor?.role === 'admin' ? 'admin' : 'affiliate',
                actorId: req.actor?.affiliateCode ?? req.actor?.role,
                action: 'profile_saved',
                entityType: 'AffiliateProfile',
                entityId: profile.id,
                changes: { version: newVersion, source: 'manual' },
            },
        });
        res.status(201).json({ profile: (0, profileMapper_1.applyDefaults)(profile), version: newVersion });
    }
    catch (err) {
        next(err);
    }
});
// POST /v2/api/affiliate/:code/profile/autofill
router.post('/:code/profile/autofill', auth_1.requireAuth, rbac_1.requireOwnAffiliate, async (req, res, next) => {
    try {
        const prisma = (0, prisma_1.getPrisma)();
        const affiliate = await findAffiliateScoped(prisma, req.params["code"], req.actor.businessId);
        const extraction = await prisma.profileExtraction.findFirst({
            where: { affiliateId: affiliate.id, status: 'done' },
            orderBy: { createdAt: 'desc' },
        });
        if (!extraction?.normalizedOutput) {
            res.json({ autofilled: false, message: 'No completed extraction found.' });
            return;
        }
        const extracted = extraction.normalizedOutput;
        res.json({
            autofilled: true,
            suggested: {
                role: extracted['role'],
                seniority: extracted['seniority'],
                industries: extracted['industries'],
                skills: extracted['skills'],
                authoritySignal: extracted['authority_signal'],
                painPoint: extracted['pain_point'],
                directness: extracted['tone_defaults']?.directness ?? 0.6,
                provocation: extracted['tone_defaults']?.provocation ?? 0.3,
            },
        });
    }
    catch (err) {
        next(err);
    }
});
// DELETE /v2/api/affiliate/:code/assets/:assetId
router.delete('/:code/assets/:assetId', auth_1.requireAuth, rbac_1.requireOwnAffiliate, async (req, res, next) => {
    try {
        const prisma = (0, prisma_1.getPrisma)();
        const affiliate = await findAffiliateScoped(prisma, req.params["code"], req.actor.businessId);
        const asset = await prisma.profileAsset.findFirst({
            where: { id: req.params["assetId"], affiliateId: affiliate.id },
        });
        if (!asset)
            throw new errorHandler_1.AppError('NOT_FOUND', 'Asset not found.', 404);
        await prisma.profileAsset.delete({ where: { id: asset.id } });
        res.status(204).send();
    }
    catch (err) {
        next(err);
    }
});
// POST /v2/api/affiliate/:code/privacy/delete-data
router.post('/:code/privacy/delete-data', auth_1.requireAuth, rbac_1.requireOwnAffiliate, idempotency_1.idempotency, async (req, res, next) => {
    try {
        await hardDeleteAffiliate(req.params["code"], req.actor?.affiliateCode ?? 'self');
        res.status(204).send();
    }
    catch (err) {
        next(err);
    }
});
// POST /v2/api/affiliate/:code/content/generate
router.post('/:code/content/generate', auth_1.requireAuth, rbac_1.requireOwnAffiliate, rateLimit_1.generateContentLimit, idempotency_1.idempotency, async (req, res, next) => {
    try {
        const prisma = (0, prisma_1.getPrisma)();
        const affiliate = await findAffiliateScoped(prisma, req.params["code"], req.actor.businessId);
        // Profile is optional — used for personalization if available
        const profile = await prisma.affiliateProfile.findFirst({
            where: { affiliateId: affiliate.id, status: 'active' },
            orderBy: { version: 'desc' },
        });
        const body = req.body;
        const channels = body.channels ?? profile?.platforms ?? ['linkedin'];
        const brief = body.brief ?? '';
        const slotId = body.slotId;
        // Get BOK context — pull relevant podcast knowledge for this brief/channel
        const business = await prisma.business.findUnique({ where: { id: affiliate.businessId }, select: { slug: true } });
        const bokTopic = brief || channels.join(' ') + ' career growth AI professional';
        const bokContext = (0, bokReader_1.readBokChunks)(business?.slug ?? '', bokTopic);
        // Get business config for brand voice
        const config = await prisma.businessConfig.findUnique({ where: { businessId: affiliate.businessId } });
        const brandName = config?.brandName ?? 'AlphaNoetics';
        const brandVoice = config?.brandVoice ?? 'authentic, direct, and insight-driven';
        // Get optimisation hints
        const optimisationHints = await (0, personalizationEngine_1.applyOptimisationToGeneration)(affiliate.businessId, { channel: channels[0] ?? 'linkedin' });
        const { llmClient } = await Promise.resolve().then(() => __importStar(require('../../integrations/llm/llmClient')));
        const runs = [];
        for (const channel of channels) {
            const formatHint = optimisationHints.preferredFormat ? ` Use ${optimisationHints.preferredFormat} format.` : '';
            const systemPrompt = [
                `You are a professional social media content writer for ${brandName}, an AI career acceleration platform.`,
                `Brand voice: ${brandVoice}.`,
                bokContext ? `\nUse the following real insights from our podcast knowledge base to ground your content in genuine expertise:\n\n${bokContext}` : '',
                `\nWrite a ${channel} post that is authentic, insightful, and valuable to career-focused professionals.`,
                `Do NOT use generic motivational fluff or spam hashtags.`,
                profile ? `The content is for an affiliate named ${affiliate.name} (code: ${affiliate.code}).` : '',
                formatHint,
            ].filter(Boolean).join('\n');
            const userPrompt = brief
                ? `Write a compelling ${channel} post based on this brief: ${brief}`
                : `Write a compelling ${channel} post that highlights real insights about AI career acceleration and professional growth. Draw from the podcast knowledge provided.`;
            const baseContent = await llmClient.complete({
                model: env_1.env.GROQ_MODEL_CONTENT,
                systemPrompt,
                userPrompt,
                maxTokens: 600,
                responseFormat: 'text',
                requestId: req.requestId,
            });
            const tenantLandingUrl = config?.landingPageUrl ?? env_1.env.APP_URL;
            const personalized = profile
                ? (0, personalizationEngine_1.personalize)({ baseContent, channel, affiliateCode: req.params["code"], profile, tenantLandingUrl })
                : baseContent;
            const run = await prisma.contentGenerationRun.create({
                data: {
                    businessId: affiliate.businessId,
                    affiliateId: affiliate.id,
                    profileId: profile?.id ?? undefined,
                    channel,
                    status: 'generating',
                    inputBrief: { brief, channels, bokUsed: !!bokContext },
                    outputContent: personalized,
                    personalizationSummary: profile ? {
                        role: profile.role,
                        painPoint: profile.painPoint,
                        ctaStrength: profile.ctaStrength,
                    } : { bokGrounded: true },
                },
            });
            // Enqueue scoring (non-blocking)
            await (0, queues_1.getQueues)()['v2-content-score'].add('score', {
                runId: run.id,
                affiliateId: affiliate.id,
                channel,
                content: personalized,
            });
            await prisma.contentGenerationRun.update({
                where: { id: run.id },
                data: { status: 'scored' },
            });
            // If a calendar slot was specified, link this run to it
            if (slotId) {
                await prisma.contentSlot.update({
                    where: { id: slotId },
                    data: { contentRunId: run.id, status: 'draft' },
                });
            }
            runs.push({ runId: run.id, channel });
        }
        res.status(201).json({ runs });
    }
    catch (err) {
        next(err);
    }
});
// GET /v2/api/affiliate/:code/content — list recent runs for this affiliate
router.get('/:code/content', auth_1.requireAuth, rbac_1.requireOwnAffiliate, async (req, res, next) => {
    try {
        const prisma = (0, prisma_1.getPrisma)();
        const affiliate = await findAffiliateScoped(prisma, req.params['code'], req.actor.businessId);
        const limit = Math.min(parseInt(req.query['limit']) || 30, 100);
        const runs = await prisma.contentGenerationRun.findMany({
            where: { affiliateId: affiliate.id, businessId: req.actor.businessId },
            include: { scores: { orderBy: { scoredAt: 'desc' }, take: 1 } },
            orderBy: { createdAt: 'desc' },
            take: limit,
        });
        res.json({ runs });
    }
    catch (err) {
        next(err);
    }
});
// GET /v2/api/affiliate/:code/content/:runId
router.get('/:code/content/:runId', auth_1.requireAuth, rbac_1.requireOwnAffiliate, async (req, res, next) => {
    try {
        const prisma = (0, prisma_1.getPrisma)();
        const run = await prisma.contentGenerationRun.findFirst({
            where: { id: req.params["runId"], businessId: req.actor.businessId },
            include: { scores: true, mediaAssets: true },
        });
        if (!run)
            throw new errorHandler_1.AppError('NOT_FOUND', 'Content run not found.', 404);
        res.json(run);
    }
    catch (err) {
        next(err);
    }
});
// POST /v2/api/affiliate/:code/content/:runId/dispatch
router.post('/:code/content/:runId/dispatch', auth_1.requireAuth, rbac_1.requireOwnAffiliate, idempotency_1.idempotency, async (req, res, next) => {
    try {
        const prisma = (0, prisma_1.getPrisma)();
        const run = await prisma.contentGenerationRun.findFirst({ where: { id: req.params["runId"], businessId: req.actor.businessId } });
        if (!run)
            throw new errorHandler_1.AppError('NOT_FOUND', 'Content run not found.', 404);
        if (run.status === 'rejected')
            throw new errorHandler_1.AppError('FORBIDDEN', 'This content has been flagged and cannot be dispatched.', 403);
        await (0, queues_1.getQueues)()['v2-content-dispatch'].add('dispatch', {
            runId: run.id,
            affiliateId: run.affiliateId,
            channel: run.channel,
        });
        res.json({ queued: true, runId: run.id });
    }
    catch (err) {
        next(err);
    }
});
// GET /v2/api/affiliate/:code/stats
router.get('/:code/stats', auth_1.requireAuth, rbac_1.requireOwnAffiliate, async (req, res, next) => {
    try {
        const prisma = (0, prisma_1.getPrisma)();
        const affiliate = await findAffiliateScoped(prisma, req.params['code'], req.actor.businessId);
        const since30 = new Date(Date.now() - 30 * 86400000);
        const [clicksByPlatform, conversions, recentClicks] = await Promise.all([
            prisma.funnelEvent.groupBy({
                by: ['channel'],
                where: { affiliateCode: affiliate.code, eventType: 'click' },
                _count: { id: true },
            }),
            prisma.conversionEvent.count({ where: { affiliateCode: affiliate.code } }),
            prisma.funnelEvent.count({
                where: { affiliateCode: affiliate.code, eventType: 'click', timestamp: { gte: since30 } },
            }),
        ]);
        const totalClicks = clicksByPlatform.reduce((a, b) => a + b._count.id, 0);
        const byPlatform = {};
        clicksByPlatform.forEach(c => { byPlatform[c.channel] = c._count.id; });
        res.json({
            clicks: { total: totalClicks, byPlatform, last30Days: recentClicks },
            conversions: { total: conversions },
            conversionRate: totalClicks > 0 ? Math.round((conversions / totalClicks) * 10000) / 100 : 0,
        });
    }
    catch (err) {
        next(err);
    }
});
// ── Module 04 — Affiliate Content Studio ─────────────────────────────────────
// PATCH /v2/api/affiliate/:code/content/:runId — save edited content
router.patch('/:code/content/:runId', auth_1.requireAuth, rbac_1.requireOwnAffiliate, async (req, res, next) => {
    try {
        const prisma = (0, prisma_1.getPrisma)();
        const run = await prisma.contentGenerationRun.findFirst({
            where: { id: req.params['runId'], businessId: req.actor.businessId },
            include: { scores: { orderBy: { scoredAt: 'desc' }, take: 1 } },
        });
        if (!run)
            throw new errorHandler_1.AppError('NOT_FOUND', 'Content run not found.', 404);
        if (['dispatched', 'approved'].includes(run.status)) {
            throw new errorHandler_1.AppError('FORBIDDEN', 'Cannot edit approved or dispatched content.', 403);
        }
        const { editedContent, mediaAssetId } = req.body;
        const data = {};
        if (editedContent !== undefined) {
            data['editedContent'] = editedContent;
            data['editedAt'] = new Date();
        }
        if (mediaAssetId !== undefined) {
            // Validate asset belongs to same business
            if (mediaAssetId) {
                const asset = await prisma.contentLibraryAsset.findFirst({
                    where: { id: mediaAssetId, businessId: req.actor.businessId, active: true },
                });
                if (!asset)
                    throw new errorHandler_1.AppError('NOT_FOUND', 'Media asset not found.', 404);
            }
            data['mediaAssetId'] = mediaAssetId || null;
        }
        const updated = await prisma.contentGenerationRun.update({
            where: { id: run.id },
            data: data,
            include: { scores: { orderBy: { scoredAt: 'desc' }, take: 1 } },
        });
        // Re-score if content changed (async, fires after response)
        if (editedContent !== undefined && editedContent !== run.outputContent) {
            setImmediate(async () => {
                try {
                    const scores = await (0, contentScorer_1.scoreContent)({ content: editedContent, channel: run.channel });
                    await prisma.contentScore.create({
                        data: {
                            runId: run.id,
                            qualityScore: scores.quality.total,
                            riskScore: scores.risk.total,
                            conversionScore: scores.conversion.total,
                            qualityBreakdown: scores.quality.breakdown,
                            riskBreakdown: scores.risk.breakdown,
                            conversionBreakdown: scores.conversion.breakdown,
                            label: scores.quality.total >= 80 ? 'strong' : scores.quality.total >= 60 ? 'acceptable' : 'revise',
                        },
                    });
                }
                catch (e) {
                    logger_1.logger.warn({ module: 'profileRoutes', err: e }, 'Re-score after edit failed');
                }
            });
        }
        res.json(updated);
    }
    catch (err) {
        next(err);
    }
});
// POST /v2/api/affiliate/:code/content/:runId/submit — submit for approval
router.post('/:code/content/:runId/submit', auth_1.requireAuth, rbac_1.requireOwnAffiliate, async (req, res, next) => {
    try {
        const prisma = (0, prisma_1.getPrisma)();
        const run = await prisma.contentGenerationRun.findFirst({
            where: { id: req.params['runId'], businessId: req.actor.businessId },
        });
        if (!run)
            throw new errorHandler_1.AppError('NOT_FOUND', 'Content run not found.', 404);
        if (run.status === 'approved' || run.status === 'dispatched') {
            throw new errorHandler_1.AppError('FORBIDDEN', 'Already approved.', 403);
        }
        const updated = await prisma.contentGenerationRun.update({
            where: { id: run.id },
            data: {
                submittedForApproval: true,
                submittedAt: new Date(),
                status: 'scored', // stays scoreable — admin approves from here
            },
        });
        res.json(updated);
    }
    catch (err) {
        next(err);
    }
});
// POST /v2/api/affiliate/:code/content/:runId/attach-media — attach library asset
router.post('/:code/content/:runId/attach-media', auth_1.requireAuth, rbac_1.requireOwnAffiliate, async (req, res, next) => {
    try {
        const prisma = (0, prisma_1.getPrisma)();
        const { assetId } = req.body;
        if (!assetId)
            throw new errorHandler_1.AppError('NOT_FOUND', 'assetId required.', 422);
        const [run, asset] = await Promise.all([
            prisma.contentGenerationRun.findFirst({
                where: { id: req.params['runId'], businessId: req.actor.businessId },
            }),
            prisma.contentLibraryAsset.findFirst({
                where: { id: assetId, businessId: req.actor.businessId, active: true },
            }),
        ]);
        if (!run)
            throw new errorHandler_1.AppError('NOT_FOUND', 'Content run not found.', 404);
        if (!asset)
            throw new errorHandler_1.AppError('NOT_FOUND', 'Asset not found.', 404);
        await Promise.all([
            prisma.contentGenerationRun.update({ where: { id: run.id }, data: { mediaAssetId: assetId } }),
            prisma.contentLibraryAsset.update({ where: { id: assetId }, data: { usageCount: { increment: 1 } } }),
        ]);
        res.json({ ok: true, assetId });
    }
    catch (err) {
        next(err);
    }
});
// GET /v2/api/affiliate/:code/library — browse content library
router.get('/:code/library', auth_1.requireAuth, rbac_1.requireOwnAffiliate, async (req, res, next) => {
    try {
        const prisma = (0, prisma_1.getPrisma)();
        const type = req.query['type'];
        const tags = req.query['tags'];
        const assets = await prisma.contentLibraryAsset.findMany({
            where: {
                businessId: req.actor.businessId,
                active: true,
                ...(type ? { type } : {}),
                ...(tags ? { tags: { hasSome: tags.split(',') } } : {}),
            },
            orderBy: [{ usageCount: 'desc' }, { createdAt: 'desc' }],
            select: { id: true, type: true, url: true, thumbnailUrl: true, tags: true, filename: true, usageCount: true },
        });
        res.json({ assets });
    }
    catch (err) {
        next(err);
    }
});
// ── Module 05 — Content Calendar ──────────────────────────────────────────────
// GET /v2/api/affiliate/:code/instance — get personal settings
router.get('/:code/instance', auth_1.requireAuth, rbac_1.requireOwnAffiliate, async (req, res, next) => {
    try {
        const prisma = (0, prisma_1.getPrisma)();
        const affiliate = await findAffiliateScoped(prisma, req.params['code'], req.actor.businessId);
        let instance = await prisma.affiliateInstance.findUnique({ where: { affiliateId: affiliate.id } });
        if (!instance) {
            instance = await prisma.affiliateInstance.create({
                data: {
                    affiliateId: affiliate.id,
                    businessId: affiliate.businessId,
                    preferredPlatforms: ['linkedin'],
                    preferredPostTimes: { linkedin: ['08:00', '17:00'] },
                },
            });
        }
        res.json({ instance });
    }
    catch (err) {
        next(err);
    }
});
// PATCH /v2/api/affiliate/:code/instance — update personal settings
router.patch('/:code/instance', auth_1.requireAuth, rbac_1.requireOwnAffiliate, async (req, res, next) => {
    try {
        const prisma = (0, prisma_1.getPrisma)();
        const affiliate = await findAffiliateScoped(prisma, req.params['code'], req.actor.businessId);
        const { weeklyPostTarget, preferredPlatforms, preferredPostTimes, timezone, personalBio, contentThemes, avoidTopics, personalHashtags, onboardingComplete, } = req.body;
        const instance = await prisma.affiliateInstance.upsert({
            where: { affiliateId: affiliate.id },
            update: {
                ...(weeklyPostTarget !== undefined && { weeklyPostTarget }),
                ...(preferredPlatforms !== undefined && { preferredPlatforms }),
                ...(preferredPostTimes !== undefined && { preferredPostTimes }),
                ...(timezone !== undefined && { timezone }),
                ...(personalBio !== undefined && { personalBio }),
                ...(contentThemes !== undefined && { contentThemes }),
                ...(avoidTopics !== undefined && { avoidTopics }),
                ...(personalHashtags !== undefined && { personalHashtags }),
                ...(onboardingComplete !== undefined && { onboardingComplete }),
                updatedAt: new Date(),
            },
            create: {
                affiliateId: affiliate.id,
                businessId: affiliate.businessId,
                weeklyPostTarget: weeklyPostTarget ?? 5,
                preferredPlatforms: preferredPlatforms ?? ['linkedin'],
                preferredPostTimes: preferredPostTimes ?? { linkedin: ['08:00', '17:00'] },
                timezone: timezone ?? 'America/New_York',
                ...(personalBio !== undefined && { personalBio }),
                contentThemes: contentThemes ?? [],
                avoidTopics: avoidTopics ?? [],
                personalHashtags: personalHashtags ?? [],
                onboardingComplete: onboardingComplete ?? false,
            },
        });
        res.json({ instance });
    }
    catch (err) {
        next(err);
    }
});
// GET /v2/api/affiliate/:code/plan/current — current week plan
router.get('/:code/plan/current', auth_1.requireAuth, rbac_1.requireOwnAffiliate, async (req, res, next) => {
    try {
        const prisma = (0, prisma_1.getPrisma)();
        const affiliate = await findAffiliateScoped(prisma, req.params['code'], req.actor.businessId);
        const weekStart = (0, planGenerator_1.getMondayOf)(new Date());
        await (0, planGenerator_1.generateWeekPlan)(affiliate.id, affiliate.businessId, weekStart);
        const plan = await prisma.affiliateContentPlan.findUnique({
            where: { affiliateId_weekStartDate: { affiliateId: affiliate.id, weekStartDate: weekStart } },
            include: {
                slots: {
                    orderBy: { scheduledDate: 'asc' },
                    include: { contentRun: { include: { scores: { orderBy: { scoredAt: 'desc' }, take: 1 } } } },
                },
            },
        });
        res.json({ plan, weekStart: weekStart.toISOString() });
    }
    catch (err) {
        next(err);
    }
});
// GET /v2/api/affiliate/:code/plan?week=DATE — specific week plan
router.get('/:code/plan', auth_1.requireAuth, rbac_1.requireOwnAffiliate, async (req, res, next) => {
    try {
        const prisma = (0, prisma_1.getPrisma)();
        const affiliate = await findAffiliateScoped(prisma, req.params['code'], req.actor.businessId);
        const weekParam = req.query['week'];
        const weekStart = (0, planGenerator_1.getMondayOf)(weekParam ? new Date(weekParam) : new Date());
        await (0, planGenerator_1.generateWeekPlan)(affiliate.id, affiliate.businessId, weekStart);
        const plan = await prisma.affiliateContentPlan.findUnique({
            where: { affiliateId_weekStartDate: { affiliateId: affiliate.id, weekStartDate: weekStart } },
            include: {
                slots: {
                    orderBy: { scheduledDate: 'asc' },
                    include: { contentRun: { include: { scores: { orderBy: { scoredAt: 'desc' }, take: 1 } } } },
                },
            },
        });
        res.json({ plan, weekStart: weekStart.toISOString() });
    }
    catch (err) {
        next(err);
    }
});
// POST /v2/api/affiliate/:code/plan/slots/:slotId/manual — write own post
router.post('/:code/plan/slots/:slotId/manual', auth_1.requireAuth, rbac_1.requireOwnAffiliate, async (req, res, next) => {
    try {
        const prisma = (0, prisma_1.getPrisma)();
        const { content, note, mediaAssetId } = req.body;
        if (!content)
            throw new errorHandler_1.AppError('NOT_FOUND', 'content required.', 422);
        const slot = await prisma.contentSlot.findFirst({
            where: { id: req.params['slotId'], businessId: req.actor.businessId },
        });
        if (!slot)
            throw new errorHandler_1.AppError('NOT_FOUND', 'Slot not found.', 404);
        const updated = await prisma.contentSlot.update({
            where: { id: slot.id },
            data: {
                manualContent: content,
                status: 'written',
                ...(note !== undefined && { note }),
                ...(mediaAssetId !== undefined && { mediaAssetId }),
                updatedAt: new Date(),
            },
            include: { contentRun: true },
        });
        res.json({ slot: updated });
    }
    catch (err) {
        next(err);
    }
});
// POST /v2/api/affiliate/:code/plan/slots/:slotId/submit — submit slot
router.post('/:code/plan/slots/:slotId/submit', auth_1.requireAuth, rbac_1.requireOwnAffiliate, async (req, res, next) => {
    try {
        const prisma = (0, prisma_1.getPrisma)();
        const affiliate = await findAffiliateScoped(prisma, req.params['code'], req.actor.businessId);
        const slot = await prisma.contentSlot.findFirst({
            where: { id: req.params['slotId'], businessId: req.actor.businessId },
            include: { contentRun: true },
        });
        if (!slot)
            throw new errorHandler_1.AppError('NOT_FOUND', 'Slot not found.', 404);
        if (slot.manualContent && !slot.contentRunId) {
            // Create a ContentGenerationRun from manual content
            const profile = await prisma.affiliateProfile.findFirst({
                where: { affiliateId: affiliate.id },
                orderBy: { version: 'desc' },
            });
            if (!profile)
                throw new errorHandler_1.AppError('NOT_FOUND', 'Affiliate profile not found.', 404);
            const run = await prisma.contentGenerationRun.create({
                data: {
                    businessId: affiliate.businessId,
                    affiliateId: affiliate.id,
                    profileId: profile.id,
                    channel: slot.platform,
                    status: 'scored',
                    outputContent: slot.manualContent,
                    inputBrief: { source: 'manual' },
                    submittedForApproval: true,
                    submittedAt: new Date(),
                },
            });
            await prisma.contentSlot.update({
                where: { id: slot.id },
                data: { contentRunId: run.id, status: 'submitted' },
            });
            res.json({ slot: { ...slot, contentRunId: run.id, status: 'submitted' }, runId: run.id });
        }
        else if (slot.contentRunId) {
            // Submit existing run
            await Promise.all([
                prisma.contentGenerationRun.update({
                    where: { id: slot.contentRunId },
                    data: { submittedForApproval: true, submittedAt: new Date() },
                }),
                prisma.contentSlot.update({
                    where: { id: slot.id },
                    data: { status: 'submitted' },
                }),
            ]);
            res.json({ slot: { ...slot, status: 'submitted' } });
        }
        else {
            throw new errorHandler_1.AppError('NOT_FOUND', 'Slot has no content to submit.', 422);
        }
    }
    catch (err) {
        next(err);
    }
});
// DELETE /v2/api/affiliate/:code/plan/slots/:slotId — clear slot
router.delete('/:code/plan/slots/:slotId', auth_1.requireAuth, rbac_1.requireOwnAffiliate, async (req, res, next) => {
    try {
        const prisma = (0, prisma_1.getPrisma)();
        const slot = await prisma.contentSlot.findFirst({
            where: { id: req.params['slotId'], businessId: req.actor.businessId },
        });
        if (!slot)
            throw new errorHandler_1.AppError('NOT_FOUND', 'Slot not found.', 404);
        if (['approved', 'posted'].includes(slot.status)) {
            throw new errorHandler_1.AppError('FORBIDDEN', 'Cannot clear approved or posted slot.', 403);
        }
        await prisma.contentSlot.update({
            where: { id: slot.id },
            data: { manualContent: null, contentRunId: null, status: 'empty', note: null, mediaAssetId: null },
        });
        res.json({ ok: true });
    }
    catch (err) {
        next(err);
    }
});
// POST /v2/api/affiliate/:code/plan/slots/:slotId/generate — AI for single slot
router.post('/:code/plan/slots/:slotId/generate', auth_1.requireAuth, rbac_1.requireOwnAffiliate, rateLimit_1.generateContentLimit, async (req, res, next) => {
    try {
        const prisma = (0, prisma_1.getPrisma)();
        const affiliate = await findAffiliateScoped(prisma, req.params['code'], req.actor.businessId);
        const slot = await prisma.contentSlot.findFirst({
            where: { id: req.params['slotId'], businessId: req.actor.businessId },
        });
        if (!slot)
            throw new errorHandler_1.AppError('NOT_FOUND', 'Slot not found.', 404);
        if (!['empty', 'draft'].includes(slot.status)) {
            throw new errorHandler_1.AppError('FORBIDDEN', 'Slot already has content.', 409);
        }
        const profile = await prisma.affiliateProfile.findFirst({
            where: { affiliateId: affiliate.id },
            orderBy: { version: 'desc' },
        });
        if (!profile)
            throw new errorHandler_1.AppError('NOT_FOUND', 'Affiliate profile not found.', 404);
        const instance = await prisma.affiliateInstance.findUnique({ where: { affiliateId: affiliate.id } });
        const themeHint = instance?.contentThemes?.join(', ') ?? '';
        // Generate content via LLM synchronously so affiliate gets result immediately
        const slotBizConfig = await prisma.businessConfig.findUnique({ where: { businessId: affiliate.businessId } });
        const slotBrandName = slotBizConfig?.brandName ?? 'AlphaNoetics';
        const slotBrandVoice = slotBizConfig?.brandVoice ?? 'authentic, direct, and insight-driven';
        const slotLandingUrl = slotBizConfig?.landingPageUrl ?? env_1.env.APP_URL;
        const { llmClient } = await Promise.resolve().then(() => __importStar(require('../../integrations/llm/llmClient')));
        const optimisationHints = await (0, personalizationEngine_1.applyOptimisationToGeneration)(affiliate.businessId, { channel: slot.platform });
        const formatHint = optimisationHints.preferredFormat ? ` Use ${optimisationHints.preferredFormat} format.` : '';
        const themeInstruction = themeHint ? ` Topics to include: ${themeHint}.` : '';
        const baseContent = await llmClient.complete({
            model: env_1.env.GROQ_MODEL_CONTENT,
            systemPrompt: `You are a professional content writer for ${slotBrandName}. Brand voice: ${slotBrandVoice}. Write a ${slot.platform} post that helps career-focused professionals.${formatHint}${themeInstruction}`,
            userPrompt: `Write a compelling ${slot.platform} post about AI career acceleration and professional growth.`,
            maxTokens: 512,
            responseFormat: 'text',
            requestId: req.requestId,
        });
        const personalized = (0, personalizationEngine_1.personalize)({
            baseContent,
            channel: slot.platform,
            affiliateCode: affiliate.code,
            profile,
            tenantLandingUrl: slotLandingUrl,
        });
        const run = await prisma.contentGenerationRun.create({
            data: {
                businessId: affiliate.businessId,
                affiliateId: affiliate.id,
                profileId: profile.id,
                channel: slot.platform,
                status: 'scored',
                inputBrief: { source: 'calendar', slotId: slot.id, themes: themeHint },
                outputContent: personalized,
                personalizationSummary: { role: profile.role, painPoint: profile.painPoint },
            },
        });
        await prisma.contentSlot.update({
            where: { id: slot.id },
            data: { contentRunId: run.id, status: 'draft' },
        });
        // Score asynchronously
        setImmediate(async () => {
            try {
                const scores = await (0, contentScorer_1.scoreContent)({ content: personalized, channel: slot.platform });
                await prisma.contentScore.create({
                    data: {
                        runId: run.id,
                        qualityScore: scores.quality.total,
                        riskScore: scores.risk.total,
                        conversionScore: scores.conversion.total,
                        qualityBreakdown: scores.quality.breakdown,
                        riskBreakdown: scores.risk.breakdown,
                        conversionBreakdown: scores.conversion.breakdown,
                        label: scores.quality.total >= 80 ? 'strong' : scores.quality.total >= 60 ? 'acceptable' : 'revise',
                    },
                });
            }
            catch { /* non-critical */ }
        });
        res.status(201).json({ run, slotId: slot.id });
    }
    catch (err) {
        next(err);
    }
});
// POST /v2/api/affiliate/:code/plan/generate-week — AI fill empty slots
router.post('/:code/plan/generate-week', auth_1.requireAuth, rbac_1.requireOwnAffiliate, rateLimit_1.generateContentLimit, async (req, res, next) => {
    try {
        const prisma = (0, prisma_1.getPrisma)();
        const affiliate = await findAffiliateScoped(prisma, req.params['code'], req.actor.businessId);
        const weekStart = (0, planGenerator_1.getMondayOf)(new Date());
        await (0, planGenerator_1.generateWeekPlan)(affiliate.id, affiliate.businessId, weekStart);
        const plan = await prisma.affiliateContentPlan.findUnique({
            where: { affiliateId_weekStartDate: { affiliateId: affiliate.id, weekStartDate: weekStart } },
            include: { slots: { where: { status: 'empty' } } },
        });
        if (!plan || plan.slots.length === 0) {
            return res.json({ slotsQueued: 0, slotIds: [] });
        }
        const profile = await prisma.affiliateProfile.findFirst({
            where: { affiliateId: affiliate.id },
            orderBy: { version: 'desc' },
        });
        if (!profile)
            throw new errorHandler_1.AppError('NOT_FOUND', 'Affiliate profile not found.', 404);
        const instance = await prisma.affiliateInstance.findUnique({ where: { affiliateId: affiliate.id } });
        const themeHint = instance?.contentThemes?.join(', ') ?? '';
        const slotIds = [];
        for (const slot of plan.slots) {
            const run = await prisma.contentGenerationRun.create({
                data: {
                    businessId: affiliate.businessId,
                    affiliateId: affiliate.id,
                    profileId: profile.id,
                    channel: slot.platform,
                    status: 'generating',
                    inputBrief: { source: 'calendar', slotId: slot.id, themes: themeHint },
                },
            });
            await prisma.contentSlot.update({ where: { id: slot.id }, data: { contentRunId: run.id, status: 'draft' } });
            await (0, queues_1.getQueues)()['v2-content-score'].add('score', {
                runId: run.id,
                affiliateId: affiliate.id,
                channel: slot.platform,
                content: '',
            });
            slotIds.push(slot.id);
        }
        return res.json({ slotsQueued: slotIds.length, slotIds });
    }
    catch (err) {
        next(err);
    }
});
async function hardDeleteAffiliate(affiliateCode, actorId) {
    const prisma = (0, prisma_1.getPrisma)();
    const affiliate = await prisma.affiliate.findUnique({ where: { code: affiliateCode } });
    if (!affiliate)
        throw new errorHandler_1.AppError('NOT_FOUND', 'Affiliate not found.', 404);
    // 1. Enqueue Zoho deletion
    try {
        await (0, queues_1.getQueues)()['v2-provider-delete'].add('delete', {
            affiliateCode,
            zohoFolderId: undefined, // will be resolved from Redis cache
        });
    }
    catch { /* continue with DB deletion regardless */ }
    // 2–11. Hard delete all records in order
    await prisma.contentMediaAsset.deleteMany({ where: { affiliateId: affiliate.id } });
    await prisma.mediaGenerationJob.deleteMany({ where: { affiliateId: affiliate.id } });
    const runs = await prisma.contentGenerationRun.findMany({ where: { affiliateId: affiliate.id }, select: { id: true } });
    const runIds = runs.map((r) => r.id);
    if (runIds.length > 0) {
        await prisma.contentScore.deleteMany({ where: { runId: { in: runIds } } });
    }
    await prisma.contentGenerationRun.deleteMany({ where: { affiliateId: affiliate.id } });
    await prisma.profileExtraction.deleteMany({ where: { affiliateId: affiliate.id } });
    await prisma.resumeProcessingJob.deleteMany({ where: { affiliateId: affiliate.id } });
    await prisma.profileAsset.deleteMany({ where: { affiliateId: affiliate.id } });
    await prisma.affiliateProfile.deleteMany({ where: { affiliateId: affiliate.id } });
    await prisma.conversionEvent.deleteMany({ where: { affiliateId: affiliate.id } });
    await prisma.affiliate.delete({ where: { id: affiliate.id } });
    // 12. Flush Redis cache
    const { getRedis } = await Promise.resolve().then(() => __importStar(require('../../lib/redis')));
    const redis = getRedis();
    const keys = await redis.keys(`v2:*:${affiliateCode}:*`);
    if (keys.length > 0)
        await redis.del(...keys);
    await redis.del(`v2:zoho:folder:${affiliateCode}`);
    // 13. Write final AuditLog (survives deletion)
    await prisma.auditLog.create({
        data: {
            actorType: actorId === 'self' ? 'affiliate' : 'admin',
            actorId,
            action: 'affiliate_hard_deleted',
            entityType: 'Affiliate',
            entityId: affiliateCode,
            changes: { deletedAt: new Date().toISOString(), affiliateCode },
        },
    });
    logger_1.logger.info({ module: 'hardDelete', affiliateCode, actorId }, 'Affiliate hard delete complete');
}
// GET /v2/api/affiliate/:code/performance
router.get('/:code/performance', auth_1.requireAuth, async (req, res, next) => {
    try {
        const { getAffiliatePerformance } = await Promise.resolve().then(() => __importStar(require('../dashboard/dashboardRoutes.js')));
        return getAffiliatePerformance(req, res);
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
//# sourceMappingURL=profileRoutes.js.map