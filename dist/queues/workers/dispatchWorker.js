"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startDispatchWorker = startDispatchWorker;
exports.stopDispatchWorker = stopDispatchWorker;
const bullmq_1 = require("bullmq");
const redis_1 = require("../../lib/redis");
const logger_1 = require("../../lib/logger");
const prisma_1 = require("../../lib/prisma");
const makeWebhook_1 = require("../../lib/makeWebhook");
const env_1 = require("../../config/env");
let worker = null;
function startDispatchWorker() {
    const connection = (0, redis_1.getBullRedis)();
    const prisma = (0, prisma_1.getPrisma)();
    worker = new bullmq_1.Worker('v2-content-dispatch', async (job) => {
        const { runId, affiliateId, channel } = job.data;
        logger_1.logger.info({ module: 'dispatchWorker', action: 'start', runId }, 'Dispatching content to review queue');
        // Mark as dispatched — content goes to manual review via admin approval
        const run = await prisma.contentGenerationRun.update({
            where: { id: runId },
            data: { status: 'dispatched', updatedAt: new Date() },
        });
        // Fetch affiliate and their tenant config for the webhook payload
        const affiliate = await prisma.affiliate.findUnique({ where: { id: affiliateId } });
        const bizConfig = affiliate ? await prisma.businessConfig.findUnique({ where: { businessId: affiliate.businessId }, select: { landingPageUrl: true } }) : null;
        const appUrl = bizConfig?.landingPageUrl ?? env_1.env.APP_URL;
        // Fire Make webhook so content lands in Sendible as a draft
        await (0, makeWebhook_1.fireMakeWebhook)({
            event: 'content_approved',
            runId,
            affiliateCode: affiliate?.code ?? affiliateId,
            affiliateName: affiliate?.name ?? affiliateId,
            channel,
            content: run.outputContent ?? '',
            refLink: `${appUrl}/ref/${affiliate?.code ?? affiliateId}`,
            approvedAt: new Date().toISOString(),
        });
        logger_1.logger.info({ module: 'dispatchWorker', action: 'complete', runId, affiliateId, channel }, 'Content dispatched');
    }, { connection, concurrency: 2
    });
    worker.on('failed', async (job, err) => {
        if (!job)
            return;
        const prisma = (0, prisma_1.getPrisma)();
        await prisma.contentGenerationRun.update({
            where: { id: job.data.runId },
            data: { status: 'failed' },
        });
        logger_1.logger.error({ module: 'dispatchWorker', runId: job.data.runId, err: err.message }, 'Dispatch failed');
    });
    logger_1.logger.info({ module: 'dispatchWorker' }, 'Dispatch worker started');
    return worker;
}
async function stopDispatchWorker() {
    if (worker) {
        await worker.close();
        worker = null;
    }
}
//# sourceMappingURL=dispatchWorker.js.map