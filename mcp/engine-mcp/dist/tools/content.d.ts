export declare function getContentRuns(input: {
    businessSlug: string;
    status?: string;
}): Promise<{
    runs: any[];
    total: number | null;
}>;
export declare function getPendingContent(input: {
    businessSlug: string;
}): Promise<{
    pendingApproval: any[];
    total: number | null;
    note: string;
}>;
export declare function getContentPerformance(input: {
    businessSlug: string;
    days?: number;
}): Promise<{
    performance: any[];
    period: string;
}>;
