import { Queue } from 'bullmq';
declare const QUEUE_NAMES: readonly ["v2-resume-parse", "v2-profile-extract", "v2-content-score", "v2-content-dispatch", "v2-media-cleanup", "v2-provider-delete", "v2-email-upload", "v2-dashboard"];
export type QueueName = typeof QUEUE_NAMES[number];
export declare function getQueues(): Record<QueueName, Queue>;
export declare function closeQueues(): Promise<void>;
export {};
//# sourceMappingURL=index.d.ts.map