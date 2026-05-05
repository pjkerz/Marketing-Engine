# CLAUDE.md — AlphaNoetics Marketing Engine (v2)

## What this is
TypeScript/Express service — the core business logic engine for AlphaNoetics.
Multi-tenant, PostgreSQL-backed, BullMQ queues, Groq LLM, Imagen 4 image gen.

## Owner
Paul Kersey — Noetica LLC

## Deployment
- GitHub: https://github.com/pjkerz/Marketing-Engine
- Host: Digital Ocean App Platform (auto-deploy on push to main)
- App spec: .do/app.yaml
- Production URL: https://alphanoetic.me
- Local: http://localhost:3457

## Key infrastructure
| Service | Provider | Status |
|---------|----------|--------|
| PostgreSQL | Neon.tech | Live — credentials in .env |
| Redis / BullMQ | Upstash | Live — credentials in .env |
| LLM | Groq (llama-3.3-70b) | Live — key in .env |
| Image gen | Google AI (Imagen 4 Fast) | Live — key in .env |
| Email | Resend | Live — key in .env |
| File storage | Zoho WorkDrive | Live — tokens in .env |

## Environment
All secrets in `~/.openclaw/v2/.env`
These same values must be set in Digital Ocean App Settings → Environment Variables

## Start command
```bash
node dist/index.js    # production (compiled)
npm run dev           # development (ts-node-dev)
npm run build         # compile TypeScript → dist/
```

## Database
```bash
npm run db:migrate    # run pending migrations (prisma migrate deploy)
npm run db:seed       # seed AlphaBoost as first tenant
```

## Health check
```bash
curl http://localhost:3457/v2/health
```

## Architecture
```
src/
  config/       — env validation (Zod)
  middleware/   — auth, rate limiting, error handling
  modules/
    profile/    — affiliate routes, content plans
    media/      — file upload, Zoho integration
    admin/      — admin routes
    tracking/   — funnel events, session stitching
    email/      — campaigns, drip sequences, spam engine
    seo/        — crawler, keyword extractor, gap analyser
    keywords/   — Google Ads + Microsoft Ads intelligence
    llmPresence/ — ChatGPT/Claude/Gemini/Perplexity audits
    dashboard/  — pre-computed snapshots
    intelligence/ — unified cross-channel recommendations
  queues/workers/ — BullMQ background jobs
  lib/          — shared utilities
  integrations/ — Zoho, Sendible, Google Ads, Microsoft Ads
prisma/
  schema.prisma — 30+ models across all 12 modules
  seed.ts       — AlphaBoost tenant seed
skills/         — skill + memory files for every domain area
  learning-loops/ — 7 automated learning loop definitions
tenants/        — per-tenant config: alphaboost, dolce, alphanoetic
```

## 12-module build plan

| # | Module | Status |
|---|--------|--------|
| 01 | Multi-Tenant Foundation | COMPLETE |
| 02 | Funnel Tracking Engine | COMPLETE |
| 03 | AI Optimisation Engine | COMPLETE |
| 04 | Affiliate Content Studio | COMPLETE |
| 05 | Content Calendar & Planner | COMPLETE |
| 06 | Sendible Publishing Pipeline | COMPLETE |
| 07 | AlphaMail Engine | COMPLETE |
| 08 | SEO Intelligence Engine | COMPLETE |
| 09 | Paid Keyword Intelligence | COMPLETE |
| 10 | LLM Presence Analysis | COMPLETE |
| 11 | Conversion Dashboard | COMPLETE |
| 12 | Unified Intelligence Layer | COMPLETE |

## Configured Tenants

| Slug | Domain | Type | Email Domain | Config |
|------|--------|------|-------------|--------|
| `alphaboost` | alphaboost.app | saas | alphaboost.app | `tenants/alphaboost.md` |
| `dolce` | dolcedd.com | ecommerce | dolcedd.com | `tenants/dolce.md` |
| `alphanoetic` | alphanoetic.ai | saas | alphanoetic.ai | `tenants/alphanoetic.md` |

**Email database isolation is strict — never query or send across tenant boundaries.**

## Skills Library
Read the relevant skill file before working on any domain area.

| Skill | File | Memory |
|-------|------|--------|
| Affiliate Management | `skills/affiliate-management.md` | `skills/affiliate-management-memory.md` |
| Email Marketing | `skills/email-marketing.md` | `skills/email-marketing-memory.md` |
| Social Media | `skills/social-media.md` | `skills/social-media-memory.md` |
| Paid Keywords | `skills/paid-keywords.md` | `skills/paid-keywords-memory.md` |
| Content Generation | `skills/content-generation.md` | `skills/content-generation-memory.md` |
| SEO Intelligence | `skills/seo-intelligence.md` | `skills/seo-intelligence-memory.md` |
| LLM Presence | `skills/llm-presence.md` | `skills/llm-presence-memory.md` |
| Conversion Dashboard | `skills/conversion-dashboard.md` | `skills/conversion-dashboard-memory.md` |
| Unified Intelligence | `skills/unified-intelligence.md` | `skills/unified-intelligence-memory.md` |
| Tenant Management | `skills/tenant-management.md` | `skills/tenant-management-memory.md` |
| System Health | `skills/system-health.md` | `skills/system-health-memory.md` |
| Error Management | `skills/error-management.md` | `skills/error-management-memory.md` |

## Learning Loops
7 automated loops that keep skill memories current:

| Loop | File | Trigger |
|------|------|---------|
| Error Learning | `skills/learning-loops/error-learning.md` | 100 errors/hour or 3 worker failures |
| Content Performance | `skills/learning-loops/content-performance.md` | Daily after dashboard snapshot |
| Campaign Learning | `skills/learning-loops/campaign-learning.md` | 48h after campaign send |
| SEO Learning | `skills/learning-loops/seo-learning.md` | Weekly after GSC refresh |
| Affiliate Learning | `skills/learning-loops/affiliate-learning.md` | Weekly after dashboard snapshot |
| System Health | `skills/learning-loops/system-health-loop.md` | Hourly |
| Human Corrections | `skills/learning-loops/human-corrections.md` | On every human override |

**Human corrections have highest authority — they always override loop-derived learnings.**

## Core Rules

### Multi-Tenant Isolation
- Every DB query on a tenant-scoped model MUST include `WHERE businessId = $tenantId`
- Email lists, subscribers, and campaigns are scoped to a single `businessId`
- Never return data from one tenant in a response scoped to another
- Do NOT modify `alphaboost.app` — it is a separate product (external)

### Content Generation
- All generation is grounded via BOK (`src/lib/bokReader.ts`)
- All generated content is scored before approval (`contentScoreWorker`)
- `autoApply` defaults to `false` on all tenants — human approval required unless explicitly enabled
- Content run lifecycle: `pending → generating → scored → approved → dispatched`

### Email
- Domain warmup is required before any campaign sends on a new tenant
- Never send above `BusinessConfig.dailySendCap`
- Spam score > 70 must be reviewed before dispatch
- Email databases are fully isolated per tenant

### Error Handling
- All workers retry 3× with exponential backoff before marking failed
- All errors logged structured JSON via pino (`src/lib/logger.ts`)
- DB or Redis connection failures → alert admin immediately (never silent fail)

### Security
- Platform OAuth tokens encrypted at rest (`src/lib/encryption.ts`)
- GSC tokens stored in `BusinessConfig.gscTokens` (JSON, encrypted)
- Rate limiting on all routes (`src/middleware/rateLimit.ts`)
- RBAC enforced via `src/middleware/rbac.ts`
- Never log secrets, tokens, or PII

### Code Quality
- No new endpoints without `businessId` scoping where applicable
- BullMQ workers must handle graceful shutdown via SIGTERM
- Use `src/lib/idempotency.ts` for all POST operations that should be idempotent
- TypeScript strict mode — no `any` casts without explicit comment

## First tenant
AlphaBoost (slug: `alphaboost`) — seeded via `npm run db:seed`
Do NOT modify `alphaboost.app` — it is a separate product (external).
