/**
 * gscRoutes.ts — Google Search Console integration (per-tenant)
 *
 * OAuth flow:  GET /api/gsc/connect                       → redirects to Google (tenant from req.actor)
 *              GET /auth/google/callback                  → exchanges code, stores tokens in tenant's BusinessConfig
 * Data:        GET /api/gsc/status
 *              GET /api/gsc/search-analytics
 *              GET /api/gsc/pages
 *              POST /api/gsc/site-url  — set the GSC property URL for this tenant
 */
declare const router: import("express-serve-static-core").Router;
export default router;
//# sourceMappingURL=gscRoutes.d.ts.map