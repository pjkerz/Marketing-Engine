# Tenant: Dolce

## Identity
| Field | Value |
|-------|-------|
| slug | `dolce` |
| name | Dolce |
| domain | `dolcedd.com` |
| type | `ecommerce` |
| plan | `starter` |

## BusinessConfig
| Field | Value |
|-------|-------|
| brandName | Dolce |
| brandColor | `#1A0A2E` |
| accentColor | `#D4AF37` |
| sendingDomain | `dolcedd.com` |
| fromName | `Dolce` |
| fromEmail | `hello@dolcedd.com` |
| dailySendCap | 500 |
| commissionType | `none` |
| commissionValue | 0 |
| autoApply | false |

## Email Database
- Isolated email lists under `businessId = dolce`
- Primary list: "Dolce Customers"
- **Completely isolated from alphaboost and alphanoetic email databases**
- Sending domain `dolcedd.com` must be warmed before any campaigns
- Warmup should start from Day 1 on first campaign activity

## Provisioning Steps (if not yet complete)
- [ ] `INSERT INTO businesses (name, slug, type, plan) VALUES ('Dolce', 'dolce', 'ecommerce', 'starter')`
- [ ] `INSERT INTO business_configs (businessId, brandName, ...) VALUES (...)`
- [ ] Create seed EmailList for this tenant
- [ ] Configure sendingDomain DNS records for `dolcedd.com`
- [ ] Start domain warmup via `POST /v2/api/email/warmup/start`

## Platforms Enabled
LinkedIn, Facebook, Instagram (via Sendible)

## Content Configuration
- BOK: `/bok/dolce/` (if exists) else fall back to `/bok/`
- Brand voice: Luxury, aspirational, lifestyle-focused
- Tone defaults: directness=0.5, provocation=0.2, humor=0.3, ctaStrength=soft

## Key Notes
- Ecommerce tenant — `landingPageUrl` and `pricingPageUrl` important for conversion tracking
- Commission structure: none (direct sales model, no affiliate commissions)
- `conversionTypes` should include: `purchase`, `cart_add`, `wishlist_add`
