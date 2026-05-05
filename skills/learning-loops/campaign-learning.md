# Learning Loop: Campaign Learning

## Trigger
48 hours after any `EmailCampaign` reaches `sent` status (allows time for open/click tracking).

## Data to Collect
```sql
SELECT 
  ec.id, ec.businessId, ec.name, ec.subject, ec.sentAt,
  ec.totalSent, ec.totalOpened, ec.totalClicked, 
  ec.totalBounced, ec.totalUnsubscribed, ec.spamScore,
  ROUND(ec.totalOpened::numeric / NULLIF(ec.totalSent, 0) * 100, 2) as openRate,
  ROUND(ec.totalClicked::numeric / NULLIF(ec.totalSent, 0) * 100, 2) as clickRate,
  el.name as listName
FROM email_campaigns ec
JOIN email_lists el ON el.id = ec.listId
WHERE ec.status = 'sent'
  AND ec.sentAt > NOW() - INTERVAL '48 hours'
ORDER BY ec.businessId, ec.sentAt;
```

## Analysis Steps
1. Flag campaigns with openRate < 15% — subject line may need work
2. Flag campaigns with bounceRate > 3% — list hygiene needed
3. Flag campaigns with spamScore > 70 — review spam engine output
4. Identify subject line patterns from top quartile open rates
5. Identify send-time patterns for each tenant (best performing days/hours)

## Update Target
`skills/email-marketing-memory.md` → **Campaign Performance**, **Spam Score Patterns**

## Entry Format
```
{date} | {tenant} | {campaignId} | sent={n} | open={%} | click={%} | bounce={%} | spam={score}
```

## What to Learn
- Subject line structures with highest open rates per tenant
- Optimal send times per tenant and list type
- Which spam score ranges actually cause deliverability problems
- List segments with highest engagement (tags, source, subscription date)

## Feedback to Engine
If a tenant consistently shows low open rates:
Flag in `skills/email-marketing-memory.md` **Human Corrections** for admin review.
Suggest subject line A/B test via Unified Intelligence recommendation.
