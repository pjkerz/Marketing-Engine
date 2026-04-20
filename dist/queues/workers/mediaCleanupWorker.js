"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startMediaCleanupWorker = startMediaCleanupWorker;
exports.stopMediaCleanupWorker = stopMediaCleanupWorker;
const bullmq_1 = require("bullmq");
const redis_1 = require("../../lib/redis");
const logger_1 = require("../../lib/logger");
const prisma_1 = require("../../lib/prisma");
let worker = null;
function startMediaCleanupWorker() {
    const connection = (0, redis_1.getBullRedis)();
    const prisma = (0, prisma_1.getPrisma)();
    worker = new bullmq_1.Worker('v2-media-cleanup', async (job) => {
        const { mediaJobId } = job.data;
        logger_1.logger.info({ module: 'mediaCleanupWorker', action: 'start', mediaJobId }, 'Running media cleanup');
        const mediaJob = await prisma.mediaGenerationJob.findUnique({ where: { id: mediaJobId } });
        if (!mediaJob)
            return;
        // Only expire if still pending/preview_ready (not approved/rejected)
        if (['pending', 'preview_ready'].includes(mediaJob.status)) {
            await prisma.mediaGenerationJob.update({
                where: { id: mediaJobId },
                data: { status: 'expired', candidatesBase64: undefined },
            });
            logger_1.logger.info({ module: 'mediaCleanupWorker', action: 'expired', mediaJobId }, 'Media job expired — candidates discarded');
        }
    }, { connection, concurrency: 2
    });
    worker.on('failed', (job, err) => {
        logger_1.logger.error({ module: 'mediaCleanupWorker', mediaJobId: job?.data?.mediaJobId, err: err.message }, 'Cleanup failed');
    });
    logger_1.logger.info({ module: 'mediaCleanupWorker' }, 'Media cleanup worker started');
    return worker;
}
async function stopMediaCleanupWorker() {
    if (worker) {
        await worker.close();
        worker = null;
    }
}
//# sourceMappingURL=mediaCleanupWorker.js.map