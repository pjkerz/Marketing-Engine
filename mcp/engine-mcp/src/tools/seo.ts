import { getPool, resolveBusinessId } from '../db';

export async function getSeoAudits(input: { businessSlug: string; limit?: number }) {
  const businessId = await resolveBusinessId(input.businessSlug);
  const rows = await getPool().query(
    `SELECT id, url, status, score, issues_count, opportunities_count,
            "createdAt"
     FROM seo_audits WHERE "businessId" = $1
     ORDER BY "createdAt" DESC LIMIT $2`,
    [businessId, input.limit ?? 10],
  );
  return { audits: rows.rows, total: rows.rowCount };
}

export async function getSeoKeywordGaps(input: { businessSlug: string }) {
  const businessId = await resolveBusinessId(input.businessSlug);
  const rows = await getPool().query(
    `SELECT keyword, search_volume, difficulty, current_position,
            opportunity_score, recommended_action
     FROM seo_keyword_gaps WHERE "businessId" = $1
     ORDER BY opportunity_score DESC LIMIT 20`,
    [businessId],
  );
  return {
    gaps: rows.rows,
    note: `Top ${rows.rowCount} keyword opportunities by opportunity score.`,
  };
}

export async function getSeoContent(input: { businessSlug: string; status?: string }) {
  const businessId = await resolveBusinessId(input.businessSlug);
  const statusFilter = input.status ? `AND status = $2` : '';
  const params = input.status ? [businessId, input.status] : [businessId];
  const rows = await getPool().query(
    `SELECT id, title, keyword, status, word_count, published_url, "createdAt"
     FROM seo_content WHERE "businessId" = $1 ${statusFilter}
     ORDER BY "createdAt" DESC LIMIT 20`,
    params,
  );
  return { content: rows.rows, total: rows.rowCount };
}
