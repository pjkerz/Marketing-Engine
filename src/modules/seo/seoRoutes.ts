import { Router, Request, Response, NextFunction } from 'express';
import { getPrisma } from '../../lib/prisma';
import { AppError } from '../../middleware/errorHandler';
import { requireAuth } from '../../middleware/auth';
import { requireRole } from '../../middleware/rbac';
import { adminLimit } from '../../middleware/rateLimit';
import { generateSeoContent } from './seoContentGenerator';
import { seoAuditQueue } from '../../queues/workers/seoAuditWorker';

const router = Router();

// POST /v2/api/admin/seo/audit — start new audit
router.post('/audit', requireAuth, requireRole('admin'), adminLimit, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const prisma = getPrisma();
    const { clientUrl, competitorUrl } = req.body as { clientUrl: string; competitorUrl: string };
    if (!clientUrl || !competitorUrl) throw new AppError('NOT_FOUND', 'clientUrl and competitorUrl required.', 422);

    const audit = await prisma.seoAudit.create({
      data: { businessId: req.actor!.businessId, clientUrl, competitorUrl, status: 'pending' },
    });

    if (!seoAuditQueue) throw new AppError('NOT_FOUND', 'SEO audit worker not started.', 503);
    await seoAuditQueue.add('seo-audit', {
      auditId: audit.id,
      clientUrl,
      competitorUrl,
      businessId: req.actor!.businessId,
    });

    res.status(202).json({ auditId: audit.id, message: 'Audit queued — poll /seo/audit/:id for results' });
  } catch (err) { next(err); }
});

// GET /v2/api/admin/seo/audits
router.get('/audits', requireAuth, requireRole('admin'), adminLimit, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const prisma = getPrisma();
    const audits = await prisma.seoAudit.findMany({
      where: { businessId: req.actor!.businessId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { id: true, clientUrl: true, competitorUrl: true, status: true, completedAt: true, createdAt: true },
    });
    res.json({ audits });
  } catch (err) { next(err); }
});

// GET /v2/api/admin/seo/audit/:id
router.get('/audit/:id', requireAuth, requireRole('admin'), adminLimit, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const prisma = getPrisma();
    const audit = await prisma.seoAudit.findFirst({
      where: { id: req.params['id'] as string, businessId: req.actor!.businessId },
    });
    if (!audit) throw new AppError('NOT_FOUND', 'Audit not found.', 404);
    res.json({ audit });
  } catch (err) { next(err); }
});

// POST /v2/api/admin/seo/generate
router.post('/generate', requireAuth, requireRole('admin'), adminLimit, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { keyword, type = 'blog-post', auditId } = req.body as { keyword: string; type?: string; auditId?: string };
    if (!keyword) throw new AppError('NOT_FOUND', 'keyword required.', 422);
    const validTypes = ['blog-post', 'meta', 'page-copy', 'faq'];
    if (!validTypes.includes(type)) throw new AppError('NOT_FOUND', `type must be one of: ${validTypes.join(', ')}`, 422);

    const content = await generateSeoContent(
      keyword,
      req.actor!.businessId,
      type as 'blog-post' | 'meta' | 'page-copy' | 'faq',
      auditId,
    );
    res.status(201).json({ content });
  } catch (err) { next(err); }
});

// GET /v2/api/admin/seo/content
router.get('/content', requireAuth, requireRole('admin'), adminLimit, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const prisma = getPrisma();
    const { status } = req.query as { status?: string };
    const content = await prisma.seoContent.findMany({
      where: { businessId: req.actor!.businessId, ...(status ? { status } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    res.json({ content });
  } catch (err) { next(err); }
});

// GET /v2/api/admin/seo/content/:id/preview
router.get('/content/:id/preview', requireAuth, requireRole('admin'), adminLimit, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const prisma = getPrisma();
    const content = await prisma.seoContent.findFirst({
      where: { id: req.params['id'] as string, businessId: req.actor!.businessId },
    });
    if (!content) throw new AppError('NOT_FOUND', 'Content not found.', 404);
    res.json({ content });
  } catch (err) { next(err); }
});

// POST /v2/api/admin/seo/content/:id/approve
router.post('/content/:id/approve', requireAuth, requireRole('admin'), adminLimit, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const prisma = getPrisma();
    const content = await prisma.seoContent.findFirst({
      where: { id: req.params['id'] as string, businessId: req.actor!.businessId },
    });
    if (!content) throw new AppError('NOT_FOUND', 'Content not found.', 404);

    const updated = await prisma.seoContent.update({
      where: { id: content.id },
      data: { status: 'approved' },
    });

    // Fire CMS webhook if configured
    const config = await prisma.businessConfig.findUnique({ where: { businessId: req.actor!.businessId } });
    if (config?.cmsWebhookUrl) {
      fetch(config.cmsWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keyword: content.keyword,
          title: content.title,
          metaTitle: content.metaTitle,
          metaDescription: content.metaDescription,
          html: content.html,
          businessId: req.actor!.businessId,
          contentId: content.id,
        }),
      }).catch(() => { /* fire-and-forget */ });
    }

    res.json({ content: updated });
  } catch (err) { next(err); }
});

export default router;
