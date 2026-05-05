# Skill: Email Marketing

## Purpose
Multi-tenant email infrastructure — list management, campaign creation, drip sequences, domain warmup, spam scoring, and per-tenant sending isolation.

## Key Models
| Model | Role |
|-------|------|
| `EmailList` | Named list per tenant — scoped by `businessId` |
| `EmailSubscriber` | Subscriber record — status, source, tags |
| `EmailCampaign` | Blast campaigns — HTML/text, schedule, metrics |
| `EmailSendEvent` | Per-message delivery tracking |
| `EmailDripSequence` | Triggered automation sequences |
| `EmailDripStep` | Individual steps with delay + conditions |
| `DomainWarmup` | Ramp schedule for new sending domains |

## Tenant Email Isolation
Each tenant has its own `EmailList` records scoped to `businessId`.
Sending domain, from-name, and from-email are set in `BusinessConfig`:
- `sendingDomain`
- `fromName`
- `fromEmail`
- `dailySendCap` (default 500)
- `warmupComplete`

**Never query or send across tenant boundaries.**

## Key Endpoints
```
POST   /v2/api/email/lists
GET    /v2/api/email/lists
POST   /v2/api/email/lists/:id/subscribers/upload
GET    /v2/api/email/lists/:id/subscribers
POST   /v2/api/email/campaigns
GET    /v2/api/email/campaigns
POST   /v2/api/email/campaigns/:id/send
POST   /v2/api/email/drip-sequences
GET    /v2/api/email/drip-sequences
POST   /v2/api/email/warmup/start
GET    /v2/api/email/warmup/status
```

## Key Workers
- `emailUploadWorker` — bulk CSV subscriber import
- `dripWorker` — processes drip step triggers, schedules sends
- `dispatchWorker` — sends campaign batches via Resend

## Key Source Files
- `src/modules/email/emailRoutes.ts`
- `src/modules/email/resendClient.ts`
- `src/modules/email/spamEngine.ts`
- `src/queues/workers/emailUploadWorker.ts`
- `src/queues/workers/dripWorker.ts`
- `src/queues/workers/dispatchWorker.ts`

## Spam Engine
`src/modules/email/spamEngine.ts` scores campaigns 0–100 before send.
Score stored in `EmailCampaign.spamScore`.
Campaigns with score > 70 should be flagged before dispatch.

## Warmup Schedule
`DomainWarmup.warmupSchedule` (JSON) defines daily ramp.
`dailySendLimit` increases each day until `warmupComplete = true`.

## Learning Loop Hook
After campaign sends, append metrics to `skills/email-marketing-memory.md` under **Campaign Performance**.
After drip step fires, append to **Drip Performance**.
