# Skill: Unified Intelligence

## Purpose
Cross-channel recommendations, auto-execution of optimisation rules, intelligence feed events, and optimisation insights derived from all other modules.

## Key Models
| Model | Role |
|-------|------|
| `CrossChannelRecommendation` | High-level recommendation — channels, actions, priority, autoExecutable |
| `IntelligenceFeedEvent` | Activity feed item — actionable notification |
| `OptimisationInsight` | Data-derived finding with evidence + recommendation |
| `OptimisationRule` | Persistent rule derived from insights — can auto-apply |

## CrossChannelRecommendation Priority
`critical` | `high` | `medium` | `low`

## OptimisationRule Types
- `content_tone_adjust` — modify LLM prompt parameters
- `email_send_time` — adjust campaign scheduling
- `affiliate_boost` — increase content quota for high performers
- `keyword_pause` — pause low-ROI keywords
- `ab_test_conclude` — end test early when winner is clear

## Auto-Execution
`CrossChannelRecommendation.autoExecutable = true` means `autoExecutor.ts` can apply it without human approval.
`BusinessConfig.autoApply = true` must be set per tenant to enable.

## Key Endpoints
```
GET    /v2/api/admin/intelligence/recommendations
POST   /v2/api/admin/intelligence/recommendations/:id/execute
GET    /v2/api/admin/intelligence/feed
PATCH  /v2/api/admin/intelligence/feed/:id/read
GET    /v2/api/admin/intelligence/insights
POST   /v2/api/admin/intelligence/insights/:id/apply
GET    /v2/api/admin/intelligence/rules
PATCH  /v2/api/admin/intelligence/rules/:id
```

## Key Workers
- `optimisationWorker` — runs nightly, generates insights + recommendations

## Key Source Files
- `src/modules/intelligence/intelligenceRoutes.ts`
- `src/modules/intelligence/recommendationEngine.ts`
- `src/modules/intelligence/contextBuilder.ts`
- `src/modules/intelligence/autoExecutor.ts`
- `src/queues/workers/optimisationWorker.ts`

## Context Builder
`contextBuilder.ts` pulls data from ALL modules to assemble cross-channel context:
- Email metrics → campaign performance
- Content scores → content quality
- SEO gaps → keyword opportunities
- LLM presence → brand authority
- Conversion events → revenue attribution

## Multi-Tenant Isolation
All records scoped by `businessId`.
`autoApply` flag is per-tenant — never auto-execute across tenants.

## Learning Loop Hook
After each recommendation is executed (auto or manual), append outcome to `skills/unified-intelligence-memory.md` under **Execution Outcomes**.
Track: did auto-executed recommendations produce positive outcomes?
