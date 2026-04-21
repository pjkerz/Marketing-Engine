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
  schema.prisma — 9+ models
  seed.ts       — AlphaBoost tenant seed
```

## 12-module build plan
Full spec in ~/Downloads/files (3)/00-MASTER-INDEX.md
Run modules in order — each depends on the previous.

| # | Module | Status |
|---|--------|--------|
| 01 | Multi-Tenant Foundation | NOT STARTED |
| 02 | Funnel Tracking Engine | NOT STARTED |
| 03 | AI Optimisation Engine | NOT STARTED |
| 04 | Affiliate Content Studio | NOT STARTED |
| 05 | Content Calendar & Planner | NOT STARTED |
| 06 | Sendible Publishing Pipeline | NOT STARTED |
| 07 | AlphaMail Engine | NOT STARTED |
| 08 | SEO Intelligence Engine | NOT STARTED |
| 09 | Paid Keyword Intelligence | NOT STARTED |
| 10 | LLM Presence Analysis | NOT STARTED |
| 11 | Conversion Dashboard | NOT STARTED |
| 12 | Unified Intelligence Layer | NOT STARTED |

## Before running any module
1. Ensure v2 is deployed and healthy on DO
2. Run db:migrate to ensure schema is current
3. Paste codebase context at [PASTE CODEBASE CONTEXT HERE] in the module prompt
4. Run modules strictly in order

## First tenant
AlphaBoost (slug: 'alphaboost') — seeded via db:seed
All existing affiliates must be migrated in Module 01.
Do NOT modify alphaboost.app — it is a separate product.
