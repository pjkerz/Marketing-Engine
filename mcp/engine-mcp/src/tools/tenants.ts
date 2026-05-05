import { getPool } from '../db';

export async function listTenants() {
  const rows = await getPool().query(
    `SELECT b.id, b.slug, b.name, b.type, b.plan, b.active,
            bc."brandName", bc."sendingDomain", bc."warmupComplete",
            bc."dailySendCap", bc."autoApply"
     FROM businesses b
     LEFT JOIN business_configs bc ON bc."businessId" = b.id
     WHERE b.active = true
     ORDER BY b."createdAt"`,
  );
  return { tenants: rows.rows, total: rows.rowCount };
}

export async function getTenantConfig(input: { businessSlug: string }) {
  const rows = await getPool().query(
    `SELECT b.slug, b.name, b.type, b.plan,
            bc."brandName", bc."brandColor", bc."accentColor",
            bc."sendingDomain", bc."fromName", bc."fromEmail",
            bc."dailySendCap", bc."warmupComplete", bc."autoApply",
            bc."landingPageUrl", bc."pricingPageUrl",
            bc."commissionType", bc."commissionValue"
     FROM businesses b
     LEFT JOIN business_configs bc ON bc."businessId" = b.id
     WHERE b.slug = $1 LIMIT 1`,
    [input.businessSlug],
  );
  if (!rows.rows[0]) throw new Error(`Tenant not found: ${input.businessSlug}`);
  return rows.rows[0];
}

export async function getTeamUsers(input: { businessSlug: string }) {
  const rows = await getPool().query(
    `SELECT bc."teamUsers"
     FROM business_configs bc
     JOIN businesses b ON b.id = bc."businessId"
     WHERE b.slug = $1 LIMIT 1`,
    [input.businessSlug],
  );
  const teamUsers = (rows.rows[0]?.teamUsers as Array<{ username: string; email?: string }>) ?? [];
  return {
    users: teamUsers.map(u => ({ username: u.username, email: u.email ?? null })),
    total: teamUsers.length,
    note: 'Passwords are not returned for security.',
  };
}
