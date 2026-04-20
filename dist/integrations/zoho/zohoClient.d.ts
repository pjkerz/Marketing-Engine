export interface ZohoUploadResult {
    fileId: string;
    fileName: string;
    folderId: string;
}
export interface ZohoBrowseItem {
    id: string;
    name: string;
    mimeType: string;
    size: number;
    createdTime: string;
}
export interface ZohoBrowseResult {
    items: ZohoBrowseItem[];
    hasMore: boolean;
}
declare class ZohoClient {
    private accessToken;
    private tokenExpiresAt;
    private client;
    constructor();
    refreshTokenIfNeeded(): Promise<void>;
    private refreshToken;
    private authHeader;
    resolveOrCreateAffiliateFolder(affiliateCode: string): Promise<string>;
    uploadResumeToZoho(params: {
        affiliateCode: string;
        filePath: string;
        fileName: string;
        mimeType: string;
    }): Promise<ZohoUploadResult>;
    uploadGeneratedImageToZoho(params: {
        affiliateCode: string;
        base64Data: string;
        mimeType: string;
        fileName: string;
    }): Promise<ZohoUploadResult>;
    browseAffiliateMediaFolder(params: {
        affiliateCode: string;
        page?: number;
        limit?: number;
    }): Promise<ZohoBrowseResult>;
    browseSharedMediaLibrary(params: {
        page?: number;
        limit?: number;
    }): Promise<ZohoBrowseResult>;
    deleteFile(providerFileId: string): Promise<void>;
    flushFolderCache(affiliateCode: string): Promise<void>;
}
export declare const zohoClient: ZohoClient;
export {};
//# sourceMappingURL=zohoClient.d.ts.map