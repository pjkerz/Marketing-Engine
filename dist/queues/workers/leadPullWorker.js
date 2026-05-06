"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.leadPullQueue = void 0;
exports.startLeadPullWorker = startLeadPullWorker;
exports.stopLeadPullWorker = stopLeadPullWorker;
exports.enqueueLeadPull = enqueueLeadPull;
const bullmq_1 = require("bullmq");
const redis_1 = require("../../lib/redis");
const prisma_1 = require("../../lib/prisma");
const logger_1 = require("../../lib/logger");
const apolloClient_1 = require("../../modules/leads/apolloClient");
const env_1 = require("../../config/env");
const QUEUE_NAME = 'v2-lead-pull';
const PER_PAGE = 100;
let worker = null;
exports.leadPullQueue = null;
async function processBatch(job) {
    const { jobId, businessId, titles, targetCount, apiKey } = job.data;
    const prisma = (0, prisma_1.getPrisma)();
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
    logger_1.logger.info({ module: 'leadPullWorker', jobId, titles, targetCount }, 'Lead pull started');
    while (totalSaved < targetCount) {
        const remaining = targetCount - totalSaved;
        const perPage = Math.min(PER_PAGE, remaining);
        let response;
        try {
            response = await (0, apolloClient_1.searchOpenToWork)({ titles, page, perPage, apiKey });
        }
        catch (err) {
            logger_1.logger.error({ module: 'leadPullWorker', jobId, page, err }, 'Apollo fetch failed');
            await prisma.leadPullJob.update({
                where: { id: jobId },
                data: { status: 'failed', error: err.message, page, fetched: totalFetched, saved: totalSaved, updatedAt: new Date() },
            });
            throw err;
        }
        const people = response.people ?? [];
        totalFetched += people.length;
        if (people.length === 0) {
            logger_1.logger.info({ module: 'leadPullWorker', jobId, page }, 'No more results from Apollo');
            break;
        }
        // Upsert each person — skip duplicates by apolloId
        for (const person of people) {
            const phone = (0, apolloClient_1.extractPhone)(person);
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
            if (totalSaved >= targetCount)
                break;
        }
        // Checkpoint progress
        await prisma.leadPullJob.update({
            where: { id: jobId },
            data: { page: page + 1, fetched: totalFetched, saved: totalSaved, updatedAt: new Date() },
        });
        await job.updateProgress(Math.round((totalSaved / targetCount) * 100));
        logger_1.logger.info({ module: 'leadPullWorker', jobId, page, totalSaved, totalFetched }, 'Page complete');
        if (page >= (response.pagination?.total_pages ?? 1)) {
            logger_1.logger.info({ module: 'leadPullWorker', jobId }, 'Reached last page of Apollo results');
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
    logger_1.logger.info({ module: 'leadPullWorker', jobId, totalSaved, totalFetched }, 'Lead pull complete');
}
function startLeadPullWorker() {
    const connection = (0, redis_1.getBullRedis)();
    exports.leadPullQueue = new bullmq_1.Queue(QUEUE_NAME, { connection });
    worker = new bullmq_1.Worker(QUEUE_NAME, processBatch, {
        connection,
        concurrency: 1, // one pull job at a time to avoid Apollo rate limits
    });
    worker.on('completed', (job) => {
        logger_1.logger.info({ module: 'leadPullWorker', jobId: job.id }, 'Lead pull job completed');
    });
    worker.on('failed', (job, err) => {
        logger_1.logger.error({ module: 'leadPullWorker', jobId: job?.id, err }, 'Lead pull job failed');
    });
    logger_1.logger.info({ module: 'leadPullWorker' }, 'Lead pull worker started');
}
async function stopLeadPullWorker() {
    await worker?.close();
    await exports.leadPullQueue?.close();
}
async function enqueueLeadPull(data) {
    const apiKey = env_1.env.APOLLO_API_KEY;
    if (!apiKey)
        throw new Error('APOLLO_API_KEY not configured');
    if (!exports.leadPullQueue)
        throw new Error('Lead pull queue not initialised');
    await exports.leadPullQueue.add('lead-pull', { ...data, apiKey }, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: 50,
        removeOnFail: 20,
    });
}
//# sourceMappingURL=leadPullWorker.js.map