"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireRole = requireRole;
exports.requireOwnAffiliate = requireOwnAffiliate;
const errorHandler_1 = require("./errorHandler");
function requireRole(...roles) {
    return (req, _res, next) => {
        if (!req.actor) {
            next(new errorHandler_1.AppError('UNAUTHORIZED', 'Authentication required.', 401));
            return;
        }
        if (!roles.includes(req.actor.role)) {
            next(new errorHandler_1.AppError('FORBIDDEN', 'Insufficient permissions.', 403));
            return;
        }
        next();
    };
}
function requireOwnAffiliate(req, _res, next) {
    if (!req.actor) {
        next(new errorHandler_1.AppError('UNAUTHORIZED', 'Authentication required.', 401));
        return;
    }
    if (req.actor.role === 'admin') {
        next();
        return;
    }
    if (req.actor.role === 'affiliate' && req.actor.affiliateCode === req.params.code) {
        next();
        return;
    }
    next(new errorHandler_1.AppError('FORBIDDEN', 'Access to this affiliate is not permitted.', 403));
}
//# sourceMappingURL=rbac.js.map