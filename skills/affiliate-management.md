# Skill: Affiliate Management

## Purpose
Full lifecycle for affiliates — onboarding, profile extraction, content plans, platform OAuth connections, and asset management.

## Key Models
| Model | Role |
|-------|------|
| `Affiliate` | Core entity — code, email, active flag |
| `AffiliateProfile` | Extracted persona — role, tone sliders, platforms |
| `AffiliateInstance` | Weekly scheduling prefs, themes, timezones |
| `PlatformConnection` | Encrypted OAuth tokens per platform |
| `ProfileAsset` | Uploaded resumes stored in Zoho |
| `ResumeProcessingJob` | BullMQ job tracking for resume parse |
| `ProfileExtraction` | LLM extraction result + repair tracking |
| `AffiliateContentPlan` | Weekly content plan per affiliate |
| `ContentSlot` | Individual post slots within a plan |

## Key Endpoints
```
POST   /v2/api/affiliate/profile/upload-resume
GET    /v2/api/affiliate/profile
PATCH  /v2/api/affiliate/profile
POST   /v2/api/affiliate/generate
GET    /v2/api/affiliate/content-plans
POST   /v2/api/affiliate/content-plans
GET    /v2/api/admin/affiliates
POST   /v2/api/admin/affiliates
PATCH  /v2/api/admin/affiliates/:id
```

## Key Workers
- `resumeParseWorker` — parse uploaded PDF resumes
- `profileExtractWorker` — LLM extraction from resume text → AffiliateProfile
- `dispatchWorker` — send approved content slots to Sendible

## Key Source Files
- `src/modules/profile/profileRoutes.ts`
- `src/modules/profile/profileMapper.ts`
- `src/modules/admin/adminRoutes.ts`
- `src/modules/oauth/oauthRoutes.ts`
- `src/queues/workers/resumeParseWorker.ts`
- `src/queues/workers/profileExtractWorker.ts`
- `src/integrations/sendible/sendibleClient.ts`
- `src/integrations/zoho/zohoClient.ts`

## Tone Sliders (AffiliateProfile)
- `directness` 0–1
- `provocation` 0–1
- `humor` 0–1
- `ctaStrength`: invisible | soft | direct | strong
- `desiredEmotion`: curiosity | urgency | trust | inspiration
- `voice`: operator | educator | challenger | storyteller
- `controversy`: balanced | edgy | safe

## Platform OAuth Platforms
`linkedin` | `facebook` | `twitter` | `youtube` | `reddit`
Tokens encrypted at rest in `PlatformConnection.tokens` via `src/lib/encryption.ts`.

## Multi-Tenant Isolation
All affiliate queries MUST be scoped to `businessId`. Never leak affiliates across tenants.

## Learning Loop Hook
After every profile extraction, append outcome to `skills/affiliate-management-memory.md` under **Profile Extraction Results**.
After every dispatchWorker run, append performance signal to **Dispatch Outcomes**.
