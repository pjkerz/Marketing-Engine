export interface MakeContentPayload {
    event: 'content_approved';
    runId: string;
    affiliateCode: string;
    affiliateName: string;
    channel: string;
    content: string;
    refLink: string;
    approvedAt: string;
}
export declare function fireMakeWebhook(payload: MakeContentPayload): Promise<void>;
//# sourceMappingURL=makeWebhook.d.ts.map