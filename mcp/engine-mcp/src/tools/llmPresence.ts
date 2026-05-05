import { getPool, resolveBusinessId } from '../db';

export async function getLlmAudits(input: { businessSlug: string; limit?: number }) {
  const businessId = await resolveBusinessId(input.businessSlug);
  const rows = await getPool().query(
    `SELECT id, platform, query, mentioned, rank, sentiment,
            excerpt, "auditedAt"
     FROM llm_presence_audits WHERE "businessId" = $1
     ORDER BY "auditedAt" DESC LIMIT $2`,
    [businessId, input.limit ?? 20],
  );

  const summary = await getPool().query(
    `SELECT platform,
            COUNT(*) AS total_queries,
            COUNT(*) FILTER (WHERE mentioned = true) AS mentioned_count,
            ROUND(COUNT(*) FILTER (WHERE mentioned = true)::numeric / NULLIF(COUNT(*),0) * 100, 1) AS mention_rate_pct
     FROM llm_presence_audits WHERE "businessId" = $1
     GROUP BY platform`,
    [businessId],
  );

  return {
    audits: rows.rows,
    summary: summary.rows,
    note: `LLM presence across ${summary.rowCount} platforms. Higher mention rate = better AI visibility.`,
  };
}

export async function getKeywordIntelligence(input: { businessSlug: string }) {
  const businessId = await resolveBusinessId(input.businessSlug);
  const rows = await getPool().query(
    `SELECT keyword, platform, avg_cpc, avg_cpm, competition_level,
            search_volume, trend_direction, "updatedAt"
     FROM keyword_intelligence WHERE "businessId" = $1
     ORDER BY search_volume DESC LIMIT 30`,
    [businessId],
  );
  return { keywords: rows.rows, total: rows.rowCount };
}
