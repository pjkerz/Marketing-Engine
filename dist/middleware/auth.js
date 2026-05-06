"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.ALPHABOOST_BUSINESS_ID = void 0;
exports.issueOnboardingToken = issueOnboardingToken;
exports.requireAuth = requireAuth;
exports.requireOnboardingToken = requireOnboardingToken;
const jwt = __importStar(require("jsonwebtoken"));
const fs = __importStar(require("fs"));
const env_1 = require("../config/env");
const errorHandler_1 = require("./errorHandler");
const prisma_1 = require("../lib/prisma");
// Kept for compat routes (legacy v1 bridge — intentionally alphaboost-only)
exports.ALPHABOOST_BUSINESS_ID = '00000000-0000-0000-0000-000000000001';
function readLeadershipPassword() {
    try {
        const content = fs.readFileSync(env_1.env.CREDS_MD_PATH, 'utf8');
        const match = content.match(/^CONSOLE_PASSWORD=(.+)$/m);
        return match ? match[1].trim() : '';
    }
    catch {
        return '';
    }
}
async function resolveBusinessIdFromSlug(slug) {
    try {
        const prisma = (0, prisma_1.getPrisma)();
        const biz = await prisma.business.findFirst({ where: { slug, active: true }, select: { id: true } });
        return biz?.id ?? null;
    }
    catch {
        return null;
    }
}
function issueOnboardingToken(affiliateCode, businessId) {
    return jwt.sign({ affiliateCode, businessId, purpose: 'onboarding' }, env_1.env.V2_JWT_SECRET, { expiresIn: '7d' });
}
function requireAuth(req, _res, next) {
    const authHeader = req.headers.authorization;
    // Try Bearer token (onboarding JWT or admin session)
    if (authHeader?.startsWith('Bearer ')) {
        const token = authHeader.slice(7);
        try {
            const payload = jwt.verify(token, env_1.env.V2_JWT_SECRET);
            if (payload.purpose === 'onboarding' && payload.affiliateCode) {
                req.actor = {
                    role: 'affiliate',
                    businessId: payload.businessId,
                    affiliateCode: payload.affiliateCode,
                };
                next();
                return;
            }
            if (payload.role) {
                const p = payload;
                if (p.businessId) {
                    req.actor = { role: p.role, businessId: p.businessId };
                    next();
                    return;
                }
            }
        }
        catch {
            // fall through to check header-based auth
        }
    }
    next(new errorHandler_1.AppError('UNAUTHORIZED', 'Authentication required.', 401));
}
function requireOnboardingToken(req, _res, next) {
    const token = req.query.token;
    if (!token) {
        next(new errorHandler_1.AppError('UNAUTHORIZED', 'Onboarding token required.', 401));
        return;
    }
    try {
        const payload = jwt.verify(token, env_1.env.V2_JWT_SECRET);
        if (payload.purpose !== 'onboarding' || !payload.affiliateCode) {
            throw new Error('Invalid token');
        }
        req.actor = {
            role: 'affiliate',
            businessId: payload.businessId,
            affiliateCode: payload.affiliateCode,
        };
        next();
    }
    catch {
        next(new errorHandler_1.AppError('UNAUTHORIZED', 'Invalid or expired onboarding token.', 401));
    }
}
//# sourceMappingURL=auth.js.map