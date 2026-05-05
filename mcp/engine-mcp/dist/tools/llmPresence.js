"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getLlmAudits = getLlmAudits;
exports.getKeywordIntelligence = getKeywordIntelligence;
const db_1 = require("../db");
async function getLlmAudits(input) {
    const businessId = await (0, db_1.resolveBusinessId)(input.businessSlug);
    const rows = await (0, db_1.getPool)().query(`SELECT id, platform, query, mentioned, rank, sentiment,
            excerpt, "auditedAt"
     FROM llm_presence_audits WHERE "businessId" = $1
     ORDER BY "auditedAt" DESC LIMIT $2`, [businessId, input.limit ?? 20]);
    const summary = await (0, db_1.getPool)().query(`SELECT platform,
            COUNT(*) AS total_queries,
            COUNT(*) FILTER (WHERE mentioned = true) AS mentioned_count,
            ROUND(COUNT(*) FILTER (WHERE mentioned = true)::numeric / NULLIF(COUNT(*),0) * 100, 1) AS mention_rate_pct
     FROM llm_presence_audits WHERE "businessId" = $1
     GROUP BY platform`, [businessId]);
    return {
        audits: rows.rows,
        summary: summary.rows,
        note: `LLM presence across ${summary.rowCount} platforms. Higher mention rate = better AI visibility.`,
    };
}
async function getKeywordIntelligence(input) {
    const businessId = await (0, db_1.resolveBusinessId)(input.businessSlug);
    const rows = await (0, db_1.getPool)().query(`SELECT keyword, platform, avg_cpc, avg_cpm, competition_level,
            search_volume, trend_direction, "updatedAt"
     FROM keyword_intelligence WHERE "businessId" = $1
     ORDER BY search_volume DESC LIMIT 30`, [businessId]);
    return { keywords: rows.rows, total: rows.rowCount };
}
//# sourceMappingURL=llmPresence.js.map