export interface ParseResult {
    text: string;
    pageCount?: number;
    mimeType: string;
}
export declare function validateResumeFile(file: Express.Multer.File): void;
export declare function parseResume(filePath: string, mimeType: string): Promise<ParseResult>;
//# sourceMappingURL=resumeParser.d.ts.map