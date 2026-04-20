"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.llmPresenceQueue = void 0;
exports.startLlmPresenceWorker = startLlmPresenceWorker;
exports.stopLlmPresenceWorker = stopLlmPresenceWorker;
const bullmq_1 = require("bullmq");
const redis_1 = require("../../lib/redis");
const prisma_1 = require("../../lib/prisma");
const logger_1 = require("../../lib/logger");
const llmQueryClients_1 = require("../../modules/llmPresence/llmQueryClients");
const responseAnalyser_1 = require("../../modules/llmPresence/responseAnalyser");
const GROQ_API_KEY = process.env['GROQ_API_KEY'] ?? '';
const DEFAULT_QUERIES = [
    { query: 'What are the best tools for finding jobs that are not posted online?', category: 'consideration' },
    { query: 'How do I access the hidden job market?', category: 'awareness' },
    { query: 'What AI tools help with job searching?', category: 'comparison' },
    { query: 'Recommend a platform for career coaching and job search strategy', category: 'recommendation' },
    { query: 'How do I get a job through networking and referrals?', category: 'awareness' },
    { query: 'What is the best way to get promoted at work?', category: 'consideration' },
    { query: 'Which AI career tools are worth paying for?', category: 'comparison' },
    { query: 'How can I use AI to improve my resume?', category: 'awareness' },
];
async function generateRecommendation(query, brandName, llmName, competitorMentioned) {
    if (!GROQ_API_KEY)
        return '';
    try {
        const prompt = `${llmName} did not mention ${brandName} when asked: "${query}".${competitorMentioned ? ` Instead, it mentioned ${competitorMentioned}.` : ''}

What content should ${brandName} create to improve its LLM visibility for this query? Be specific and actionable. 2-3 sentences.`;
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_API_KEY}` },
            body: JSON.stringify({
                model: 'llama-3.1-8b-instant',
                max_tokens: 200,
                messages: [
                    { role: 'system', content: 'You are an LLM SEO strategist. Give specific, actionable content recommendations.' },
                    { role: 'user', content: prompt },
                ],
            }),
        });
        const d = await res.json();
        return d.choices?.[0]?.message?.content?.trim() ?? '';
    }
    catch {
        return '';
    }
}
async function runPresenceAudit(job) {
    const { auditId, businessId } = job.data;
    const prisma = (0, prisma_1.getPrisma)();
    try {
        const audit = await prisma.llmPresenceAudit.findUnique({ where: { id: auditId } });
        if (!audit)
            return;
        await prisma.llmPresenceAudit.update({ where: { id: auditId }, data: { status: 'running' } });
        const config = await prisma.businessConfig.findUnique({ where: { businessId } });
        const brandName = config?.brandName ?? 'AlphaBoost';
        const competitors = audit.competitors ?? [];
        const customQueries = audit.queries ?? [];
        const queries = customQueries.length > 0 ? customQueries : DEFAULT_QUERIES;
        const llmNames = ['chatgpt', 'claude', 'gemini', 'perplexity'];
        const BATCH_SIZE = 5;
        let totalResults = 0;
        let brandMentions = 0;
        // Process queries in batches of 5
        for (let batchStart = 0; batchStart < queries.length; batchStart += BATCH_SIZE) {
            const batch = queries.slice(batchStart, batchStart + BATCH_SIZE);
            await Promise.all(batch.map(async ({ query, category }) => {
                // Query all 4 LLMs in parallel for this query
                const llmResponses = await (0, llmQueryClients_1.queryAllLlms)(query);
                for (const llmName of llmNames) {
                    const { response, failed, error } = llmResponses[llmName];
                    if (failed || !response) {
                        await prisma.llmPresenceResult.create({
                            data: {
                                auditId,
                                businessId,
                                llmName,
                                query,
                                queryCategory: category,
                                response: '',
                                failed: true,
                                recommendations: error,
                            },
                        });
                        continue;
                    }
                    const analysis = await (0, responseAnalyser_1.analyseResponse)(response, brandName, competitors);
                    if (analysis.mentionsBrand)
                        brandMentions++;
                    const topCompetitorMentioned = analysis.mentionsCompetitors[0]?.name ?? null;
                    let recommendations = '';
                    if (!analysis.mentionsBrand) {
                        recommendations = await generateRecommendation(query, brandName, llmName, topCompetitorMentioned);
                    }
                    await prisma.llmPresenceResult.create({
                        data: {
                            auditId,
                            businessId,
                            llmName,
                            query,
                            queryCategory: category,
                            response: response.slice(0, 4000),
                            mentionsBrand: analysis.mentionsBrand,
                            brandContext: analysis.brandContext,
                            mentionsCompetitors: analysis.mentionsCompetitors,
                            authorityLanguage: analysis.authorityLanguage,
                            recommendations,
                            failed: false,
                        },
                    });
                    totalResults++;
                }
            }));
        }
        // Calculate summary
        const mentionRate = totalResults > 0 ? brandMentions / totalResults : 0;
        const allResults = await prisma.llmPresenceResult.findMany({
            where: { auditId, failed: false },
            select: { llmName: true, mentionsBrand: true, mentionsCompetitors: true, query: true },
        });
        // Per-LLM mention rates
        const llmRates = {};
        for (const llm of llmNames) {
            const llmResults = allResults.filter(r => r.llmName === llm);
            llmRates[llm] = llmResults.length > 0
                ? llmResults.filter(r => r.mentionsBrand).length / llmResults.length
                : 0;
        }
        // Top gap queries (competitor mentioned, brand not)
        const gapQueries = allResults
            .filter(r => !r.mentionsBrand && r.mentionsCompetitors.length > 0)
            .map(r => r.query)
            .slice(0, 10);
        await prisma.llmPresenceAudit.update({
            where: { id: auditId },
            data: {
                status: 'complete',
                completedAt: new Date(),
                summary: {
                    brandMentionRate: mentionRate,
                    brandMentions,
                    totalResults,
                    llmRates,
                    topGapQueries: [...new Set(gapQueries)],
                },
            },
        });
        logger_1.logger.info({ module: 'llmPresenceWorker', auditId, brandMentions, totalResults }, 'LLM presence audit complete');
    }
    catch (err) {
        await prisma.llmPresenceAudit.update({ where: { id: auditId }, data: { status: 'failed' } }).catch(() => { });
        logger_1.logger.error({ module: 'llmPresenceWorker', auditId, err }, 'LLM presence audit failed');
        throw err;
    }
}
let worker = null;
exports.llmPresenceQueue = null;
function startLlmPresenceWorker() {
    if (worker)
        return;
    const connection = (0, redis_1.getBullRedis)();
    exports.llmPresenceQueue = new bullmq_1.Queue('v2-llm-presence', {
        connection,
        defaultJobOptions: { removeOnComplete: 10, removeOnFail: 20 },
    });
    worker = new bullmq_1.Worker('v2-llm-presence', runPresenceAudit, { connection, concurrency: 1 });
    worker.on('failed', (job, err) => {
        logger_1.logger.error({ module: 'llmPresenceWorker', auditId: job?.data?.auditId, err }, 'Job failed');
    });
    logger_1.logger.info({ module: 'llmPresenceWorker' }, 'LLM presence worker started');
}
async function stopLlmPresenceWorker() {
    if (worker) {
        await worker.close();
        worker = null;
    }
    if (exports.llmPresenceQueue) {
        await exports.llmPresenceQueue.close();
        exports.llmPresenceQueue = null;
    }
}
//# sourceMappingURL=llmPresenceWorker.js.map