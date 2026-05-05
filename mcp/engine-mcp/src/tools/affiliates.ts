import { getPool, resolveBusinessId } from '../db';

export async function getAffiliates(input: { businessSlug: string; activeOnly?: boolean }) {
  const businessId = await resolveBusinessId(input.businessSlug);
  const where = input.activeOnly !== false ? `AND a.active = true` : '';
  const rows = await getPool().query(
    `SELECT a.id, a.code, a.name, a.email, a.active, a.created_at,
            COUNT(DISTINCT fe.id) FILTER (WHERE fe.event_type='click') AS clicks,
            COUNT(DISTINCT ce.id) AS conversions
     FROM affiliates a
     LEFT JOIN funnel_events fe ON fe.affiliate_code = a.code AND fe."businessId" = $1
     LEFT JOIN conversion_events ce ON ce.affiliate_code = a.code AND ce."businessId" = $1
     WHERE a.business_id = $1 ${where}
     GROUP BY a.id ORDER BY conversions DESC, clicks DESC`,
    [businessId],
  );
  return {
    affiliates: rows.rows,
    total: rows.rowCount,
    note: `${rows.rowCount} affiliates for tenant "${input.businessSlug}"`,
  };
}

export async function getAffiliateLeaderboard(input: { businessSlug: string; days?: number }) {
  const businessId = await resolveBusinessId(input.businessSlug);
  const since = new Date(Date.now() - (input.days ?? 30) * 86400000);
  const rows = await getPool().query(
    `SELECT a.name, a.code, a.email,
            COUNT(DISTINCT fe.id) FILTER (WHERE fe.event_type='click') AS clicks,
            COUNT(DISTINCT ce.id) AS conversions,
            ROUND(COUNT(DISTINCT ce.id)::numeric / NULLIF(COUNT(DISTINCT fe.id) FILTER (WHERE fe.event_type='click'),0) * 100, 1) AS cvr_pct
     FROM affiliates a
     LEFT JOIN funnel_events fe ON fe.affiliate_code = a.code AND fe."businessId" = $1 AND fe.timestamp >= $2
     LEFT JOIN conversion_events ce ON ce.affiliate_code = a.code AND ce."businessId" = $1 AND ce."occurredAt" >= $2
     WHERE a.business_id = $1 AND a.active = true
     GROUP BY a.id ORDER BY conversions DESC, clicks DESC LIMIT 20`,
    [businessId, since],
  );
  return {
    leaderboard: rows.rows,
    period: `Last ${input.days ?? 30} days`,
    note: `Top ${rows.rowCount} affiliates by conversions`,
  };
}

export async function getCommissions(input: { businessSlug: string; status?: string }) {
  const businessId = await resolveBusinessId(input.businessSlug);
  const statusFilter = input.status ? `AND c.status = $2` : '';
  const params = input.status ? [businessId, input.status] : [businessId];
  const rows = await getPool().query(
    `SELECT c.id, c.affiliate_code, c.amount, c.status, c.created_at,
            a.name AS affiliate_name, a.email AS affiliate_email
     FROM commissions c
     LEFT JOIN affiliates a ON a.code = c.affiliate_code AND a.business_id = $1
     WHERE c.business_id = $1 ${statusFilter}
     ORDER BY c.created_at DESC LIMIT 50`,
    params,
  );
  return { commissions: rows.rows, total: rows.rowCount };
}
