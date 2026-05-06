import https from 'https'
import { getPrisma } from '../../lib/prisma'
import { env } from '../../config/env'
import { IntelligenceContext } from './contextBuilder'

async function callGroq(systemPrompt: string, userContent: string): Promise<string> {
  const body = JSON.stringify({
    model: 'llama-3.3-70b-versatile',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ],
    max_tokens: 2000,
    temperature: 0.3,
  })

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.groq.com',
      path: '/openai/v1/chat/completions',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.GROQ_API_KEY}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, res => {
      let data = ''
      res.on('data', (chunk: Buffer) => { data += chunk })
      res.on('end', () => {
        try { resolve(JSON.parse(data).choices[0].message.content ?? '') }
        catch { reject(new Error('Groq parse error: ' + data.slice(0, 200))) }
      })
    })
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

export async function generateRecommendations(context: IntelligenceContext, businessId: string) {
  const prisma = getPrisma()

  const systemPrompt = `You are a senior digital marketing strategist for ${context.businessName} (${context.businessType} business).
Generate specific, data-backed, cross-channel recommendations.
ALWAYS reference specific numbers from the data.
Each recommendation MUST involve at least 2 channels.
Return ONLY a valid JSON array, no other text, no markdown.`

  const userContent = `Current marketing state:
- Funnel CVR: ${context.funnelCvr}% | Top channel: ${context.topChannel} | Weakest stage: ${context.weakestFunnelStage}
- Content pending approvals: ${context.pendingApprovals}
- Email subscribers: ${context.emailListSize} | Last open rate: ${context.lastCampaignOpenRate}%
- SEO keyword gaps: ${context.topKeywordGaps.join(', ') || 'none yet'}
- Opportunity keywords: ${context.topOpportunityKeywords.join(', ') || 'none yet'}
- LLM brand mention rate: ${context.brandMentionRate}%
- LLM gap queries: ${context.topLlmGapQueries.slice(0, 3).join(', ') || 'none'}
- High-impact insights pending: ${context.pendingHighInsights}

Generate exactly 3 cross-channel recommendations as JSON array:
[{
  "title": "string",
  "insight": "string referencing specific numbers",
  "recommendation": "string with actionable steps",
  "channels": ["channel1", "channel2"],
  "actions": [{"channel": "string", "action": "string"}],
  "estimatedImpact": "string",
  "priority": "high|medium|low",
  "autoExecutable": false
}]`

  try {
    const raw = await callGroq(systemPrompt, userContent)
    const jsonMatch = raw.match(/\[[\s\S]*\]/)
    if (!jsonMatch) throw new Error('No JSON array in response')

    const recs = JSON.parse(jsonMatch[0]) as Array<{
      title?: string; insight?: string; recommendation?: string; channels?: string[]
      actions?: object[]; estimatedImpact?: string; priority?: string; autoExecutable?: boolean
    }>

    if (!Array.isArray(recs)) throw new Error('Not an array')

    const saved = await Promise.all(recs.map(r => prisma.crossChannelRecommendation.create({
      data: {
        businessId,
        title: r.title ?? 'Recommendation',
        insight: r.insight ?? '',
        recommendation: r.recommendation ?? '',
        channels: Array.isArray(r.channels) ? r.channels : [],
        actions: (r.actions ?? []) as object,
        estimatedImpact: r.estimatedImpact ?? '',
        priority: ['high', 'medium', 'low'].includes(r.priority ?? '') ? r.priority! : 'medium',
        autoExecutable: r.autoExecutable ?? false,
      },
    })))

    return saved
  } catch (err) {
    console.error('[recommendationEngine] Failed:', err)
    const fallback = await prisma.crossChannelRecommendation.create({
      data: {
        businessId,
        title: 'Review your top channel performance',
        insight: `Top channel is ${context.topChannel} with ${context.funnelCvr}% overall CVR.`,
        recommendation: 'Increase content volume on your best-performing channel and test new formats.',
        channels: [context.topChannel, 'email'],
        actions: [] as object,
        estimatedImpact: 'Moderate CVR improvement',
        priority: 'medium',
        autoExecutable: false,
      },
    })
    return [fallback]
  }
}
