export declare function getLlmAudits(input: {
    businessSlug: string;
    limit?: number;
}): Promise<{
    audits: any[];
    summary: any[];
    note: string;
}>;
export declare function getKeywordIntelligence(input: {
    businessSlug: string;
}): Promise<{
    keywords: any[];
    total: number | null;
}>;
