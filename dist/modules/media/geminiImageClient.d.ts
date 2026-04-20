export interface ImageCandidate {
    candidateId: string;
    base64Data: string;
    mimeType: string;
}
export declare function generateImageCandidates(params: {
    prompt: string;
    aspectRatio: '9:16' | '1:1' | '16:9';
    numberOfImages: number;
    requestId: string;
}): Promise<ImageCandidate[]>;
//# sourceMappingURL=geminiImageClient.d.ts.map