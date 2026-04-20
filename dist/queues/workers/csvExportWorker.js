"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generatePlatformCSV = generatePlatformCSV;
exports.startCsvExportWorker = startCsvExportWorker;
exports.stopCsvExportWorker = stopCsvExportWorker;
const bullmq_1 = require("bullmq");
const redis_1 = require("../../lib/redis");
const prisma_1 = require("../../lib/prisma");
const logger_1 = require("../../lib/logger");
let worker = null;
let schedulerQueue = null;
const QUEUE_NAME = 'v2-csv-export';
// ── CSV generation helper ─────────────────────────────────────────────────────
function csvEscape(value) {
    // Wrap in double quotes and escape internal quotes as ""
    return '"' + value.replace(/"/g, '""') + '"';
}
function formatSendibleDate(d) {
    // YYYY-MM-DD HH:mm
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
async function generatePlatformCSV(businessId, platform) {
    const prisma = (0, prisma_1.getPrisma)();
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
    const assetIds = slots.map(s => s.mediaAssetId).filter(Boolean);
    const assets = {};
    if (assetIds.length > 0) {
        const found = await prisma.contentLibraryAsset.findMany({
            where: { id: { in: assetIds } },
            select: { id: true, url: true },
        });
        found.forEach(a => { assets[a.id] = a.url; });
    }
    // Group by platform
    const byPlatform = {};
    slots.forEach(slot => {
        if (!byPlatform[slot.platform])
            byPlatform[slot.platform] = [];
        byPlatform[slot.platform].push(slot);
    });
    const results = [];
    for (const [plat, platSlots] of Object.entries(byPlatform)) {
        const rows = ['Message,SendDate,URL,Image'];
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
async function runCsvExport(_job) {
    const prisma = (0, prisma_1.getPrisma)();
    // Get all active businesses
    const businesses = await prisma.business.findMany({
        where: { active: true },
        select: { id: true, name: true },
    });
    for (const biz of businesses) {
        try {
            const results = await generatePlatformCSV(biz.id);
            const totalPosts = results.reduce((a, r) => a + r.count, 0);
            if (totalPosts === 0)
                continue;
            logger_1.logger.info({ module: 'csvExportWorker', businessId: biz.id, businessName: biz.name, platforms: results.map(r => r.platform), totalPosts }, 'CSV export run complete');
            // Note: email notification added in Module 07 when AlphaMail is extended
        }
        catch (err) {
            logger_1.logger.error({ module: 'csvExportWorker', businessId: biz.id, err }, 'CSV export failed for business');
        }
    }
}
// ── Scheduler setup ───────────────────────────────────────────────────────────
function startCsvExportWorker() {
    const connection = (0, redis_1.getBullRedis)();
    schedulerQueue = new bullmq_1.Queue(QUEUE_NAME, { connection });
    // Schedule: 6am and 6pm UTC daily
    schedulerQueue.add('csv-export-6am', {}, {
        repeat: { pattern: '0 6 * * *' },
        jobId: 'csv-export-6am',
    });
    schedulerQueue.add('csv-export-6pm', {}, {
        repeat: { pattern: '0 18 * * *' },
        jobId: 'csv-export-6pm',
    });
    worker = new bullmq_1.Worker(QUEUE_NAME, async (job) => { await runCsvExport(job); }, { connection, concurrency: 1 });
    worker.on('completed', (job) => {
        logger_1.logger.info({ module: 'csvExportWorker', jobId: job.id }, 'CSV export job completed');
    });
    worker.on('failed', (job, err) => {
        logger_1.logger.error({ module: 'csvExportWorker', jobId: job?.id, err }, 'CSV export job failed');
    });
    logger_1.logger.info({ module: 'csvExportWorker' }, 'CSV export worker started (6am + 6pm UTC)');
}
async function stopCsvExportWorker() {
    await worker?.close();
    await schedulerQueue?.close();
}
//# sourceMappingURL=csvExportWorker.js.map