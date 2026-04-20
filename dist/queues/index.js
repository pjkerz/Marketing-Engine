"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getQueues = getQueues;
exports.closeQueues = closeQueues;
const bullmq_1 = require("bullmq");
const redis_1 = require("../lib/redis");
let queues = null;
const QUEUE_NAMES = [
    'v2-resume-parse',
    'v2-profile-extract',
    'v2-content-score',
    'v2-content-dispatch',
    'v2-media-cleanup',
    'v2-provider-delete',
    'v2-email-upload',
    'v2-dashboard',
];
function getQueues() {
    if (!queues) {
        const connection = (0, redis_1.getBullRedis)();
        queues = Object.fromEntries(QUEUE_NAMES.map((name) => [
            name,
            new bullmq_1.Queue(name, { connection, defaultJobOptions: { removeOnComplete: 100, removeOnFail: 500 } }),
        ]));
    }
    return queues;
}
async function closeQueues() {
    if (queues) {
        await Promise.all(Object.values(queues).map((q) => q.close()));
        queues = null;
    }
}
//# sourceMappingURL=index.js.map