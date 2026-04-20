"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.executeRecommendation = executeRecommendation;
const prisma_js_1 = require("../../lib/prisma.js");
const env_js_1 = require("../../config/env.js");
async function executeRecommendation(recommendationId, businessId) {
    const prisma = (0, prisma_js_1.getPrisma)();
    const rec = await prisma.crossChannelRecommendation.findFirst({ where: { id: recommendationId, businessId } });
    if (!rec)
        throw new Error('Recommendation not found');
    if (rec.status !== 'new')
        throw new Error('Recommendation already processed');
    const actions = rec.actions;
    const results = [];
    for (const action of actions) {
        try {
            if (!action.endpoint) {
                results.push({ channel: action.channel, action: action.action, success: true });
                continue;
            }
            const baseUrl = `http://localhost:${env_js_1.env.PORT}`;
            const resp = await fetch(`${baseUrl}${action.endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-admin-password': process.env.CONSOLE_PASSWORD ?? '' },
                body: JSON.stringify(action.payload ?? {}),
            });
            if (!resp.ok) {
                results.push({ channel: action.channel, action: action.action, success: false, error: `API ${resp.status}` });
                continue;
            }
            const data = await resp.json();
            results.push({ channel: action.channel, action: action.action, success: true, draftId: (data['id'] ?? data['runId'] ?? data['campaignId']) });
        }
        catch (err) {
            results.push({ channel: action.channel, action: action.action, success: false, error: err instanceof Error ? err.message : 'Unknown' });
        }
    }
    await prisma.crossChannelRecommendation.update({ where: { id: recommendationId }, data: { status: 'executed', executedAt: new Date() } });
    return results;
}
//# sourceMappingURL=autoExecutor.js.map