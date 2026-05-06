"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getOptimisationRules = getOptimisationRules;
exports.weightedRandom = weightedRandom;
exports.applyOptimisationToGeneration = applyOptimisationToGeneration;
exports.personalize = personalize;
const prisma_1 = require("../../lib/prisma");
async function getOptimisationRules(businessId) {
    const prisma = (0, prisma_1.getPrisma)();
    return prisma.optimisationRule.findMany({ where: { businessId, active: true } });
}
function weightedRandom(weights) {
    const entries = Object.entries(weights);
    const total = entries.reduce((s, [, w]) => s + w, 0);
    let rand = Math.random() * total;
    for (const [key, weight] of entries) {
        rand -= weight;
        if (rand <= 0)
            return key;
    }
    return entries[0]?.[0] ?? '';
}
async function applyOptimisationToGeneration(businessId, opts) {
    try {
        const rules = await getOptimisationRules(businessId);
        const result = {};
        const formatRule = rules.find(r => r.ruleType === 'content_format');
        if (formatRule) {
            const config = formatRule.config;
            if (config.weights)
                result.preferredFormat = weightedRandom(config.weights);
        }
        const timeRule = rules.find(r => r.ruleType === 'posting_time');
        if (timeRule) {
            const config = timeRule.config;
            const times = config[opts.channel];
            if (times?.length)
                result.preferredTime = times[0];
        }
        return result;
    }
    catch {
        return {};
    }
}
const CHANNEL_FORMAT = {
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
function buildCtaMap(landingUrl) {
    const domain = (() => { try {
        return new URL(landingUrl).hostname;
    }
    catch {
        return landingUrl;
    } })();
    return {
        invisible: '',
        soft: 'Worth exploring if this resonates.',
        direct: `Check it out at ${domain}`,
        strong: `👉 Start now at ${domain} — free to join.`,
    };
}
function personalize(input) {
    const { baseContent, channel, affiliateCode, profile, tenantLandingUrl } = input;
    let content = baseContent;
    // 1. Pain-point hook injection
    if (profile.painPoint && profile.seniority && profile.role) {
        const hook = `Most ${profile.seniority} ${profile.role} professionals are struggling with ${profile.painPoint}. `;
        content = hook + content;
    }
    // 2. Authority signal framing
    if (profile.authoritySignal) {
        const signal = `\n\nFrom what I've seen in ${profile.authoritySignal}: `;
        const lastDot = content.lastIndexOf('. ');
        if (lastDot > 0) {
            content = content.slice(0, lastDot + 2) + signal + content.slice(lastDot + 2);
        }
    }
    // 3. Tone calibration
    if (profile.directness > 0.7) {
        content = content.replace(/\bmight\b/g, 'will').replace(/\bcould\b/g, 'can');
    }
    if (profile.provocation > 0.6) {
        if (!content.includes('?')) {
            const firstStop = content.indexOf('. ');
            if (firstStop > 0) {
                content = content.slice(0, firstStop) + '?' + content.slice(firstStop + 1);
            }
        }
    }
    // 4. CTA calibration
    const ctaMap = buildCtaMap(tenantLandingUrl);
    const ctaText = ctaMap[profile.ctaStrength] ?? ctaMap['soft'];
    if (ctaText) {
        content = `${content}\n\n${ctaText}`;
    }
    // 5. Channel format adjustments
    const formatter = CHANNEL_FORMAT[channel] ?? ((t) => t);
    content = formatter(content);
    // 6. Affiliate ref link injection — replace bare landing URL with ref link
    const escapedUrl = tenantLandingUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    content = content.replace(new RegExp(`${escapedUrl}(?!\\/ref\\/)`, 'g'), `${tenantLandingUrl}/ref/${affiliateCode}`);
    return content.trim();
}
//# sourceMappingURL=personalizationEngine.js.map