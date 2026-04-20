import { Worker, Job } from 'bullmq';
import { getBullRedis } from '../../lib/redis';
import { logger } from '../../lib/logger';
import { getPrisma } from '../../lib/prisma';
import { zohoClient } from '../../integrations/zoho/zohoClient';

interface ProviderDeleteJobData {
  affiliateCode: string;
  driveFolderId?: string;
  fileIds?: string[];
}

let worker: Worker | null = null;

export function startProviderDeleteWorker(): Worker {
  const connection = getBullRedis();

  worker = new Worker(
    'v2-provider-delete',
    async (job: Job<ProviderDeleteJobData>) => {
      const { affiliateCode, driveFolderId, fileIds } = job.data;
      logger.info({ module: 'providerDeleteWorker', action: 'start', affiliateCode }, 'Deleting affiliate Drive data');

      const idsToDelete = fileIds ?? [];
      if (driveFolderId) {
        try {
          await zohoClient.deleteFile(driveFolderId);
          logger.info({ module: 'providerDeleteWorker', affiliateCode, driveFolderId }, 'Drive folder deleted');
        } catch (err) {
          logger.error({ module: 'providerDeleteWorker', affiliateCode, driveFolderId, err }, 'Drive folder delete failed');
          throw err; // Will retry
        }
      }

      for (const fileId of idsToDelete) {
        try {
          await zohoClient.deleteFile(fileId);
        } catch (err) {
          logger.warn({ module: 'providerDeleteWorker', affiliateCode, fileId, err }, 'File delete failed');
        }
      }

      // Clear Redis folder cache
      await zohoClient.flushFolderCache(affiliateCode);

      logger.info({ module: 'providerDeleteWorker', action: 'complete', affiliateCode }, 'Provider delete complete');
    },
    { connection, concurrency: 1 },
  );

  worker.on('failed', async (job, err) => {
    if (!job || job.attemptsMade < 3) return;
    const prisma = getPrisma();
    await prisma.auditLog.create({
      data: {
        actorType: 'system',
        action: 'provider_delete_failed',
        entityType: 'Affiliate',
        entityId: job.data.affiliateCode,
        changes: { error: err.message, requiresManualCleanup: true, driveFolderId: job.data.driveFolderId },
      },
    });
    logger.error({ module: 'providerDeleteWorker', affiliateCode: job.data.affiliateCode }, 'Provider delete dead-lettered — manual cleanup required');
  });

  logger.info({ module: 'providerDeleteWorker' }, 'Provider delete worker started');
  return worker;
}

export async function stopProviderDeleteWorker(): Promise<void> {
  if (worker) { await worker.close(); worker = null; }
}
