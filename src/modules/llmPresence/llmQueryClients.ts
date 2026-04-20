import { logger } from '../../lib/logger';

const OPENAI_API_KEY = process.env['OPENAI_API_KEY'] ?? '';
const ANTHROPIC_API_KEY = process.env['ANTHROPIC_API_KEY'] ?? '';
const GEMINI_API_KEY = process.env['GEMINI_API_KEY'] ?? process.env['GOOGLE_AI_API_KEY'] ?? '';
const PERPLEXITY_API_KEY = process.env['PERPLEXITY_API_KEY'] ?? '';

export async function queryChatGPT(query: string): Promise<string> {
  if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY not configured');
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      max_tokens: 500,
      messages: [{ role: 'user', content: query }],
    }),
  });
  const d = await res.json() as { choices?: Array<{ message?: { content?: string } }>; error?: { message: string } };
  if (!res.ok) throw new Error(`OpenAI: ${d.error?.message ?? 'API error'}`);
  return d.choices?.[0]?.message?.content ?? '';
}

export async function queryClaude(query: string): Promise<string> {
  if (!ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not configured');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      messages: [{ role: 'user', content: query }],
    }),
  });
  const d = await res.json() as { content?: Array<{ text?: string }>; error?: { message: string } };
  if (!res.ok) throw new Error(`Anthropic: ${d.error?.message ?? 'API error'}`);
  return d.content?.[0]?.text ?? '';
}

export async function queryGemini(query: string): Promise<string> {
  if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not configured');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: query }] }],
      generationConfig: { maxOutputTokens: 500 },
    }),
  });
  const d = await res.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>; error?: { message: string } };
  if (!res.ok) throw new Error(`Gemini: ${d.error?.message ?? 'API error'}`);
  return d.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

export async function queryPerplexity(query: string): Promise<string> {
  if (!PERPLEXITY_API_KEY) throw new Error('PERPLEXITY_API_KEY not configured');
  const res = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${PERPLEXITY_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'llama-3.1-sonar-small-128k-online',
      max_tokens: 500,
      messages: [{ role: 'user', content: query }],
    }),
  });
  const d = await res.json() as { choices?: Array<{ message?: { content?: string } }>; error?: { message: string } };
  if (!res.ok) throw new Error(`Perplexity: ${d.error?.message ?? 'API error'}`);
  return d.choices?.[0]?.message?.content ?? '';
}

export type LlmName = 'chatgpt' | 'claude' | 'gemini' | 'perplexity';

const CLIENTS: Record<LlmName, (q: string) => Promise<string>> = {
  chatgpt: queryChatGPT,
  claude: queryClaude,
  gemini: queryGemini,
  perplexity: queryPerplexity,
};

export async function queryAllLlms(query: string): Promise<Record<LlmName, { response: string; failed: boolean; error?: string }>> {
  const entries = Object.entries(CLIENTS) as Array<[LlmName, (q: string) => Promise<string>]>;

  const results = await Promise.allSettled(
    entries.map(async ([name, fn]) => {
      const response = await fn(query);
      return { name, response };
    }),
  );

  const out = {} as Record<LlmName, { response: string; failed: boolean; error?: string }>;
  for (let i = 0; i < entries.length; i++) {
    const [name] = entries[i]!;
    const result = results[i]!;
    if (result.status === 'fulfilled') {
      out[name] = { response: result.value.response, failed: false };
    } else {
      const err = result.reason instanceof Error ? result.reason.message : 'Unknown error';
      logger.warn({ module: 'llmQueryClients', llm: name, err }, 'LLM query failed');
      out[name] = { response: '', failed: true, error: err };
    }
  }
  return out;
}
