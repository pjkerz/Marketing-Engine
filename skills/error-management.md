# Skill: Error Management

## Purpose
Classify, track, and learn from errors across all modules — HTTP errors, worker failures, LLM failures, integration errors, and data validation errors.

## Error Handler
`src/middleware/errorHandler.ts` — catches all unhandled Express errors.
Logs with structured JSON via `src/lib/logger.ts` (pino).

## Error Classification
| Code | Type | Source |
|------|------|--------|
| 400 | ValidationError | Bad request body / params |
| 401 | AuthError | Invalid or missing token |
| 403 | ForbiddenError | RBAC permission denied |
| 404 | NotFoundError | Resource not in DB |
| 409 | ConflictError | Unique constraint violation |
| 422 | ProcessingError | LLM or parser failure |
| 429 | RateLimitError | Rate limiter triggered |
| 500 | InternalError | Unhandled exception |
| 503 | ServiceUnavailableError | DB/Redis/integration down |

## Worker Error Codes
- `PARSE_FAILED` — resume parse failure
- `EXTRACT_FAILED` — LLM profile extraction failure
- `EXTRACT_REPAIR_FAILED` — repair attempt also failed
- `SCORE_FAILED` — content scoring error
- `DISPATCH_FAILED` — Sendible API error
- `UPLOAD_FAILED` — email subscriber CSV parse error
- `DRIP_FAILED` — drip step send failure
- `SEO_AUDIT_FAILED` — crawler or extractor error
- `LLM_PRESENCE_FAILED` — LLM query client error

## Retry Policy
- All BullMQ workers: 3 attempts with exponential backoff (2s, 8s, 32s)
- LLM calls: 2 attempts with 5s delay
- Integration calls (Zoho, Sendible, GSC): 3 attempts with 10s delay

## Rate Limits
- General API: 100 req/min per IP (`src/middleware/rateLimit.ts`)
- Auth endpoints: 20 req/min per IP
- Content generation: 10 req/min per affiliate

## Key Source Files
- `src/middleware/errorHandler.ts`
- `src/middleware/rateLimit.ts`
- `src/lib/logger.ts`
- `src/lib/idempotency.ts`

## Idempotency
`src/lib/idempotency.ts` — prevents duplicate operations on retried requests.
Use `Idempotency-Key` header for all POST requests that should be idempotent.

## Learning Loop Hook
After every 100 errors, classify top error types and append to `skills/error-management-memory.md` under **Error Patterns**.
After each new error type is introduced, append its definition under **Error Registry**.
