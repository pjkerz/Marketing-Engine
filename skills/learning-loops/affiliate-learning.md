# Learning Loop: Affiliate Learning

## Trigger
Weekly, after dashboard snapshot OR after any affiliate's content reaches `dispatched` status and has downstream conversion data (7-day window).

## Data to Collect
```sql
SELECT 
  a.id as affiliateId, a.businessId, a.code,
  ap.role, ap.seniority, ap.directness, ap.provocation,
  ap.ctaStrength, ap.voice, ap.platforms,
  COUNT(cgr.id) as totalRuns,
  AVG(cs.qualityScore) as avgQuality,
  AVG(cs.conversionScore) as avgConversion,
  COUNT(ce.id) as totalConversions,
  SUM(ce.conversionValue) as totalRevenue
FROM affiliates a
JOIN affiliate_profiles ap ON ap.affiliateId = a.id AND ap.status = 'active'
LEFT JOIN content_generation_runs cgr ON cgr.affiliateId = a.id
LEFT JOIN content_scores cs ON cs.runId = cgr.id
LEFT JOIN conversion_events ce ON ce.affiliateId = a.id
WHERE a.active = true
GROUP BY a.id, a.businessId, a.code, ap.role, ap.seniority, 
         ap.directness, ap.provocation, ap.ctaStrength, ap.voice, ap.platforms
ORDER BY totalRevenue DESC;
```

## Analysis Steps
1. Rank affiliates by revenue contribution per tenant
2. Identify which tone profiles (directness, provocation, ctaStrength) drive highest conversion
3. Detect underperforming affiliates — low quality scores + zero conversions after 30 days
4. Identify which platform combinations drive most conversions per affiliate type

## Update Target
`skills/affiliate-management-memory.md` → **Dispatch Outcomes**, **Profile Extraction Results**

## Entry Format
```
{date} | {tenant} | {affiliateCode} | avgQuality={q} | conversions={n} | revenue={$} | topPlatform
```

## What to Learn
- Which tone profiles convert best per tenant niche
- Whether high-confidence profile extractions outperform low-confidence ones
- Which platform OAuth completion rates are lowest (friction in onboarding)
- Content volume vs quality tradeoff — do high-volume affiliates maintain quality?

## Feedback to Engine
Surface top-performing tone profile patterns as defaults for new affiliates in that tenant.
Flag underperforming affiliates to Unified Intelligence for re-onboarding recommendation.
