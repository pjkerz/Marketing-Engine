"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSeoAudits = getSeoAudits;
exports.getSeoKeywordGaps = getSeoKeywordGaps;
exports.getSeoContent = getSeoContent;
const db_1 = require("../db");
async function getSeoAudits(input) {
    const businessId = await (0, db_1.resolveBusinessId)(input.businessSlug);
    const rows = await (0, db_1.getPool)().query(`SELECT id, url, status, score, issues_count, opportunities_count,
            "createdAt"
     FROM seo_audits WHERE "businessId" = $1
     ORDER BY "createdAt" DESC LIMIT $2`, [businessId, input.limit ?? 10]);
    return { audits: rows.rows, total: rows.rowCount };
}
async function getSeoKeywordGaps(input) {
    const businessId = await (0, db_1.resolveBusinessId)(input.businessSlug);
    const rows = await (0, db_1.getPool)().query(`SELECT keyword, search_volume, difficulty, current_position,
            opportunity_score, recommended_action
     FROM seo_keyword_gaps WHERE "businessId" = $1
     ORDER BY opportunity_score DESC LIMIT 20`, [businessId]);
    return {
        gaps: rows.rows,
        note: `Top ${rows.rowCount} keyword opportunities by opportunity score.`,
    };
}
async function getSeoContent(input) {
    const businessId = await (0, db_1.resolveBusinessId)(input.businessSlug);
    const statusFilter = input.status ? `AND status = $2` : '';
    const params = input.status ? [businessId, input.status] : [businessId];
    const rows = await (0, db_1.getPool)().query(`SELECT id, title, keyword, status, word_count, published_url, "createdAt"
     FROM seo_content WHERE "businessId" = $1 ${statusFilter}
     ORDER BY "createdAt" DESC LIMIT 20`, params);
    return { content: rows.rows, total: rows.rowCount };
}
//# sourceMappingURL=seo.js.map