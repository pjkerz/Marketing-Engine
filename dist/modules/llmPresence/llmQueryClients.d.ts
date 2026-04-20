export declare function queryChatGPT(query: string): Promise<string>;
export declare function queryClaude(query: string): Promise<string>;
export declare function queryGemini(query: string): Promise<string>;
export declare function queryPerplexity(query: string): Promise<string>;
export type LlmName = 'chatgpt' | 'claude' | 'gemini' | 'perplexity';
export declare function queryAllLlms(query: string): Promise<Record<LlmName, {
    response: string;
    failed: boolean;
    error?: string;
}>>;
//# sourceMappingURL=llmQueryClients.d.ts.map