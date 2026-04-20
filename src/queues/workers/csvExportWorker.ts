import { Worker, Job, Queue } from 'bullmq';
import { getBullRedis } from '../../lib/redis';
import { getPrisma } from '../../lib/prisma';
import { logger } from '../../lib/logger';

let worker: Worker | null = null;
let schedulerQueue: Queue | null = null;

const QUEUE_NAME = 'v2-csv-export';

// ── CSV generation helper ─────────────────────────────────────────────────────

function csvEscape(value: string): string {
  // Wrap in double quotes and escape internal quotes as ""
  return '"' + value.replace(/"/g, '""') + '"';
}

function formatSendibleDate(d: Date): string {
  // YYYY-MM-DD HH:mm
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export async function generatePlatformCSV(
  businessId: string,
  platform?: string,
): Promise<{ csvText: string; platform: string; count: number }[]> {
  const prisma = getPrisma();

  // Find approved unexported slots for this business
  const slots = await prisma.contentSlot.findMany({
    where: {
      businessId,
      status: 'approved',
      exportedAt: null,
      ...(platform ? { platform } : {}),
    },
    include: {
      contentRun: {
        include: {
          affiliate: { select: { code: true } },
        },
      },
    },
    orderBy: { scheduledDate: 'asc' },
  });

  // Get business config for landing page URL
  const config = await prisma.businessConfig.findUnique({ where: { businessId } });
  const landingBase = config?.landingPageUrl ?? 'https://alphaboost.app';

  // Get library assets for media URLs
  const assetIds = slots.map(s => s.mediaAssetId).filter(Boolean) as string[];
  const assets: Record<string, string> = {};
  if (assetIds.length > 0) {
    const found = await prisma.contentLibraryAsset.findMany({
      where: { id: { in: assetIds } },
      select: { id: true, url: true },
    });
    found.forEach(a => { assets[a.id] = a.url; });
  }

  // Group by platform
  const byPlatform: Record<string, typeof slots> = {};
  slots.forEach(slot => {
    if (!byPlatform[slot.platform]) byPlatform[slot.platform] = [];
    byPlatform[slot.platform]!.push(slot);
  });

  const results: { csvText: string; platform: string; count: number }[] = [];

  for (const [plat, platSlots] of Object.entries(byPlatform)) {
    const rows: string[] = ['Message,SendDate,URL,Image'];

    for (const slot of platSlots) {
      const run = slot.contentRun;
      const content = run?.editedContent ?? run?.outputContent ?? slot.manualContent ?? '';
      const affiliateCode = run?.affiliate?.code ?? '';
      const url = affiliateCode ? `${landingBase}?ref=${affiliateCode}` : landingBase;
      const imageUrl = slot.mediaAssetId ? (assets[slot.mediaAssetId] ?? '') : '';
      const sendDate = formatSendibleDate(slot.scheduledDate);

      rows.push([csvEscape(content), csvEscape(sendDate), csvEscape(url), csvEscape(imageUrl)].join(','));
    }

    results.push({ csvText: rows.join('\n'), platform: plat, count: platSlots.length });

    // Mark as exported
    await prisma.contentSlot.updateMany({
      where: { id: { in: platSlots.map(s => s.id) } },
      data: { exportedAt: new Date() },
    });
  }

  return results;
}

// ── Worker ───────────────────────────────────────────────────────────────────

async function runCsvExport(_job: Job) {
  const prisma = getPrisma();

  // Get all active businesses
  const businesses = await prisma.business.findMany({
    where: { active: true },
    select: { id: true, name: true },
  });

  for (const biz of businesses) {
    try {
      const results = await generatePlatformCSV(biz.id);

      const totalPosts = results.reduce((a, r) => a + r.count, 0);
      if (totalPosts === 0) continue;

      logger.info(
        { module: 'csvExportWorker', businessId: biz.id, businessName: biz.name, platforms: results.map(r => r.platform), totalPosts },
        'CSV export run complete',
      );
      // Note: email notification added in Module 07 when AlphaMail is extended
    } catch (err) {
      logger.error({ module: 'csvExportWorker', businessId: biz.id, err }, 'CSV export failed for business');
    }
  }
}

// ── Scheduler setup ───────────────────────────────────────────────────────────

export function startCsvExportWorker() {
  const connection = getBullRedis();

  schedulerQueue = new Queue(QUEUE_NAME, { connection });

  // Schedule: 6am and 6pm UTC daily
  schedulerQueue.add('csv-export-6am', {}, {
    repeat: { pattern: '0 6 * * *' },
    jobId: 'csv-export-6am',
  });
  schedulerQueue.add('csv-export-6pm', {}, {
    repeat: { pattern: '0 18 * * *' },
    jobId: 'csv-export-6pm',
  });

  worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => { await runCsvExport(job); },
    { connection, concurrency: 1 },
  );

  worker.on('completed', (job) => {
    logger.info({ module: 'csvExportWorker', jobId: job.id }, 'CSV export job completed');
  });
  worker.on('failed', (job, err) => {
    logger.error({ module: 'csvExportWorker', jobId: job?.id, err }, 'CSV export job failed');
  });

  logger.info({ module: 'csvExportWorker' }, 'CSV export worker started (6am + 6pm UTC)');
}

export async function stopCsvExportWorker() {
  await worker?.close();
  await schedulerQueue?.close();
}
