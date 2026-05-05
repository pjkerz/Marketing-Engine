# Learning Loop: System Health

## Trigger
Hourly — runs regardless of other activity. Also triggered immediately on any worker crash.

## Data to Collect
From BullMQ queue stats for each worker:
```
- waiting count
- active count
- completed count (last hour)
- failed count (last hour)
- stalled count
- avg processing time (last hour)
```

From infrastructure:
- PostgreSQL: `SELECT 1` round-trip time
- Redis: `PING` round-trip time
- Active HTTP connections
- Memory usage

## Analysis Steps
1. Compare current queue depths vs baselines in `skills/system-health-memory.md`
2. Flag any worker with failed > 5 in last hour
3. Flag any queue with depth > 500
4. Alert if DB or Redis latency > 100ms
5. Detect gradual queue buildup (depth increasing each check) — may indicate worker crash

## Update Target
`skills/system-health-memory.md` → **Health Events**, **Performance Baselines**

## Entry Format
```
{datetime} | {component} | {status} | depth={n} | failed={n} | latency={ms}
```

## Baseline Update
Monthly: recalculate baseline from 30-day rolling average.
Update **Performance Baselines** section with new normal ranges.

## Escalation
- Worker stalled > 10 min → restart recommendation
- DB latency > 500ms sustained → check Neon connection pool
- Redis PING fails → check Upstash status page
- Any critical alert → append to **Health Events** and surface in intelligence feed

## What NOT to Alert
- Normal nightly batch spikes (dashboardWorker, optimisationWorker) — document expected windows
- Brief latency spikes < 30s around top-of-hour cron triggers
