"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.idempotency = idempotency;
const redis_1 = require("./redis");
const errorHandler_1 = require("../middleware/errorHandler");
const TTL_SECONDS = 86400; // 24 hours
function idempotency(req, res, next) {
    const key = req.headers['x-idempotency-key'];
    if (!key) {
        next(new errorHandler_1.AppError('RATE_LIMITED', 'X-Idempotency-Key header is required for this endpoint.', 422));
        return;
    }
    const redisKey = `v2:idempotency:${key}`;
    const redis = (0, redis_1.getRedis)();
    redis.get(redisKey).then((cached) => {
        if (cached) {
            const parsed = JSON.parse(cached);
            res.status(parsed.status).json(parsed.body);
            return;
        }
        // Intercept the response to cache it
        const originalJson = res.json.bind(res);
        res.json = function (body) {
            redis.setex(redisKey, TTL_SECONDS, JSON.stringify({ status: res.statusCode, body })).catch(() => { });
            return originalJson(body);
        };
        next();
    }).catch(() => next());
}
//# sourceMappingURL=idempotency.js.map