"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.scoreKeyword = scoreKeyword;
exports.mergeKeywordIdeas = mergeKeywordIdeas;
function getIntentScore(keyword) {
    const kw = keyword.toLowerCase();
    if (/\b(buy|purchase|price|cost|hire|pricing|plans)\b/.test(kw))
        return 0.9;
    if (/\b(best|top|review|compare|vs|versus|alternative)\b/.test(kw))
        return 0.7;
    if (/\b(how to|what is|what are|guide|tutorial|tips)\b/.test(kw))
        return 0.4;
    return 0.5;
}
const COMPETITION_SCORE = { low: 1, medium: 2, high: 3 };
function scoreKeyword(kw) {
    if (!kw.monthlyVolume || !kw.cpcEstimate || kw.cpcEstimate === 0)
        return 0;
    const intentScore = getIntentScore(kw.keyword);
    const competitionScore = COMPETITION_SCORE[kw.competition] ?? 2;
    const raw = (kw.monthlyVolume * intentScore) / (kw.cpcEstimate * competitionScore);
    // Normalise to 0-100 scale (log scale to handle large volumes)
    return Math.min(100, Math.round(Math.log10(raw + 1) * 25));
}
function mergeKeywordIdeas(lists) {
    const merged = new Map();
    for (const list of lists) {
        for (const kw of list) {
            const key = kw.keyword.toLowerCase().trim();
            const existing = merged.get(key);
            if (!existing) {
                merged.set(key, { ...kw });
            }
            else {
                // Average volumes, take min CPC (most conservative cost estimate)
                existing.monthlyVolume = Math.round((existing.monthlyVolume + kw.monthlyVolume) / 2);
                existing.cpcEstimate = Math.min(existing.cpcEstimate, kw.cpcEstimate);
                existing.source = existing.source === kw.source ? existing.source : 'google+microsoft';
            }
        }
    }
    return [...merged.values()];
}
//# sourceMappingURL=opportunityScorer.js.map