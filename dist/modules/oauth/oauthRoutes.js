"use strict";
/**
 * oauthRoutes.ts — Social platform OAuth for affiliate "Set Up" tab
 *
 * Platforms: LinkedIn · Facebook/Instagram · X/Twitter · YouTube · Reddit
 *
 * Flow:
 *   GET /auth/:platform/start?affiliateCode=xxx  → redirect to platform
 *   GET /auth/:platform/callback                  → exchange code, save to DB
 *
 * Tokens stored in `platform_connections` table (JSONB) — no filesystem.
 * Redirect base: https://alphanoetic.me  (register this in each platform's dev console)
 */
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
const crypto = __importStar(require("crypto"));
const prisma_1 = require("../../lib/prisma");
const env_1 = require("../../config/env");
const router = (0, express_1.Router)();
const REDIRECT_BASE = 'https://alphanoetic.me';
// ── In-memory state map: oauthState → { affiliateCode, codeVerifier? } ──────
// Entries expire after 10 minutes
const pendingOAuth = new Map();
function genState(affiliateCode, extra = {}) {
    const state = crypto.randomBytes(16).toString('hex');
    pendingOAuth.set(state, { affiliateCode, ...extra });
    setTimeout(() => pendingOAuth.delete(state), 10 * 60 * 1000);
    return state;
}
function genPKCE() {
    const encode = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    const verifier = encode(crypto.randomBytes(32));
    const challenge = encode(crypto.createHash('sha256').update(verifier).digest());
    return { verifier, challenge };
}
// ── Token storage: upsert into platform_connections ──────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function saveConnection(affiliateCode, platform, tokens) {
    const prisma = (0, prisma_1.getPrisma)();
    const affiliate = await prisma.affiliate.findUnique({ where: { code: affiliateCode } });
    if (!affiliate)
        throw new Error(`Affiliate not found: ${affiliateCode}`);
    await prisma.platformConnection.upsert({
        where: { affiliateId_platform: { affiliateId: affiliate.id, platform } },
        create: {
            affiliateId: affiliate.id,
            platform,
            tokens,
        },
        update: {
            tokens,
            updatedAt: new Date(),
        },
    });
}
// ── Success / error redirect pages ───────────────────────────────────────────
function successPage(affiliateCode, platform) {
    return `<!DOCTYPE html>
<html>
<head><title>Connected</title></head>
<body style="font-family:monospace;background:#020617;color:#34d399;padding:40px;text-align:center">
  <h2>✓ ${platform.charAt(0).toUpperCase() + platform.slice(1)} Connected</h2>
  <p>You can close this window.</p>
  <script>
    if (window.opener) {
      window.opener.postMessage({ type: 'oauth_success', platform: '${platform}', affiliateCode: '${affiliateCode}' }, '*');
      setTimeout(() => window.close(), 1500);
    } else {
      setTimeout(() => { window.location.href = '/connect?code=${affiliateCode}&connected=${platform}'; }, 1500);
    }
  </script>
</body>
</html>`;
}
function errorPage(msg, affiliateCode) {
    return `<!DOCTYPE html>
<html>
<head><title>OAuth Error</title></head>
<body style="font-family:monospace;background:#020617;color:#f87171;padding:40px;text-align:center">
  <h2>OAuth Failed</h2>
  <p>${msg}</p>
  <p><a href="/connect?code=${affiliateCode}" style="color:#00C8FF">← Back</a></p>
</body>
</html>`;
}
// ══════════════════════════════════════════════════════════════════════════════
// LINKEDIN
// Register redirect URI: https://alphanoetic.me/auth/linkedin/callback
// Scopes: openid profile w_member_social
// ══════════════════════════════════════════════════════════════════════════════
router.get('/auth/linkedin/start', (req, res) => {
    const affiliateCode = req.query['affiliateCode'];
    if (!affiliateCode) {
        res.status(400).send('Missing affiliateCode');
        return;
    }
    if (!env_1.env.LI_CLIENT_ID) {
        res.status(503).send('LinkedIn OAuth not configured');
        return;
    }
    const state = genState(affiliateCode);
    const params = new URLSearchParams({
        response_type: 'code',
        client_id: env_1.env.LI_CLIENT_ID,
        redirect_uri: `${REDIRECT_BASE}/auth/linkedin/callback`,
        state,
        scope: 'openid profile w_member_social',
    });
    res.redirect(`https://www.linkedin.com/oauth/v2/authorization?${params}`);
});
router.get('/auth/linkedin/callback', async (req, res) => {
    const { code, state, error } = req.query;
    const stored = pendingOAuth.get(state);
    if (!stored) {
        res.send(errorPage('Session expired — please try again.', ''));
        return;
    }
    pendingOAuth.delete(state);
    if (error || !code) {
        res.send(errorPage(error || 'No code received', stored.affiliateCode));
        return;
    }
    try {
        const tokenRes = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type: 'authorization_code',
                code,
                redirect_uri: `${REDIRECT_BASE}/auth/linkedin/callback`,
                client_id: env_1.env.LI_CLIENT_ID,
                client_secret: env_1.env.LI_CLIENT_SECRET,
            }),
        });
        const data = await tokenRes.json();
        if (!data.access_token)
            throw new Error('No access_token in response');
        await saveConnection(stored.affiliateCode, 'linkedin', {
            access_token: data.access_token,
            expires_in: data.expires_in,
            saved_at: Date.now(),
        });
        res.send(successPage(stored.affiliateCode, 'linkedin'));
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        res.send(errorPage(`LinkedIn auth failed: ${msg}`, stored.affiliateCode));
    }
});
// ══════════════════════════════════════════════════════════════════════════════
// FACEBOOK / INSTAGRAM
// Register redirect URI: https://alphanoetic.me/auth/facebook/callback
// Scopes: pages_show_list pages_read_engagement pages_manage_posts
//         instagram_basic instagram_content_publish
// ══════════════════════════════════════════════════════════════════════════════
router.get('/auth/facebook/start', (req, res) => {
    const affiliateCode = req.query['affiliateCode'];
    if (!affiliateCode) {
        res.status(400).send('Missing affiliateCode');
        return;
    }
    if (!env_1.env.FB_APP_ID) {
        res.status(503).send('Facebook OAuth not configured');
        return;
    }
    const state = genState(affiliateCode);
    const params = new URLSearchParams({
        client_id: env_1.env.FB_APP_ID,
        redirect_uri: `${REDIRECT_BASE}/auth/facebook/callback`,
        state,
        scope: 'pages_show_list,pages_read_engagement,pages_manage_posts,instagram_basic,instagram_content_publish',
        response_type: 'code',
    });
    res.redirect(`https://www.facebook.com/v18.0/dialog/oauth?${params}`);
});
router.get('/auth/facebook/callback', async (req, res) => {
    const { code, state, error } = req.query;
    const stored = pendingOAuth.get(state);
    if (!stored) {
        res.send(errorPage('Session expired — please try again.', ''));
        return;
    }
    pendingOAuth.delete(state);
    if (error || !code) {
        res.send(errorPage(error || 'No code received', stored.affiliateCode));
        return;
    }
    try {
        const tokenRes = await fetch(`https://graph.facebook.com/v18.0/oauth/access_token?` +
            new URLSearchParams({
                client_id: env_1.env.FB_APP_ID,
                client_secret: env_1.env.FB_APP_SECRET,
                redirect_uri: `${REDIRECT_BASE}/auth/facebook/callback`,
                code,
            }));
        const tokenData = await tokenRes.json();
        if (!tokenData.access_token)
            throw new Error('No access_token in response');
        // Fetch Pages so we can post to FB Pages + Instagram
        const pagesRes = await fetch(`https://graph.facebook.com/v18.0/me/accounts?access_token=${tokenData.access_token}`);
        const pagesData = await pagesRes.json();
        const pages = (pagesData.data ?? []).map(p => ({
            id: p.id,
            name: p.name,
            access_token: p.access_token,
        }));
        await saveConnection(stored.affiliateCode, 'facebook', {
            user_access_token: tokenData.access_token,
            pages,
            saved_at: Date.now(),
        });
        res.send(successPage(stored.affiliateCode, 'facebook'));
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        res.send(errorPage(`Facebook auth failed: ${msg}`, stored.affiliateCode));
    }
});
// ══════════════════════════════════════════════════════════════════════════════
// X / TWITTER (OAuth 2.0 + PKCE)
// Register redirect URI: https://alphanoetic.me/auth/twitter/callback
// App type: Native App (confidential optional but PKCE required)
// Scopes: tweet.write users.read offline.access
// ══════════════════════════════════════════════════════════════════════════════
router.get('/auth/twitter/start', (req, res) => {
    const affiliateCode = req.query['affiliateCode'];
    if (!affiliateCode) {
        res.status(400).send('Missing affiliateCode');
        return;
    }
    if (!env_1.env.X_CLIENT_ID) {
        res.status(503).send('X/Twitter OAuth not configured');
        return;
    }
    const { verifier, challenge } = genPKCE();
    const state = genState(affiliateCode, { codeVerifier: verifier });
    const params = new URLSearchParams({
        response_type: 'code',
        client_id: env_1.env.X_CLIENT_ID,
        redirect_uri: `${REDIRECT_BASE}/auth/twitter/callback`,
        scope: 'tweet.write users.read offline.access',
        state,
        code_challenge: challenge,
        code_challenge_method: 'S256',
    });
    res.redirect(`https://twitter.com/i/oauth2/authorize?${params}`);
});
router.get('/auth/twitter/callback', async (req, res) => {
    const { code, state, error } = req.query;
    const stored = pendingOAuth.get(state);
    if (!stored) {
        res.send(errorPage('Session expired — please try again.', ''));
        return;
    }
    pendingOAuth.delete(state);
    if (error || !code) {
        res.send(errorPage(error || 'No code received', stored.affiliateCode));
        return;
    }
    const basicAuth = Buffer
        .from(`${env_1.env.X_CLIENT_ID}:${env_1.env.X_CLIENT_SECRET}`)
        .toString('base64');
    try {
        const tokenRes = await fetch('https://api.twitter.com/2/oauth2/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': `Basic ${basicAuth}`,
            },
            body: new URLSearchParams({
                code,
                grant_type: 'authorization_code',
                redirect_uri: `${REDIRECT_BASE}/auth/twitter/callback`,
                code_verifier: stored.codeVerifier ?? '',
            }),
        });
        const data = await tokenRes.json();
        if (!data.access_token)
            throw new Error('No access_token in response');
        await saveConnection(stored.affiliateCode, 'twitter', {
            access_token: data.access_token,
            refresh_token: data.refresh_token,
            saved_at: Date.now(),
        });
        res.send(successPage(stored.affiliateCode, 'twitter'));
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        res.send(errorPage(`X/Twitter auth failed: ${msg}`, stored.affiliateCode));
    }
});
// ══════════════════════════════════════════════════════════════════════════════
// YOUTUBE (Google OAuth 2.0)
// Register redirect URI: https://alphanoetic.me/auth/youtube/callback
// Enable: YouTube Data API v3 in Google Cloud Console
// Scopes: https://www.googleapis.com/auth/youtube.upload
// ══════════════════════════════════════════════════════════════════════════════
router.get('/auth/youtube/start', (req, res) => {
    const affiliateCode = req.query['affiliateCode'];
    if (!affiliateCode) {
        res.status(400).send('Missing affiliateCode');
        return;
    }
    if (!env_1.env.GOOGLE_CLIENT_ID) {
        res.status(503).send('Google/YouTube OAuth not configured');
        return;
    }
    const state = genState(affiliateCode);
    const params = new URLSearchParams({
        client_id: env_1.env.GOOGLE_CLIENT_ID,
        redirect_uri: `${REDIRECT_BASE}/auth/youtube/callback`,
        response_type: 'code',
        scope: 'https://www.googleapis.com/auth/youtube.upload',
        access_type: 'offline',
        prompt: 'consent',
        state,
    });
    res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});
router.get('/auth/youtube/callback', async (req, res) => {
    const { code, state, error } = req.query;
    const stored = pendingOAuth.get(state);
    if (!stored) {
        res.send(errorPage('Session expired — please try again.', ''));
        return;
    }
    pendingOAuth.delete(state);
    if (error || !code) {
        res.send(errorPage(error || 'No code received', stored.affiliateCode));
        return;
    }
    try {
        const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                code,
                client_id: env_1.env.GOOGLE_CLIENT_ID,
                client_secret: env_1.env.GOOGLE_CLIENT_SECRET,
                redirect_uri: `${REDIRECT_BASE}/auth/youtube/callback`,
                grant_type: 'authorization_code',
            }),
        });
        const data = await tokenRes.json();
        if (!data.access_token)
            throw new Error('No access_token in response');
        await saveConnection(stored.affiliateCode, 'youtube', {
            access_token: data.access_token,
            refresh_token: data.refresh_token,
            expires_in: data.expires_in,
            saved_at: Date.now(),
        });
        res.send(successPage(stored.affiliateCode, 'youtube'));
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        res.send(errorPage(`YouTube auth failed: ${msg}`, stored.affiliateCode));
    }
});
// ══════════════════════════════════════════════════════════════════════════════
// REDDIT
// Register redirect URI: https://alphanoetic.me/auth/reddit/callback
// App type: web app
// Scopes: identity submit
// ══════════════════════════════════════════════════════════════════════════════
router.get('/auth/reddit/start', (req, res) => {
    const affiliateCode = req.query['affiliateCode'];
    if (!affiliateCode) {
        res.status(400).send('Missing affiliateCode');
        return;
    }
    if (!env_1.env.REDDIT_CLIENT_ID) {
        res.status(503).send('Reddit OAuth not configured');
        return;
    }
    const state = genState(affiliateCode);
    const params = new URLSearchParams({
        client_id: env_1.env.REDDIT_CLIENT_ID,
        response_type: 'code',
        state,
        redirect_uri: `${REDIRECT_BASE}/auth/reddit/callback`,
        duration: 'permanent',
        scope: 'identity submit',
    });
    res.redirect(`https://www.reddit.com/api/v1/authorize?${params}`);
});
router.get('/auth/reddit/callback', async (req, res) => {
    const { code, state, error } = req.query;
    const stored = pendingOAuth.get(state);
    if (!stored) {
        res.send(errorPage('Session expired — please try again.', ''));
        return;
    }
    pendingOAuth.delete(state);
    if (error || !code) {
        res.send(errorPage(error || 'No code received', stored.affiliateCode));
        return;
    }
    const basicAuth = Buffer
        .from(`${env_1.env.REDDIT_CLIENT_ID}:${env_1.env.REDDIT_CLIENT_SECRET}`)
        .toString('base64');
    try {
        const tokenRes = await fetch('https://www.reddit.com/api/v1/access_token', {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${basicAuth}`,
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': 'AlphaBoost/2.0',
            },
            body: new URLSearchParams({
                grant_type: 'authorization_code',
                code,
                redirect_uri: `${REDIRECT_BASE}/auth/reddit/callback`,
            }),
        });
        const data = await tokenRes.json();
        if (!data.access_token)
            throw new Error('No access_token in response');
        await saveConnection(stored.affiliateCode, 'reddit', {
            access_token: data.access_token,
            refresh_token: data.refresh_token,
            saved_at: Date.now(),
        });
        res.send(successPage(stored.affiliateCode, 'reddit'));
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        res.send(errorPage(`Reddit auth failed: ${msg}`, stored.affiliateCode));
    }
});
// ══════════════════════════════════════════════════════════════════════════════
// DELETE /auth/:platform/disconnect?affiliateCode=xxx
// ══════════════════════════════════════════════════════════════════════════════
router.delete('/auth/:platform/disconnect', async (req, res) => {
    const { platform } = req.params;
    const affiliateCode = req.query['affiliateCode'];
    if (!affiliateCode) {
        res.status(400).json({ error: 'Missing affiliateCode' });
        return;
    }
    try {
        const prisma = (0, prisma_1.getPrisma)();
        const affiliate = await prisma.affiliate.findUnique({ where: { code: affiliateCode } });
        if (!affiliate) {
            res.status(404).json({ error: 'Affiliate not found' });
            return;
        }
        await prisma.platformConnection.deleteMany({
            where: { affiliateId: affiliate.id, platform },
        });
        res.json({ ok: true });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        res.status(500).json({ error: msg });
    }
});
exports.default = router;
//# sourceMappingURL=oauthRoutes.js.map