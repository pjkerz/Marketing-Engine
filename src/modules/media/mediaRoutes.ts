import { Router, Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { getPrisma } from '../../lib/prisma';
import { AppError } from '../../middleware/errorHandler';
import { requireAuth } from '../../middleware/auth';
import { requireOwnAffiliate } from '../../middleware/rbac';
import { generateImageLimit } from '../../middleware/rateLimit';
import { idempotency } from '../../lib/idempotency';
import { zohoClient } from '../../integrations/zoho/zohoClient';
import { generateImageCandidates } from './geminiImageClient';
import { getQueues } from '../../queues';
import { env } from '../../config/env';
import { randomBytes } from 'crypto';

const router = Router();

// GET /v2/api/affiliate/:code/media/browse
router.get(
  '/:code/media/browse',
  requireAuth,
  requireOwnAffiliate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 50;
      const source = req.query.source as string ?? 'affiliate'; // "affiliate" | "shared"

      let result;
      if (source === 'shared') {
        result = await zohoClient.browseSharedMediaLibrary({ page, limit });
      } else {
        result = await zohoClient.browseAffiliateMediaFolder({ affiliateCode: req.params["code"] as string, page, limit });
      }

      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

// POST /v2/api/affiliate/:code/content/:runId/media/attach
router.post(
  '/:code/content/:runId/media/attach',
  requireAuth,
  requireOwnAffiliate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const prisma = getPrisma();
      const affiliate = await prisma.affiliate.findUnique({ where: { code: req.params["code"] as string } });
      if (!affiliate) throw new AppError('NOT_FOUND', 'Affiliate not found.', 404);

      const run = await prisma.contentGenerationRun.findUnique({ where: { id: req.params["runId"] as string } });
      if (!run) throw new AppError('NOT_FOUND', 'Content run not found.', 404);

      const body = req.body as { zohoFileId: string; mimeType?: string };
      if (!body.zohoFileId) throw new AppError('NOT_FOUND', 'zohoFileId is required.', 422);

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
    } catch (err) {
      next(err);
    }
  },
);

// POST /v2/api/affiliate/:code/media/generate
router.post(
  '/:code/media/generate',
  requireAuth,
  requireOwnAffiliate,
  generateImageLimit,
  idempotency,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const prisma = getPrisma();
      const affiliate = await prisma.affiliate.findUnique({ where: { code: req.params["code"] as string } });
      if (!affiliate) throw new AppError('NOT_FOUND', 'Affiliate not found.', 404);

      const body = req.body as { prompt: string; aspectRatio?: '9:16' | '1:1' | '16:9'; generationRunId?: string };
      if (!body.prompt) throw new AppError('NOT_FOUND', 'prompt is required.', 422);

      // Enforce regen limit per run
      if (body.generationRunId) {
        const existingJobs = await prisma.mediaGenerationJob.count({
          where: {
            affiliateId: affiliate.id,
            generationRunId: body.generationRunId,
            status: { not: 'failed' },
          },
        });
        if (existingJobs >= env.GOOGLE_AI_IMAGE_MAX_GENERATIONS_PER_RUN) {
          throw new AppError(
            'MEDIA_REGEN_LIMIT_REACHED',
            `You have reached the maximum of ${env.GOOGLE_AI_IMAGE_MAX_GENERATIONS_PER_RUN} image generation attempts for this post.`,
            429,
          );
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
        const candidates = await generateImageCandidates({
          prompt: body.prompt,
          aspectRatio: body.aspectRatio ?? '1:1',
          numberOfImages: 4,
          requestId: req.requestId,
        });

        await prisma.mediaGenerationJob.update({
          where: { id: job.id },
          data: {
            status: 'preview_ready',
            candidatesBase64: candidates as unknown as Prisma.JsonArray,
          },
        });

        // Schedule cleanup after 24h
        await getQueues()['v2-media-cleanup'].add('cleanup', { mediaJobId: job.id }, {
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
      } catch (err) {
        await prisma.mediaGenerationJob.update({
          where: { id: job.id },
          data: { status: 'failed', errorCode: (err as AppError).code ?? 'INTERNAL_ERROR', errorMessage: (err as Error).message },
        });
        throw err;
      }
    } catch (err) {
      next(err);
    }
  },
);

// POST /v2/api/affiliate/:code/media/generate/:jobId/approve
router.post(
  '/:code/media/generate/:jobId/approve',
  requireAuth,
  requireOwnAffiliate,
  idempotency,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const prisma = getPrisma();
      const affiliate = await prisma.affiliate.findUnique({ where: { code: req.params["code"] as string } });
      if (!affiliate) throw new AppError('NOT_FOUND', 'Affiliate not found.', 404);

      const job = await prisma.mediaGenerationJob.findUnique({ where: { id: req.params["jobId"] as string } });
      if (!job) throw new AppError('NOT_FOUND', 'Media job not found.', 404);
      if (job.status === 'expired') throw new AppError('MEDIA_JOB_EXPIRED', 'Image candidates have expired.', 410);
      if (job.affiliateId !== affiliate.id) throw new AppError('FORBIDDEN', 'Access denied.', 403);

      const body = req.body as { candidateId: string; runId?: string };
      if (!body.candidateId) throw new AppError('NOT_FOUND', 'candidateId is required.', 422);

      const candidates = (job.candidatesBase64 as Array<{ candidateId: string; base64Data: string; mimeType: string }>) ?? [];
      const selected = candidates.find((c) => c.candidateId === body.candidateId);
      if (!selected) throw new AppError('NOT_FOUND', 'Candidate not found.', 404);

      // Save to Google Drive
      const fileName = `generated_${Date.now()}_${randomBytes(4).toString('hex')}.jpg`;
      const gdriveResult = await zohoClient.uploadGeneratedImageToZoho({
        affiliateCode: req.params["code"] as string,
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
          candidatesBase64: Prisma.JsonNull, // discard all
        },
      });

      // Create ContentMediaAsset if linked to a run
      let assetId: string | null = null;
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
    } catch (err) {
      next(err);
    }
  },
);

// DELETE /v2/api/affiliate/:code/media/:assetId
router.delete(
  '/:code/media/:assetId',
  requireAuth,
  requireOwnAffiliate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const prisma = getPrisma();
      const affiliate = await prisma.affiliate.findUnique({ where: { code: req.params["code"] as string } });
      if (!affiliate) throw new AppError('NOT_FOUND', 'Affiliate not found.', 404);

      const asset = await prisma.contentMediaAsset.findFirst({
        where: { id: req.params["assetId"] as string, affiliateId: affiliate.id },
      });
      if (!asset) throw new AppError('NOT_FOUND', 'Media asset not found.', 404);

      if (asset.zohoFileId) {
        await zohoClient.deleteFile(asset.zohoFileId);
      }
      await prisma.contentMediaAsset.delete({ where: { id: asset.id } });

      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },
);

// GET /v2/api/affiliate/:code/media/:assetId/thumbnail
router.get(
  '/:code/media/:assetId/thumbnail',
  requireAuth,
  requireOwnAffiliate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const prisma = getPrisma();
      const affiliate = await prisma.affiliate.findUnique({ where: { code: req.params["code"] as string } });
      if (!affiliate) throw new AppError('NOT_FOUND', 'Affiliate not found.', 404);

      const asset = await prisma.contentMediaAsset.findFirst({
        where: { id: req.params["assetId"] as string, affiliateId: affiliate.id },
      });
      if (!asset) throw new AppError('NOT_FOUND', 'Asset not found.', 404);
      if (!asset.zohoFileId) throw new AppError('NOT_FOUND', 'No Zoho file associated.', 404);

      // Proxy thumbnail from Zoho — never return raw Zoho URLs
      res.json({ zohoFileId: asset.zohoFileId, proxied: true });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
