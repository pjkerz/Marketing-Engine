"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.seoAuditQueue = void 0;
exports.startSeoAuditWorker = startSeoAuditWorker;
exports.stopSeoAuditWorker = stopSeoAuditWorker;
const bullmq_1 = require("bullmq");
const redis_1 = require("../../lib/redis");
const prisma_1 = require("../../lib/prisma");
const logger_1 = require("../../lib/logger");
const crawler_1 = require("../../modules/seo/crawler");
const keywordExtractor_1 = require("../../modules/seo/keywordExtractor");
const gapAnalyser_1 = require("../../modules/seo/gapAnalyser");
async function runSeoAudit(job) {
    const { auditId, clientUrl, competitorUrl } = job.data;
    const prisma = (0, prisma_1.getPrisma)();
    try {
        await prisma.seoAudit.update({ where: { id: auditId }, data: { status: 'crawling' } });
        logger_1.logger.info({ module: 'seoAuditWorker', auditId, clientUrl, competitorUrl }, 'Starting SEO audit');
        // Crawl both sites concurrently
        const [clientPages, competitorPages] = await Promise.all([
            (0, crawler_1.crawlUrl)(clientUrl),
            (0, crawler_1.crawlUrl)(competitorUrl),
        ]);
        await prisma.seoAudit.update({ where: { id: auditId }, data: { status: 'analysing' } });
        const clientKeywords = (0, keywordExtractor_1.extractKeywords)(clientPages);
        const competitorKeywords = (0, keywordExtractor_1.extractKeywords)(competitorPages);
        const gapKeywords = (0, gapAnalyser_1.analyseGap)(clientKeywords, competitorKeywords);
        await prisma.seoAudit.update({
            where: { id: auditId },
            data: {
                status: 'complete',
                clientKeywords: clientKeywords,
                competitorKeywords: competitorKeywords,
                gapKeywords: gapKeywords,
                completedAt: new Date(),
            },
        });
        logger_1.logger.info({ module: 'seoAuditWorker', auditId, gaps: gapKeywords.length }, 'SEO audit complete');
    }
    catch (err) {
        await prisma.seoAudit.update({ where: { id: auditId }, data: { status: 'failed' } }).catch(() => { });
        logger_1.logger.error({ module: 'seoAuditWorker', auditId, err }, 'SEO audit failed');
        throw err;
    }
}
let worker = null;
exports.seoAuditQueue = null;
function startSeoAuditWorker() {
    if (worker)
        return;
    const connection = (0, redis_1.getBullRedis)();
    exports.seoAuditQueue = new bullmq_1.Queue('v2-seo-audit', {
        connection,
        defaultJobOptions: { removeOnComplete: 20, removeOnFail: 50 },
    });
    worker = new bullmq_1.Worker('v2-seo-audit', runSeoAudit, { connection, concurrency: 2 });
    worker.on('failed', (job, err) => {
        logger_1.logger.error({ module: 'seoAuditWorker', auditId: job?.data?.auditId, err }, 'Job failed');
    });
    logger_1.logger.info({ module: 'seoAuditWorker' }, 'SEO audit worker started');
}
async function stopSeoAuditWorker() {
    if (worker) {
        await worker.close();
        worker = null;
    }
    if (exports.seoAuditQueue) {
        await exports.seoAuditQueue.close();
        exports.seoAuditQueue = null;
    }
}
//# sourceMappingURL=seoAuditWorker.js.map