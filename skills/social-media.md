# Skill: Social Media

## Purpose
Platform OAuth connections, content slot dispatch via Sendible, and per-platform publishing for all affiliates across tenants.

## Key Models
| Model | Role |
|-------|------|
| `PlatformConnection` | Encrypted OAuth tokens per affiliate per platform |
| `ContentGenerationRun` | Generated post waiting for dispatch |
| `ContentSlot` | Scheduled slot in a weekly content plan |
| `ContentMediaAsset` | Image/video attached to a content run |

## Supported Platforms
`linkedin` | `facebook` | `twitter` | `youtube` | `reddit`

## OAuth Flow
Each platform uses separate OAuth app credentials from env:
- `LINKEDIN_CLIENT_ID` / `LINKEDIN_CLIENT_SECRET`
- `FACEBOOK_APP_ID` / `FACEBOOK_APP_SECRET`
- `TWITTER_CLIENT_ID` / `TWITTER_CLIENT_SECRET`
- `YOUTUBE_CLIENT_ID` / `YOUTUBE_CLIENT_SECRET`
- `REDDIT_CLIENT_ID` / `REDDIT_CLIENT_SECRET`

Tokens stored encrypted in `PlatformConnection.tokens`.
Redirect handler at `GET /oauth/:platform/callback`.

## Key Endpoints
```
GET    /oauth/:platform/connect          — initiate OAuth flow
GET    /oauth/:platform/callback         — token exchange
DELETE /v2/api/affiliate/connections/:platform  — disconnect
GET    /v2/api/affiliate/connections     — list connected platforms
POST   /v2/api/affiliate/dispatch/:slotId — dispatch slot to Sendible
```

## Key Source Files
- `src/modules/oauth/oauthRoutes.ts`
- `src/integrations/sendible/sendibleClient.ts`
- `src/queues/workers/dispatchWorker.ts`
- `src/lib/encryption.ts`

## Sendible Integration
`src/integrations/sendible/sendibleClient.ts` wraps the Sendible API.
Content slots with status `approved` are picked up by `dispatchWorker`.
After dispatch: slot status → `posted`, ContentGenerationRun status → `dispatched`.

## Multi-Tenant Notes
`PlatformConnection.affiliateId` links to `Affiliate.businessId` for tenant scope.
Sendible accounts are per-tenant (different API keys in BusinessConfig or env).

## Learning Loop Hook
After each dispatch, append platform, score, and result to `skills/social-media-memory.md` under **Dispatch Results**.
