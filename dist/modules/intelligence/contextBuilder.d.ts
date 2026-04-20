export interface IntelligenceContext {
    businessId: string;
    businessName: string;
    businessType: string;
    funnelCvr: number;
    topChannel: string;
    weakestFunnelStage: string;
    pendingApprovals: number;
    bestPerformingFormat: string;
    emailListSize: number;
    lastCampaignOpenRate: number;
    topKeywordGaps: string[];
    topOpportunityKeywords: string[];
    brandMentionRate: number;
    topLlmGapQueries: string[];
    pendingHighInsights: number;
    pendingInsightSummaries: string[];
}
export declare function buildBusinessContext(businessId: string): Promise<IntelligenceContext>;
//# sourceMappingURL=contextBuilder.d.ts.map