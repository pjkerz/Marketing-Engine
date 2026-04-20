"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startContentScoreWorker = startContentScoreWorker;
exports.stopContentScoreWorker = stopContentScoreWorker;
const bullmq_1 = require("bullmq");
const redis_1 = require("../../lib/redis");
const logger_1 = require("../../lib/logger");
const prisma_1 = require("../../lib/prisma");
const contentScorer_1 = require("../../modules/scoring/contentScorer");
let worker = null;
function startContentScoreWorker() {
    const connection = (0, redis_1.getBullRedis)();
    const prisma = (0, prisma_1.getPrisma)();
    worker = new bullmq_1.Worker('v2-content-score', async (job) => {
        const { runId, affiliateId, channel, content } = job.data;
        logger_1.logger.info({ module: 'contentScoreWorker', action: 'start', runId }, 'Scoring content');
        const scores = await (0, contentScorer_1.scoreContent)({ content, channel });
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
        logger_1.logger.info({ module: 'contentScoreWorker', action: 'complete', runId, scores: { q: scores.quality.total, r: scores.risk.total, c: scores.conversion.total } }, 'Content scored');
    }, { connection, concurrency: 4
    });
    worker.on('failed', (job, err) => {
        logger_1.logger.error({ module: 'contentScoreWorker', runId: job?.data?.runId, err: err.message }, 'Score job failed');
    });
    logger_1.logger.info({ module: 'contentScoreWorker' }, 'Content score worker started');
    return worker;
}
async function stopContentScoreWorker() {
    if (worker) {
        await worker.close();
        worker = null;
    }
}
//# sourceMappingURL=contentScoreWorker.js.map