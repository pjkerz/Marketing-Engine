# Learning Loop: Human Corrections

## Purpose
The most important learning loop — captures every time a human overrides, rejects, or corrects an AI-generated decision. This prevents the system from repeating mistakes.

## Trigger
Any of the following events:
- Admin rejects a 'strong'-scored content run
- Admin approves a 'revise'-scored content run
- Admin manually edits AI-generated SEO content before publish
- Admin overrides an auto-executed OptimisationRule
- Admin modifies an AI-extracted AffiliateProfile
- Admin re-dispatches a Sendible post that was auto-cancelled
- Human sends a campaign that the spam engine flagged
- Human changes a tenant config that was AI-recommended

## Data to Record
For each correction:
1. **What** — the AI decision that was overridden
2. **Why** — the human's stated or inferred reason
3. **Which skill** — which skill file governs this decision
4. **Frequency** — how often this type of correction occurs

## Update Targets
Route correction to the appropriate memory file:
| Correction Type | Memory File |
|----------------|-------------|
| Content score override | `skills/content-generation-memory.md` → Human Corrections |
| Email campaign override | `skills/email-marketing-memory.md` → Human Corrections |
| Profile edit | `skills/affiliate-management-memory.md` → Human Overrides |
| SEO content edit | `skills/seo-intelligence-memory.md` → Human Corrections |
| Rule override | `skills/unified-intelligence-memory.md` → Human Corrections |
| Platform dispatch override | `skills/social-media-memory.md` → Human Corrections |
| Tenant config change | `skills/tenant-management-memory.md` → Human Corrections |

## Entry Format
```
{date} | {actor} | {what was overridden} | {AI decision} | {human decision} | {inferred reason}
```

## Escalation to Skill Files
If the same correction type occurs 3+ times:
1. Review the relevant skill's decision rules
2. Propose an update to that skill's logic section
3. Document the updated rule in the skill file with evidence date and correction count

## Example: Score Threshold Adjustment
If humans approve 'revise' content 5 times for LinkedIn posts with high personalization:
→ Update `skills/content-generation.md` **Score Labels**: note LinkedIn personalization exception
→ Flag for `contentScoreWorker` threshold tuning

## Meta-Rule
This loop has higher authority than all others.
A human correction ALWAYS overrides a learning loop's automated update.
When in conflict: human > loop > baseline.
