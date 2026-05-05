export interface LeadStatusInput {
    businessSlug: string;
    jobId?: string;
}
export interface LeadStatusResult {
    jobs: Array<{
        id: string;
        status: string;
        titles: string[];
        targetCount: number;
        saved: number;
        progress: string;
        createdAt: string;
        error?: string;
    }>;
    totalLeads: number;
    byStatus: Record<string, number>;
    note: string;
}
export declare function getLeadStatus(input: LeadStatusInput): Promise<LeadStatusResult>;
