# Skill: Paid Keywords

## Purpose
Keyword intelligence pipeline — research, scoring, Google Ads and Microsoft Ads integration, opportunity ranking for paid campaigns.

## Key Models
| Model | Role |
|-------|------|
| `KeywordTarget` | Keyword record — volume, CPC, competition, opportunity score |

## Key Fields
- `source`: `google_ads` | `microsoft_ads` | `manual` | `seo_gap`
- `monthlyVolume`: search volume estimate
- `cpcEstimate`: cost-per-click estimate
- `competition`: `low` | `medium` | `high`
- `intentScore`: 0–1 (commercial intent)
- `opportunityScore`: 0–1 (composite ranking score)
- `matchType`: `broad` | `phrase` | `exact`
- `status`: `research` | `active` | `paused` | `negative`

## Key Endpoints
```
GET    /v2/api/admin/keywords
POST   /v2/api/admin/keywords/sync/google
POST   /v2/api/admin/keywords/sync/microsoft
GET    /v2/api/admin/keywords/opportunities
PATCH  /v2/api/admin/keywords/:id
DELETE /v2/api/admin/keywords/:id
```

## Key Source Files
- `src/modules/keywords/keywordRoutes.ts`
- `src/modules/keywords/opportunityScorer.ts`
- `src/integrations/googleAds/googleAdsClient.ts`
- `src/integrations/microsoftAds/microsoftAdsClient.ts`

## Opportunity Scorer
`opportunityScorer.ts` computes a composite score from volume, CPC, competition, and intent.
High-opportunity keywords (score > 0.7) surface in Unified Intelligence Layer.

## Multi-Tenant Isolation
All `KeywordTarget` records scoped by `businessId`.

## Learning Loop Hook
Weekly: compare `opportunityScore` against actual conversion data.
Append findings to `skills/paid-keywords-memory.md` under **Score Accuracy**.
