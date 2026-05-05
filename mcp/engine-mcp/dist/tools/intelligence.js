"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRecommendations = getRecommendations;
exports.getIntelligenceFeed = getIntelligenceFeed;
exports.getSystemHealth = getSystemHealth;
const db_1 = require("../db");
async function getRecommendations(input) {
    const businessId = await (0, db_1.resolveBusinessId)(input.businessSlug);
    const statusFilter = input.status ? `AND status = $2` : `AND status = 'new'`;
    const params = input.status ? [businessId, input.status] : [businessId];
    const rows = await (0, db_1.getPool)().query(`SELECT id, type, title, description, impact, effort, status, "createdAt"
     FROM optimisation_insights WHERE "businessId" = $1 ${statusFilter}
     ORDER BY impact DESC LIMIT 20`, params);
    return {
        recommendations: rows.rows,
        total: rows.rowCount,
        note: `${rows.rowCount} ${input.status ?? 'new'} recommendations. High-impact items listed first.`,
    };
}
async function getIntelligenceFeed(input) {
    const businessId = await (0, db_1.resolveBusinessId)(input.businessSlug);
    const readFilter = input.unreadOnly !== false ? `AND read = false` : '';
    const rows = await (0, db_1.getPool)().query(`SELECT id, type, title, detail, "actionLabel", "actionEndpoint", read, "createdAt"
     FROM intelligence_feed_events WHERE "businessId" = $1 ${readFilter}
     ORDER BY "createdAt" DESC LIMIT 20`, [businessId]);
    return { feed: rows.rows, total: rows.rowCount };
}
async function getSystemHealth(input) {
    const businessId = await (0, db_1.resolveBusinessId)(input.businessSlug);
    const [workerErrors, pendingJobs, recentConversions] = await Promise.all([
        (0, db_1.getPool)().query(`SELECT COUNT(*) as count FROM audit_logs
       WHERE action LIKE '%_failed' AND "createdAt" >= NOW() - INTERVAL '1 hour'`, []),
        (0, db_1.getPool)().query(`SELECT status, COUNT(*) as count FROM content_generation_runs
       WHERE "businessId" = $1 AND status IN ('pending','generating')
       GROUP BY status`, [businessId]),
        (0, db_1.getPool)().query(`SELECT COUNT(*) as count FROM conversion_events
       WHERE "businessId" = $1 AND "occurredAt" >= NOW() - INTERVAL '24 hours'`, [businessId]),
    ]);
    return {
        workerErrorsLastHour: parseInt(workerErrors.rows[0]?.count ?? '0', 10),
        pendingJobs: pendingJobs.rows,
        conversionsLast24h: parseInt(recentConversions.rows[0]?.count ?? '0', 10),
        status: parseInt(workerErrors.rows[0]?.count ?? '0', 10) > 5 ? 'degraded' : 'healthy',
    };
}
//# sourceMappingURL=intelligence.js.map