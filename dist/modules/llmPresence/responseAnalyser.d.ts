export interface MentionedCompetitor {
    name: string;
    context: string;
    sentiment: 'positive' | 'neutral' | 'negative';
}
export interface AnalysisResult {
    mentionsBrand: boolean;
    brandContext: string | null;
    mentionsCompetitors: MentionedCompetitor[];
    authorityLanguage: string;
}
export declare function analyseResponse(response: string, brandName: string, competitors: string[]): Promise<AnalysisResult>;
//# sourceMappingURL=responseAnalyser.d.ts.map