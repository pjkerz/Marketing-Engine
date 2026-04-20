import { ZodSchema } from 'zod';
export declare class LLMExtractionError extends Error {
    readonly code: 'INVALID_JSON' | 'SCHEMA_INVALID' | 'REPAIR_FAILED';
    readonly rawResponse?: string | undefined;
    constructor(message: string, code: 'INVALID_JSON' | 'SCHEMA_INVALID' | 'REPAIR_FAILED', rawResponse?: string | undefined);
}
export interface LLMClient {
    complete(params: {
        model: string;
        systemPrompt: string;
        userPrompt: string;
        maxTokens: number;
        responseFormat: 'json' | 'text';
        requestId: string;
    }): Promise<string>;
}
export interface LLMClientWithValidation extends LLMClient {
    completeValidated<T>(params: {
        model: string;
        systemPrompt: string;
        userPrompt: string;
        maxTokens: number;
        schema: ZodSchema<T>;
        requestId: string;
    }): Promise<T>;
}
export declare const llmClient: LLMClientWithValidation;
//# sourceMappingURL=llmClient.d.ts.map