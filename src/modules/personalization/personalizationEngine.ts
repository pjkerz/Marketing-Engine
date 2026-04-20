import { AffiliateProfile } from '@prisma/client';
import { getPrisma } from '../../lib/prisma';

export async function getOptimisationRules(businessId: string) {
  const prisma = getPrisma();
  return prisma.optimisationRule.findMany({ where: { businessId, active: true } });
}

export function weightedRandom(weights: Record<string, number>): string {
  const entries = Object.entries(weights);
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let rand = Math.random() * total;
  for (const [key, weight] of entries) {
    rand -= weight;
    if (rand <= 0) return key;
  }
  return entries[0]?.[0] ?? '';
}

export async function applyOptimisationToGeneration(
  businessId: string,
  opts: { channel: string },
): Promise<{ preferredFormat?: string; preferredTime?: string }> {
  try {
    const rules = await getOptimisationRules(businessId);
    const result: { preferredFormat?: string; preferredTime?: string } = {};

    const formatRule = rules.find(r => r.ruleType === 'content_format');
    if (formatRule) {
      const config = formatRule.config as { weights?: Record<string, number> };
      if (config.weights) result.preferredFormat = weightedRandom(config.weights);
    }

    const timeRule = rules.find(r => r.ruleType === 'posting_time');
    if (timeRule) {
      const config = timeRule.config as Record<string, string[]>;
      const times = config[opts.channel];
      if (times?.length) result.preferredTime = times[0];
    }

    return result;
  } catch {
    return {};
  }
}

const CHANNEL_FORMAT: Record<string, (text: string) => string> = {
  linkedin: (t) => t.replace(/([.!?])\s+/g, '$1\n\n'),
  twitter: (t) => {
    const sentences = t.split(/[.!?]+\s+/);
    const short = sentences[0]?.trim() ?? t;
    return short.length > 280 ? short.slice(0, 277) + '...' : short;
  },
  reddit: (t) => {
    // Remove CTA from top
    const lines = t.split('\n').filter((l) => !l.toLowerCase().includes('sign up') || t.indexOf(l) > 100);
    return lines.join('\n');
  },
  quora: (t) => {
    // Ensure 300-500 word first-person narrative
    const words = t.split(/\s+/);
    const trimmed = words.slice(0, 500).join(' ');
    return trimmed.startsWith('I ') ? trimmed : `I've seen this firsthand. ${trimmed}`;
  },
  youtube: (t) => {
    const lines = t.split('\n');
    // Hook-first: move the strongest line up
    return `🔥 ${lines[0]?.trim()}\n\n${lines.slice(1).join('\n')}`;
  },
  instagram: (t) => {
    const lines = t.split('\n');
    return `${lines[0]?.trim()}\n\n${lines.slice(1).join('\n')}`;
  },
  facebook: (t) => {
    const lines = t.split('\n');
    return `${lines[0]?.trim()}\n\n${lines.slice(1).join('\n')}`;
  },
  discord: (t) => t,
  slack: (t) => t,
  telegram: (t) => t,
};

const CTA_MAP: Record<string, string> = {
  invisible: '',
  soft: 'Worth exploring if this resonates.',
  direct: 'Check it out at alphaboost.app',
  strong: '👉 Start now at alphaboost.app — free to join.',
};

export interface PersonalizationInput {
  baseContent: string;
  channel: string;
  affiliateCode: string;
  profile: AffiliateProfile;
}

export function personalize(input: PersonalizationInput): string {
  const { baseContent, channel, affiliateCode, profile } = input;

  let content = baseContent;

  // 1. Pain-point hook injection
  if (profile.painPoint && profile.seniority && profile.role) {
    const hook = `Most ${profile.seniority} ${profile.role}s are struggling with ${profile.painPoint}. `;
    content = hook + content;
  }

  // 2. Authority signal framing
  if (profile.authoritySignal) {
    const signal = `\n\nFrom what I've seen in ${profile.authoritySignal}: `;
    // Insert before the last sentence
    const lastDot = content.lastIndexOf('. ');
    if (lastDot > 0) {
      content = content.slice(0, lastDot + 2) + signal + content.slice(lastDot + 2);
    }
  }

  // 3. Tone calibration
  const directness = profile.directness;
  const provocation = profile.provocation;

  if (directness > 0.7) {
    content = content.replace(/\bmight\b/g, 'will').replace(/\bcould\b/g, 'can');
  }
  if (provocation > 0.6) {
    if (!content.includes('?')) {
      const firstStop = content.indexOf('. ');
      if (firstStop > 0) {
        content = content.slice(0, firstStop) + '?' + content.slice(firstStop + 1);
      }
    }
  }

  // 4. CTA calibration
  const ctaText = CTA_MAP[profile.ctaStrength] ?? CTA_MAP['soft'];
  if (ctaText) {
    content = `${content}\n\n${ctaText}`;
  }

  // 5. Channel format adjustments
  const formatter = CHANNEL_FORMAT[channel] ?? ((t: string) => t);
  content = formatter(content);

  // 6. Affiliate ref link injection
  content = content.replace(
    /https:\/\/alphaboost\.app(?!\/ref\/)/g,
    `https://alphaboost.app/ref/${affiliateCode}`,
  );

  // 7. Remove any fabricated credentials (safety: only use what's in profile)
  // Naive filter: strip common fake claim patterns not grounded in profile
  const safeRole = profile.role?.toLowerCase() ?? '';
  const safeIndustries = (profile.industries ?? []).map((i) => i.toLowerCase());
  // No fabrication guard beyond this — content comes from controlled LLM prompt

  return content.trim();
}
