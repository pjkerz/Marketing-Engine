export declare function getAffiliates(input: {
    businessSlug: string;
    activeOnly?: boolean;
}): Promise<{
    affiliates: any[];
    total: number | null;
    note: string;
}>;
export declare function getAffiliateLeaderboard(input: {
    businessSlug: string;
    days?: number;
}): Promise<{
    leaderboard: any[];
    period: string;
    note: string;
}>;
export declare function getCommissions(input: {
    businessSlug: string;
    status?: string;
}): Promise<{
    commissions: any[];
    total: number | null;
}>;
