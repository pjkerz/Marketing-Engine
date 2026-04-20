import { getPrisma } from '../../lib/prisma.js'
import { env } from '../../config/env.js'

interface ExecutionResult {
  channel: string
  action: string
  success: boolean
  draftId?: string
  error?: string
}

export async function executeRecommendation(recommendationId: string, businessId: string): Promise<ExecutionResult[]> {
  const prisma = getPrisma()
  const rec = await prisma.crossChannelRecommendation.findFirst({ where: { id: recommendationId, businessId } })
  if (!rec) throw new Error('Recommendation not found')
  if (rec.status !== 'new') throw new Error('Recommendation already processed')

  const actions = rec.actions as Array<{ channel: string; action: string; endpoint?: string; payload?: object }>
  const results: ExecutionResult[] = []

  for (const action of actions) {
    try {
      if (!action.endpoint) {
        results.push({ channel: action.channel, action: action.action, success: true })
        continue
      }
      const baseUrl = `http://localhost:${env.PORT}`
      const resp = await fetch(`${baseUrl}${action.endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-password': process.env.CONSOLE_PASSWORD ?? '' },
        body: JSON.stringify(action.payload ?? {}),
      })
      if (!resp.ok) { results.push({ channel: action.channel, action: action.action, success: false, error: `API ${resp.status}` }); continue }
      const data = await resp.json() as Record<string, unknown>
      results.push({ channel: action.channel, action: action.action, success: true, draftId: (data['id'] ?? data['runId'] ?? data['campaignId']) as string | undefined })
    } catch (err) {
      results.push({ channel: action.channel, action: action.action, success: false, error: err instanceof Error ? err.message : 'Unknown' })
    }
  }

  await prisma.crossChannelRecommendation.update({ where: { id: recommendationId }, data: { status: 'executed', executedAt: new Date() } })
  return results
}
