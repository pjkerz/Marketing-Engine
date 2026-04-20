import { Worker } from 'bullmq';
export interface ResumeParseJobData {
    jobId: string;
    affiliateCode: string;
    affiliateId: string;
    assetId: string;
    tempFilePath: string;
    fileName: string;
    mimeType: string;
}
export declare function startResumeParseWorker(): Worker;
export declare function stopResumeParseWorker(): Promise<void>;
//# sourceMappingURL=resumeParseWorker.d.ts.map