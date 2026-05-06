"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loginLimit = exports.trackingLimit = exports.adminLimit = exports.generalLimit = exports.generateImageLimit = exports.generateContentLimit = exports.uploadResumeLimit = void 0;
exports.rateLimit = rateLimit;
const redis_1 = require("../lib/redis");
const errorHandler_1 = require("./errorHandler");
function rateLimit(config) {
    return async (req, _res, next) => {
        try {
            const redis = (0, redis_1.getRedis)();
            const key = `v2:ratelimit:${config.keyFn(req)}`;
            const count = await redis.incr(key);
            if (count === 1) {
                await redis.expire(key, config.windowSeconds);
            }
            if (count > config.max) {
                next(new errorHandler_1.AppError('RATE_LIMITED', 'Too many requests. Please slow down.', 429));
                return;
            }
            next();
        }
        catch {
            // If Redis is down, allow the request through (fail open)
            next();
        }
    };
}
exports.uploadResumeLimit = rateLimit({
    max: 5,
    windowSeconds: 600,
    keyFn: (req) => `${req.actor?.affiliateCode ?? req.params.code}:upload-resume`,
});
exports.generateContentLimit = rateLimit({
    max: 30,
    windowSeconds: 3600,
    keyFn: (req) => `${req.actor?.affiliateCode ?? req.params.code}:generate-content`,
});
exports.generateImageLimit = rateLimit({
    max: 20,
    windowSeconds: 3600,
    keyFn: (req) => `${req.actor?.affiliateCode ?? req.params.code}:generate-image`,
});
exports.generalLimit = rateLimit({
    max: 100,
    windowSeconds: 60,
    keyFn: (req) => `ip:${req.ip}:general`,
});
exports.adminLimit = rateLimit({
    max: 200,
    windowSeconds: 60,
    keyFn: (req) => `admin:${req.ip}`,
});
// Dedicated tracking endpoint limiter — separate budget from general API
exports.trackingLimit = rateLimit({
    max: 120,
    windowSeconds: 60,
    keyFn: (req) => `track:ip:${req.ip}`,
});
// SECURITY: Strict login rate limiting — 3 attempts per 5 minutes per IP
// Prevents brute-force and credential enumeration attacks
exports.loginLimit = rateLimit({
    max: 3,
    windowSeconds: 300,
    keyFn: (req) => {
        const username = req.body?.username || 'unknown';
        return `login:${username}:${req.ip}`;
    },
});
//# sourceMappingURL=rateLimit.js.map