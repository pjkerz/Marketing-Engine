# Learning Loop: Error Learning

## Trigger
After any worker job fails 3+ times OR after 100+ errors accumulate in a 1-hour window.

## Data to Collect
```sql
SELECT errorCode, COUNT(*) as frequency, module, AVG(attempts)
FROM (worker_job_logs)
WHERE failedAt > NOW() - INTERVAL '1 hour'
GROUP BY errorCode, module
ORDER BY frequency DESC
LIMIT 20;
```

## Analysis Steps
1. Identify the top 3 error codes by frequency
2. For each: check if it's a known pattern in `skills/error-management-memory.md`
3. If new: document in **Error Registry** with root cause and resolution
4. If known but recurring: escalate — the resolution isn't working

## Update Target
`skills/error-management-memory.md` → **Error Patterns** section

## Entry Format
```
{date} | {errorCode} | {frequency}/hr | {module} | {rootCause} | {resolution}
```

## Escalation Criteria
- Same error code recurring after applying documented resolution → flag for human review
- `DISPATCH_FAILED` with social platform OAuth errors → notify affiliate to re-authenticate
- DB or Redis connection errors → alert admin immediately

## What NOT to Learn
- Transient 429 errors from external APIs (expected — retry handles them)
- 401 errors from expired user sessions (expected — user flow)
