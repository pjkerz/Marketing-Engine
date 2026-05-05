# Learning Loop: SEO Learning

## Trigger
Weekly, after GSC data refresh OR after any `SeoContent` is published (status → `published`).

## Data to Collect
```sql
-- Gap keywords from completed audits
SELECT sa.businessId, sa.gapKeywords, sa.completedAt
FROM seo_audits sa
WHERE sa.status = 'completed'
  AND sa.completedAt > NOW() - INTERVAL '30 days';

-- Published content performance
SELECT sc.businessId, sc.keyword, sc.contentType, sc.wordCount,
       sc.publishedAt, sc.publishedUrl
FROM seo_content sc
WHERE sc.status = 'published'
ORDER BY sc.publishedAt DESC;
```
Plus GSC performance data from `/v2/api/gsc/performance` for each tenant.

## Analysis Steps
1. For each published keyword: check current GSC ranking vs pre-publish baseline
2. Identify which content types (wordCount ranges, contentType) rank fastest
3. Compare gap keywords from audits against new GSC data — which gaps are closing?
4. Flag keywords that were targeted but haven't moved in 30 days

## Update Target
`skills/seo-intelligence-memory.md` → **Keyword Performance**, **Content That Ranked**

## Entry Format
```
{date} | {tenant} | {keyword} | contentType | wordCount | rankBefore | rankAfter | traffic delta
```

## What to Learn
- Minimum wordCount that reliably achieves rankings for this niche
- Which contentType (article vs guide vs comparison) ranks fastest
- Time-to-rank distribution — set realistic expectations in recommendations
- Crawl budget issues — which tenant sites have slow crawl rates

## Feedback to Engine
Update `skills/seo-intelligence.md` **SeoContent** section with learned optimal content specs.
Surface high-opportunity gaps that haven't been targeted yet to Unified Intelligence.
