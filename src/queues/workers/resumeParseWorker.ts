import { Worker, Job } from 'bullmq';
import { getBullRedis } from '../../lib/redis';
import { logger } from '../../lib/logger';
import { getPrisma } from '../../lib/prisma';
import { parseResume } from '../../upload/resumeParser';
import { encrypt } from '../../lib/encryption';
import { zohoClient } from '../../integrations/zoho/zohoClient';

export interface ResumeParseJobData {
  jobId: string;
  affiliateCode: string;
  affiliateId: string;
  assetId: string;
  tempFilePath: string;
  fileName: string;
  mimeType: string;
}

let worker: Worker | null = null;

export function startResumeParseWorker(): Worker {
  const connection = getBullRedis();
  const prisma = getPrisma();

  worker = new Worker(
    'v2-resume-parse',
    async (job: Job<ResumeParseJobData>) => {
      const { jobId, affiliateId, affiliateCode, assetId, tempFilePath, fileName, mimeType } = job.data;
      const requestId = `resume-parse:${jobId}`;

      logger.info({ module: 'resumeParseWorker', action: 'start', jobId, affiliateId }, 'Starting resume parse');

      await prisma.resumeProcessingJob.update({
        where: { id: jobId },
        data: { status: 'processing', attempts: { increment: 1 } },
      });

      // 1. Parse file
      const parsed = await parseResume(tempFilePath, mimeType);
      const truncatedText = parsed.text.slice(0, 6000);

      // 2. Upload to Google Drive
      let gdriveResult;
      try {
        gdriveResult = await zohoClient.uploadResumeToZoho({
          affiliateCode,
          filePath: tempFilePath,
          fileName,
          mimeType,
        });
      } catch (err) {
        logger.warn({ module: 'resumeParseWorker', action: 'driveUploadFailed', jobId, err }, 'Drive upload failed');
        gdriveResult = null;
      }

      // 3. Store encrypted resume text in ProfileAsset metadata
      const encryptedText = encrypt(truncatedText);
      await prisma.profileAsset.update({
        where: { id: assetId },
        data: {
          zohoFileId: gdriveResult?.fileId,   // field reused for Drive file ID
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

      logger.info({ module: 'resumeParseWorker', action: 'complete', requestId, jobId }, 'Resume parse complete');

      // 5. Enqueue profile extraction
      const { getQueues } = await import('../index');
      await getQueues()['v2-profile-extract'].add('extract', {
        jobId,
        affiliateId,
        assetId,
        encryptedText,
      });
    },
    {
      connection,
      concurrency: 2
    });


  worker.on('failed', async (job, err) => {
    if (!job) return;
    logger.error({ module: 'resumeParseWorker', jobId: job.data.jobId, err: err.message }, 'Resume parse job failed');
    const prisma = getPrisma();
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

  logger.info({ module: 'resumeParseWorker' }, 'Resume parse worker started');
  return worker;
}

export async function stopResumeParseWorker(): Promise<void> {
  if (worker) {
    await worker.close();
    worker = null;
  }
}
