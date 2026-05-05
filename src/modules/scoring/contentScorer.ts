export interface ScoreBreakdown {
  total: number;
  breakdown: Record<string, number>;
}

export interface ContentScoreResult {
  quality: ScoreBreakdown;
  risk: ScoreBreakdown;
  conversion: ScoreBreakdown;
}

const SPAM_PHRASES = ['act now', 'limited time', 'guaranteed', 'make money fast', '100%', 'click here', 'free money'];
const HIGH_URGENCY = ['urgent', 'immediately', 'right now', 'last chance', 'expires today'];

export async function scoreContent(params: { content: string; channel: string }): Promise<ContentScoreResult> {
  const { content, channel } = params;
  const lower = content.toLowerCase();
  const wordCount = content.split(/\s+/).length;
  const sentences = content.split(/[.!?]+/).filter(Boolean);

  // ── Quality Score ──────────────────────────────────────────────────────────
  const hookClarity = sentences[0]?.length > 20 ? 18 : 10;
  const audienceRelevance = lower.includes('career') || lower.includes('professional') || lower.includes('job') ? 16 : 10;
  const structure = sentences.length >= 3 ? 18 : sentences.length === 2 ? 12 : 6;
  const authorityGrounding = lower.includes("i've seen") || lower.includes('from what i') || lower.includes('in my experience') ? 16 : 8;
  const ctaCoherence = lower.includes('sign up') || lower.includes('check it out') || lower.includes('join') || lower.includes('start now') ? 16 : 8;

  const quality: ScoreBreakdown = {
    total: hookClarity + audienceRelevance + structure + authorityGrounding + ctaCoherence,
    breakdown: { hookClarity, audienceRelevance, structure, authorityGrounding, ctaCoherence },
  };

  // ── Risk Score ─────────────────────────────────────────────────────────────
  const promotionalIntensity = (content.match(/!/g) ?? []).length > 3 ? 18 : (content.match(/!/g) ?? []).length > 1 ? 10 : 4;
  const unverifiableClaims = lower.includes('guaranteed') || lower.includes('proven') ? 16 : 4;
  const spamLikePhrasing = SPAM_PHRASES.filter((p) => lower.includes(p)).length * 5;
  const excessiveUrgency = HIGH_URGENCY.filter((p) => lower.includes(p)).length * 4;
  const platformMismatch = (channel === 'twitter' && wordCount > 100) ? 14 : 0;

  const risk: ScoreBreakdown = {
    total: Math.min(100, promotionalIntensity + unverifiableClaims + spamLikePhrasing + excessiveUrgency + platformMismatch),
    breakdown: { promotionalIntensity, unverifiableClaims, spamLikePhrasing, excessiveUrgency, platformMismatch },
  };

  // ── Conversion Readiness ───────────────────────────────────────────────────
  const painPointResonance = lower.includes('struggling') || lower.includes('challenge') || lower.includes('problem') ? 18 : 8;
  const curiosityGeneration = sentences[0]?.includes('?') || lower.includes('what if') ? 16 : 8;
  const specificity = wordCount >= 50 && wordCount <= 300 ? 18 : 8;
  const narrativeCredibility = lower.includes("i've") || lower.includes('my experience') ? 16 : 8;
  const frictionToAction = lower.includes('ref/') ? 18 : (lower.includes('join') || lower.includes('sign up') || lower.includes('start')) ? 12 : 4;

  const conversion: ScoreBreakdown = {
    total: painPointResonance + curiosityGeneration + specificity + narrativeCredibility + frictionToAction,
    breakdown: { painPointResonance, curiosityGeneration, specificity, narrativeCredibility, frictionToAction },
  };

  return { quality, risk, conversion };
}
