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
declare const router: import("express-serve-static-core").Router;
export default router;
//# sourceMappingURL=oauthRoutes.d.ts.map