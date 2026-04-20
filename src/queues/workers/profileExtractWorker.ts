import { Worker, Job } from 'bullmq';
import { z } from 'zod';
import { getBullRedis } from '../../lib/redis';
import { logger } from '../../lib/logger';
import { getPrisma } from '../../lib/prisma';
import { llmClient, LLMExtractionError } from '../../integrations/llm/llmClient';
import { decrypt } from '../../lib/encryption';
import { env } from '../../config/env';

interface ProfileExtractJobData {
  jobId: string;
  affiliateId: string;
  assetId: string;
  encryptedText: string;
}

const ProfileExtractionSchema = z.object({
  role: z.string().nullable(),
  seniority: z.string().nullable(),
  industries: z.array(z.string()).default([]),
  skills: z.array(z.string()).default([]),
  authority_signal: z.string().nullable(),
  pain_point: z.string().nullable(),
  tone_defaults: z.object({
    directness: z.number().min(0).max(1).default(0.6),
    provocation: z.number().min(0).max(1).default(0.3),
  }),
  confidence: z.number().min(0).max(1).default(0.5),
});

const SYSTEM_PROMPT = `Extract structured professional profile signals from the resume text below.
Return valid JSON only. No commentary. No markdown. No explanation.
If a field is uncertain, return null rather than guessing.`;

let worker: Worker | null = null;

export function startProfileExtractWorker(): Worker {
  const connection = getBullRedis();
  const prisma = getPrisma();

  worker = new Worker(
    'v2-profile-extract',
    async (job: Job<ProfileExtractJobData>) => {
      const { jobId, affiliateId, assetId, encryptedText } = job.data;
      const requestId = `profile-extract:${jobId}`;

      logger.info({ module: 'profileExtractWorker', action: 'start', jobId, affiliateId }, 'Starting profile extraction');

      // Create extraction record
      const extraction = await prisma.profileExtraction.create({
        data: { affiliateId, resumeJobId: jobId, status: 'pending' },
      });

      const resumeText = decrypt(encryptedText);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let extracted!: any;
      let repairAttempted = false;

      try {
        extracted = await llmClient.completeValidated({
          model: env.GROQ_MODEL_EXTRACT,
          systemPrompt: SYSTEM_PROMPT,
          userPrompt: resumeText,
          maxTokens: 1024,
          schema: ProfileExtractionSchema,
          requestId,
        });
      } catch (err) {
        repairAttempted = err instanceof LLMExtractionError;
        const errorCode = err instanceof LLMExtractionError
          ? (err.code === 'INVALID_JSON' ? 'EXTRACTION_INVALID_JSON' : 'EXTRACTION_SCHEMA_INVALID')
          : 'EXTRACTION_INVALID_JSON';

        await prisma.profileExtraction.update({
          where: { id: extraction.id },
          data: { status: 'failed', errorCode, repairAttempted },
        });

        await prisma.auditLog.create({
          data: {
            actorType: 'system',
            action: 'extraction_failed',
            entityType: 'ProfileExtraction',
            entityId: extraction.id,
            changes: { errorCode, affiliateId },
          },
        });

        throw err;
      }

      // Save extraction result
      await prisma.profileExtraction.update({
        where: { id: extraction.id },
        data: {
          status: 'done',
          normalizedOutput: extracted,
          repairAttempted,
        },
      });

      // Create or update AffiliateProfile
      const existingProfile = await prisma.affiliateProfile.findFirst({
        where: { affiliateId, status: 'active' },
        orderBy: { version: 'desc' },
      });

      const newVersion = (existingProfile?.version ?? 0) + 1;
      await prisma.affiliateProfile.create({
        data: {
          affiliateId,
          version: newVersion,
          source: 'resume',
          status: 'active',
          role: extracted.role,
          seniority: extracted.seniority,
          industries: extracted.industries ?? [],
          skills: extracted.skills ?? [],
          authoritySignal: extracted.authority_signal,
          painPoint: extracted.pain_point,
          directness: extracted.tone_defaults.directness,
          provocation: extracted.tone_defaults.provocation,
          confidence: extracted.confidence,
          extractionId: extraction.id,
        },
      });

      logger.info({ module: 'profileExtractWorker', action: 'complete', jobId, affiliateId }, 'Profile extraction complete');
    },
    { connection, concurrency: 2 });


  worker.on('failed', async (job, err) => {
    if (!job) return;
    logger.error({ module: 'profileExtractWorker', jobId: job.data.jobId, err: err.message }, 'Profile extract failed');
    if (job.attemptsMade >= 2) {
      const prisma = getPrisma();
      await prisma.auditLog.create({
        data: {
          actorType: 'system',
          action: 'job_dead_lettered',
          entityType: 'ProfileExtraction',
          entityId: `job:${job.data.jobId}`,
          changes: { error: err.message, affiliateId: job.data.affiliateId },
        },
      });
    }
  });

  logger.info({ module: 'profileExtractWorker' }, 'Profile extract worker started');
  return worker;
}

export async function stopProfileExtractWorker(): Promise<void> {
  if (worker) {
    await worker.close();
    worker = null;
  }
}
