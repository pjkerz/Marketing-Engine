import { Router, Request, Response, NextFunction } from 'express';
import { getPrisma } from '../../lib/prisma';
import { AppError } from '../../middleware/errorHandler';
import { requireAuth } from '../../middleware/auth';
import { requireRole } from '../../middleware/rbac';
import { adminLimit } from '../../middleware/rateLimit';
import { llmPresenceQueue } from '../../queues/workers/llmPresenceWorker';
import { generateSeoContent } from '../seo/seoContentGenerator';

const router = Router();

// POST /v2/api/admin/llm-presence/audit
router.post('/audit', requireAuth, requireRole('admin'), adminLimit, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const prisma = getPrisma();
    const { competitors = [], customQueries = [] } = req.body as {
      competitors?: string[];
      customQueries?: Array<{ query: string; category: string }>;
    };

    const audit = await prisma.llmPresenceAudit.create({
      data: {
        businessId: req.actor!.businessId,
        competitors,
        queries: customQueries,
        status: 'pending',
      },
    });

    if (!llmPresenceQueue) throw new AppError('NOT_FOUND', 'LLM presence worker not started.', 503);
    await llmPresenceQueue.add('llm-presence', {
      auditId: audit.id,
      businessId: req.actor!.businessId,
    });

    res.status(202).json({ auditId: audit.id, message: 'Audit queued — poll /llm-presence/audit/:id for results' });
  } catch (err) { next(err); }
});

// GET /v2/api/admin/llm-presence/audits
router.get('/audits', requireAuth, requireRole('admin'), adminLimit, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const prisma = getPrisma();
    const audits = await prisma.llmPresenceAudit.findMany({
      where: { businessId: req.actor!.businessId },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true, status: true, competitors: true,
        summary: true, createdAt: true, completedAt: true,
        _count: { select: { results: true } },
      },
    });
    res.json({ audits });
  } catch (err) { next(err); }
});

// GET /v2/api/admin/llm-presence/audit/:id
router.get('/audit/:id', requireAuth, requireRole('admin'), adminLimit, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const prisma = getPrisma();
    const audit = await prisma.llmPresenceAudit.findFirst({
      where: { id: req.params['id'] as string, businessId: req.actor!.businessId },
      include: {
        results: {
          orderBy: [{ query: 'asc' }, { llmName: 'asc' }],
        },
      },
    });
    if (!audit) throw new AppError('NOT_FOUND', 'Audit not found.', 404);
    res.json({ audit });
  } catch (err) { next(err); }
});

// POST /v2/api/admin/llm-presence/generate-content/:resultId
router.post('/generate-content/:resultId', requireAuth, requireRole('admin'), adminLimit, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const prisma = getPrisma();
    const result = await prisma.llmPresenceResult.findFirst({
      where: { id: req.params['resultId'] as string, businessId: req.actor!.businessId },
    });
    if (!result) throw new AppError('NOT_FOUND', 'Result not found.', 404);

    // Generate blog post targeting the gap query
    const content = await generateSeoContent(
      result.query,
      req.actor!.businessId,
      'blog-post',
    );

    res.status(201).json({ content });
  } catch (err) { next(err); }
});

export default router;
