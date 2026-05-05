# Skill: Conversion Dashboard

## Purpose
Pre-computed funnel analytics, A/B test tracking, visitor session stitching, and dashboard snapshots for admin reporting.

## Key Models
| Model | Role |
|-------|------|
| `DashboardSnapshot` | Daily pre-computed metrics blob per tenant |
| `FunnelEvent` | Raw funnel events — stage, channel, UTM, conversion value |
| `VisitorSession` | Stitched session — entry URL, channel, conversion outcome |
| `AbTest` | Running A/B test — variants, status, winner |
| `AbTestResult` | Per-variant impressions, clicks, conversions, rate |
| `ConversionEvent` | High-value conversion records — affiliate attribution |

## FunnelEvent Stages
`awareness` → `consideration` → `intent` → `conversion` → `retention`

## Dashboard Snapshot
`DashboardSnapshot.data` JSON contains:
- `totalConversions`, `conversionRate`, `avgOrderValue`
- `channelBreakdown`, `affiliateBreakdown`
- `funnelDropoffs`, `topContent`, `topKeywords`
- Snapshot computed daily by `dashboardWorker`

## Key Endpoints
```
GET    /v2/api/admin/dashboard/snapshot
GET    /v2/api/admin/dashboard/funnel
GET    /v2/api/admin/dashboard/affiliates
GET    /v2/api/admin/dashboard/ab-tests
POST   /v2/api/admin/dashboard/ab-tests
PATCH  /v2/api/admin/dashboard/ab-tests/:id/end
GET    /v2/api/admin/dashboard/conversions
POST   /track/event          — public tracking pixel
POST   /track/conversion     — public conversion webhook
```

## Key Workers
- `dashboardWorker` — nightly snapshot computation

## Key Source Files
- `src/modules/dashboard/dashboardRoutes.ts`
- `src/modules/tracking/trackingRoutes.ts`
- `src/lib/abTesting.ts`
- `src/queues/workers/dashboardWorker.ts`

## Multi-Tenant Isolation
All analytics scoped by `businessId`.
Tracking endpoints require valid `businessId` token in payload.

## Learning Loop Hook
Daily: after snapshot compute, append key metrics to `skills/conversion-dashboard-memory.md` under **Daily Snapshots**.
After A/B test ends, append winner + lift to **A/B Test Results**.
