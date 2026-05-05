export declare function getDashboardSnapshot(input: {
    businessSlug: string;
    days?: number;
}): Promise<{
    period: string;
    funnel: Record<string, {
        count: number;
        change: number;
    }>;
    overallCvr: number;
    topAffiliates: any[];
    recentCampaigns: any[];
    totalOpenToWorkLeads: number;
}>;
export declare function getFunnelBreakdown(input: {
    businessSlug: string;
    days?: number;
}): Promise<{
    breakdown: any[];
    period: string;
}>;
