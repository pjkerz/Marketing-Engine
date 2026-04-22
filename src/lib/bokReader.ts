import * as fs from 'fs';
import * as path from 'path';

const BOK_BASE = path.join(process.cwd(), 'bok');

/**
 * Read relevant BOK (Body of Knowledge) chunks for a given business and topic.
 * Returns up to ~3000 chars of relevant podcast-derived knowledge.
 */
export function readBokChunks(businessSlug: string, topic: string, maxChars = 3000): string {
  const bokDir = path.join(BOK_BASE, businessSlug);
  if (!fs.existsSync(bokDir)) return '';

  const keywords = topic.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  const chunks: Array<{ text: string; score: number }> = [];

  try {
    for (const file of fs.readdirSync(bokDir)) {
      if (!file.endsWith('.md') && !file.endsWith('.txt')) continue;
      const raw = fs.readFileSync(path.join(bokDir, file), 'utf-8');

      // Split into ~500-char paragraphs
      const paragraphs = raw.split(/\n{2,}/);
      for (const para of paragraphs) {
        if (para.length < 80) continue;
        const lower = para.toLowerCase();
        const score = keywords.reduce((acc, kw) => acc + (lower.includes(kw) ? 1 : 0), 0);
        if (score > 0) {
          chunks.push({ text: para.trim(), score });
        }
      }
    }
  } catch { /* ignore */ }

  if (!chunks.length) {
    // Fallback: grab first few paragraphs as general context
    try {
      const files = fs.readdirSync(bokDir).filter(f => f.endsWith('.md') || f.endsWith('.txt'));
      if (files.length) {
        const raw = fs.readFileSync(path.join(bokDir, files[0]!), 'utf-8');
        return raw.slice(0, maxChars);
      }
    } catch { /* ignore */ }
    return '';
  }

  // Sort by relevance, pick best chunks up to maxChars
  chunks.sort((a, b) => b.score - a.score);
  let result = '';
  for (const c of chunks) {
    if (result.length + c.text.length > maxChars) break;
    result += c.text + '\n\n';
  }
  return result.trim();
}
