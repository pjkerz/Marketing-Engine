# Tenant: AlphaNoetics

## Identity
| Field | Value |
|-------|-------|
| slug | `alphanoetic` |
| name | AlphaNoetics |
| domain | `alphanoetic.ai` |
| type | `saas` |
| plan | `growth` |

## BusinessConfig
| Field | Value |
|-------|-------|
| brandName | AlphaNoetics |
| brandColor | `#0D1B2A` |
| accentColor | `#7B2FBE` |
| sendingDomain | `alphanoetic.ai` |
| fromName | `AlphaNoetics` |
| fromEmail | `hello@alphanoetic.ai` |
| dailySendCap | 1000 |
| commissionType | `none` |
| commissionValue | 0 |
| autoApply | false |

## Email Database
- Isolated email lists under `businessId = alphanoetic`
- Primary list: "AlphaNoetics Users"
- Trial list: "AlphaNoetics Trials"
- **Completely isolated from alphaboost and dolce email databases**
- Production sending domain: `alphanoetic.ai`

## Provisioning Steps (if not yet complete)
- [ ] `INSERT INTO businesses (name, slug, type, plan) VALUES ('AlphaNoetics', 'alphanoetic', 'saas', 'growth')`
- [ ] `INSERT INTO business_configs (businessId, brandName, ...) VALUES (...)`
- [ ] Create seed EmailLists for this tenant
- [ ] Configure DNS for `alphanoetic.ai` sending domain
- [ ] Start domain warmup

## Platforms Enabled
LinkedIn, Twitter, Reddit, YouTube

## Content Configuration
- BOK: `/bok/alphanoetic/` (if exists) else `/bok/`
- Brand voice: AI-forward, technical authority, innovation-led
- Tone defaults: directness=0.8, provocation=0.4, ctaStrength=direct
- Audience: SaaS founders, growth marketers, AI practitioners

## Key Notes
- Production URL: `https://alphanoetic.me` (note: .me domain for hosting, .ai for brand)
- This is the Noetica LLC flagship product
- LLM presence auditing is especially important for this tenant — it IS an AI company
- `autoApply` should remain false until AI optimisation is fully validated
- `conversionTypes` should include: `trial_start`, `upgrade`, `referral`

## GSC Integration
Site: `https://alphanoetic.ai`
GSC tokens stored in `BusinessConfig.gscTokens` for this tenant.
