"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppError = void 0;
exports.errorHandler = errorHandler;
exports.notFound = notFound;
const logger_1 = require("../lib/logger");
class AppError extends Error {
    code;
    message;
    httpStatus;
    details;
    constructor(code, message, httpStatus, details) {
        super(message);
        this.code = code;
        this.message = message;
        this.httpStatus = httpStatus;
        this.details = details;
        this.name = 'AppError';
    }
}
exports.AppError = AppError;
const HTTP_STATUS_MAP = {
    UPLOAD_INVALID_TYPE: 415,
    UPLOAD_TOO_LARGE: 413,
    UPLOAD_PARSE_FAILED: 422,
    EXTRACTION_INVALID_JSON: 422,
    EXTRACTION_SCHEMA_INVALID: 422,
    PROFILE_SAVE_CONFLICT: 409,
    DISPATCH_FAILED: 502,
    RATE_LIMITED: 429,
    MEDIA_PROMPT_REJECTED: 422,
    MEDIA_JOB_EXPIRED: 410,
    MEDIA_REGEN_LIMIT_REACHED: 429,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
};
function errorHandler(err, req, res, _next) {
    const requestId = req.requestId ?? 'unknown';
    if (err instanceof AppError) {
        logger_1.logger.warn({
            requestId,
            module: 'errorHandler',
            action: 'appError',
            code: err.code,
            status: 'failure',
        }, err.message);
        res.status(err.httpStatus).json({
            error: {
                code: err.code,
                message: err.message,
                requestId,
                details: err.details ?? {},
            },
        });
        return;
    }
    logger_1.logger.error({ requestId, module: 'errorHandler', err }, 'Unhandled error');
    res.status(500).json({
        error: {
            code: 'INTERNAL_ERROR',
            message: 'An unexpected error occurred.',
            requestId,
            details: {},
        },
    });
}
function notFound(req, res) {
    res.status(404).json({
        error: {
            code: 'NOT_FOUND',
            message: `Route ${req.method} ${req.path} not found.`,
            requestId: req.requestId,
            details: {},
        },
    });
}
//# sourceMappingURL=errorHandler.js.map