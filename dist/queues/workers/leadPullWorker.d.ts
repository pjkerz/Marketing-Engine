import { Queue } from 'bullmq';
export declare let leadPullQueue: Queue | null;
export interface LeadPullJobData {
    jobId: string;
    businessId: string;
    titles: string[];
    targetCount: number;
    apiKey: string;
}
export declare function startLeadPullWorker(): void;
export declare function stopLeadPullWorker(): Promise<void>;
export declare function enqueueLeadPull(data: Omit<LeadPullJobData, 'apiKey'>): Promise<void>;
//# sourceMappingURL=leadPullWorker.d.ts.map