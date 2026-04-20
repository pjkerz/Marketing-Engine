import https from 'https';
import { z, ZodSchema } from 'zod';
import { env } from '../../config/env';
import { logger } from '../../lib/logger';

export class LLMExtractionError extends Error {
  constructor(
    message: string,
    public readonly code: 'INVALID_JSON' | 'SCHEMA_INVALID' | 'REPAIR_FAILED',
    public readonly rawResponse?: string,
  ) {
    super(message);
    this.name = 'LLMExtractionError';
  }
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

class GroqClient implements LLMClientWithValidation {
  async complete(params: {
    model: string;
    systemPrompt: string;
    userPrompt: string;
    maxTokens: number;
    responseFormat: 'json' | 'text';
    requestId: string;
  }): Promise<string> {
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

    const result = await new Promise<string>((resolve, reject) => {
      const req = https.request({
        hostname: 'api.groq.com',
        path: '/openai/v1/chat/completions',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.GROQ_API_KEY}`,
          'X-Request-Id': params.requestId,
        },
      }, (res) => {
        let data = '';
        res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`Groq API error ${res.statusCode}: ${data}`));
            return;
          }
          try {
            const parsed = JSON.parse(data) as { choices: Array<{ message: { content: string } }>; usage: { prompt_tokens: number; completion_tokens: number } };
            resolve(parsed.choices[0].message.content);
          } catch {
            reject(new Error('Failed to parse Groq response'));
          }
        });
      });
      req.on('error', reject);
      req.write(body);
      req.end();
    });

    const latency = Date.now() - start;
    logger.info({
      module: 'llmClient',
      action: 'complete',
      requestId: params.requestId,
      provider: 'groq',
      model: params.model,
      latencyMs: latency,
    }, 'LLM completion done');

    return result;
  }

  async completeValidated<T>(params: {
    model: string;
    systemPrompt: string;
    userPrompt: string;
    maxTokens: number;
    schema: ZodSchema<T>;
    requestId: string;
  }): Promise<T> {
    const raw = await this.complete({
      ...params,
      responseFormat: 'json',
    });

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
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
      } catch {
        throw new LLMExtractionError('LLM returned invalid JSON after repair attempt', 'REPAIR_FAILED', raw);
      }
    }

    const result = params.schema.safeParse(parsed);
    if (!result.success) {
      // Attempt repair with schema hint
      const schemaShape = (params.schema as unknown as z.ZodObject<z.ZodRawShape>).shape;
      const schemaKeys = schemaShape ? Object.keys(schemaShape).join(', ') : 'unknown fields';
      const repaired = await this.complete({
        model: params.model,
        systemPrompt: 'Return only valid JSON. No commentary. No markdown.',
        userPrompt: `Return valid JSON with these fields: ${schemaKeys}. Fix this:\n${JSON.stringify(parsed)}`,
        maxTokens: params.maxTokens,
        responseFormat: 'json',
        requestId: `${params.requestId}_schema_repair`,
      });
      let repairedParsed: unknown;
      try {
        repairedParsed = JSON.parse(repaired);
      } catch {
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

export const llmClient: LLMClientWithValidation = new GroqClient();
