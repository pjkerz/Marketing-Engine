"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
exports.childLogger = childLogger;
const pino_1 = __importDefault(require("pino"));
exports.logger = (0, pino_1.default)({
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
    transport: process.env.NODE_ENV !== 'production'
        ? { target: 'pino-pretty', options: { colorize: true } }
        : undefined,
    redact: {
        paths: [
            'GOOGLE_AI_API_KEY', 'V2_JWT_SECRET', 'V2_ENCRYPTION_KEY',
            'GROQ_API_KEY', 'ZOHO_CLIENT_SECRET', 'ZOHO_REFRESH_TOKEN',
            '*.access_token', '*.refresh_token', '*.password',
            'body.resumeText', 'body.base64Data',
        ],
        censor: '[REDACTED]',
    },
});
function childLogger(fields) {
    return exports.logger.child(fields);
}
//# sourceMappingURL=logger.js.map