import { Router, Request, Response, NextFunction } from 'express';
import * as crypto from 'crypto';
import { getPrisma } from '../../lib/prisma';
import { AppError } from '../../middleware/errorHandler';
import { requireAuth } from '../../middleware/auth';
import { requireRole } from '../../middleware/rbac';
import { adminLimit, trackingLimit } from '../../middleware/rateLimit';
import { logger } from '../../lib/logger';
import { env } from '../../config/env';
import {
  scoreContent, getThrottledBatches, getSuppressedSubscribers,
  orderByEngagement, generateUnsubToken, verifyUnsubToken,
} from './spamEngine';
import { sendEmail } from './resendClient';

const router = Router();

const UNSUB_SECRET = env.SESSION_STITCH_SECRET ?? 'unsub-secret-change-me';

// ── Helpers ───────────────────────────────────────────────────────────────────

function injectTrackingPixel(html: string, campaignId: string, subscriberId: string, businessId: string, appUrl: string): string {
  const pixelUrl = `${appUrl}/track/pixel.gif?cid=${campaignId}&sid=${subscriberId}&bid=${businessId}`;
  const pixel = `<img src="${pixelUrl}" width="1" height="1" style="display:none" alt="">`;
  if (html.includes('</body>')) return html.replace('</body>', `${pixel}</body>`);
  return html + pixel;
}

function injectUnsubscribeLink(html: string, subscriberId: string, appUrl: string): string {
  const token = generateUnsubToken(subscriberId, UNSUB_SECRET);
  const unsubUrl = `${appUrl}/v2/api/email/unsubscribe?sid=${subscriberId}&token=${token}`;
  const link = `<p style="text-align:center;font-size:11px;color:#94a3b8;margin-top:32px">
    <a href="${unsubUrl}" style="color:#94a3b8">Unsubscribe</a>
  </p>`;
  if (html.includes('</body>')) return html.replace('</body>', `${link}</body>`);
  return html + link;
}

function wrapLinksForTracking(html: string, campaignId: string, appUrl: string): string {
  return html.replace(/href="(https?:\/\/[^"]+)"/g, (match, url) => {
    if (url.includes('/track/') || url.includes('unsubscribe')) return match;
    const encoded = encodeURIComponent(url);
    return `href="${appUrl}/track/click/${campaignId}?url=${encoded}"`;
  });
}

// ── Lists ─────────────────────────────────────────────────────────────────────

// GET /v2/api/email/lists
router.get('/lists', requireAuth, requireRole('admin'), adminLimit, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const prisma = getPrisma();
    const lists = await prisma.emailList.findMany({
      where: { businessId: req.actor!.businessId, active: true },
      include: { _count: { select: { subscribers: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ lists });
  } catch (err) { next(err); }
});

// POST /v2/api/email/lists
router.post('/lists', requireAuth, requireRole('admin'), adminLimit, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const prisma = getPrisma();
    const { name, description, tags } = req.body as { name: string; description?: string; tags?: string[] };
    if (!name) throw new AppError('NOT_FOUND', 'name required.', 422);
    const list = await prisma.emailList.create({
      data: { businessId: req.actor!.businessId, name, description, tags: tags ?? [] },
    });
    res.status(201).json({ list });
  } catch (err) { next(err); }
});

// GET /v2/api/email/lists/:listId/subscribers
router.get('/lists/:listId/subscribers', requireAuth, requireRole('admin'), adminLimit, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const prisma = getPrisma();
    const list = await prisma.emailList.findFirst({
      where: { id: req.params['listId'] as string, businessId: req.actor!.businessId },
    });
    if (!list) throw new AppError('NOT_FOUND', 'List not found.', 404);

    const subscribers = await prisma.emailSubscriber.findMany({
      where: { listId: list.id },
      orderBy: { subscribedAt: 'desc' },
      take: 500,
    });
    res.json({ subscribers, total: subscribers.length });
  } catch (err) { next(err); }
});

// POST /v2/api/email/lists/:listId/subscribers — add single subscriber
router.post('/lists/:listId/subscribers', requireAuth, requireRole('admin'), adminLimit, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const prisma = getPrisma();
    const list = await prisma.emailList.findFirst({
      where: { id: req.params['listId'] as string, businessId: req.actor!.businessId },
    });
    if (!list) throw new AppError('NOT_FOUND', 'List not found.', 404);

    const { email, name, affiliateCode, tags } = req.body as { email: string; name?: string; affiliateCode?: string; tags?: string[] };
    if (!email) throw new AppError('NOT_FOUND', 'email required.', 422);

    const sub = await prisma.emailSubscriber.upsert({
      where: { listId_email: { listId: list.id, email } },
      update: { status: 'active', name: name ?? undefined },
      create: {
        businessId: req.actor!.businessId,
        listId: list.id,
        email,
        name,
        affiliateCode,
        tags: tags ?? [],
        source: 'manual',
      },
    });
    res.status(201).json({ subscriber: sub });
  } catch (err) { next(err); }
});

// ── CSV Upload ────────────────────────────────────────────────────────────────

const multer = require('multer');
const uploadMiddleware = multer({ dest: require('os').tmpdir(), limits: { fileSize: 10 * 1024 * 1024 } });

router.post('/lists/:listId/upload', requireAuth, requireRole('admin'), uploadMiddleware.single('file'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const prisma = getPrisma();
    const list = await prisma.emailList.findFirst({
      where: { id: req.params['listId'] as string, businessId: req.actor!.businessId },
    });
    if (!list) throw new AppError('NOT_FOUND', 'List not found.', 404);

    const file = (req as Request & { file?: { path: string; originalname: string; mimetype: string } }).file;
    if (!file) throw new AppError('NOT_FOUND', 'File required.', 422);

    const { fieldMap } = req.body as { fieldMap?: string };
    const mapping = fieldMap ? JSON.parse(fieldMap) as Record<string, string> : { email: 'email', name: 'name', tags: 'tags' };

    // Queue async upload job
    const { getQueues } = await import('../../queues');
    const jobId = crypto.randomUUID();
    await getQueues()['v2-email-upload'].add('upload', {
      jobId,
      listId: list.id,
      businessId: req.actor!.businessId,
      filePath: file.path,
      fileName: file.originalname,
      mimeType: file.mimetype,
      fieldMap: mapping,
    });

    res.status(202).json({ jobId, message: 'Upload queued — poll /upload-status/:jobId for progress' });
  } catch (err) { next(err); }
});

router.get('/lists/:listId/upload-status/:jobId', requireAuth, requireRole('admin'), adminLimit, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { getRedis } = await import('../../lib/redis');
    const redis = getRedis();
    const raw = await redis.get(`v2:email:upload:${req.params['jobId'] as string}`);
    if (!raw) return res.json({ status: 'queued', progress: 0 });
    res.json(JSON.parse(raw));
  } catch (err) { next(err); }
});

// ── Capture endpoint (public) ─────────────────────────────────────────────────

router.post('/capture', trackingLimit, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const prisma = getPrisma();
    const { businessId, listId, email, name, tags, source, affiliateCode } = req.body as {
      businessId: string; listId: string; email: string;
      name?: string; tags?: string[]; source?: string; affiliateCode?: string;
    };

    if (!businessId || !listId || !email) {
      return res.status(200).json({ ok: true }); // Never reveal error to scrapers
    }

    // Validate business + list belong together
    const list = await prisma.emailList.findFirst({
      where: { id: listId, businessId, active: true },
    });
    if (!list) return res.status(200).json({ ok: true });

    // Upsert subscriber
    await prisma.emailSubscriber.upsert({
      where: { listId_email: { listId, email } },
      update: { status: 'active' },
      create: {
        businessId,
        listId,
        email,
        name,
        affiliateCode,
        tags: tags ?? [],
        source: source ?? 'capture',
        status: 'active',
      },
    });

    // Trigger on_subscribe drip sequences
    setImmediate(async () => {
      try {
        const sequences = await prisma.emailDripSequence.findMany({
          where: { businessId, listId, active: true, triggerType: 'on_subscribe' },
          include: { steps: { orderBy: { stepNumber: 'asc' }, take: 1 } },
        });

        for (const seq of sequences) {
          const firstStep = seq.steps[0];
          if (!firstStep) continue;
          if (firstStep.delayDays === 0) {
            // Send immediately
            const sub = await prisma.emailSubscriber.findUnique({ where: { listId_email: { listId, email } } });
            if (sub) {
              const bConfig = await prisma.businessConfig.findUnique({ where: { businessId }, select: { landingPageUrl: true, fromName: true, fromEmail: true } });
              const subAppUrl = bConfig?.landingPageUrl ?? env.APP_URL;
              const subFrom = bConfig?.fromEmail && bConfig?.fromName ? `${bConfig.fromName} <${bConfig.fromEmail}>` : env.EMAIL_FROM;
              const finalHtml = injectUnsubscribeLink(firstStep.html, sub.id, subAppUrl);
              await sendEmail({
                from: subFrom,
                to: [email],
                subject: firstStep.subject,
                html: finalHtml,
                text: firstStep.text ?? undefined,
              });
            }
          }
          // Future steps are handled by drip worker
        }
      } catch { /* non-critical */ }
    });

    return res.status(200).json({ ok: true });
  } catch (err) { next(err); }
});

// ── Campaigns ─────────────────────────────────────────────────────────────────

// GET /v2/api/email/campaigns
router.get('/campaigns', requireAuth, requireRole('admin'), adminLimit, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const prisma = getPrisma();
    const campaigns = await prisma.emailCampaign.findMany({
      where: { businessId: req.actor!.businessId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    res.json({ campaigns });
  } catch (err) { next(err); }
});

// POST /v2/api/email/campaigns — create draft
router.post('/campaigns', requireAuth, requireRole('admin'), adminLimit, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const prisma = getPrisma();
    const { listId, name, subject, previewText, html, text } = req.body as {
      listId: string; name: string; subject: string;
      previewText?: string; html: string; text?: string;
    };
    if (!listId || !name || !subject || !html) throw new AppError('NOT_FOUND', 'listId, name, subject, html required.', 422);

    const list = await prisma.emailList.findFirst({ where: { id: listId, businessId: req.actor!.businessId } });
    if (!list) throw new AppError('NOT_FOUND', 'List not found.', 404);

    // Pre-score for spam
    const spamResult = scoreContent(html, subject);

    const campaign = await prisma.emailCampaign.create({
      data: {
        businessId: req.actor!.businessId,
        listId,
        name,
        subject,
        previewText,
        html,
        text,
        spamScore: spamResult.score,
        status: 'draft',
      },
    });

    res.status(201).json({ campaign, spamScore: spamResult });
  } catch (err) { next(err); }
});

// GET /v2/api/email/campaigns/:id/preview — format review
router.get('/campaigns/:id/preview', requireAuth, requireRole('admin'), adminLimit, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const prisma = getPrisma();
    const campaign = await prisma.emailCampaign.findFirst({
      where: { id: req.params['id'] as string, businessId: req.actor!.businessId },
    });
    if (!campaign) throw new AppError('NOT_FOUND', 'Campaign not found.', 404);

    const spamResult = scoreContent(campaign.html, campaign.subject);
    const hasPlainText = !!campaign.text;
    const hasUnsubLink = campaign.html.toLowerCase().includes('unsubscribe');
    const linkCount = (campaign.html.match(/<a\s[^>]*href/gi) || []).length;
    const textContent = campaign.html.replace(/<[^>]+>/g, ' ').trim();
    const imgCount = (campaign.html.match(/<img/gi) || []).length;
    const imageTextRatio = imgCount > 0 ? Math.round(textContent.length / (imgCount * 100)) : 100;

    const sub = campaign.subject;
    const warnings: string[] = [...spamResult.issues];
    if (!hasPlainText) warnings.push('No plain-text version — some email clients will show blank');
    if (!hasUnsubLink) warnings.push('No unsubscribe link — will be blocked');

    res.json({
      spamScore: spamResult,
      subjectPreview: {
        gmail: sub.slice(0, 45) + (sub.length > 45 ? '…' : ''),
        outlook: sub.slice(0, 60) + (sub.length > 60 ? '…' : ''),
        apple: sub.slice(0, 70) + (sub.length > 70 ? '…' : ''),
      },
      hasPlainText,
      hasUnsubscribeLink: hasUnsubLink,
      linkCount,
      imageTextRatio,
      warnings,
      recipientCount: 0, // filled below
    });
  } catch (err) { next(err); }
});

// POST /v2/api/email/campaigns/:id/send — send campaign
router.post('/campaigns/:id/send', requireAuth, requireRole('admin'), adminLimit, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const prisma = getPrisma();
    const businessId = req.actor!.businessId;
    const { override } = req.body as { override?: boolean };

    const campaign = await prisma.emailCampaign.findFirst({
      where: { id: req.params['id'] as string, businessId },
    });
    if (!campaign) throw new AppError('NOT_FOUND', 'Campaign not found.', 404);
    if (campaign.status === 'sent') throw new AppError('FORBIDDEN', 'Campaign already sent.', 409);

    const bizConfig = await prisma.businessConfig.findUnique({ where: { businessId }, select: { landingPageUrl: true, fromName: true, fromEmail: true } });
    const appUrl = bizConfig?.landingPageUrl ?? env.APP_URL;
    const fromAddress = bizConfig?.fromEmail && bizConfig?.fromName
      ? `${bizConfig.fromName} <${bizConfig.fromEmail}>`
      : env.EMAIL_FROM;

    // Layer 1: Spam check
    const spamResult = scoreContent(campaign.html, campaign.subject);
    if (!spamResult.safe && !override) {
      return res.status(422).json({
        error: 'Campaign failed spam check',
        spamScore: spamResult,
        hint: 'Pass { override: true } to send anyway',
      });
    }

    // Enforce unsubscribe link
    if (!campaign.html.toLowerCase().includes('unsubscribe') && !override) {
      throw new AppError('FORBIDDEN', 'Campaign must contain an unsubscribe link.', 422);
    }

    // Get active subscribers
    const allSubs = await prisma.emailSubscriber.findMany({
      where: { listId: campaign.listId, status: 'active' },
      select: { id: true, email: true, name: true },
    });

    // Layer 4: Remove suppressed
    const suppressedIds = await getSuppressedSubscribers(campaign.listId);
    const activeSubs = allSubs.filter(s => !suppressedIds.includes(s.id));

    if (!activeSubs.length) throw new AppError('NOT_FOUND', 'No eligible recipients.', 422);

    // Layer 5: Order by engagement
    const orderedIds = await orderByEngagement(activeSubs.map(s => s.id));
    const orderedSubs = orderedIds.map(id => activeSubs.find(s => s.id === id)!).filter(Boolean);

    // Layer 2: Throttle into batches
    const batches = await getThrottledBatches(orderedSubs.map(s => s.id), businessId);

    // Mark campaign as sending
    await prisma.emailCampaign.update({
      where: { id: campaign.id },
      data: { status: 'sending' },
    });

    // Send asynchronously
    setImmediate(async () => {
      let totalSent = 0;

      for (const batch of batches) {
        const batchSubs = batch.subscriberIds.map(id => orderedSubs.find(s => s.id === id)!).filter(Boolean);

        for (const sub of batchSubs) {
          try {
            // Personalise HTML
            let html = campaign.html;
            html = injectTrackingPixel(html, campaign.id, sub.id, businessId, appUrl);
            html = injectUnsubscribeLink(html, sub.id, appUrl);
            html = wrapLinksForTracking(html, campaign.id, appUrl);

            const result = await sendEmail({
              from: fromAddress,
              to: [sub.email],
              subject: campaign.subject,
              html,
              text: campaign.text ?? undefined,
            });

            await prisma.emailSendEvent.create({
              data: {
                campaignId: campaign.id,
                subscriberId: sub.id,
                businessId,
                messageId: result.id,
                status: 'sent',
              },
            });

            totalSent++;
          } catch (e) {
            logger.error({ module: 'emailRoutes', campaignId: campaign.id, subscriberId: sub.id, err: e }, 'Failed to send to subscriber');
          }
        }

        // Respect batch delay
        const delay = batch.sendAfter.getTime() - Date.now();
        if (delay > 0) await new Promise(r => setTimeout(r, Math.min(delay, 30000)));
      }

      await prisma.emailCampaign.update({
        where: { id: campaign.id },
        data: { status: 'sent', sentAt: new Date(), totalSent },
      });

      logger.info({ module: 'emailRoutes', campaignId: campaign.id, totalSent }, 'Campaign send complete');
    });

    res.json({ ok: true, message: `Sending to ${activeSubs.length} recipients in ${batches.length} batches`, recipientCount: activeSubs.length });
  } catch (err) { next(err); }
});

// ── Resend webhook ────────────────────────────────────────────────────────────

router.post('/webhook/resend', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Validate webhook signature
    const secret = env.RESEND_WEBHOOK_SECRET;
    if (secret) {
      const sig = req.headers['resend-signature'] as string | undefined;
      if (!sig) return res.status(401).json({ error: 'Missing signature' });
      // Basic HMAC validation
      const body = JSON.stringify(req.body);
      const expected = crypto.createHmac('sha256', secret).update(body).digest('hex');
      if (sig !== expected) return res.status(401).json({ error: 'Invalid signature' });
    }

    const { type, data } = req.body as { type: string; data: { email_id?: string; [k: string]: unknown } };
    const messageId = data?.email_id as string | undefined;
    if (!messageId) return res.json({ ok: true });

    const prisma = getPrisma();
    const event = await prisma.emailSendEvent.findFirst({ where: { messageId } });
    if (!event) return res.json({ ok: true });

    const now = new Date();
    const updates: Record<string, unknown> = {};
    const subUpdates: Record<string, unknown> = {};

    if (type === 'email.delivered') {
      updates['status'] = 'delivered';
    } else if (type === 'email.opened') {
      updates['openedAt'] = now;
      updates['status'] = 'opened';
      updates['openCount'] = { increment: 1 };
      if (event.campaignId) await prisma.emailCampaign.update({ where: { id: event.campaignId }, data: { totalOpened: { increment: 1 } } });
    } else if (type === 'email.clicked') {
      updates['clickedAt'] = now;
      updates['status'] = 'clicked';
      updates['clickCount'] = { increment: 1 };
      if (event.campaignId) await prisma.emailCampaign.update({ where: { id: event.campaignId }, data: { totalClicked: { increment: 1 } } });
    } else if (type === 'email.bounced') {
      updates['bouncedAt'] = now;
      updates['status'] = 'bounced';
      subUpdates['bouncedAt'] = now;
      subUpdates['status'] = 'bounced';
      if (event.campaignId) await prisma.emailCampaign.update({ where: { id: event.campaignId }, data: { totalBounced: { increment: 1 } } });
    } else if (type === 'email.complained') {
      updates['complainedAt'] = now;
      updates['status'] = 'complained';
      subUpdates['status'] = 'complained';
      if (event.campaignId) await prisma.emailCampaign.update({ where: { id: event.campaignId }, data: { totalBounced: { increment: 1 } } });
    }

    await prisma.emailSendEvent.update({ where: { id: event.id }, data: updates as Parameters<typeof prisma.emailSendEvent.update>[0]['data'] });
    if (Object.keys(subUpdates).length) {
      await prisma.emailSubscriber.update({ where: { id: event.subscriberId }, data: subUpdates as Parameters<typeof prisma.emailSubscriber.update>[0]['data'] });
    }

    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── Unsubscribe ───────────────────────────────────────────────────────────────

router.get('/unsubscribe', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const prisma = getPrisma();
    const { sid, token } = req.query as { sid?: string; token?: string };

    if (!sid || !token) {
      return res.status(400).send('<h1>Invalid unsubscribe link</h1>');
    }

    if (!verifyUnsubToken(sid, token, UNSUB_SECRET)) {
      return res.status(400).send('<h1>Invalid or expired unsubscribe link</h1>');
    }

    await prisma.emailSubscriber.update({
      where: { id: sid },
      data: { status: 'unsubscribed', unsubscribedAt: new Date() },
    });

    // Log funnel event
    setImmediate(async () => {
      try {
        const sub = await prisma.emailSubscriber.findUnique({ where: { id: sid } });
        if (sub) {
          await prisma.funnelEvent.create({
            data: {
              businessId: sub.businessId,
              sessionId: crypto.randomUUID(),
              eventType: 'unsubscribe',
              channel: 'email',
              funnelStage: 'retention',
            },
          });
        }
      } catch { /* non-critical */ }
    });

    res.send(`<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>Unsubscribed</title>
<style>body{font-family:sans-serif;max-width:500px;margin:80px auto;text-align:center;color:#334155}
h1{color:#0f172a}p{color:#64748b;margin-top:16px}</style>
</head>
<body>
<h1>You've been unsubscribed</h1>
<p>You won't receive any more emails from us.</p>
<p style="margin-top:32px;font-size:12px;color:#94a3b8">Changed your mind? Contact us to re-subscribe.</p>
</body></html>`);
  } catch (err) { next(err); }
});

// ── Drip sequences ────────────────────────────────────────────────────────────

router.get('/sequences', requireAuth, requireRole('admin'), adminLimit, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const prisma = getPrisma();
    const sequences = await prisma.emailDripSequence.findMany({
      where: { businessId: req.actor!.businessId },
      include: { steps: { orderBy: { stepNumber: 'asc' } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ sequences });
  } catch (err) { next(err); }
});

router.post('/sequences', requireAuth, requireRole('admin'), adminLimit, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const prisma = getPrisma();
    const { listId, name, triggerType, triggerValue, steps } = req.body as {
      listId: string; name: string; triggerType: string; triggerValue?: string;
      steps?: Array<{ stepNumber: number; delayDays: number; subject: string; html: string; text?: string; condition?: string }>;
    };
    if (!listId || !name || !triggerType) throw new AppError('NOT_FOUND', 'listId, name, triggerType required.', 422);

    const sequence = await prisma.emailDripSequence.create({
      data: {
        businessId: req.actor!.businessId,
        listId,
        name,
        triggerType,
        triggerValue,
        steps: steps?.length ? {
          create: steps.map(s => ({
            stepNumber: s.stepNumber,
            delayDays: s.delayDays,
            subject: s.subject,
            html: s.html,
            text: s.text,
            condition: s.condition,
          })),
        } : undefined,
      },
      include: { steps: true },
    });

    res.status(201).json({ sequence });
  } catch (err) { next(err); }
});

// ── Domain warmup ─────────────────────────────────────────────────────────────

router.get('/warmup', requireAuth, requireRole('admin'), adminLimit, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const prisma = getPrisma();
    const warmup = await prisma.domainWarmup.findUnique({ where: { businessId: req.actor!.businessId } });
    res.json({ warmup });
  } catch (err) { next(err); }
});

router.post('/warmup/start', requireAuth, requireRole('admin'), adminLimit, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const prisma = getPrisma();
    const { sendingDomain } = req.body as { sendingDomain: string };
    if (!sendingDomain) throw new AppError('NOT_FOUND', 'sendingDomain required.', 422);

    const warmupSchedule = [
      { day: 1, limit: 50 }, { day: 4, limit: 100 }, { day: 7, limit: 200 },
      { day: 10, limit: 400 }, { day: 14, limit: 700 }, { day: 18, limit: 1000 },
      { day: 22, limit: 2000 }, { day: 26, limit: 3500 }, { day: 30, limit: 5000 },
    ];

    const warmup = await prisma.domainWarmup.upsert({
      where: { businessId: req.actor!.businessId },
      update: { sendingDomain, startedAt: new Date(), currentDay: 1, dailySendLimit: 50, complete: false, warmupSchedule },
      create: { businessId: req.actor!.businessId, sendingDomain, warmupSchedule },
    });

    res.status(201).json({ warmup });
  } catch (err) { next(err); }
});

export default router;
