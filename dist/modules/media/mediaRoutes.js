"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const client_1 = require("@prisma/client");
const prisma_1 = require("../../lib/prisma");
const errorHandler_1 = require("../../middleware/errorHandler");
const auth_1 = require("../../middleware/auth");
const rbac_1 = require("../../middleware/rbac");
const rateLimit_1 = require("../../middleware/rateLimit");
const idempotency_1 = require("../../lib/idempotency");
const zohoClient_1 = require("../../integrations/zoho/zohoClient");
const geminiImageClient_1 = require("./geminiImageClient");
const queues_1 = require("../../queues");
const env_1 = require("../../config/env");
const crypto_1 = require("crypto");
const router = (0, express_1.Router)();
// GET /v2/api/affiliate/:code/media/browse
router.get('/:code/media/browse', auth_1.requireAuth, rbac_1.requireOwnAffiliate, async (req, res, next) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const source = req.query.source ?? 'affiliate'; // "affiliate" | "shared"
        let result;
        if (source === 'shared') {
            result = await zohoClient_1.zohoClient.browseSharedMediaLibrary({ page, limit });
        }
        else {
            result = await zohoClient_1.zohoClient.browseAffiliateMediaFolder({ affiliateCode: req.params["code"], page, limit });
        }
        res.json(result);
    }
    catch (err) {
        next(err);
    }
});
// POST /v2/api/affiliate/:code/content/:runId/media/attach
router.post('/:code/content/:runId/media/attach', auth_1.requireAuth, rbac_1.requireOwnAffiliate, async (req, res, next) => {
    try {
        const prisma = (0, prisma_1.getPrisma)();
        const affiliate = await prisma.affiliate.findUnique({ where: { code: req.params["code"] } });
        if (!affiliate)
            throw new errorHandler_1.AppError('NOT_FOUND', 'Affiliate not found.', 404);
        const run = await prisma.contentGenerationRun.findUnique({ where: { id: req.params["runId"] } });
        if (!run)
            throw new errorHandler_1.AppError('NOT_FOUND', 'Content run not found.', 404);
        const body = req.body;
        if (!body.zohoFileId)
            throw new errorHandler_1.AppError('NOT_FOUND', 'zohoFileId is required.', 422);
        const asset = await prisma.contentMediaAsset.create({
            data: {
                runId: run.id,
                affiliateId: affiliate.id,
                assetType: 'picked',
                zohoFileId: body.zohoFileId,
                mimeType: body.mimeType,
            },
        });
        res.status(201).json({ assetId: asset.id });
    }
    catch (err) {
        next(err);
    }
});
// POST /v2/api/affiliate/:code/media/generate
router.post('/:code/media/generate', auth_1.requireAuth, rbac_1.requireOwnAffiliate, rateLimit_1.generateImageLimit, idempotency_1.idempotency, async (req, res, next) => {
    try {
        const prisma = (0, prisma_1.getPrisma)();
        const affiliate = await prisma.affiliate.findUnique({ where: { code: req.params["code"] } });
        if (!affiliate)
            throw new errorHandler_1.AppError('NOT_FOUND', 'Affiliate not found.', 404);
        const body = req.body;
        if (!body.prompt)
            throw new errorHandler_1.AppError('NOT_FOUND', 'prompt is required.', 422);
        // Enforce regen limit per run
        if (body.generationRunId) {
            const existingJobs = await prisma.mediaGenerationJob.count({
                where: {
                    affiliateId: affiliate.id,
                    generationRunId: body.generationRunId,
                    status: { not: 'failed' },
                },
            });
            if (existingJobs >= env_1.env.GOOGLE_AI_IMAGE_MAX_GENERATIONS_PER_RUN) {
                throw new errorHandler_1.AppError('MEDIA_REGEN_LIMIT_REACHED', `You have reached the maximum of ${env_1.env.GOOGLE_AI_IMAGE_MAX_GENERATIONS_PER_RUN} image generation attempts for this post.`, 429);
            }
        }
        // Create job
        const job = await prisma.mediaGenerationJob.create({
            data: {
                affiliateId: affiliate.id,
                generationRunId: body.generationRunId,
                prompt: body.prompt,
                aspectRatio: body.aspectRatio ?? '1:1',
                numberOfImages: 4,
                status: 'pending',
                expiresAt: new Date(Date.now() + 86400 * 1000), // 24h
            },
        });
        // Generate candidates
        try {
            const candidates = await (0, geminiImageClient_1.generateImageCandidates)({
                prompt: body.prompt,
                aspectRatio: body.aspectRatio ?? '1:1',
                numberOfImages: 4,
                requestId: req.requestId,
            });
            await prisma.mediaGenerationJob.update({
                where: { id: job.id },
                data: {
                    status: 'preview_ready',
                    candidatesBase64: candidates,
                },
            });
            // Schedule cleanup after 24h
            await (0, queues_1.getQueues)()['v2-media-cleanup'].add('cleanup', { mediaJobId: job.id }, {
                delay: 86400 * 1000,
            });
            // Return base64 URIs (do NOT save to Zoho yet)
            res.status(201).json({
                jobId: job.id,
                status: 'preview_ready',
                candidates: candidates.map((c) => ({
                    candidateId: c.candidateId,
                    dataUri: `data:${c.mimeType};base64,${c.base64Data}`,
                })),
            });
        }
        catch (err) {
            await prisma.mediaGenerationJob.update({
                where: { id: job.id },
                data: { status: 'failed', errorCode: err.code ?? 'INTERNAL_ERROR', errorMessage: err.message },
            });
            throw err;
        }
    }
    catch (err) {
        next(err);
    }
});
// POST /v2/api/affiliate/:code/media/generate/:jobId/approve
router.post('/:code/media/generate/:jobId/approve', auth_1.requireAuth, rbac_1.requireOwnAffiliate, idempotency_1.idempotency, async (req, res, next) => {
    try {
        const prisma = (0, prisma_1.getPrisma)();
        const affiliate = await prisma.affiliate.findUnique({ where: { code: req.params["code"] } });
        if (!affiliate)
            throw new errorHandler_1.AppError('NOT_FOUND', 'Affiliate not found.', 404);
        const job = await prisma.mediaGenerationJob.findUnique({ where: { id: req.params["jobId"] } });
        if (!job)
            throw new errorHandler_1.AppError('NOT_FOUND', 'Media job not found.', 404);
        if (job.status === 'expired')
            throw new errorHandler_1.AppError('MEDIA_JOB_EXPIRED', 'Image candidates have expired.', 410);
        if (job.affiliateId !== affiliate.id)
            throw new errorHandler_1.AppError('FORBIDDEN', 'Access denied.', 403);
        const body = req.body;
        if (!body.candidateId)
            throw new errorHandler_1.AppError('NOT_FOUND', 'candidateId is required.', 422);
        const candidates = job.candidatesBase64 ?? [];
        const selected = candidates.find((c) => c.candidateId === body.candidateId);
        if (!selected)
            throw new errorHandler_1.AppError('NOT_FOUND', 'Candidate not found.', 404);
        // Save to Google Drive
        const fileName = `generated_${Date.now()}_${(0, crypto_1.randomBytes)(4).toString('hex')}.jpg`;
        const gdriveResult = await zohoClient_1.zohoClient.uploadGeneratedImageToZoho({
            affiliateCode: req.params["code"],
            base64Data: selected.base64Data,
            mimeType: selected.mimeType,
            fileName,
        });
        // Update job — discard all candidates
        await prisma.mediaGenerationJob.update({
            where: { id: job.id },
            data: {
                status: 'approved',
                selectedCandidateId: body.candidateId,
                candidatesBase64: client_1.Prisma.JsonNull, // discard all
            },
        });
        // Create ContentMediaAsset if linked to a run
        let assetId = null;
        if (body.runId) {
            const asset = await prisma.contentMediaAsset.create({
                data: {
                    runId: body.runId,
                    affiliateId: affiliate.id,
                    assetType: 'generated',
                    zohoFileId: gdriveResult.fileId,
                    mimeType: selected.mimeType,
                    aspectRatio: job.aspectRatio,
                },
            });
            assetId = asset.id;
        }
        res.json({ approved: true, zohoFileId: gdriveResult.fileId, assetId });
    }
    catch (err) {
        next(err);
    }
});
// DELETE /v2/api/affiliate/:code/media/:assetId
router.delete('/:code/media/:assetId', auth_1.requireAuth, rbac_1.requireOwnAffiliate, async (req, res, next) => {
    try {
        const prisma = (0, prisma_1.getPrisma)();
        const affiliate = await prisma.affiliate.findUnique({ where: { code: req.params["code"] } });
        if (!affiliate)
            throw new errorHandler_1.AppError('NOT_FOUND', 'Affiliate not found.', 404);
        const asset = await prisma.contentMediaAsset.findFirst({
            where: { id: req.params["assetId"], affiliateId: affiliate.id },
        });
        if (!asset)
            throw new errorHandler_1.AppError('NOT_FOUND', 'Media asset not found.', 404);
        if (asset.zohoFileId) {
            await zohoClient_1.zohoClient.deleteFile(asset.zohoFileId);
        }
        await prisma.contentMediaAsset.delete({ where: { id: asset.id } });
        res.status(204).send();
    }
    catch (err) {
        next(err);
    }
});
// GET /v2/api/affiliate/:code/media/:assetId/thumbnail
router.get('/:code/media/:assetId/thumbnail', auth_1.requireAuth, rbac_1.requireOwnAffiliate, async (req, res, next) => {
    try {
        const prisma = (0, prisma_1.getPrisma)();
        const affiliate = await prisma.affiliate.findUnique({ where: { code: req.params["code"] } });
        if (!affiliate)
            throw new errorHandler_1.AppError('NOT_FOUND', 'Affiliate not found.', 404);
        const asset = await prisma.contentMediaAsset.findFirst({
            where: { id: req.params["assetId"], affiliateId: affiliate.id },
        });
        if (!asset)
            throw new errorHandler_1.AppError('NOT_FOUND', 'Asset not found.', 404);
        if (!asset.zohoFileId)
            throw new errorHandler_1.AppError('NOT_FOUND', 'No Zoho file associated.', 404);
        // Proxy thumbnail from Zoho — never return raw Zoho URLs
        res.json({ zohoFileId: asset.zohoFileId, proxied: true });
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
//# sourceMappingURL=mediaRoutes.js.map