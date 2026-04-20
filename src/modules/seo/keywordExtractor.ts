import type { PageContent } from './crawler';

export interface KeywordScore {
  keyword: string;
  score: number;
  frequency: number;
}

// Extract n-grams (1-4 word phrases) from text
function extractNGrams(text: string, maxN = 4): string[] {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOPWORDS.has(w));

  const ngrams: string[] = [];
  for (let n = 1; n <= maxN; n++) {
    for (let i = 0; i <= words.length - n; i++) {
      ngrams.push(words.slice(i, i + n).join(' '));
    }
  }
  return ngrams;
}

const STOPWORDS = new Set([
  'the', 'and', 'for', 'that', 'this', 'with', 'are', 'was', 'were',
  'has', 'have', 'had', 'will', 'would', 'could', 'should', 'may',
  'can', 'not', 'but', 'from', 'they', 'all', 'our', 'your', 'its',
  'you', 'we', 'he', 'she', 'it', 'is', 'be', 'to', 'of', 'in',
  'on', 'at', 'by', 'an', 'as', 'or', 'so', 'do', 'did', 'get',
  'also', 'more', 'what', 'how', 'when', 'who', 'which', 'about',
  'into', 'than', 'then', 'been', 'just', 'like', 'some', 'use',
  'them', 'their', 'make', 'made', 'many', 'out', 'up', 'if', 'my',
]);

export function extractKeywords(pages: PageContent[]): KeywordScore[] {
  const scores: Map<string, number> = new Map();
  const frequency: Map<string, number> = new Map();

  for (const page of pages) {
    // Title: +10
    const titleNgrams = extractNGrams(page.title, 4);
    for (const kw of titleNgrams) {
      scores.set(kw, (scores.get(kw) ?? 0) + 10);
      frequency.set(kw, (frequency.get(kw) ?? 0) + 1);
    }

    // Meta description: +8
    for (const kw of extractNGrams(page.metaDescription, 4)) {
      scores.set(kw, (scores.get(kw) ?? 0) + 8);
      frequency.set(kw, (frequency.get(kw) ?? 0) + 1);
    }

    // H1: +6
    for (const h of page.h1) {
      for (const kw of extractNGrams(h, 4)) {
        scores.set(kw, (scores.get(kw) ?? 0) + 6);
        frequency.set(kw, (frequency.get(kw) ?? 0) + 1);
      }
    }

    // H2 + H3: +4
    for (const h of [...page.h2, ...page.h3]) {
      for (const kw of extractNGrams(h, 4)) {
        scores.set(kw, (scores.get(kw) ?? 0) + 4);
        frequency.set(kw, (frequency.get(kw) ?? 0) + 1);
      }
    }

    // Body: +1 per mention, max +10
    const bodyNgrams = extractNGrams(page.bodyText, 4);
    const bodyCount: Map<string, number> = new Map();
    for (const kw of bodyNgrams) {
      bodyCount.set(kw, (bodyCount.get(kw) ?? 0) + 1);
    }
    for (const [kw, count] of bodyCount) {
      scores.set(kw, (scores.get(kw) ?? 0) + Math.min(count, 10));
      frequency.set(kw, (frequency.get(kw) ?? 0) + count);
    }

    // Image alts: +2
    for (const alt of page.imageAlts) {
      for (const kw of extractNGrams(alt, 3)) {
        scores.set(kw, (scores.get(kw) ?? 0) + 2);
      }
    }
  }

  // Filter to meaningful phrases (score > 5, 2+ words preferred)
  const results: KeywordScore[] = [];
  for (const [keyword, score] of scores) {
    if (score < 5) continue;
    const words = keyword.split(' ');
    // Prefer 2-4 word phrases over single words (single words need higher score)
    if (words.length === 1 && score < 15) continue;
    results.push({ keyword, score, frequency: frequency.get(keyword) ?? 1 });
  }

  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, 100);
}
