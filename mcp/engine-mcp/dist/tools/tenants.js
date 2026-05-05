"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listTenants = listTenants;
exports.getTenantConfig = getTenantConfig;
exports.getTeamUsers = getTeamUsers;
const db_1 = require("../db");
async function listTenants() {
    const rows = await (0, db_1.getPool)().query(`SELECT b.id, b.slug, b.name, b.type, b.plan, b.active,
            bc."brandName", bc."sendingDomain", bc."warmupComplete",
            bc."dailySendCap", bc."autoApply"
     FROM businesses b
     LEFT JOIN business_configs bc ON bc."businessId" = b.id
     WHERE b.active = true
     ORDER BY b."createdAt"`);
    return { tenants: rows.rows, total: rows.rowCount };
}
async function getTenantConfig(input) {
    const rows = await (0, db_1.getPool)().query(`SELECT b.slug, b.name, b.type, b.plan,
            bc."brandName", bc."brandColor", bc."accentColor",
            bc."sendingDomain", bc."fromName", bc."fromEmail",
            bc."dailySendCap", bc."warmupComplete", bc."autoApply",
            bc."landingPageUrl", bc."pricingPageUrl",
            bc."commissionType", bc."commissionValue"
     FROM businesses b
     LEFT JOIN business_configs bc ON bc."businessId" = b.id
     WHERE b.slug = $1 LIMIT 1`, [input.businessSlug]);
    if (!rows.rows[0])
        throw new Error(`Tenant not found: ${input.businessSlug}`);
    return rows.rows[0];
}
async function getTeamUsers(input) {
    const rows = await (0, db_1.getPool)().query(`SELECT bc."teamUsers"
     FROM business_configs bc
     JOIN businesses b ON b.id = bc."businessId"
     WHERE b.slug = $1 LIMIT 1`, [input.businessSlug]);
    const teamUsers = rows.rows[0]?.teamUsers ?? [];
    return {
        users: teamUsers.map(u => ({ username: u.username, email: u.email ?? null })),
        total: teamUsers.length,
        note: 'Passwords are not returned for security.',
    };
}
//# sourceMappingURL=tenants.js.map