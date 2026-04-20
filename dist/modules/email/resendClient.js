"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendEmail = sendEmail;
const env_1 = require("../../config/env");
const logger_1 = require("../../lib/logger");
async function sendEmail(params) {
    const apiKey = env_1.env.RESEND_API_KEY;
    if (!apiKey) {
        logger_1.logger.warn({ module: 'resendClient' }, 'RESEND_API_KEY not configured — email not sent');
        throw new Error('RESEND_API_KEY not configured in environment');
    }
    const resp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            from: params.from,
            to: params.to,
            subject: params.subject,
            html: params.html,
            text: params.text,
            ...(params.replyTo ? { reply_to: params.replyTo } : {}),
            ...(params.headers ? { headers: params.headers } : {}),
        }),
    });
    if (!resp.ok) {
        const body = await resp.text();
        logger_1.logger.error({ module: 'resendClient', status: resp.status, body }, 'Resend API error');
        throw new Error(`Resend API error ${resp.status}: ${body}`);
    }
    const data = await resp.json();
    return { id: data.id };
}
//# sourceMappingURL=resendClient.js.map