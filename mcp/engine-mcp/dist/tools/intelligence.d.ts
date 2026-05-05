export declare function getRecommendations(input: {
    businessSlug: string;
    status?: string;
}): Promise<{
    recommendations: any[];
    total: number | null;
    note: string;
}>;
export declare function getIntelligenceFeed(input: {
    businessSlug: string;
    unreadOnly?: boolean;
}): Promise<{
    feed: any[];
    total: number | null;
}>;
export declare function getSystemHealth(input: {
    businessSlug: string;
}): Promise<{
    workerErrorsLastHour: number;
    pendingJobs: {
        count: string;
        status: string;
    }[];
    conversionsLast24h: number;
    status: string;
}>;
