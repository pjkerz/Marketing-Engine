export declare function getSeoAudits(input: {
    businessSlug: string;
    limit?: number;
}): Promise<{
    audits: any[];
    total: number | null;
}>;
export declare function getSeoKeywordGaps(input: {
    businessSlug: string;
}): Promise<{
    gaps: any[];
    note: string;
}>;
export declare function getSeoContent(input: {
    businessSlug: string;
    status?: string;
}): Promise<{
    content: any[];
    total: number | null;
}>;
