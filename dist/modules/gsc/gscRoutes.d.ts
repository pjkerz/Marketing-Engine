/**
 * gscRoutes.ts — Google Search Console integration
 *
 * OAuth flow:  GET /api/gsc/connect   → redirects to Google
 *              GET /auth/google/callback → exchanges code, stores tokens in DB businessConfig
 * Data:        GET /api/gsc/status
 *              GET /api/gsc/search-analytics
 *              GET /api/gsc/pages
 */
declare const router: import("express-serve-static-core").Router;
export default router;
//# sourceMappingURL=gscRoutes.d.ts.map