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
exports.startResumeParseWorker = startResumeParseWorker;
exports.stopResumeParseWorker = stopResumeParseWorker;
const bullmq_1 = require("bullmq");
const redis_1 = require("../../lib/redis");
const logger_1 = require("../../lib/logger");
const prisma_1 = require("../../lib/prisma");
const resumeParser_1 = require("../../upload/resumeParser");
const encryption_1 = require("../../lib/encryption");
const zohoClient_1 = require("../../integrations/zoho/zohoClient");
let worker = null;
function startResumeParseWorker() {
    const connection = (0, redis_1.getBullRedis)();
    const prisma = (0, prisma_1.getPrisma)();
    worker = new bullmq_1.Worker('v2-resume-parse', async (job) => {
        const { jobId, affiliateId, affiliateCode, assetId, tempFilePath, fileName, mimeType } = job.data;
        const requestId = `resume-parse:${jobId}`;
        logger_1.logger.info({ module: 'resumeParseWorker', action: 'start', jobId, affiliateId }, 'Starting resume parse');
        await prisma.resumeProcessingJob.update({
            where: { id: jobId },
            data: { status: 'processing', attempts: { increment: 1 } },
        });
        // 1. Parse file
        const parsed = await (0, resumeParser_1.parseResume)(tempFilePath, mimeType);
        const truncatedText = parsed.text.slice(0, 6000);
        // 2. Upload to Google Drive
        let gdriveResult;
        try {
            gdriveResult = await zohoClient_1.zohoClient.uploadResumeToZoho({
                affiliateCode,
                filePath: tempFilePath,
                fileName,
                mimeType,
            });
        }
        catch (err) {
            logger_1.logger.warn({ module: 'resumeParseWorker', action: 'driveUploadFailed', jobId, err }, 'Drive upload failed');
            gdriveResult = null;
        }
        // 3. Store encrypted resume text in ProfileAsset metadata
        const encryptedText = (0, encryption_1.encrypt)(truncatedText);
        await prisma.profileAsset.update({
            where: { id: assetId },
            data: {
                zohoFileId: gdriveResult?.fileId, // field reused for Drive file ID
                zohoFolderId: gdriveResult?.folderId, // field reused for Drive folder ID
                metadata: { encryptedResumeText: encryptedText, pageCount: parsed.pageCount },
            },
        });
        // 4. Update job status
        await prisma.resumeProcessingJob.update({
            where: { id: jobId },
            data: {
                status: 'done',
                parseResult: { charCount: parsed.text.length, pageCount: parsed.pageCount },
            },
        });
        logger_1.logger.info({ module: 'resumeParseWorker', action: 'complete', requestId, jobId }, 'Resume parse complete');
        // 5. Enqueue profile extraction
        const { getQueues } = await Promise.resolve().then(() => __importStar(require('../index')));
        await getQueues()['v2-profile-extract'].add('extract', {
            jobId,
            affiliateId,
            assetId,
            encryptedText,
        });
    }, {
        connection,
        concurrency: 2
    });
    worker.on('failed', async (job, err) => {
        if (!job)
            return;
        logger_1.logger.error({ module: 'resumeParseWorker', jobId: job.data.jobId, err: err.message }, 'Resume parse job failed');
        const prisma = (0, prisma_1.getPrisma)();
        await prisma.resumeProcessingJob.update({
            where: { id: job.data.jobId },
            data: { status: 'failed', errorCode: 'UPLOAD_PARSE_FAILED', errorMessage: err.message },
        });
        // Write to AuditLog on max attempts
        if (job.attemptsMade >= 3) {
            await prisma.auditLog.create({
                data: {
                    actorType: 'system',
                    action: 'job_dead_lettered',
                    entityType: 'ResumeProcessingJob',
                    entityId: job.data.jobId,
                    changes: { error: err.message, attemptsMade: job.attemptsMade },
                },
            });
        }
    });
    logger_1.logger.info({ module: 'resumeParseWorker' }, 'Resume parse worker started');
    return worker;
}
async function stopResumeParseWorker() {
    if (worker) {
        await worker.close();
        worker = null;
    }
}
//# sourceMappingURL=resumeParseWorker.js.map