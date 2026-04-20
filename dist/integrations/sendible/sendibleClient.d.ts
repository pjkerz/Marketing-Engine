export interface SendiblePost {
    profileId: string;
    message: string;
    scheduleTime: string;
    mediaUrl?: string;
}
export interface SendibleProfile {
    id: string;
    platform: string;
    name: string;
}
declare class SendibleClient {
    createPost(params: SendiblePost): Promise<{
        id: string;
        status: string;
    }>;
    getProfiles(): Promise<SendibleProfile[]>;
}
export declare const sendibleClient: SendibleClient;
export {};
//# sourceMappingURL=sendibleClient.d.ts.map