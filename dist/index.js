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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const env_1 = require("./config/env");
const logger_1 = require("./lib/logger");
const requestId_1 = require("./middleware/requestId");
const errorHandler_1 = require("./middleware/errorHandler");
const rateLimit_1 = require("./middleware/rateLimit");
const profileRoutes_1 = __importDefault(require("./modules/profile/profileRoutes"));
const mediaRoutes_1 = __importDefault(require("./modules/media/mediaRoutes"));
const adminRoutes_1 = __importDefault(require("./modules/admin/adminRoutes"));
const trackingRoutes_1 = __importDefault(require("./modules/tracking/trackingRoutes"));
const authRoutes_1 = __importDefault(require("./modules/auth/authRoutes"));
const resumeParseWorker_1 = require("./queues/workers/resumeParseWorker");
const profileExtractWorker_1 = require("./queues/workers/profileExtractWorker");
const contentScoreWorker_1 = require("./queues/workers/contentScoreWorker");
const dispatchWorker_1 = require("./queues/workers/dispatchWorker");
const mediaCleanupWorker_1 = require("./queues/workers/mediaCleanupWorker");
const providerDeleteWorker_1 = require("./queues/workers/providerDeleteWorker");
const optimisationWorker_1 = require("./queues/workers/optimisationWorker");
const csvExportWorker_1 = require("./queues/workers/csvExportWorker");
const emailUploadWorker_1 = require("./queues/workers/emailUploadWorker");
const dripWorker_1 = require("./queues/workers/dripWorker");
const seoAuditWorker_1 = require("./queues/workers/seoAuditWorker");
const llmPresenceWorker_1 = require("./queues/workers/llmPresenceWorker");
const emailRoutes_1 = __importDefault(require("./modules/email/emailRoutes"));
const seoRoutes_1 = __importDefault(require("./modules/seo/seoRoutes"));
const keywordRoutes_1 = __importDefault(require("./modules/keywords/keywordRoutes"));
const llmPresenceRoutes_1 = __importDefault(require("./modules/llmPresence/llmPresenceRoutes"));
const dashboardRoutes_1 = __importDefault(require("./modules/dashboard/dashboardRoutes"));
const intelligenceRoutes_1 = __importDefault(require("./modules/intelligence/intelligenceRoutes"));
const dashboardWorker_1 = require("./queues/workers/dashboardWorker");
const redis_1 = require("./lib/redis");
const prisma_1 = require("./lib/prisma");
const queues_1 = require("./queues");
const app = (0, express_1.default)();
// Core middleware
app.use(requestId_1.requestId);
app.use((0, cookie_parser_1.default)());
app.use(express_1.default.json({ limit: '2mb' }));
app.use(express_1.default.urlencoded({ extended: true }));
// General rate limiting
app.use(rateLimit_1.generalLimit);
// Health check — public
app.get('/v2/health', (_req, res) => {
    res.json({ status: 'ok', version: '2.0.0', ts: new Date().toISOString() });
});
// Affiliate onboarding page — publicly served; token is validated client-side
app.get('/v2/connect', (_req, res) => {
    const htmlPath = path.join(__dirname, '../public/connect.html');
    if (fs.existsSync(htmlPath)) {
        res.sendFile(htmlPath);
    }
    else {
        res.send(`<!DOCTYPE html>
<html>
<head><title>AlphaBoost Affiliate Onboarding</title></head>
<body>
  <h1>Welcome to AlphaBoost</h1>
  <p>Your onboarding is ready. The full UI is coming soon.</p>
  <p>Affiliate code: <strong>${_req.actor?.affiliateCode}</strong></p>
</body>
</html>`);
    }
});
// Tracking routes — public, no auth
app.use('/track', trackingRoutes_1.default);
// Auth routes — login, logout, me
app.use('/', authRoutes_1.default);
// API routes
app.use('/v2/api/affiliate', profileRoutes_1.default);
app.use('/v2/api/affiliate', mediaRoutes_1.default);
app.use('/v2/api/admin', adminRoutes_1.default);
app.use('/v2/api/email', emailRoutes_1.default);
app.use('/v2/api/admin/seo', seoRoutes_1.default);
app.use('/v2/api/admin/keywords', keywordRoutes_1.default);
app.use('/v2/api/admin/llm-presence', llmPresenceRoutes_1.default);
app.use('/v2/api/admin/dashboard', dashboardRoutes_1.default);
app.use('/v2/api/admin/intelligence', intelligenceRoutes_1.default);
// Static frontend files
const PUBLIC_DIR = path.join(__dirname, '../public');
app.use(express_1.default.static(PUBLIC_DIR));
// Page routes
function sendPage(res, file) {
    const p = path.join(PUBLIC_DIR, file);
    if (fs.existsSync(p)) {
        res.sendFile(p);
    }
    else {
        res.status(404).send('Not found');
    }
}
app.get('/', (_req, res) => sendPage(res, 'login.html'));
app.get('/login', (_req, res) => sendPage(res, 'login.html'));
app.get('/affiliate', (_req, res) => sendPage(res, 'affiliate.html'));
app.get('/app', (_req, res) => sendPage(res, 'app.html'));
app.get('/admin', (_req, res) => sendPage(res, 'admin.html'));
app.get('/connect', (_req, res) => sendPage(res, 'connect.html'));
app.get('/adhoc', (_req, res) => sendPage(res, 'adhoc.html'));
app.get('/forgot-password', (_req, res) => sendPage(res, 'forgot-password.html'));
app.get('/reset-password', (_req, res) => sendPage(res, 'reset-password.html'));
app.get('/privacy', (_req, res) => sendPage(res, 'privacy.html'));
app.get('/terms', (_req, res) => sendPage(res, 'terms.html'));
// 404 + error handler
app.use(errorHandler_1.notFound);
app.use(errorHandler_1.errorHandler);
// Start workers
function startWorkers() {
    (0, resumeParseWorker_1.startResumeParseWorker)();
    (0, profileExtractWorker_1.startProfileExtractWorker)();
    (0, contentScoreWorker_1.startContentScoreWorker)();
    (0, dispatchWorker_1.startDispatchWorker)();
    (0, mediaCleanupWorker_1.startMediaCleanupWorker)();
    (0, providerDeleteWorker_1.startProviderDeleteWorker)();
    (0, optimisationWorker_1.startOptimisationWorker)();
    (0, csvExportWorker_1.startCsvExportWorker)();
    (0, emailUploadWorker_1.startEmailUploadWorker)();
    (0, dripWorker_1.startDripWorker)();
    (0, seoAuditWorker_1.startSeoAuditWorker)();
    (0, llmPresenceWorker_1.startLlmPresenceWorker)();
    (0, dashboardWorker_1.startDashboardWorker)();
    logger_1.logger.info({ module: 'index' }, 'All workers started');
}
// Graceful shutdown
async function shutdown(signal) {
    logger_1.logger.info({ module: 'index', signal }, 'Shutdown signal received');
    await Promise.all([
        (0, resumeParseWorker_1.stopResumeParseWorker)(),
        (0, profileExtractWorker_1.stopProfileExtractWorker)(),
        (0, contentScoreWorker_1.stopContentScoreWorker)(),
        (0, dispatchWorker_1.stopDispatchWorker)(),
        (0, mediaCleanupWorker_1.stopMediaCleanupWorker)(),
        (0, providerDeleteWorker_1.stopProviderDeleteWorker)(),
        (0, optimisationWorker_1.stopOptimisationWorker)(),
        (0, csvExportWorker_1.stopCsvExportWorker)(),
        (0, emailUploadWorker_1.stopEmailUploadWorker)(),
        (0, dripWorker_1.stopDripWorker)(),
        (0, seoAuditWorker_1.stopSeoAuditWorker)(),
        (0, llmPresenceWorker_1.stopLlmPresenceWorker)(),
        (0, dashboardWorker_1.stopDashboardWorker)(),
    ]);
    await (0, queues_1.closeQueues)();
    await (0, redis_1.closeRedis)();
    await (0, prisma_1.closePrisma)();
    logger_1.logger.info({ module: 'index' }, 'Shutdown complete');
    process.exit(0);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
// Start server
app.listen(env_1.env.PORT, () => {
    logger_1.logger.info({ module: 'index', port: env_1.env.PORT }, `OpenClaw v2 running on port ${env_1.env.PORT}`);
    startWorkers();
});
exports.default = app;
//# sourceMappingURL=index.js.map