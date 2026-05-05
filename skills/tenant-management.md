# Skill: Tenant Management

## Purpose
Multi-tenant lifecycle — provisioning, config management, isolation enforcement, and per-tenant email database segregation.

## Key Models
| Model | Role |
|-------|------|
| `Business` | Core tenant — slug, type, plan, active flag |
| `BusinessConfig` | All config — brand, email, commission, GSC, autoApply |

## Tenant Isolation Rules
1. Every query to a tenant-scoped model MUST include `WHERE businessId = $tenantId`
2. Never return data from one tenant in a response scoped to another
3. Email lists, subscribers, campaigns are ALWAYS scoped to a single `businessId`
4. Affiliates belong to exactly one tenant — no cross-tenant affiliate reuse
5. `BusinessConfig` is 1:1 with `Business` — never share configs

## Configured Tenants

### alphaboost
- slug: `alphaboost`
- Domain: `alphaboost.app`
- Brand: AlphaBoost
- Type: `saas`
- Config file: `tenants/alphaboost.md`

### dolce
- slug: `dolce`
- Domain: `dolcedd.com`
- Brand: Dolce
- Type: `ecommerce`
- Config file: `tenants/dolce.md`

### alphanoetic
- slug: `alphanoetic`
- Domain: `alphanoetic.ai`
- Brand: AlphaNoetics
- Type: `saas`
- Config file: `tenants/alphanoetic.md`

## Provisioning Checklist
When adding a new tenant:
- [ ] Insert `Business` record (slug must be unique)
- [ ] Insert `BusinessConfig` record (set sendingDomain, fromEmail, dailySendCap)
- [ ] Create seed `EmailList` for this tenant
- [ ] Add env vars for tenant-specific API keys if needed
- [ ] Set `warmupComplete = false` and start domain warmup

## Plan Tiers
`starter` | `growth` | `scale` | `enterprise`

## Key Endpoints
```
POST   /v2/api/admin/tenants
GET    /v2/api/admin/tenants
GET    /v2/api/admin/tenants/:slug
PATCH  /v2/api/admin/tenants/:slug/config
```

## Key Source Files
- `src/modules/admin/adminRoutes.ts`
- `src/middleware/auth.ts`
- `src/middleware/rbac.ts`
- `prisma/seed.ts`

## Learning Loop Hook
After any tenant config change, append to `skills/tenant-management-memory.md` under **Config Changes**.
