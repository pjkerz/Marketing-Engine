import type { KeywordScore } from './keywordExtractor';
export interface GapKeyword {
    keyword: string;
    competitorScore: number;
    clientScore: number;
    gap: number;
    priority: 'high' | 'medium' | 'low';
}
export declare function analyseGap(clientKws: KeywordScore[], competitorKws: KeywordScore[]): GapKeyword[];
//# sourceMappingURL=gapAnalyser.d.ts.map