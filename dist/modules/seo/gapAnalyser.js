"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyseGap = analyseGap;
// Simple fuzzy match: check if two keywords share 70%+ of words
function isSimilar(a, b) {
    if (a === b)
        return true;
    const wordsA = new Set(a.split(' '));
    const wordsB = new Set(b.split(' '));
    const intersection = [...wordsA].filter(w => wordsB.has(w)).length;
    const union = new Set([...wordsA, ...wordsB]).size;
    return intersection / union >= 0.7;
}
function findClientScore(keyword, clientKws) {
    const exact = clientKws.find(k => k.keyword === keyword);
    if (exact)
        return exact.score;
    const fuzzy = clientKws.find(k => isSimilar(k.keyword, keyword));
    return fuzzy ? fuzzy.score * 0.8 : 0; // penalise fuzzy match slightly
}
function analyseGap(clientKws, competitorKws) {
    const gaps = [];
    for (const compKw of competitorKws) {
        const clientScore = findClientScore(compKw.keyword, clientKws);
        const gap = compKw.score - clientScore;
        if (gap <= 5)
            continue;
        const priority = gap > 30 ? 'high' : gap > 15 ? 'medium' : 'low';
        gaps.push({
            keyword: compKw.keyword,
            competitorScore: Math.round(compKw.score),
            clientScore: Math.round(clientScore),
            gap: Math.round(gap),
            priority,
        });
    }
    return gaps
        .sort((a, b) => b.gap - a.gap)
        .slice(0, 50);
}
//# sourceMappingURL=gapAnalyser.js.map