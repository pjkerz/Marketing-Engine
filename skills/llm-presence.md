# Skill: LLM Presence Analysis

## Purpose
Audit how ChatGPT, Claude, Gemini, and Perplexity mention a brand vs competitors — track brand authority in AI-generated responses.

## Key Models
| Model | Role |
|-------|------|
| `LlmPresenceAudit` | Audit job — queries, competitors, summary |
| `LlmPresenceResult` | Per-LLM per-query result — mentionsBrand, context, competitor mentions |

## LlmPresenceAudit Lifecycle
```
pending → (llmPresenceWorker) → completed
```
- `queries` (JSON array) — list of prompts to fire at each LLM
- `competitors` (string array) — brands to detect in responses
- `summary` (JSON) — brand mention rate, share of voice, authority language breakdown

## LlmPresenceResult Fields
- `llmName`: `chatgpt` | `claude` | `gemini` | `perplexity`
- `mentionsBrand`: boolean
- `brandContext`: how brand was mentioned
- `mentionsCompetitors`: JSON array of competitor mentions
- `authorityLanguage`: detected authority signals ("leading", "best", "trusted")
- `recommendations`: AI-generated action to improve presence

## Key Endpoints
```
POST   /v2/api/admin/llm-presence/audits
GET    /v2/api/admin/llm-presence/audits
GET    /v2/api/admin/llm-presence/audits/:id
GET    /v2/api/admin/llm-presence/audits/:id/results
```

## Key Workers
- `llmPresenceWorker` — fires queries at all 4 LLMs in parallel, stores results

## Key Source Files
- `src/modules/llmPresence/llmPresenceRoutes.ts`
- `src/modules/llmPresence/llmQueryClients.ts`
- `src/modules/llmPresence/responseAnalyser.ts`
- `src/queues/workers/llmPresenceWorker.ts`

## Multi-Tenant Isolation
All audit records scoped by `businessId`.
Each tenant has different brand name and competitors configured.

## Learning Loop Hook
After each audit, append brand mention rate + share of voice to `skills/llm-presence-memory.md` under **Audit Results**.
Track trend: is brand mention rate improving over time?
