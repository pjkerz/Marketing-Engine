# Skill: System Health

## Purpose
Monitor service health — HTTP endpoints, BullMQ workers, PostgreSQL (Neon), Redis (Upstash), and all integration connections.

## Health Check Endpoint
```
GET /v2/health
→ { status: 'ok', version: '2.0.0', ts: ISO8601 }
```

## Infrastructure Components
| Component | Provider | Check Method |
|-----------|----------|-------------|
| PostgreSQL | Neon.tech | `prisma.$queryRaw\`SELECT 1\`` |
| Redis / BullMQ | Upstash | `redis.ping()` |
| LLM | Groq | test completion |
| Image Gen | Google AI (Imagen 4 Fast) | test generation |
| Email | Resend | API key validity |
| File Storage | Zoho WorkDrive | token validity |

## Workers to Monitor
| Worker | Queue | Healthy Signal |
|--------|-------|---------------|
| resumeParseWorker | resume-parse | queue depth < 100, no stalled jobs |
| profileExtractWorker | profile-extract | queue depth < 50, avg processing < 30s |
| contentScoreWorker | content-score | queue depth < 200, no stalled jobs |
| dispatchWorker | dispatch | queue depth < 50, no failed jobs |
| mediaCleanupWorker | media-cleanup | running on schedule |
| providerDeleteWorker | provider-delete | no stalled jobs |
| optimisationWorker | optimisation | runs nightly successfully |
| csvExportWorker | csv-export | no stalled jobs |
| emailUploadWorker | email-upload | queue depth < 500 |
| dripWorker | drip | no missed triggers |
| seoAuditWorker | seo-audit | queue depth < 20 |
| llmPresenceWorker | llm-presence | queue depth < 10 |
| dashboardWorker | dashboard | nightly run successful |

## Key Source Files
- `src/index.ts` — health endpoint, worker start/stop
- `src/lib/redis.ts` — Redis connection
- `src/lib/prisma.ts` — Prisma client
- `src/queues/index.ts` — queue definitions
- `src/middleware/errorHandler.ts`

## Alert Thresholds
- Any worker with > 10 failed jobs in last hour → critical
- Queue depth > 1000 → warning
- API response time > 5s → warning
- DB connection failure → critical
- Redis connection failure → critical

## Recovery Procedures
- Stalled jobs: use BullMQ `obliterate` or `clean` to clear old stalled jobs
- DB connection: check `DATABASE_URL` env var; Neon may need connection pool reset
- Redis: check `REDIS_URL` / `UPSTASH_REDIS_REST_URL` env vars
- Graceful shutdown: SIGTERM → all workers stop cleanly before process exits

## Learning Loop Hook
Every hour: check worker health and queue depths.
Append anomalies to `skills/system-health-memory.md` under **Health Events**.
