import { Worker, Job } from 'bullmq';
import { getBullRedis } from '../../lib/redis';
import { logger } from '../../lib/logger';
import { getPrisma } from '../../lib/prisma';
import { fireMakeWebhook } from '../../lib/makeWebhook';

interface DispatchJobData {
  runId: string;
  affiliateId: string;
  channel: string;
}

let worker: Worker | null = null;

export function startDispatchWorker(): Worker {
  const connection = getBullRedis();
  const prisma = getPrisma();

  worker = new Worker(
    'v2-content-dispatch',
    async (job: Job<DispatchJobData>) => {
      const { runId, affiliateId, channel } = job.data;
      logger.info({ module: 'dispatchWorker', action: 'start', runId }, 'Dispatching content to review queue');

      // Mark as dispatched — content goes to manual review via admin approval
      const run = await prisma.contentGenerationRun.update({
        where: { id: runId },
        data: { status: 'dispatched', updatedAt: new Date() },
      });

      // Fetch affiliate name for the webhook payload
      const affiliate = await prisma.affiliate.findUnique({ where: { id: affiliateId } });

      // Fire Make webhook so content lands in Sendible as a draft
      await fireMakeWebhook({
        event: 'content_approved',
        runId,
        affiliateCode: affiliate?.code ?? affiliateId,
        affiliateName: affiliate?.name ?? affiliateId,
        channel,
        content: run.outputContent ?? '',
        refLink: `https://alphaboost.ngrok.app/ref/${affiliate?.code ?? affiliateId}`,
        approvedAt: new Date().toISOString(),
      });

      logger.info({ module: 'dispatchWorker', action: 'complete', runId, affiliateId, channel }, 'Content dispatched');
    },
    { connection, concurrency: 2
    });


  worker.on('failed', async (job, err) => {
    if (!job) return;
    const prisma = getPrisma();
    await prisma.contentGenerationRun.update({
      where: { id: job.data.runId },
      data: { status: 'failed' },
    });
    logger.error({ module: 'dispatchWorker', runId: job.data.runId, err: err.message }, 'Dispatch failed');
  });

  logger.info({ module: 'dispatchWorker' }, 'Dispatch worker started');
  return worker;
}

export async function stopDispatchWorker(): Promise<void> {
  if (worker) { await worker.close(); worker = null; }
}
