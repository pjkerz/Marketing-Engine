# Tenant: AlphaBoost

## Identity
| Field | Value |
|-------|-------|
| slug | `alphaboost` |
| name | AlphaBoost |
| domain | `alphaboost.app` |
| type | `saas` |
| plan | `growth` |

## BusinessConfig
| Field | Value |
|-------|-------|
| brandName | AlphaBoost |
| brandColor | `#0D1B2A` |
| accentColor | `#E87A2A` |
| sendingDomain | `alphaboost.app` |
| fromName | `AlphaBoost` |
| fromEmail | `hello@alphaboost.app` |
| dailySendCap | 1000 |
| commissionType | `percentage` |
| commissionValue | 30 |
| autoApply | false |

## Email Database
- Isolated email lists under `businessId = alphaboost`
- Primary list: "AlphaBoost Subscribers"
- Affiliate list: "AlphaBoost Affiliates"
- Sending domain fully warmed: expected after Day 30 of warmup
- **Do NOT share any email list with dolce or alphanoetic**

## Affiliates
- Existing affiliates migrated from pre-v2 database in Module 01
- Affiliate onboarding URL: `https://alphanoetics.me/v2/connect`
- Affiliate portal: `https://alphanoetics.me/affiliate`

## Platforms Enabled
LinkedIn, Facebook, Twitter, YouTube, Reddit

## Content Configuration
- BOK: `/bok/alphaboost/` (if exists) else `/bok/`
- Brand voice: Professional authority, results-driven
- Avoid phrases: (to be configured by admin)
- Tone defaults: directness=0.7, provocation=0.3, ctaStrength=direct

## Key Notes
- Do NOT modify alphaboost.app — it is a separate product (external)
- This tenant is the "first tenant" seeded via `npm run db:seed`
- AlphaBoost slug is `alphaboost` — never rename

## GSC Integration
GSC tokens stored in `BusinessConfig.gscTokens` for this tenant.
Site: `https://alphaboost.app`
