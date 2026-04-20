"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startProviderDeleteWorker = startProviderDeleteWorker;
exports.stopProviderDeleteWorker = stopProviderDeleteWorker;
const bullmq_1 = require("bullmq");
const redis_1 = require("../../lib/redis");
const logger_1 = require("../../lib/logger");
const prisma_1 = require("../../lib/prisma");
const zohoClient_1 = require("../../integrations/zoho/zohoClient");
let worker = null;
function startProviderDeleteWorker() {
    const connection = (0, redis_1.getBullRedis)();
    worker = new bullmq_1.Worker('v2-provider-delete', async (job) => {
        const { affiliateCode, driveFolderId, fileIds } = job.data;
        logger_1.logger.info({ module: 'providerDeleteWorker', action: 'start', affiliateCode }, 'Deleting affiliate Drive data');
        const idsToDelete = fileIds ?? [];
        if (driveFolderId) {
            try {
                await zohoClient_1.zohoClient.deleteFile(driveFolderId);
                logger_1.logger.info({ module: 'providerDeleteWorker', affiliateCode, driveFolderId }, 'Drive folder deleted');
            }
            catch (err) {
                logger_1.logger.error({ module: 'providerDeleteWorker', affiliateCode, driveFolderId, err }, 'Drive folder delete failed');
                throw err; // Will retry
            }
        }
        for (const fileId of idsToDelete) {
            try {
                await zohoClient_1.zohoClient.deleteFile(fileId);
            }
            catch (err) {
                logger_1.logger.warn({ module: 'providerDeleteWorker', affiliateCode, fileId, err }, 'File delete failed');
            }
        }
        // Clear Redis folder cache
        await zohoClient_1.zohoClient.flushFolderCache(affiliateCode);
        logger_1.logger.info({ module: 'providerDeleteWorker', action: 'complete', affiliateCode }, 'Provider delete complete');
    }, { connection, concurrency: 1 });
    worker.on('failed', async (job, err) => {
        if (!job || job.attemptsMade < 3)
            return;
        const prisma = (0, prisma_1.getPrisma)();
        await prisma.auditLog.create({
            data: {
                actorType: 'system',
                action: 'provider_delete_failed',
                entityType: 'Affiliate',
                entityId: job.data.affiliateCode,
                changes: { error: err.message, requiresManualCleanup: true, driveFolderId: job.data.driveFolderId },
            },
        });
        logger_1.logger.error({ module: 'providerDeleteWorker', affiliateCode: job.data.affiliateCode }, 'Provider delete dead-lettered — manual cleanup required');
    });
    logger_1.logger.info({ module: 'providerDeleteWorker' }, 'Provider delete worker started');
    return worker;
}
async function stopProviderDeleteWorker() {
    if (worker) {
        await worker.close();
        worker = null;
    }
}
//# sourceMappingURL=providerDeleteWorker.js.map