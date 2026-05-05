export declare function getEmailLists(input: {
    businessSlug: string;
}): Promise<{
    lists: any[];
    total: number | null;
}>;
export declare function getCampaigns(input: {
    businessSlug: string;
    status?: string;
}): Promise<{
    campaigns: any[];
    total: number | null;
}>;
export declare function getEmailHealth(input: {
    businessSlug: string;
}): Promise<{
    warmupComplete: any;
    sendingDomain: any;
    fromEmail: any;
    dailySendCap: any;
    sentToday: number;
    avgBounceRatePct: number;
    note: string;
}>;
export declare function getDripSequences(input: {
    businessSlug: string;
}): Promise<{
    sequences: any[];
    total: number | null;
}>;
