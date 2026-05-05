"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getLeadStatus = getLeadStatus;
const pg_1 = require("pg");
const env_1 = require("../env");
let pool = null;
function getPool() {
    if (!pool)
        pool = new pg_1.Pool({ connectionString: (0, env_1.loadEnv)().DATABASE_URL, max: 3 });
    return pool;
}
async function getLeadStatus(input) {
    const bizResult = await getPool().query(`SELECT id FROM businesses WHERE slug = $1 AND active = true LIMIT 1`, [input.businessSlug]);
    if (!bizResult.rows[0])
        throw new Error(`Tenant not found: ${input.businessSlug}`);
    const businessId = bizResult.rows[0].id;
    const jobWhere = input.jobId
        ? `"businessId" = $1 AND id = $2`
        : `"businessId" = $1`;
    const jobParams = input.jobId ? [businessId, input.jobId] : [businessId];
    const jobsResult = await getPool().query(`SELECT id, status, titles, "targetCount" as targetcount, saved, page,
            "createdAt" as createdat, error
     FROM lead_pull_jobs WHERE ${jobWhere}
     ORDER BY "createdAt" DESC LIMIT 10`, jobParams);
    const statusResult = await getPool().query(`SELECT status, COUNT(*) as count FROM leads WHERE "businessId" = $1 GROUP BY status`, [businessId]);
    const totalResult = await getPool().query(`SELECT COUNT(*) as count FROM leads WHERE "businessId" = $1`, [businessId]);
    const byStatus = {};
    for (const row of statusResult.rows)
        byStatus[row.status] = parseInt(row.count, 10);
    const jobs = jobsResult.rows.map(j => ({
        id: j.id,
        status: j.status,
        titles: j.titles,
        targetCount: j.targetcount,
        saved: j.saved,
        progress: `${j.saved}/${j.targetcount} (${Math.round((j.saved / Math.max(j.targetcount, 1)) * 100)}%)`,
        createdAt: j.createdat,
        ...(j.error ? { error: j.error } : {}),
    }));
    const totalLeads = parseInt(totalResult.rows[0]?.count ?? '0', 10);
    return {
        jobs,
        totalLeads,
        byStatus,
        note: `${totalLeads} total leads in tenant "${input.businessSlug}". ${jobs.length} pull job(s) found.`,
    };
}
//# sourceMappingURL=leadStatus.js.map