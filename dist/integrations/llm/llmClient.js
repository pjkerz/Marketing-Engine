"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.llmClient = exports.LLMExtractionError = void 0;
const https_1 = __importDefault(require("https"));
const env_1 = require("../../config/env");
const logger_1 = require("../../lib/logger");
class LLMExtractionError extends Error {
    code;
    rawResponse;
    constructor(message, code, rawResponse) {
        super(message);
        this.code = code;
        this.rawResponse = rawResponse;
        this.name = 'LLMExtractionError';
    }
}
exports.LLMExtractionError = LLMExtractionError;
class GroqClient {
    async complete(params) {
        const start = Date.now();
        const body = JSON.stringify({
            model: params.model,
            messages: [
                { role: 'system', content: params.systemPrompt },
                { role: 'user', content: params.userPrompt },
            ],
            max_tokens: params.maxTokens,
            ...(params.responseFormat === 'json' ? { response_format: { type: 'json_object' } } : {}),
        });
        const result = await new Promise((resolve, reject) => {
            const req = https_1.default.request({
                hostname: 'api.groq.com',
                path: '/openai/v1/chat/completions',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${env_1.env.GROQ_API_KEY}`,
                    'X-Request-Id': params.requestId,
                },
            }, (res) => {
                let data = '';
                res.on('data', (chunk) => { data += chunk.toString(); });
                res.on('end', () => {
                    if (res.statusCode && res.statusCode >= 400) {
                        reject(new Error(`Groq API error ${res.statusCode}: ${data}`));
                        return;
                    }
                    try {
                        const parsed = JSON.parse(data);
                        resolve(parsed.choices[0].message.content);
                    }
                    catch {
                        reject(new Error('Failed to parse Groq response'));
                    }
                });
            });
            req.on('error', reject);
            req.write(body);
            req.end();
        });
        const latency = Date.now() - start;
        logger_1.logger.info({
            module: 'llmClient',
            action: 'complete',
            requestId: params.requestId,
            provider: 'groq',
            model: params.model,
            latencyMs: latency,
        }, 'LLM completion done');
        return result;
    }
    async completeValidated(params) {
        const raw = await this.complete({
            ...params,
            responseFormat: 'json',
        });
        let parsed;
        try {
            parsed = JSON.parse(raw);
        }
        catch {
            // Attempt repair
            const repaired = await this.complete({
                model: params.model,
                systemPrompt: 'Return only valid JSON. No commentary. No markdown.',
                userPrompt: `Return only valid JSON matching this schema. Fix this malformed output:\n${raw}`,
                maxTokens: params.maxTokens,
                responseFormat: 'json',
                requestId: `${params.requestId}_repair`,
            });
            try {
                parsed = JSON.parse(repaired);
            }
            catch {
                throw new LLMExtractionError('LLM returned invalid JSON after repair attempt', 'REPAIR_FAILED', raw);
            }
        }
        const result = params.schema.safeParse(parsed);
        if (!result.success) {
            // Attempt repair with schema hint
            const schemaShape = params.schema.shape;
            const schemaKeys = schemaShape ? Object.keys(schemaShape).join(', ') : 'unknown fields';
            const repaired = await this.complete({
                model: params.model,
                systemPrompt: 'Return only valid JSON. No commentary. No markdown.',
                userPrompt: `Return valid JSON with these fields: ${schemaKeys}. Fix this:\n${JSON.stringify(parsed)}`,
                maxTokens: params.maxTokens,
                responseFormat: 'json',
                requestId: `${params.requestId}_schema_repair`,
            });
            let repairedParsed;
            try {
                repairedParsed = JSON.parse(repaired);
            }
            catch {
                throw new LLMExtractionError('Schema repair returned invalid JSON', 'REPAIR_FAILED', raw);
            }
            const repairedResult = params.schema.safeParse(repairedParsed);
            if (!repairedResult.success) {
                throw new LLMExtractionError('LLM output did not match expected schema after repair', 'SCHEMA_INVALID', raw);
            }
            return repairedResult.data;
        }
        return result.data;
    }
}
exports.llmClient = new GroqClient();
//# sourceMappingURL=llmClient.js.map