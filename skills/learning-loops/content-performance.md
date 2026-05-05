# Learning Loop: Content Performance

## Trigger
Daily, after dashboard snapshot is computed OR after a ContentGenerationRun reaches `dispatched` status with downstream engagement data.

## Data to Collect
```sql
SELECT 
  cgr.id, cgr.channel, cgr.businessId,
  cs.qualityScore, cs.riskScore, cs.conversionScore, cs.label,
  ce.conversionType, ce.conversionValue,
  fe.eventType, fe.funnelStage
FROM content_generation_runs cgr
LEFT JOIN content_scores cs ON cs.runId = cgr.id
LEFT JOIN conversion_events ce ON ce.contentRunId = cgr.id
LEFT JOIN funnel_events fe ON fe.contentRunId = cgr.id
WHERE cgr.status = 'dispatched'
  AND cgr.updatedAt > NOW() - INTERVAL '7 days'
ORDER BY cgr.businessId, cgr.channel;
```

## Analysis Steps
1. Group by `channel` — which platform produces highest conversion rate from content?
2. Correlate `contentScore label` with `conversionValue` — do 'strong' scores predict conversions?
3. Identify top-performing content patterns (BOK topic + tone + platform)
4. Identify 'strong'-scored content that underperformed — update **Risk Patterns** in content memory

## Update Target
`skills/content-generation-memory.md` → **Score Outcomes**, **Engagement vs Score**

## Entry Format
```
{date} | {tenant} | {runId} | {platform} | quality={q} risk={r} conv={c} | actualConv={n} | delta={+/-}
```

## What to Learn
- Which score thresholds reliably predict real conversions
- Which platforms have highest content ROI per tenant
- Whether `revise`-label content ever converts well (if yes, adjust score thresholds)

## Feedback to Engine
If analysis shows score thresholds need adjustment:
Update `skills/content-generation.md` **Score Labels** section with revised thresholds.
Note the evidence date and sample size.
