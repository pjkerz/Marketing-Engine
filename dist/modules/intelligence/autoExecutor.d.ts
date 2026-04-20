interface ExecutionResult {
    channel: string;
    action: string;
    success: boolean;
    draftId?: string;
    error?: string;
}
export declare function executeRecommendation(recommendationId: string, businessId: string): Promise<ExecutionResult[]>;
export {};
//# sourceMappingURL=autoExecutor.d.ts.map