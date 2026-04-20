export interface SpamScore {
    score: number;
    issues: string[];
    safe: boolean;
}
export interface Batch {
    subscriberIds: string[];
    sendAfter: Date;
}
export declare function scoreContent(html: string, subject: string): SpamScore;
export declare function getThrottledBatches(subscriberIds: string[], businessId: string): Promise<Batch[]>;
export declare function getDailyLimit(businessId: string): Promise<number>;
export declare function getSuppressedSubscribers(listId: string): Promise<string[]>;
export declare function orderByEngagement(subscriberIds: string[]): Promise<string[]>;
export declare function generateUnsubToken(subscriberId: string, secret: string): string;
export declare function verifyUnsubToken(subscriberId: string, token: string, secret: string): boolean;
//# sourceMappingURL=spamEngine.d.ts.map