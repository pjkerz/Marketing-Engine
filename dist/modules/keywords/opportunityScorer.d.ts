export interface KeywordIdea {
    keyword: string;
    monthlyVolume: number;
    cpcEstimate: number;
    competition: 'low' | 'medium' | 'high';
    source: string;
    trend?: string;
}
export declare function scoreKeyword(kw: KeywordIdea): number;
export declare function mergeKeywordIdeas(lists: KeywordIdea[][]): KeywordIdea[];
//# sourceMappingURL=opportunityScorer.d.ts.map