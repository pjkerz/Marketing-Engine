import { getPool, resolveBusinessId } from '../db';

export async function getDashboardSnapshot(input: { businessSlug: string; days?: number }) {
  const businessId = await resolveBusinessId(input.businessSlug);
  const days = input.days ?? 30;
  const since = new Date(Date.now() - days * 86400000);
  const prevSince = new Date(Date.now() - 2 * days * 86400000);

  const [funnel, prevFunnel, topAffiliates, recentCampaigns, leadCount] = await Promise.all([
    getPool().query(
      `SELECT "funnelStage", COUNT(*) AS count FROM funnel_events
       WHERE "businessId" = $1 AND timestamp >= $2 GROUP BY "funnelStage"`,
      [businessId, since],
    ),
    getPool().query(
      `SELECT "funnelStage", COUNT(*) AS count FROM funnel_events
       WHERE "businessId" = $1 AND timestamp >= $2 AND timestamp < $3 GROUP BY "funnelStage"`,
      [businessId, prevSince, since],
    ),
    getPool().query(
      `SELECT a.name, COUNT(DISTINCT ce.id) AS conversions
       FROM affiliates a
       JOIN conversion_events ce ON ce.affiliate_code = a.code AND ce."businessId" = $1 AND ce."occurredAt" >= $2
       WHERE a.business_id = $1
       GROUP BY a.id ORDER BY conversions DESC LIMIT 5`,
      [businessId, since],
    ),
    getPool().query(
      `SELECT name, status, sent_count,
              ROUND(open_count::numeric/NULLIF(sent_count,0)*100,1) AS open_rate_pct
       FROM email_campaigns WHERE "businessId" = $1 AND status = 'sent'
       ORDER BY "sentAt" DESC LIMIT 3`,
      [businessId],
    ),
    getPool().query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM leads WHERE "businessId" = $1 AND "openToWork" = true`,
      [businessId],
    ),
  ]);

  const funnelMap: Record<string, { count: number; change: number }> = {};
  const cur = Object.fromEntries(funnel.rows.map((r: { funnelStage: string; count: string }) => [r.funnelStage, parseInt(r.count, 10)]));
  const prev = Object.fromEntries(prevFunnel.rows.map((r: { funnelStage: string; count: string }) => [r.funnelStage, parseInt(r.count, 10)]));
  for (const stage of ['awareness', 'interest', 'consideration', 'conversion']) {
    const c = cur[stage] ?? 0, p = prev[stage] ?? 0;
    funnelMap[stage] = { count: c, change: p > 0 ? Math.round((c - p) / p * 100) : 0 };
  }

  return {
    period: `Last ${days} days`,
    funnel: funnelMap,
    overallCvr: funnelMap['awareness']?.count
      ? +((funnelMap['conversion']?.count ?? 0) / funnelMap['awareness'].count * 100).toFixed(2)
      : 0,
    topAffiliates: topAffiliates.rows,
    recentCampaigns: recentCampaigns.rows,
    totalOpenToWorkLeads: parseInt(leadCount.rows[0]?.count ?? '0', 10),
  };
}

export async function getFunnelBreakdown(input: { businessSlug: string; days?: number }) {
  const businessId = await resolveBusinessId(input.businessSlug);
  const since = new Date(Date.now() - (input.days ?? 30) * 86400000);
  const rows = await getPool().query(
    `SELECT "funnelStage", channel, COUNT(*) AS count
     FROM funnel_events WHERE "businessId" = $1 AND timestamp >= $2
     GROUP BY "funnelStage", channel ORDER BY "funnelStage", count DESC`,
    [businessId, since],
  );
  return { breakdown: rows.rows, period: `Last ${input.days ?? 30} days` };
}
