import { Router, Request, Response, NextFunction } from 'express';
import { getPrisma } from '../../lib/prisma';
import { requireAuth } from '../../middleware/auth';
import { requireRole } from '../../middleware/rbac';
import { adminLimit } from '../../middleware/rateLimit';
import { enqueueLeadPull } from '../../queues/workers/leadPullWorker';
import { env } from '../../config/env';

const router = Router();

router.use(requireAuth, requireRole('admin'), adminLimit);

const DEFAULT_TITLES = [
  // Product Management
  'Product Manager',
  'Senior Product Manager',
  'Product Management',
  // Project Management
  'Project Manager',
  'Senior Project Manager',
  'Project Management Analyst',
  // Analyst (general)
  'Analyst',
  'Business Analyst',
  'Data Analyst',
  // Cyber Security
  'Cyber Security Specialist',
  'Cybersecurity Analyst',
  'Information Security Analyst',
  'Security Engineer',
  // UX Design
  'UX Designer',
  'User Experience Designer',
  'UI/UX Designer',
  // Software Development
  'Software Developer',
  'Software Engineer',
  'Full Stack Developer',
  'Backend Developer',
  'Frontend Developer',
  // Software QA
  'Software QA Engineer',
  'QA Analyst',
  'Quality Assurance Engineer',
  'QA Engineer',
  // Legal
  'Lawyer',
  'Attorney',
  'Associate Attorney',
  'Legal Counsel',
];

// POST /v2/api/admin/leads/pull — start a pull job
router.post('/pull', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!env.APOLLO_API_KEY) {
      res.status(503).json({ error: 'APOLLO_API_KEY not configured. Add it to your environment variables.' });
      return;
    }

    const {
      titles = DEFAULT_TITLES,
      targetCount = 10000,
    } = req.body as { titles?: string[]; targetCount?: number };

    if (targetCount > 25000) {
      res.status(400).json({ error: 'Max 25,000 per pull job' });
      return;
    }

    const prisma = getPrisma();
    const businessId = req.actor!.businessId;

    // Create the tracking record
    const pullJob = await prisma.leadPullJob.create({
      data: {
        id: crypto.randomUUID(),
        businessId,
        titles,
        targetCount,
        status: 'pending',
      },
    });

    // Queue the background job
    await enqueueLeadPull({ jobId: pullJob.id, businessId, titles, targetCount });

    res.json({ ok: true, jobId: pullJob.id, titles, targetCount });
  } catch (err) { next(err); }
});

// GET /v2/api/admin/leads/jobs — list pull jobs
router.get('/jobs', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const prisma = getPrisma();
    const jobs = await prisma.leadPullJob.findMany({
      where: { businessId: req.actor!.businessId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    res.json(jobs);
  } catch (err) { next(err); }
});

// GET /v2/api/admin/leads/jobs/:id — single job status
router.get('/jobs/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const prisma = getPrisma();
    const job = await prisma.leadPullJob.findFirst({
      where: { id: req.params.id, businessId: req.actor!.businessId },
    });
    if (!job) { res.status(404).json({ error: 'Job not found' }); return; }
    res.json(job);
  } catch (err) { next(err); }
});

// GET /v2/api/admin/leads — list leads with pagination and filters
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const prisma = getPrisma();
    const businessId = req.actor!.businessId;
    const {
      status,
      search,
      page = '1',
      limit = '100',
    } = req.query as Record<string, string>;

    const take = Math.min(parseInt(limit, 10) || 100, 500);
    const skip = (parseInt(page, 10) - 1) * take;

    const where = {
      businessId,
      openToWork: true,
      ...(status ? { status } : {}),
      ...(search ? {
        OR: [
          { firstName: { contains: search, mode: 'insensitive' as const } },
          { lastName: { contains: search, mode: 'insensitive' as const } },
          { email: { contains: search, mode: 'insensitive' as const } },
          { title: { contains: search, mode: 'insensitive' as const } },
          { company: { contains: search, mode: 'insensitive' as const } },
        ],
      } : {}),
    };

    const [leads, total] = await Promise.all([
      prisma.lead.findMany({ where, orderBy: { createdAt: 'desc' }, take, skip }),
      prisma.lead.count({ where }),
    ]);

    res.json({ leads, total, page: parseInt(page, 10), pages: Math.ceil(total / take) });
  } catch (err) { next(err); }
});

// PATCH /v2/api/admin/leads/:id/status — update lead status
router.patch('/:id/status', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status } = req.body as { status?: string };
    const allowed = ['new', 'contacted', 'replied', 'converted', 'unsubscribed'];
    if (!status || !allowed.includes(status)) {
      res.status(400).json({ error: `status must be one of: ${allowed.join(', ')}` });
      return;
    }

    const prisma = getPrisma();
    await prisma.lead.updateMany({
      where: { id: req.params.id, businessId: req.actor!.businessId },
      data: { status },
    });

    res.json({ ok: true });
  } catch (err) { next(err); }
});

// GET /v2/api/admin/leads/export.csv — download all leads as CSV
router.get('/export.csv', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const prisma = getPrisma();
    const leads = await prisma.lead.findMany({
      where: { businessId: req.actor!.businessId, openToWork: true },
      orderBy: { createdAt: 'desc' },
    });

    const headers = ['First Name', 'Last Name', 'Email', 'Phone', 'Title', 'Company', 'Location', 'LinkedIn', 'Status', 'Created'];
    const rows = leads.map(l => [
      l.firstName ?? '',
      l.lastName ?? '',
      l.email ?? '',
      l.phone ?? '',
      l.title ?? '',
      l.company ?? '',
      l.location ?? '',
      l.linkedinUrl ?? '',
      l.status,
      l.createdAt.toISOString().split('T')[0],
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));

    const csv = [headers.join(','), ...rows].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="leads-open-to-work.csv"');
    res.send(csv);
  } catch (err) { next(err); }
});

export default router;
