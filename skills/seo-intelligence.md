# Skill: SEO Intelligence

## Purpose
Site crawling, keyword extraction, competitor gap analysis, GSC integration, and AI-generated SEO content ready for CMS publish.

## Key Models
| Model | Role |
|-------|------|
| `SeoAudit` | Crawl job — client URL vs competitor URL, keyword gap results |
| `SeoContent` | Generated SEO article — keyword, title, meta, HTML, publish status |

## SeoAudit Lifecycle
```
pending → (seoAuditWorker runs) → completed
```
- `clientKeywords` / `competitorKeywords` / `gapKeywords` stored as JSON arrays
- Completed audit surfaces gap keywords for content generation

## SeoContent Lifecycle
```
draft → published
```
- `publishedUrl` set after CMS webhook succeeds
- `publishedAt` recorded
- CMS webhook: `BusinessConfig.cmsWebhookUrl`

## Key Endpoints
```
POST   /v2/api/admin/seo/audits
GET    /v2/api/admin/seo/audits
GET    /v2/api/admin/seo/audits/:id
POST   /v2/api/admin/seo/content/generate
GET    /v2/api/admin/seo/content
PATCH  /v2/api/admin/seo/content/:id/publish
GET    /v2/api/gsc/sites
GET    /v2/api/gsc/performance
GET    /oauth/gsc/callback
```

## Key Workers
- `seoAuditWorker` — runs crawler + keyword extractor + gap analyser

## Key Source Files
- `src/modules/seo/seoRoutes.ts`
- `src/modules/seo/crawler.ts`
- `src/modules/seo/keywordExtractor.ts`
- `src/modules/seo/gapAnalyser.ts`
- `src/modules/seo/seoContentGenerator.ts`
- `src/modules/gsc/gscRoutes.ts`
- `src/queues/workers/seoAuditWorker.ts`

## GSC Integration
OAuth tokens stored in `BusinessConfig.gscTokens`.
GSC data surfaces in audit results and informs gap analysis.

## Multi-Tenant Isolation
All `SeoAudit` and `SeoContent` records scoped by `businessId`.
CMS webhook URL and GSC tokens are per-tenant in `BusinessConfig`.

## Learning Loop Hook
After publish, record keyword + ranking trend in `skills/seo-intelligence-memory.md` under **Keyword Performance**.
Weekly: compare gap keywords against new GSC data — log what closed.
