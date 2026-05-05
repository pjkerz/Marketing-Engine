import { Pool } from 'pg';
import { loadEnv } from '../env';

let pool: Pool | null = null;
function getPool(): Pool {
  if (!pool) pool = new Pool({ connectionString: loadEnv().DATABASE_URL, max: 3 });
  return pool;
}

export interface LeadStatusInput {
  businessSlug: string;
  jobId?: string;
}

export interface LeadStatusResult {
  jobs: Array<{
    id: string;
    status: string;
    titles: string[];
    targetCount: number;
    saved: number;
    progress: string;
    createdAt: string;
    error?: string;
  }>;
  totalLeads: number;
  byStatus: Record<string, number>;
  note: string;
}

export async function getLeadStatus(input: LeadStatusInput): Promise<LeadStatusResult> {
  const bizResult = await getPool().query<{ id: string }>(
    `SELECT id FROM businesses WHERE slug = $1 AND active = true LIMIT 1`,
    [input.businessSlug],
  );
  if (!bizResult.rows[0]) throw new Error(`Tenant not found: ${input.businessSlug}`);
  const businessId = bizResult.rows[0].id;

  const jobWhere = input.jobId
    ? `"businessId" = $1 AND id = $2`
    : `"businessId" = $1`;
  const jobParams = input.jobId ? [businessId, input.jobId] : [businessId];

  const jobsResult = await getPool().query<{
    id: string; status: string; titles: string[];
    targetcount: number; saved: number; page: number;
    createdat: string; error: string | null;
  }>(
    `SELECT id, status, titles, "targetCount" as targetcount, saved, page,
            "createdAt" as createdat, error
     FROM lead_pull_jobs WHERE ${jobWhere}
     ORDER BY "createdAt" DESC LIMIT 10`,
    jobParams,
  );

  const statusResult = await getPool().query<{ status: string; count: string }>(
    `SELECT status, COUNT(*) as count FROM leads WHERE "businessId" = $1 GROUP BY status`,
    [businessId],
  );

  const totalResult = await getPool().query<{ count: string }>(
    `SELECT COUNT(*) as count FROM leads WHERE "businessId" = $1`,
    [businessId],
  );

  const byStatus: Record<string, number> = {};
  for (const row of statusResult.rows) byStatus[row.status] = parseInt(row.count, 10);

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
