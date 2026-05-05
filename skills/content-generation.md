# Skill: Content Generation

## Purpose
AI-driven content creation pipeline — BOK-grounded briefs, Groq LLM generation, quality/risk/conversion scoring, Imagen 4 media generation, personalization engine.

## Key Models
| Model | Role |
|-------|------|
| `ContentGenerationRun` | Full lifecycle: pending → generating → scored → approved → dispatched |
| `ContentScore` | quality (0–100), risk (0–100), conversion (0–100) + breakdowns |
| `ContentMediaAsset` | Zoho-stored media attached to a run |
| `MediaGenerationJob` | Imagen 4 generation job — preview_ready until approved/expired |
| `ContentLibraryAsset` | Reusable media library per tenant |

## Content Run Lifecycle
```
pending → generating → scored → [approved | rejected | revise] → dispatched
```
- `flaggedAt` + `flagReason` set when auto-flagged for risk
- `editedContent` / `editedAt` set when affiliate edits before submission
- `submittedForApproval` + `submittedAt` for approval queue

## Score Labels
- `strong`: qualityScore ≥ 75, riskScore ≤ 25, conversionScore ≥ 65
- `acceptable`: qualityScore ≥ 55, riskScore ≤ 45
- `revise`: anything below acceptable thresholds

## Key Endpoints
```
POST   /v2/api/affiliate/generate
GET    /v2/api/affiliate/content
GET    /v2/api/affiliate/content/:id
PATCH  /v2/api/affiliate/content/:id/edit
POST   /v2/api/affiliate/content/:id/submit
POST   /v2/api/admin/content/:id/approve
POST   /v2/api/admin/content/:id/reject
GET    /v2/api/admin/content/queue
```

## Key Workers
- `contentScoreWorker` — scores generated content
- `mediaCleanupWorker` — expires unapproved MediaGenerationJob candidates
- `providerDeleteWorker` — cleans up Zoho assets on deletion

## Key Source Files
- `src/modules/media/mediaRoutes.ts`
- `src/modules/media/geminiImageClient.ts`
- `src/modules/scoring/contentScorer.ts`
- `src/modules/personalization/personalizationEngine.ts`
- `src/lib/bokReader.ts`
- `src/lib/planGenerator.ts`
- `src/integrations/llm/llmClient.ts` — Groq llama-3.3-70b
- `src/queues/workers/contentScoreWorker.ts`
- `src/queues/workers/mediaCleanupWorker.ts`

## BOK Integration
`bokReader.ts` reads the Business of Knowledge directory (`/bok`).
BOK entries ground content generation — affiliates get relevant BOK context injected into prompts.

## Personalization Engine
`personalizationEngine.ts` applies AffiliateProfile tone sliders to adjust LLM prompts before generation.

## Multi-Tenant Isolation
All `ContentGenerationRun` records scoped by `businessId`.
Each tenant's `BusinessConfig.brandVoice`, `toneKeywords`, `avoidPhrases` applied at generation time.

## Learning Loop Hook
After every scored run, append score + label to `skills/content-generation-memory.md` under **Score Outcomes**.
After dispatch, append engagement signal when available under **Engagement vs Score**.
