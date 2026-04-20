"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRedis = getRedis;
exports.getBullRedis = getBullRedis;
exports.closeRedis = closeRedis;
const ioredis_1 = __importDefault(require("ioredis"));
const env_1 = require("../config/env");
const logger_1 = require("./logger");
let redisInstance = null;
let bullRedisInstance = null;
function getRedis() {
    if (!redisInstance) {
        redisInstance = new ioredis_1.default(env_1.env.REDIS_URL, {
            maxRetriesPerRequest: 3,
            enableReadyCheck: true,
            lazyConnect: true,
        });
        redisInstance.on('error', (err) => {
            logger_1.logger.error({ module: 'redis', action: 'connectionError', err: err.message }, 'Redis error');
        });
        redisInstance.on('connect', () => {
            logger_1.logger.info({ module: 'redis', action: 'connected' }, 'Redis connected');
        });
    }
    return redisInstance;
}
// Separate connection for BullMQ — requires maxRetriesPerRequest: null
function getBullRedis() {
    if (!bullRedisInstance) {
        bullRedisInstance = new ioredis_1.default(env_1.env.REDIS_URL, {
            maxRetriesPerRequest: null,
            enableReadyCheck: false,
        });
        bullRedisInstance.on('error', (err) => {
            logger_1.logger.error({ module: 'redis', action: 'bullConnectionError', err: err.message }, 'BullMQ Redis error');
        });
    }
    return bullRedisInstance;
}
async function closeRedis() {
    if (redisInstance) {
        await redisInstance.quit();
        redisInstance = null;
    }
}
//# sourceMappingURL=redis.js.map