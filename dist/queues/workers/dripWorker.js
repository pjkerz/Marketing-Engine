"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startDripWorker = startDripWorker;
exports.stopDripWorker = stopDripWorker;
const bullmq_1 = require("bullmq");
const redis_1 = require("../../lib/redis");
const prisma_1 = require("../../lib/prisma");
const logger_1 = require("../../lib/logger");
const env_1 = require("../../config/env");
const resendClient_1 = require("../../modules/email/resendClient");
const spamEngine_1 = require("../../modules/email/spamEngine");
const BASE_URL = 'https://alphaboost.ngrok.app';
const UNSUB_SECRET = env_1.env.SESSION_STITCH_SECRET ?? 'unsub-secret-change-me';
function injectUnsubscribeLink(html, subscriberId) {
    const token = (0, spamEngine_1.generateUnsubToken)(subscriberId, UNSUB_SECRET);
    const unsubUrl = `${BASE_URL}/v2/api/email/unsubscribe?sid=${subscriberId}&token=${token}`;
    const link = `<p style="text-align:center;font-size:11px;color:#94a3b8;margin-top:32px">
    <a href="${unsubUrl}" style="color:#94a3b8">Unsubscribe</a>
  </p>`;
    if (html.includes('</body>'))
        return html.replace('</body>', `${link}</body>`);
    return html + link;
}
async function runDripCheck() {
    const prisma = (0, prisma_1.getPrisma)();
    // Find all active drip sequences
    const sequences = await prisma.emailDripSequence.findMany({
        where: { active: true },
        include: {
            steps: { orderBy: { stepNumber: 'asc' } },
        },
    });
    if (!sequences.length)
        return;
    const now = new Date();
    let totalSent = 0;
    for (const seq of sequences) {
        if (!seq.steps.length)
            continue;
        // Find active subscribers on this list who haven't received all steps
        const allSubs = await prisma.emailSubscriber.findMany({
            where: { listId: seq.listId, status: 'active' },
            select: { id: true, email: true, name: true, subscribedAt: true },
        });
        for (const sub of allSubs) {
            try {
                // Find which steps this subscriber has already received (tracked via dripStepId)
                const sentDripEvents = await prisma.emailSendEvent.findMany({
                    where: { subscriberId: sub.id, dripStepId: { not: null } },
                    select: { dripStepId: true },
                });
                const sentIds = new Set(sentDripEvents.map(e => e.dripStepId));
                for (const step of seq.steps) {
                    // Already sent this step to this subscriber?
                    if (sentIds.has(step.id))
                        continue;
                    // Check if enough time has passed since subscription
                    const daysSinceSubscribe = Math.floor((now.getTime() - sub.subscribedAt.getTime()) / (1000 * 60 * 60 * 24));
                    // For delay_days trigger type: send after N days from subscribe
                    if (seq.triggerType === 'on_subscribe' || seq.triggerType === 'delay_days') {
                        if (daysSinceSubscribe < step.delayDays)
                            continue; // Not time yet
                    }
                    // Check condition if set
                    if (step.condition) {
                        // Supported condition: "opened_previous" — only send if previous step was opened
                        if (step.condition === 'opened_previous' && step.stepNumber > 1) {
                            const prevStep = seq.steps.find(s => s.stepNumber === step.stepNumber - 1);
                            if (prevStep) {
                                const prevEvent = await prisma.emailSendEvent.findFirst({
                                    where: { subscriberId: sub.id, dripStepId: prevStep.id },
                                });
                                if (!prevEvent?.openedAt)
                                    continue; // Didn't open previous step
                            }
                        }
                    }
                    // Send this step
                    try {
                        let html = step.html;
                        html = injectUnsubscribeLink(html, sub.id);
                        const result = await (0, resendClient_1.sendEmail)({
                            from: env_1.env.EMAIL_FROM,
                            to: [sub.email],
                            subject: step.subject,
                            html,
                            text: step.text ?? undefined,
                        });
                        // Log as EmailSendEvent — use dripStepId to track drip sends (no campaignId)
                        await prisma.emailSendEvent.create({
                            data: {
                                dripStepId: step.id,
                                subscriberId: sub.id,
                                businessId: seq.businessId,
                                messageId: result.id,
                                status: 'sent',
                            },
                        });
                        totalSent++;
                        logger_1.logger.info({ module: 'dripWorker', sequenceId: seq.id, stepId: step.id, subscriberId: sub.id }, 'Drip step sent');
                    }
                    catch (e) {
                        logger_1.logger.error({ module: 'dripWorker', stepId: step.id, subscriberId: sub.id, err: e }, 'Failed to send drip step');
                    }
                    break; // Only send one pending step per subscriber per run
                }
            }
            catch (e) {
                logger_1.logger.error({ module: 'dripWorker', seqId: seq.id, subId: sub.id, err: e }, 'Error processing drip subscriber');
            }
        }
    }
    if (totalSent > 0) {
        logger_1.logger.info({ module: 'dripWorker', totalSent }, 'Drip check complete');
    }
}
let worker = null;
let schedulerQueue = null;
function startDripWorker() {
    if (worker)
        return;
    const connection = (0, redis_1.getBullRedis)();
    // Scheduled trigger queue
    schedulerQueue = new bullmq_1.Queue('v2-drip-scheduler', {
        connection,
        defaultJobOptions: { removeOnComplete: 10, removeOnFail: 50 },
    });
    // Register hourly repeatable job
    schedulerQueue.add('drip-check', {}, {
        repeat: { pattern: '0 * * * *' }, // every hour on the hour
        jobId: 'drip-check-hourly',
    }).catch(err => logger_1.logger.error({ module: 'dripWorker', err }, 'Failed to register drip schedule'));
    worker = new bullmq_1.Worker('v2-drip-scheduler', async () => {
        await runDripCheck();
    }, { connection, concurrency: 1 });
    worker.on('failed', (_job, err) => {
        logger_1.logger.error({ module: 'dripWorker', err }, 'Drip worker job failed');
    });
    logger_1.logger.info({ module: 'dripWorker' }, 'Drip worker started (runs hourly)');
}
async function stopDripWorker() {
    if (worker) {
        await worker.close();
        worker = null;
    }
    if (schedulerQueue) {
        await schedulerQueue.close();
        schedulerQueue = null;
    }
}
//# sourceMappingURL=dripWorker.js.map