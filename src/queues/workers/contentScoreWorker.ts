import { Worker, Job } from 'bullmq';
import { getBullRedis } from '../../lib/redis';
import { logger } from '../../lib/logger';
import { getPrisma } from '../../lib/prisma';
import { scoreContent } from '../../modules/scoring/contentScorer';

interface ContentScoreJobData {
  runId: string;
  affiliateId: string;
  channel: string;
  content: string;
}

let worker: Worker | null = null;

export function startContentScoreWorker(): Worker {
  const connection = getBullRedis();
  const prisma = getPrisma();

  worker = new Worker(
    'v2-content-score',
    async (job: Job<ContentScoreJobData>) => {
      const { runId, affiliateId, channel, content } = job.data;
      logger.info({ module: 'contentScoreWorker', action: 'start', runId }, 'Scoring content');

      const scores = await scoreContent({ content, channel });

      await prisma.contentScore.create({
        data: {
          runId,
          qualityScore: scores.quality.total,
          riskScore: scores.risk.total,
          conversionScore: scores.conversion.total,
          qualityBreakdown: scores.quality.breakdown,
          riskBreakdown: scores.risk.breakdown,
          conversionBreakdown: scores.conversion.breakdown,
          label: scores.quality.total >= 80 ? 'strong' : scores.quality.total >= 60 ? 'acceptable' : 'revise',
        },
      });

      logger.info({ module: 'contentScoreWorker', action: 'complete', runId, scores: { q: scores.quality.total, r: scores.risk.total, c: scores.conversion.total } }, 'Content scored');
    },
    { connection, concurrency: 4
    });


  worker.on('failed', (job, err) => {
    logger.error({ module: 'contentScoreWorker', runId: job?.data?.runId, err: err.message }, 'Score job failed');
  });

  logger.info({ module: 'contentScoreWorker' }, 'Content score worker started');
  return worker;
}

export async function stopContentScoreWorker(): Promise<void> {
  if (worker) { await worker.close(); worker = null; }
}
