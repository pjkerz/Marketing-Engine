import express from 'express';
import cookieParser from 'cookie-parser';
import * as path from 'path';
import * as fs from 'fs';
import { env } from './config/env';
import { logger } from './lib/logger';
import { requestId } from './middleware/requestId';
import { errorHandler, notFound } from './middleware/errorHandler';
import { generalLimit } from './middleware/rateLimit';
import profileRoutes from './modules/profile/profileRoutes';
import mediaRoutes from './modules/media/mediaRoutes';
import adminRoutes from './modules/admin/adminRoutes';
import trackingRoutes from './modules/tracking/trackingRoutes';
import authRoutes from './modules/auth/authRoutes';
import { startResumeParseWorker, stopResumeParseWorker } from './queues/workers/resumeParseWorker';
import { startProfileExtractWorker, stopProfileExtractWorker } from './queues/workers/profileExtractWorker';
import { startContentScoreWorker, stopContentScoreWorker } from './queues/workers/contentScoreWorker';
import { startDispatchWorker, stopDispatchWorker } from './queues/workers/dispatchWorker';
import { startMediaCleanupWorker, stopMediaCleanupWorker } from './queues/workers/mediaCleanupWorker';
import { startProviderDeleteWorker, stopProviderDeleteWorker } from './queues/workers/providerDeleteWorker';
import { startOptimisationWorker, stopOptimisationWorker } from './queues/workers/optimisationWorker';
import { startCsvExportWorker, stopCsvExportWorker } from './queues/workers/csvExportWorker';
import { startEmailUploadWorker, stopEmailUploadWorker } from './queues/workers/emailUploadWorker';
import { startDripWorker, stopDripWorker } from './queues/workers/dripWorker';
import { startSeoAuditWorker, stopSeoAuditWorker } from './queues/workers/seoAuditWorker';
import { startLlmPresenceWorker, stopLlmPresenceWorker } from './queues/workers/llmPresenceWorker';
import emailRoutes from './modules/email/emailRoutes';
import seoRoutes from './modules/seo/seoRoutes';
import keywordRoutes from './modules/keywords/keywordRoutes';
import llmPresenceRoutes from './modules/llmPresence/llmPresenceRoutes';
import dashboardRoutes from './modules/dashboard/dashboardRoutes';
import intelligenceRoutes from './modules/intelligence/intelligenceRoutes';
import compatRoutes from './modules/compat/compatRoutes';
import gscRoutes from './modules/gsc/gscRoutes';
import oauthRoutes from './modules/oauth/oauthRoutes';
import { startDashboardWorker, stopDashboardWorker } from './queues/workers/dashboardWorker';
import { closeRedis } from './lib/redis';
import { closePrisma } from './lib/prisma';
import { closeQueues } from './queues';

const app = express();

// Core middleware
app.use(requestId);
app.use(cookieParser());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// General rate limiting
app.use(generalLimit);

// Health check — public
app.get('/v2/health', (_req, res) => {
  res.json({ status: 'ok', version: '2.0.0', ts: new Date().toISOString() });
});

// Affiliate onboarding page — publicly served; token is validated client-side
app.get('/v2/connect', (_req, res) => {
  const htmlPath = path.join(__dirname, '../public/connect.html');
  if (fs.existsSync(htmlPath)) {
    res.sendFile(htmlPath);
  } else {
    res.send(`<!DOCTYPE html>
<html>
<head><title>AlphaBoost Affiliate Onboarding</title></head>
<body>
  <h1>Welcome to AlphaBoost</h1>
  <p>Your onboarding is ready. The full UI is coming soon.</p>
  <p>Affiliate code: <strong>${(_req as typeof _req & { actor: { affiliateCode: string } }).actor?.affiliateCode}</strong></p>
</body>
</html>`);
  }
});

// Tracking routes — public, no auth
app.use('/track', trackingRoutes);

// Auth routes — login, logout, me
app.use('/', authRoutes);

// API routes
app.use('/v2/api/affiliate', profileRoutes);
app.use('/v2/api/affiliate', mediaRoutes);
app.use('/v2/api/admin', adminRoutes);
app.use('/v2/api/email', emailRoutes);
app.use('/v2/api/admin/seo', seoRoutes);
app.use('/v2/api/admin/keywords', keywordRoutes);
app.use('/v2/api/admin/llm-presence', llmPresenceRoutes);
app.use('/v2/api/admin/dashboard', dashboardRoutes);
app.use('/v2/api/admin/intelligence', intelligenceRoutes);

// Legacy /api/* compat bridge (admin.html v1 paths → v2 implementations)
app.use('/', compatRoutes);

// Google Search Console OAuth + data routes
app.use('/', gscRoutes);

// Social platform OAuth (LinkedIn, Facebook, Twitter, YouTube, Reddit)
app.use('/', oauthRoutes);

// Static frontend files
const PUBLIC_DIR = path.join(__dirname, '../public');
app.use(express.static(PUBLIC_DIR));

// Page routes
function sendPage(res: express.Response, file: string): void {
  const p = path.join(PUBLIC_DIR, file);
  if (fs.existsSync(p)) { res.sendFile(p); } else { res.status(404).send('Not found'); }
}
app.get('/',                    (_req, res) => sendPage(res, 'login.html'));
app.get('/login',               (_req, res) => sendPage(res, 'login.html'));
app.get('/affiliate',           (_req, res) => sendPage(res, 'affiliate.html'));
app.get('/app',                 (_req, res) => sendPage(res, 'app.html'));
app.get('/admin',               (_req, res) => sendPage(res, 'admin.html'));
app.get('/connect',             (_req, res) => sendPage(res, 'connect.html'));
app.get('/adhoc',               (_req, res) => sendPage(res, 'adhoc.html'));
app.get('/forgot-password',     (_req, res) => sendPage(res, 'forgot-password.html'));
app.get('/reset-password',      (_req, res) => sendPage(res, 'reset-password.html'));
app.get('/privacy',             (_req, res) => sendPage(res, 'privacy.html'));
app.get('/terms',               (_req, res) => sendPage(res, 'terms.html'));

// 404 + error handler
app.use(notFound);
app.use(errorHandler);

// Start workers
function startWorkers(): void {
  startResumeParseWorker();
  startProfileExtractWorker();
  startContentScoreWorker();
  startDispatchWorker();
  startMediaCleanupWorker();
  startProviderDeleteWorker();
  startOptimisationWorker();
  startCsvExportWorker();
  startEmailUploadWorker();
  startDripWorker();
  startSeoAuditWorker();
  startLlmPresenceWorker();
  startDashboardWorker();
  logger.info({ module: 'index' }, 'All workers started');
}

// Graceful shutdown
async function shutdown(signal: string): Promise<void> {
  logger.info({ module: 'index', signal }, 'Shutdown signal received');
  await Promise.all([
    stopResumeParseWorker(),
    stopProfileExtractWorker(),
    stopContentScoreWorker(),
    stopDispatchWorker(),
    stopMediaCleanupWorker(),
    stopProviderDeleteWorker(),
    stopOptimisationWorker(),
    stopCsvExportWorker(),
    stopEmailUploadWorker(),
    stopDripWorker(),
    stopSeoAuditWorker(),
    stopLlmPresenceWorker(),
    stopDashboardWorker(),
  ]);
  await closeQueues();
  await closeRedis();
  await closePrisma();
  logger.info({ module: 'index' }, 'Shutdown complete');
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Start server
app.listen(env.PORT, () => {
  logger.info({ module: 'index', port: env.PORT }, `OpenClaw v2 running on port ${env.PORT}`);
  startWorkers();
});

export default app;
