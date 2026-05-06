import { Router, Request, Response } from 'express'
import { getPrisma } from '../../lib/prisma'
import { requireAuth } from '../../middleware/auth'
import { buildBusinessContext } from './contextBuilder'
import { generateRecommendations } from './recommendationEngine'
import { executeRecommendation } from './autoExecutor'

const router = Router()

// POST /v2/api/admin/intelligence/generate
router.post('/generate', requireAuth, async (req: Request, res: Response) => {
  const prisma = getPrisma()
  const { businessId } = (req as any).actor
  const force = req.query.force === 'true'

  if (!force) {
    const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000)
    const recent = await prisma.crossChannelRecommendation.findFirst({ where: { businessId, status: 'new', createdAt: { gte: sixHoursAgo } } })
    if (recent) {
      const all = await prisma.crossChannelRecommendation.findMany({ where: { businessId, status: 'new' }, orderBy: { createdAt: 'desc' }, take: 5 })
      return res.json({ recommendations: all, cached: true })
    }
  }

  const context = await buildBusinessContext(businessId)
  const recs = await generateRecommendations(context, businessId)
  res.json({ recommendations: recs, cached: false })
})

// GET /v2/api/admin/intelligence/recommendations
router.get('/recommendations', requireAuth, async (req: Request, res: Response) => {
  const prisma = getPrisma()
  const { businessId } = (req as any).actor
  const status = typeof req.query.status === 'string' ? req.query.status : 'new'

  const recs = await prisma.crossChannelRecommendation.findMany({
    where: { businessId, status },
    orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }],
    take: 10,
  })
  res.json({ recommendations: recs })
})

// POST /v2/api/admin/intelligence/recommendations/:id/execute
router.post('/recommendations/:id/execute', requireAuth, async (req: Request, res: Response) => {
  const { businessId } = (req as any).actor
  try {
    const results = await executeRecommendation(req.params['id'] as string, businessId)
    res.json({ results })
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed' })
  }
})

// POST /v2/api/admin/intelligence/recommendations/:id/dismiss
router.post('/recommendations/:id/dismiss', requireAuth, async (req: Request, res: Response) => {
  const prisma = getPrisma()
  const { businessId } = (req as any).actor
  const id = req.params['id'] as string
  const rec = await prisma.crossChannelRecommendation.findFirst({ where: { id, businessId } })
  if (!rec) return res.status(404).json({ error: 'Not found' })
  await prisma.crossChannelRecommendation.update({ where: { id }, data: { status: 'dismissed' } })
  res.json({ ok: true })
})

// GET /v2/api/admin/intelligence/feed?limit=20
router.get('/feed', requireAuth, async (req: Request, res: Response) => {
  const prisma = getPrisma()
  const { businessId } = (req as any).actor
  const limit = Math.min(parseInt(req.query.limit as string) || 20, 50)

  const events = await prisma.intelligenceFeedEvent.findMany({
    where: { businessId },
    orderBy: [{ read: 'asc' }, { createdAt: 'desc' }],
    take: limit,
  })
  res.json({ events })
})

// POST /v2/api/admin/intelligence/feed/:id/read
router.post('/feed/:id/read', requireAuth, async (req: Request, res: Response) => {
  const prisma = getPrisma()
  const { businessId } = (req as any).actor
  await prisma.intelligenceFeedEvent.updateMany({ where: { id: req.params['id'] as string, businessId }, data: { read: true } })
  res.json({ ok: true })
})

// POST /v2/api/admin/intelligence/feed/read-all
router.post('/feed/read-all', requireAuth, async (req: Request, res: Response) => {
  const prisma = getPrisma()
  const { businessId } = (req as any).actor
  await prisma.intelligenceFeedEvent.updateMany({ where: { businessId, read: false }, data: { read: true } })
  res.json({ ok: true })
})

// GET /v2/api/admin/intelligence/context
router.get('/context', requireAuth, async (req: Request, res: Response) => {
  const { businessId } = (req as any).actor
  const context = await buildBusinessContext(businessId)
  res.json({ context })
})

export default router
