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
const express_1 = require("express");
const fs = __importStar(require("fs"));
const jwt = __importStar(require("jsonwebtoken"));
const env_1 = require("../../config/env");
const auth_1 = require("../../middleware/auth");
const auth_2 = require("../../middleware/auth");
const prisma_1 = require("../../lib/prisma");
const router = (0, express_1.Router)();
function readAffiliates() {
    try {
        return JSON.parse(fs.readFileSync(env_1.env.AFFILIATES_JSON_PATH, 'utf8'));
    }
    catch {
        return [];
    }
}
function readCreds() {
    const out = {};
    try {
        const lines = fs.readFileSync(env_1.env.CREDS_MD_PATH, 'utf8').split('\n');
        for (const line of lines) {
            const eq = line.indexOf('=');
            if (eq === -1)
                continue;
            const key = line.slice(0, eq).trim();
            const val = line.slice(eq + 1).trim();
            if (key && !key.startsWith('#'))
                out[key] = val;
        }
    }
    catch { /* ignore */ }
    return out;
}
function issueSessionToken(payload) {
    return jwt.sign({
        username: payload.username,
        role: payload.role,
        affiliateCode: payload.affiliateCode,
        businessId: payload.businessId || auth_2.ALPHABOOST_BUSINESS_ID,
        tier: payload.tier || 1,
    }, env_1.env.V2_JWT_SECRET, { expiresIn: '30d' });
}
// POST /api/login
router.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        res.status(400).json({ error: 'username and password required' });
        return;
    }
    // Temporary debug — remove after confirming auth works
    console.log('[login] attempt', { username, hasAdminUsers: !!env_1.env.ADMIN_USERS, hasConsolePassword: !!env_1.env.CONSOLE_PASSWORD });
    const affiliates = readAffiliates();
    const creds = readCreds();
    // Check affiliate users in database first
    try {
        const prisma = (0, prisma_1.getPrisma)();
        const dbAffiliate = await prisma.affiliate.findFirst({
            where: { email: username, active: true },
        });
        if (!dbAffiliate) {
            // Also try matching by code
            const byCode = await prisma.affiliate.findFirst({
                where: { code: username.toUpperCase(), active: true },
            });
            if (byCode?.password && byCode.password === password) {
                const token = issueSessionToken({ username: byCode.name, role: 'affiliate', affiliateCode: byCode.code });
                res.json({ ok: true, token, username: byCode.name, role: 'affiliate', tier: 1, affiliateCode: byCode.code });
                return;
            }
        }
        if (dbAffiliate?.password && dbAffiliate.password === password) {
            const token = issueSessionToken({ username: dbAffiliate.name, role: 'affiliate', affiliateCode: dbAffiliate.code });
            res.json({ ok: true, token, username: dbAffiliate.name, role: 'affiliate', tier: 1, affiliateCode: dbAffiliate.code });
            return;
        }
    }
    catch { /* fall through to file-based auth */ }
    // Check affiliate users in affiliates.json (legacy)
    const affiliateUser = affiliates.find((a) => a.username === username && a.password === password);
    if (affiliateUser) {
        const affiliateCode = affiliateUser.affiliateCode || affiliateUser.code || username.toUpperCase();
        const token = issueSessionToken({
            username: affiliateUser.name || username,
            role: 'affiliate',
            affiliateCode,
            tier: affiliateUser.tier || 1,
        });
        res.json({
            ok: true,
            token,
            username: affiliateUser.name || username,
            role: 'affiliate',
            tier: affiliateUser.tier || 1,
            affiliateCode,
        });
        return;
    }
    // Check ADMIN_USERS env var first (format: "user1:pass1,user2:pass2")
    if (env_1.env.ADMIN_USERS) {
        const adminUsers = env_1.env.ADMIN_USERS.split(',').map((entry) => {
            const idx = entry.indexOf(':');
            return { username: entry.slice(0, idx).trim(), password: entry.slice(idx + 1).trim() };
        });
        const adminMatch = adminUsers.find((u) => u.username === username && u.password === password);
        if (adminMatch) {
            const token = issueSessionToken({ username, role: 'admin' });
            res.json({ ok: true, token, username, role: 'leadership' });
            return;
        }
    }
    // Check CONSOLE_PASSWORD env var
    if (env_1.env.CONSOLE_PASSWORD && password === env_1.env.CONSOLE_PASSWORD) {
        const token = issueSessionToken({ username, role: 'admin' });
        res.json({ ok: true, token, username, role: 'leadership' });
        return;
    }
    // Check TEAM_USER_* entries from CREDS.md (local dev fallback)
    const teamUsers = Object.entries(creds)
        .filter(([k]) => k.startsWith('TEAM_USER_'))
        .map(([, v]) => { const idx = v.indexOf(':'); return { username: v.slice(0, idx), password: v.slice(idx + 1) }; });
    const teamMatch = teamUsers.find((u) => u.username === username && u.password === password);
    if (teamMatch) {
        const token = issueSessionToken({ username, role: 'admin' });
        res.json({ ok: true, token, username, role: 'leadership' });
        return;
    }
    // Check CONSOLE_PASSWORD from CREDS.md (local dev fallback)
    if (creds.CONSOLE_PASSWORD && password === creds.CONSOLE_PASSWORD) {
        const token = issueSessionToken({ username, role: 'admin' });
        res.json({ ok: true, token, username, role: 'leadership' });
        return;
    }
    res.status(401).json({ error: 'Invalid username or password' });
});
// POST /api/admin/verify-pin — PIN gate for admin.html (no auth required, PIN is the factor)
router.post('/api/admin/verify-pin', (req, res) => {
    const { pin } = req.body;
    const correctPin = (process.env.ADMIN_PIN || '0404').toString().trim();
    if (pin && pin.toString().trim() === correctPin) {
        res.json({ ok: true });
    }
    else {
        res.status(401).json({ error: 'Incorrect PIN' });
    }
});
// POST /api/logout
router.post('/api/logout', (_req, res) => {
    res.clearCookie('session');
    res.json({ ok: true });
});
// GET /api/me
router.get('/api/me', auth_1.requireAuth, (req, res) => {
    const actor = req.actor;
    const affiliates = readAffiliates();
    const aff = affiliates.find((a) => a.affiliateCode === actor.affiliateCode || a.username === actor.affiliateCode);
    res.json({
        username: actor.affiliateCode || 'admin',
        role: actor.role === 'admin' ? 'leadership' : actor.role,
        affiliateCode: actor.affiliateCode || null,
        tier: aff?.tier || (actor.role === 'admin' ? null : 1),
    });
});
// GET /api/my/connected-platforms — stub for affiliate.html
router.get('/api/my/connected-platforms', auth_1.requireAuth, (_req, res) => {
    res.json({ platforms: {} });
});
// GET /api/welcome — stub for affiliate.html
router.get('/api/welcome', auth_1.requireAuth, (_req, res) => {
    res.json({ ok: true });
});
// GET /api/terms — stub for affiliate.html
router.get('/api/terms', (_req, res) => {
    res.json({ ok: true });
});
exports.default = router;
//# sourceMappingURL=authRoutes.js.map