import { Worker, Job } from 'bullmq';
import { getBullRedis } from '../../lib/redis';
import { logger } from '../../lib/logger';
import { getPrisma } from '../../lib/prisma';

interface MediaCleanupJobData {
  mediaJobId: string;
}

let worker: Worker | null = null;

export function startMediaCleanupWorker(): Worker {
  const connection = getBullRedis();
  const prisma = getPrisma();

  worker = new Worker(
    'v2-media-cleanup',
    async (job: Job<MediaCleanupJobData>) => {
      const { mediaJobId } = job.data;
      logger.info({ module: 'mediaCleanupWorker', action: 'start', mediaJobId }, 'Running media cleanup');

      const mediaJob = await prisma.mediaGenerationJob.findUnique({ where: { id: mediaJobId } });
      if (!mediaJob) return;

      // Only expire if still pending/preview_ready (not approved/rejected)
      if (['pending', 'preview_ready'].includes(mediaJob.status)) {
        await prisma.mediaGenerationJob.update({
          where: { id: mediaJobId },
          data: { status: 'expired', candidatesBase64: undefined },
        });
        logger.info({ module: 'mediaCleanupWorker', action: 'expired', mediaJobId }, 'Media job expired — candidates discarded');
      }
    },
    { connection, concurrency: 2
    });


  worker.on('failed', (job, err) => {
    logger.error({ module: 'mediaCleanupWorker', mediaJobId: job?.data?.mediaJobId, err: err.message }, 'Cleanup failed');
  });

  logger.info({ module: 'mediaCleanupWorker' }, 'Media cleanup worker started');
  return worker;
}

export async function stopMediaCleanupWorker(): Promise<void> {
  if (worker) { await worker.close(); worker = null; }
}
