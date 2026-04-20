import { Worker, Queue } from 'bullmq';
import { getBullRedis } from '../../lib/redis';
import { getPrisma } from '../../lib/prisma';
import { logger } from '../../lib/logger';
import { crawlUrl } from '../../modules/seo/crawler';
import { extractKeywords } from '../../modules/seo/keywordExtractor';
import { analyseGap } from '../../modules/seo/gapAnalyser';

interface SeoAuditJob {
  auditId: string;
  clientUrl: string;
  competitorUrl: string;
  businessId: string;
}

async function runSeoAudit(job: { data: SeoAuditJob }): Promise<void> {
  const { auditId, clientUrl, competitorUrl } = job.data;
  const prisma = getPrisma();

  try {
    await prisma.seoAudit.update({ where: { id: auditId }, data: { status: 'crawling' } });
    logger.info({ module: 'seoAuditWorker', auditId, clientUrl, competitorUrl }, 'Starting SEO audit');

    // Crawl both sites concurrently
    const [clientPages, competitorPages] = await Promise.all([
      crawlUrl(clientUrl),
      crawlUrl(competitorUrl),
    ]);

    await prisma.seoAudit.update({ where: { id: auditId }, data: { status: 'analysing' } });

    const clientKeywords = extractKeywords(clientPages);
    const competitorKeywords = extractKeywords(competitorPages);
    const gapKeywords = analyseGap(clientKeywords, competitorKeywords);

    await prisma.seoAudit.update({
      where: { id: auditId },
      data: {
        status: 'complete',
        clientKeywords: clientKeywords as unknown as Parameters<typeof prisma.seoAudit.update>[0]['data']['clientKeywords'],
        competitorKeywords: competitorKeywords as unknown as Parameters<typeof prisma.seoAudit.update>[0]['data']['competitorKeywords'],
        gapKeywords: gapKeywords as unknown as Parameters<typeof prisma.seoAudit.update>[0]['data']['gapKeywords'],
        completedAt: new Date(),
      },
    });

    logger.info({ module: 'seoAuditWorker', auditId, gaps: gapKeywords.length }, 'SEO audit complete');
  } catch (err) {
    await prisma.seoAudit.update({ where: { id: auditId }, data: { status: 'failed' } }).catch(() => {});
    logger.error({ module: 'seoAuditWorker', auditId, err }, 'SEO audit failed');
    throw err;
  }
}

let worker: Worker | null = null;
export let seoAuditQueue: Queue | null = null;

export function startSeoAuditWorker(): void {
  if (worker) return;
  const connection = getBullRedis();
  seoAuditQueue = new Queue('v2-seo-audit', {
    connection,
    defaultJobOptions: { removeOnComplete: 20, removeOnFail: 50 },
  });
  worker = new Worker('v2-seo-audit', runSeoAudit, { connection, concurrency: 2 });
  worker.on('failed', (job, err) => {
    logger.error({ module: 'seoAuditWorker', auditId: job?.data?.auditId, err }, 'Job failed');
  });
  logger.info({ module: 'seoAuditWorker' }, 'SEO audit worker started');
}

export async function stopSeoAuditWorker(): Promise<void> {
  if (worker) { await worker.close(); worker = null; }
  if (seoAuditQueue) { await seoAuditQueue.close(); seoAuditQueue = null; }
}
