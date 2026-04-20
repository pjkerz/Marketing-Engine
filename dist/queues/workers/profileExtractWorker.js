"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startProfileExtractWorker = startProfileExtractWorker;
exports.stopProfileExtractWorker = stopProfileExtractWorker;
const bullmq_1 = require("bullmq");
const zod_1 = require("zod");
const redis_1 = require("../../lib/redis");
const logger_1 = require("../../lib/logger");
const prisma_1 = require("../../lib/prisma");
const llmClient_1 = require("../../integrations/llm/llmClient");
const encryption_1 = require("../../lib/encryption");
const env_1 = require("../../config/env");
const ProfileExtractionSchema = zod_1.z.object({
    role: zod_1.z.string().nullable(),
    seniority: zod_1.z.string().nullable(),
    industries: zod_1.z.array(zod_1.z.string()).default([]),
    skills: zod_1.z.array(zod_1.z.string()).default([]),
    authority_signal: zod_1.z.string().nullable(),
    pain_point: zod_1.z.string().nullable(),
    tone_defaults: zod_1.z.object({
        directness: zod_1.z.number().min(0).max(1).default(0.6),
        provocation: zod_1.z.number().min(0).max(1).default(0.3),
    }),
    confidence: zod_1.z.number().min(0).max(1).default(0.5),
});
const SYSTEM_PROMPT = `Extract structured professional profile signals from the resume text below.
Return valid JSON only. No commentary. No markdown. No explanation.
If a field is uncertain, return null rather than guessing.`;
let worker = null;
function startProfileExtractWorker() {
    const connection = (0, redis_1.getBullRedis)();
    const prisma = (0, prisma_1.getPrisma)();
    worker = new bullmq_1.Worker('v2-profile-extract', async (job) => {
        const { jobId, affiliateId, assetId, encryptedText } = job.data;
        const requestId = `profile-extract:${jobId}`;
        logger_1.logger.info({ module: 'profileExtractWorker', action: 'start', jobId, affiliateId }, 'Starting profile extraction');
        // Create extraction record
        const extraction = await prisma.profileExtraction.create({
            data: { affiliateId, resumeJobId: jobId, status: 'pending' },
        });
        const resumeText = (0, encryption_1.decrypt)(encryptedText);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let extracted;
        let repairAttempted = false;
        try {
            extracted = await llmClient_1.llmClient.completeValidated({
                model: env_1.env.GROQ_MODEL_EXTRACT,
                systemPrompt: SYSTEM_PROMPT,
                userPrompt: resumeText,
                maxTokens: 1024,
                schema: ProfileExtractionSchema,
                requestId,
            });
        }
        catch (err) {
            repairAttempted = err instanceof llmClient_1.LLMExtractionError;
            const errorCode = err instanceof llmClient_1.LLMExtractionError
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
        logger_1.logger.info({ module: 'profileExtractWorker', action: 'complete', jobId, affiliateId }, 'Profile extraction complete');
    }, { connection, concurrency: 2 });
    worker.on('failed', async (job, err) => {
        if (!job)
            return;
        logger_1.logger.error({ module: 'profileExtractWorker', jobId: job.data.jobId, err: err.message }, 'Profile extract failed');
        if (job.attemptsMade >= 2) {
            const prisma = (0, prisma_1.getPrisma)();
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
    logger_1.logger.info({ module: 'profileExtractWorker' }, 'Profile extract worker started');
    return worker;
}
async function stopProfileExtractWorker() {
    if (worker) {
        await worker.close();
        worker = null;
    }
}
//# sourceMappingURL=profileExtractWorker.js.map