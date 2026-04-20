const GROQ_API_KEY = process.env['GROQ_API_KEY'] ?? '';

export interface MentionedCompetitor {
  name: string;
  context: string;
  sentiment: 'positive' | 'neutral' | 'negative';
}

export interface AnalysisResult {
  mentionsBrand: boolean;
  brandContext: string | null;
  mentionsCompetitors: MentionedCompetitor[];
  authorityLanguage: string;
}

function extractSentenceContext(text: string, term: string): string | null {
  const lower = text.toLowerCase();
  const idx = lower.indexOf(term.toLowerCase());
  if (idx === -1) return null;
  // Find sentence boundaries around the match
  const start = Math.max(0, text.lastIndexOf('.', idx - 1) + 1);
  const end = text.indexOf('.', idx + term.length);
  const sentence = text.slice(start, end === -1 ? text.length : end + 1).trim();
  return sentence.slice(0, 300); // cap at 300 chars
}

function guessSentiment(context: string): 'positive' | 'neutral' | 'negative' {
  const pos = /recommend|great|best|excellent|top|leading|popular|trusted|effective/.test(context.toLowerCase());
  const neg = /avoid|poor|bad|worse|problems|issues|not recommend|don't use/.test(context.toLowerCase());
  if (pos && !neg) return 'positive';
  if (neg) return 'negative';
  return 'neutral';
}

async function extractAuthorityLanguage(response: string): Promise<string> {
  if (!GROQ_API_KEY || !response) return '';
  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_API_KEY}` },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        max_tokens: 150,
        messages: [
          { role: 'system', content: 'Extract key descriptive phrases. Return a single sentence of comma-separated phrases only, no explanation.' },
          { role: 'user', content: `What authority phrases describe this topic space in this response? Response: "${response.slice(0, 800)}"` },
        ],
      }),
    });
    const d = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
    return d.choices?.[0]?.message?.content?.trim() ?? '';
  } catch {
    return '';
  }
}

export async function analyseResponse(
  response: string,
  brandName: string,
  competitors: string[],
): Promise<AnalysisResult> {
  const mentionsBrand = response.toLowerCase().includes(brandName.toLowerCase());
  const brandContext = mentionsBrand ? extractSentenceContext(response, brandName) : null;

  const mentionsCompetitors: MentionedCompetitor[] = [];
  for (const comp of competitors) {
    if (response.toLowerCase().includes(comp.toLowerCase())) {
      const context = extractSentenceContext(response, comp) ?? '';
      mentionsCompetitors.push({
        name: comp,
        context,
        sentiment: guessSentiment(context),
      });
    }
  }

  const authorityLanguage = await extractAuthorityLanguage(response);

  return { mentionsBrand, brandContext, mentionsCompetitors, authorityLanguage };
}
