import type { PageContent } from './crawler';
export interface KeywordScore {
    keyword: string;
    score: number;
    frequency: number;
}
export declare function extractKeywords(pages: PageContent[]): KeywordScore[];
//# sourceMappingURL=keywordExtractor.d.ts.map