"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getEmailLists = getEmailLists;
exports.getCampaigns = getCampaigns;
exports.getEmailHealth = getEmailHealth;
exports.getDripSequences = getDripSequences;
const db_1 = require("../db");
async function getEmailLists(input) {
    const businessId = await (0, db_1.resolveBusinessId)(input.businessSlug);
    const rows = await (0, db_1.getPool)().query(`SELECT el.id, el.name, el.description, el.active,
            COUNT(es.id) AS subscriber_count,
            COUNT(es.id) FILTER (WHERE es.status = 'subscribed') AS active_subscribers
     FROM email_lists el
     LEFT JOIN email_subscribers es ON es.list_id = el.id
     WHERE el."businessId" = $1
     GROUP BY el.id ORDER BY el."createdAt" DESC`, [businessId]);
    return { lists: rows.rows, total: rows.rowCount };
}
async function getCampaigns(input) {
    const businessId = await (0, db_1.resolveBusinessId)(input.businessSlug);
    const statusFilter = input.status ? `AND c.status = $2` : '';
    const params = input.status ? [businessId, input.status] : [businessId];
    const rows = await (0, db_1.getPool)().query(`SELECT c.id, c.name, c.subject, c.status, c.sent_count, c.open_count,
            c.click_count, c.bounce_count, c.spam_count,
            ROUND(c.open_count::numeric / NULLIF(c.sent_count,0) * 100, 1) AS open_rate_pct,
            ROUND(c.click_count::numeric / NULLIF(c.sent_count,0) * 100, 1) AS click_rate_pct,
            c."createdAt", c."sentAt"
     FROM email_campaigns c
     WHERE c."businessId" = $1 ${statusFilter}
     ORDER BY c."createdAt" DESC LIMIT 20`, params);
    return { campaigns: rows.rows, total: rows.rowCount };
}
async function getEmailHealth(input) {
    const businessId = await (0, db_1.resolveBusinessId)(input.businessSlug);
    const configRow = await (0, db_1.getPool)().query(`SELECT "dailySendCap", "warmupComplete", "sendingDomain", "fromEmail"
     FROM business_configs WHERE "businessId" = $1`, [businessId]);
    const config = configRow.rows[0];
    const todaySent = await (0, db_1.getPool)().query(`SELECT COUNT(*) as count FROM email_campaigns
     WHERE "businessId" = $1 AND DATE("sentAt") = CURRENT_DATE AND status = 'sent'`, [businessId]);
    const bounceRate = await (0, db_1.getPool)().query(`SELECT ROUND(AVG(bounce_count::numeric / NULLIF(sent_count,0)) * 100, 2) AS rate
     FROM email_campaigns WHERE "businessId" = $1 AND sent_count > 0`, [businessId]);
    return {
        warmupComplete: config?.warmupComplete ?? false,
        sendingDomain: config?.sendingDomain ?? null,
        fromEmail: config?.fromEmail ?? null,
        dailySendCap: config?.dailySendCap ?? 500,
        sentToday: parseInt(todaySent.rows[0]?.count ?? '0', 10),
        avgBounceRatePct: parseFloat(bounceRate.rows[0]?.rate ?? '0'),
        note: config?.warmupComplete
            ? 'Domain warmed up — ready to send campaigns.'
            : 'WARNING: Domain warmup not complete. Run warmup before sending campaigns.',
    };
}
async function getDripSequences(input) {
    const businessId = await (0, db_1.resolveBusinessId)(input.businessSlug);
    const rows = await (0, db_1.getPool)().query(`SELECT s.id, s.name, s.status, s.trigger_event,
            COUNT(se.id) AS step_count,
            COUNT(DISTINCT ss.subscriber_id) AS enrolled_subscribers
     FROM drip_sequences s
     LEFT JOIN sequence_steps se ON se.sequence_id = s.id
     LEFT JOIN sequence_subscribers ss ON ss.sequence_id = s.id AND ss.status = 'active'
     WHERE s."businessId" = $1
     GROUP BY s.id ORDER BY s."createdAt" DESC`, [businessId]);
    return { sequences: rows.rows, total: rows.rowCount };
}
//# sourceMappingURL=email.js.map