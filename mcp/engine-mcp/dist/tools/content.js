"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getContentRuns = getContentRuns;
exports.getPendingContent = getPendingContent;
exports.getContentPerformance = getContentPerformance;
const db_1 = require("../db");
async function getContentRuns(input) {
    const businessId = await (0, db_1.resolveBusinessId)(input.businessSlug);
    const statusFilter = input.status ? `AND gr.status = $2` : '';
    const params = input.status ? [businessId, input.status] : [businessId];
    const rows = await (0, db_1.getPool)().query(`SELECT gr.id, gr.platform, gr.status, gr.brief,
            gr."autoApply", gr."createdAt",
            COUNT(gp.id) AS piece_count,
            COUNT(gp.id) FILTER (WHERE gp.status = 'approved') AS approved,
            COUNT(gp.id) FILTER (WHERE gp.status = 'pending') AS pending
     FROM content_generation_runs gr
     LEFT JOIN generated_pieces gp ON gp.run_id = gr.id
     WHERE gr."businessId" = $1 ${statusFilter}
     GROUP BY gr.id ORDER BY gr."createdAt" DESC LIMIT 20`, params);
    return { runs: rows.rows, total: rows.rowCount };
}
async function getPendingContent(input) {
    const businessId = await (0, db_1.resolveBusinessId)(input.businessSlug);
    const rows = await (0, db_1.getPool)().query(`SELECT gp.id, gp.platform, gp.status, gp.score,
            LEFT(gp.content, 200) AS content_preview,
            gr.brief, gp."createdAt"
     FROM generated_pieces gp
     JOIN content_generation_runs gr ON gr.id = gp.run_id
     WHERE gr."businessId" = $1 AND gp.status = 'scored'
     ORDER BY gp.score DESC LIMIT 20`, [businessId]);
    return {
        pendingApproval: rows.rows,
        total: rows.rowCount,
        note: (rows.rowCount ?? 0) > 0
            ? `${rows.rowCount} pieces awaiting approval. Review and approve in the Content Studio.`
            : 'No content pending approval.',
    };
}
async function getContentPerformance(input) {
    const businessId = await (0, db_1.resolveBusinessId)(input.businessSlug);
    const since = new Date(Date.now() - (input.days ?? 30) * 86400000);
    const rows = await (0, db_1.getPool)().query(`SELECT gp.platform,
            COUNT(DISTINCT gp.id) AS pieces_published,
            COUNT(DISTINCT fe.id) FILTER (WHERE fe.event_type = 'click') AS clicks,
            AVG(gp.score) AS avg_score
     FROM generated_pieces gp
     LEFT JOIN funnel_events fe ON fe."contentRunId" = gp.run_id
       AND fe."businessId" = $1 AND fe.timestamp >= $2
     JOIN content_generation_runs gr ON gr.id = gp.run_id AND gr."businessId" = $1
     WHERE gp.status = 'dispatched' AND gp."createdAt" >= $2
     GROUP BY gp.platform ORDER BY clicks DESC`, [businessId, since]);
    return { performance: rows.rows, period: `Last ${input.days ?? 30} days` };
}
//# sourceMappingURL=content.js.map