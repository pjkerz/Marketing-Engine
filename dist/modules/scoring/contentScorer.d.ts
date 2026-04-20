export interface ScoreBreakdown {
    total: number;
    breakdown: Record<string, number>;
}
export interface ContentScoreResult {
    quality: ScoreBreakdown;
    risk: ScoreBreakdown;
    conversion: ScoreBreakdown;
}
export declare function scoreContent(params: {
    content: string;
    channel: string;
}): Promise<ContentScoreResult>;
//# sourceMappingURL=contentScorer.d.ts.map