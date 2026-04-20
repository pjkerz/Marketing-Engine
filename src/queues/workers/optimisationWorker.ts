import { Worker, Job, Queue } from 'bullmq';
import { getBullRedis } from '../../lib/redis';
import { getPrisma } from '../../lib/prisma';
import { logger } from '../../lib/logger';
import { llmClient } from '../../integrations/llm/llmClient';
import { env } from '../../config/env';

let worker: Worker | null = null;
let schedulerQueue: Queue | null = null;

const QUEUE_NAME = 'v2-optimisation';
const MIN_SAMPLE = 50;

// ── Analysis helpers ──────────────────────────────────────────────────────────

async function upsertInsight(
  prisma: ReturnType<typeof getPrisma>,
  businessId: string,
  insightType: string,
  finding: string,
  evidence: object,
  recommendation: string,
  impact: 'high' | 'medium' | 'low',
) {
  // Idempotent: skip if an unresolved insight of same type already exists
  const existing = await prisma.optimisationInsight.findFirst({
    where: { businessId, insightType, status: { in: ['new', 'acknowledged'] } },
  });
  if (existing) return;

  await prisma.optimisationInsight.create({
    data: { businessId, insightType, finding, evidence, recommendation, impact },
  });
  logger.info({ module: 'optimisationWorker', businessId, insightType }, 'Insight created');
}

async function analyseContentFormatPerformance(
  prisma: ReturnType<typeof getPrisma>,
  businessId: string,
) {
  const since = new Date(Date.now() - 7 * 86400000);
  const events = await prisma.funnelEvent.groupBy({
    by: ['contentFormat', 'eventType'],
    where: { businessId, timestamp: { gte: since }, contentFormat: { not: null } },
    _count: { id: true },
  });

  const clicks: Record<string, number> = {};
  const conversions: Record<string, number> = {};
  events.forEach(e => {
    if (!e.contentFormat) return;
    if (e.eventType === 'click') clicks[e.contentFormat] = (clicks[e.contentFormat] || 0) + e._count.id;
    if (e.eventType === 'form_submit' || e.eventType === 'conversion') conversions[e.contentFormat] = (conversions[e.contentFormat] || 0) + e._count.id;
  });

  const formats = Object.keys(clicks).filter(f => clicks[f] >= MIN_SAMPLE);
  if (formats.length < 2) return;

  const rates = formats.map(f => ({ format: f, rate: (conversions[f] || 0) / clicks[f], clicks: clicks[f] }));
  const avgRate = rates.reduce((s, r) => s + r.rate, 0) / rates.length;
  const best = rates.reduce((a, b) => a.rate > b.rate ? a : b);

  if (best.rate > avgRate * 1.2) {
    const lift = Math.round(((best.rate / avgRate) - 1) * 100);
    await upsertInsight(prisma, businessId, 'content_format',
      `${best.format}-format posts convert ${lift}% better than average`,
      { sampleSize: best.clicks, conversionRateLift: lift, winningFormat: best.format, allFormats: rates },
      `Increase ${best.format}-format content in generation queue`,
      lift > 40 ? 'high' : 'medium',
    );
  }
}

async function analyseChannelMixPerformance(
  prisma: ReturnType<typeof getPrisma>,
  businessId: string,
) {
  const since = new Date(Date.now() - 7 * 86400000);
  const events = await prisma.funnelEvent.groupBy({
    by: ['channel', 'eventType'],
    where: { businessId, timestamp: { gte: since } },
    _count: { id: true },
  });

  const clicks: Record<string, number> = {};
  const convs: Record<string, number> = {};
  events.forEach(e => {
    if (e.eventType === 'click') clicks[e.channel] = (clicks[e.channel] || 0) + e._count.id;
    if (e.eventType === 'form_submit') convs[e.channel] = (convs[e.channel] || 0) + e._count.id;
  });

  const channels = Object.keys(clicks).filter(c => clicks[c] >= MIN_SAMPLE);
  if (channels.length < 2) return;

  const rates = channels.map(c => ({ channel: c, rate: (convs[c] || 0) / clicks[c], clicks: clicks[c] }));
  const avgRate = rates.reduce((s, r) => s + r.rate, 0) / rates.length;
  const best = rates.reduce((a, b) => a.rate > b.rate ? a : b);

  if (best.rate > avgRate * 2) {
    const lift = Math.round(((best.rate / avgRate) - 1) * 100);
    await upsertInsight(prisma, businessId, 'channel_mix',
      `${best.channel} converts ${lift}% better than average across all channels`,
      { sampleSize: best.clicks, conversionRateLift: lift, winningChannel: best.channel, allChannels: rates },
      `Shift content volume toward ${best.channel} — allocate at least 40% of posts there`,
      'high',
    );
  }
}

async function analysePostingTimePerformance(
  prisma: ReturnType<typeof getPrisma>,
  businessId: string,
) {
  const since = new Date(Date.now() - 14 * 86400000);
  const events = await prisma.funnelEvent.findMany({
    where: { businessId, eventType: 'click', timestamp: { gte: since }, channel: { not: 'email' } },
    select: { timestamp: true, channel: true },
  });

  if (events.length < MIN_SAMPLE) return;

  const hourCounts: Record<string, Record<number, number>> = {};
  events.forEach(e => {
    const h = new Date(e.timestamp).getUTCHours();
    if (!hourCounts[e.channel]) hourCounts[e.channel] = {};
    hourCounts[e.channel][h] = (hourCounts[e.channel][h] || 0) + 1;
  });

  for (const [channel, hours] of Object.entries(hourCounts)) {
    const counts = Object.values(hours);
    if (counts.length < 3) continue;
    const avg = counts.reduce((a, b) => a + b, 0) / counts.length;
    const bestHour = parseInt(Object.entries(hours).sort((a, b) => b[1] - a[1])[0][0]);
    const bestCount = hours[bestHour];

    if (bestCount > avg * 1.15) {
      const lift = Math.round(((bestCount / avg) - 1) * 100);
      await upsertInsight(prisma, businessId, 'posting_time',
        `Posts at ${bestHour}:00 UTC on ${channel} get ${lift}% more clicks than average`,
        { channel, bestHour, lift, sampleSize: events.length },
        `Schedule ${channel} posts at ${bestHour}:00 UTC for maximum reach`,
        'medium',
      );
    }
  }
}

async function analyseEmailSubjectLines(
  prisma: ReturnType<typeof getPrisma>,
  businessId: string,
) {
  // EmailSendEvent arrives in Module 07 — stub with funnel email events for now
  const since = new Date(Date.now() - 30 * 86400000);
  const emailEvents = await prisma.funnelEvent.groupBy({
    by: ['campaignId', 'eventType'],
    where: { businessId, channel: 'email', timestamp: { gte: since }, campaignId: { not: null } },
    _count: { id: true },
  });

  const sends: Record<string, number> = {};
  const opens: Record<string, number> = {};
  emailEvents.forEach(e => {
    if (!e.campaignId) return;
    if (e.eventType === 'pageview') sends[e.campaignId] = (sends[e.campaignId] || 0) + e._count.id;
    if (e.eventType === 'open') opens[e.campaignId] = (opens[e.campaignId] || 0) + e._count.id;
  });

  const campaigns = Object.keys(sends).filter(id => sends[id] >= MIN_SAMPLE);
  if (campaigns.length < 2) return;

  const rates = campaigns.map(id => ({ id, rate: (opens[id] || 0) / sends[id] }));
  const good = rates.filter(r => r.rate > 0.3);
  const poor = rates.filter(r => r.rate < 0.15);

  if (good.length === 0 || poor.length === 0) return;

  await upsertInsight(prisma, businessId, 'subject_line',
    `Email open rates vary significantly: top campaigns ${Math.round(good[0].rate * 100)}% vs bottom ${Math.round(poor[0].rate * 100)}%`,
    { goodCampaigns: good, poorCampaigns: poor },
    'Review subject lines of top-performing campaigns and replicate their patterns (personalisation, curiosity hooks, numbers)',
    'medium',
  );
}

async function analyseFunnelDropoff(
  prisma: ReturnType<typeof getPrisma>,
  businessId: string,
) {
  const since = new Date(Date.now() - 30 * 86400000);
  const stages = ['awareness', 'interest', 'consideration', 'conversion'];
  const counts = await prisma.funnelEvent.groupBy({
    by: ['funnelStage'],
    where: { businessId, timestamp: { gte: since } },
    _count: { id: true },
  });

  const stageMap: Record<string, number> = {};
  counts.forEach(c => { stageMap[c.funnelStage] = c._count.id; });

  let worstStage = '';
  let worstDropoff = 0;

  for (let i = 0; i < stages.length - 1; i++) {
    const current = stageMap[stages[i]] || 0;
    const next = stageMap[stages[i + 1]] || 0;
    if (current < MIN_SAMPLE) continue;
    const dropoff = 1 - (next / current);
    if (dropoff > worstDropoff) {
      worstDropoff = dropoff;
      worstStage = stages[i];
    }
  }

  if (!worstStage || worstDropoff < 0.5) return;

  const stageRecommendations: Record<string, string> = {
    awareness: 'Increase content volume and cross-platform distribution',
    interest: 'Improve landing page above-the-fold content and load speed',
    consideration: 'Add social proof, testimonials, and comparison content to pricing page',
  };

  await upsertInsight(prisma, businessId, 'funnel_stage',
    `${Math.round(worstDropoff * 100)}% of visitors drop off between ${worstStage} and ${stages[stages.indexOf(worstStage) + 1]}`,
    { worstStage, dropoffRate: worstDropoff, stageCounts: stageMap },
    stageRecommendations[worstStage] || 'Investigate drop-off causes at this stage',
    worstDropoff > 0.7 ? 'high' : 'medium',
  );
}

function chiSquaredSignificance(a: { clicks: number; conversions: number }, b: { clicks: number; conversions: number }): number {
  const n = a.clicks + b.clicks;
  const c = a.conversions + b.conversions;
  if (n === 0 || c === 0) return 0;

  const expected = (row: number, col: number) => (row * col) / n;
  const aNoConv = a.clicks - a.conversions;
  const bNoConv = b.clicks - b.conversions;

  const chi = [
    [a.conversions, expected(a.clicks, c)],
    [aNoConv, expected(a.clicks, n - c)],
    [b.conversions, expected(b.clicks, c)],
    [bNoConv, expected(b.clicks, n - c)],
  ].reduce((sum, [obs, exp]) => sum + (exp > 0 ? Math.pow(obs - exp, 2) / exp : 0), 0);

  // Approximate p-value for 1 df using chi-squared CDF
  if (chi < 2.706) return 0.90;
  if (chi < 3.841) return 0.95;
  if (chi < 6.635) return 0.99;
  return 0.999;
}

async function analyseAbTests(prisma: ReturnType<typeof getPrisma>, businessId: string) {
  const tests = await prisma.abTest.findMany({
    where: { businessId, status: 'running' },
    include: { results: true },
  });

  for (const test of tests) {
    if (test.results.length < 2) continue;
    const [a, b] = test.results;
    if (!a || !b) continue;
    if (a.impressions < 200 || b.impressions < 200) continue;

    const sig = chiSquaredSignificance(
      { clicks: a.clicks, conversions: a.conversions },
      { clicks: b.clicks, conversions: b.conversions },
    );
    const winner = a.conversionRate >= b.conversionRate ? a : b;

    if (sig >= 0.95) {
      await prisma.abTest.update({
        where: { id: test.id },
        data: { winnerVariantId: winner.variantId },
      });

      await upsertInsight(prisma, businessId, 'ab_test',
        `A/B test "${test.name}" reached ${Math.round(sig * 100)}% confidence. Variant ${winner.variantId} wins.`,
        { testId: test.id, significance: sig, winner: winner.variantId, results: test.results },
        `Apply winning variant ${winner.variantId} to all content generation`,
        'high',
      );
    }
  }
}

// ── Worker ────────────────────────────────────────────────────────────────────

async function runOptimisationForBusiness(businessId: string) {
  const prisma = getPrisma();
  logger.info({ module: 'optimisationWorker', businessId }, 'Running optimisation analysis');

  await Promise.allSettled([
    analyseContentFormatPerformance(prisma, businessId),
    analyseChannelMixPerformance(prisma, businessId),
    analysePostingTimePerformance(prisma, businessId),
    analyseEmailSubjectLines(prisma, businessId),
    analyseFunnelDropoff(prisma, businessId),
    analyseAbTests(prisma, businessId),
  ]);

  logger.info({ module: 'optimisationWorker', businessId }, 'Optimisation analysis complete');
}

export function startOptimisationWorker(): void {
  const connection = getBullRedis();

  // Register the queue + scheduled repeating job
  schedulerQueue = new Queue(QUEUE_NAME, { connection });
  schedulerQueue.add('run', {}, {
    repeat: { every: 6 * 60 * 60 * 1000 }, // every 6 hours
    jobId: 'optimisation-scheduled',
  }).catch(err => logger.warn({ err }, 'Could not schedule optimisation job'));

  worker = new Worker(
    QUEUE_NAME,
    async (_job: Job) => {
      const prisma = getPrisma();
      const businesses = await prisma.business.findMany({ where: { active: true }, select: { id: true } });
      await Promise.allSettled(businesses.map(b => runOptimisationForBusiness(b.id)));
    },
    { connection, concurrency: 1 },
  );

  worker.on('completed', () => logger.info({ module: 'optimisationWorker' }, 'Optimisation job complete'));
  worker.on('failed', (_job, err) => logger.error({ err, module: 'optimisationWorker' }, 'Optimisation job failed'));

  logger.info({ module: 'optimisationWorker' }, 'Optimisation worker started');
}

export async function stopOptimisationWorker(): Promise<void> {
  await worker?.close();
  await schedulerQueue?.close();
  worker = null;
  schedulerQueue = null;
}

// Export for on-demand trigger from admin API
export { runOptimisationForBusiness };
