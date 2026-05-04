import { Worker, Queue, Job } from 'bullmq';
import { getBullRedis } from '../../lib/redis';
import { getPrisma } from '../../lib/prisma';
import { logger } from '../../lib/logger';
import { searchOpenToWork, extractPhone, ApolloPersonResult } from '../../modules/leads/apolloClient';
import { env } from '../../config/env';

const QUEUE_NAME = 'v2-lead-pull';
const PER_PAGE = 100;

let worker: Worker | null = null;
export let leadPullQueue: Queue | null = null;

export interface LeadPullJobData {
  jobId: string;        // LeadPullJob.id
  businessId: string;
  titles: string[];
  targetCount: number;
  apiKey: string;
}

async function processBatch(job: Job<LeadPullJobData>): Promise<void> {
  const { jobId, businessId, titles, targetCount, apiKey } = job.data;
  const prisma = getPrisma();

  let page = 1;
  let totalSaved = 0;
  let totalFetched = 0;

  // Resume from where we left off if the job was interrupted
  const existing = await prisma.leadPullJob.findUnique({ where: { id: jobId } });
  if (existing?.page && existing.page > 1) {
    page = existing.page;
    totalSaved = existing.saved;
    totalFetched = existing.fetched;
  }

  await prisma.leadPullJob.update({
    where: { id: jobId },
    data: { status: 'running' },
  });

  logger.info({ module: 'leadPullWorker', jobId, titles, targetCount }, 'Lead pull started');

  while (totalSaved < targetCount) {
    const remaining = targetCount - totalSaved;
    const perPage = Math.min(PER_PAGE, remaining);

    let response;
    try {
      response = await searchOpenToWork({ titles, page, perPage, apiKey });
    } catch (err) {
      logger.error({ module: 'leadPullWorker', jobId, page, err }, 'Apollo fetch failed');
      await prisma.leadPullJob.update({
        where: { id: jobId },
        data: { status: 'failed', error: (err as Error).message, page, fetched: totalFetched, saved: totalSaved, updatedAt: new Date() },
      });
      throw err;
    }

    const people: ApolloPersonResult[] = response.people ?? [];
    totalFetched += people.length;

    if (people.length === 0) {
      logger.info({ module: 'leadPullWorker', jobId, page }, 'No more results from Apollo');
      break;
    }

    // Upsert each person — skip duplicates by apolloId
    for (const person of people) {
      const phone = extractPhone(person);
      const location = [person.city, person.state, person.country].filter(Boolean).join(', ') || null;

      await prisma.lead.upsert({
        where: { apolloId: person.id },
        update: {
          email: person.email ?? undefined,
          phone: phone ?? undefined,
          title: person.title ?? undefined,
          company: person.organization_name ?? undefined,
          location: location ?? undefined,
          linkedinUrl: person.linkedin_url ?? undefined,
          openToWork: true,
        },
        create: {
          id: crypto.randomUUID(),
          businessId,
          apolloId: person.id,
          firstName: person.first_name ?? null,
          lastName: person.last_name ?? null,
          email: person.email ?? null,
          phone,
          title: person.title ?? null,
          company: person.organization_name ?? null,
          location,
          linkedinUrl: person.linkedin_url ?? null,
          openToWork: true,
          status: 'new',
        },
      }).catch(() => {
        // apolloId collision from another business — skip
      });

      totalSaved++;
      if (totalSaved >= targetCount) break;
    }

    // Checkpoint progress
    await prisma.leadPullJob.update({
      where: { id: jobId },
      data: { page: page + 1, fetched: totalFetched, saved: totalSaved, updatedAt: new Date() },
    });

    await job.updateProgress(Math.round((totalSaved / targetCount) * 100));

    logger.info({ module: 'leadPullWorker', jobId, page, totalSaved, totalFetched }, 'Page complete');

    if (page >= (response.pagination?.total_pages ?? 1)) {
      logger.info({ module: 'leadPullWorker', jobId }, 'Reached last page of Apollo results');
      break;
    }

    page++;

    // Respect Apollo rate limits — 1 request/sec on Basic plan
    await new Promise(r => setTimeout(r, 1100));
  }

  await prisma.leadPullJob.update({
    where: { id: jobId },
    data: { status: 'done', fetched: totalFetched, saved: totalSaved, updatedAt: new Date() },
  });

  logger.info({ module: 'leadPullWorker', jobId, totalSaved, totalFetched }, 'Lead pull complete');
}

export function startLeadPullWorker(): void {
  const connection = getBullRedis();
  leadPullQueue = new Queue(QUEUE_NAME, { connection });

  worker = new Worker<LeadPullJobData>(QUEUE_NAME, processBatch, {
    connection,
    concurrency: 1, // one pull job at a time to avoid Apollo rate limits
  });

  worker.on('completed', (job) => {
    logger.info({ module: 'leadPullWorker', jobId: job.id }, 'Lead pull job completed');
  });

  worker.on('failed', (job, err) => {
    logger.error({ module: 'leadPullWorker', jobId: job?.id, err }, 'Lead pull job failed');
  });

  logger.info({ module: 'leadPullWorker' }, 'Lead pull worker started');
}

export async function stopLeadPullWorker(): Promise<void> {
  await worker?.close();
  await leadPullQueue?.close();
}

export async function enqueueLeadPull(data: Omit<LeadPullJobData, 'apiKey'>): Promise<void> {
  const apiKey = env.APOLLO_API_KEY;
  if (!apiKey) throw new Error('APOLLO_API_KEY not configured');
  if (!leadPullQueue) throw new Error('Lead pull queue not initialised');

  await leadPullQueue.add('lead-pull', { ...data, apiKey }, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: 50,
    removeOnFail: 20,
  });
}
