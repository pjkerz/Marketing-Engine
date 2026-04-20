"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fireMakeWebhook = fireMakeWebhook;
/**
 * makeWebhook.ts
 * Fires a payload to the Make.com custom webhook URL when content is approved.
 * No-ops silently if MAKE_WEBHOOK_URL is not configured.
 */
const env_1 = require("../config/env");
const logger_1 = require("./logger");
async function fireMakeWebhook(payload) {
    if (!env_1.env.MAKE_WEBHOOK_URL)
        return;
    try {
        const res = await fetch(env_1.env.MAKE_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        if (!res.ok) {
            logger_1.logger.warn({ module: 'makeWebhook', runId: payload.runId, status: res.status }, 'Make webhook returned non-2xx');
        }
        else {
            logger_1.logger.info({ module: 'makeWebhook', runId: payload.runId, channel: payload.channel }, 'Make webhook fired');
        }
    }
    catch (err) {
        // Never throw — webhook failure must not break the approval flow
        logger_1.logger.error({ module: 'makeWebhook', runId: payload.runId, err: err.message }, 'Make webhook failed');
    }
}
//# sourceMappingURL=makeWebhook.js.map