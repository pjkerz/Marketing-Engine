interface ResendSendParams {
    from: string;
    to: string[];
    subject: string;
    html: string;
    text?: string;
    replyTo?: string;
    headers?: Record<string, string>;
}
interface ResendSendResult {
    id: string;
    error?: string;
}
export declare function sendEmail(params: ResendSendParams): Promise<ResendSendResult>;
export {};
//# sourceMappingURL=resendClient.d.ts.map