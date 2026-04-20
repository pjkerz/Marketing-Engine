import { logger } from '../../lib/logger';

export interface PageContent {
  url: string;
  title: string;
  metaDescription: string;
  h1: string[];
  h2: string[];
  h3: string[];
  bodyText: string;
  links: string[];
  imageAlts: string[];
}

export interface CrawlResult {
  rootUrl: string;
  pages: PageContent[];
  crawledAt: Date;
}

function parseDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

function normaliseUrl(base: string, href: string): string | null {
  try {
    const u = new URL(href, base);
    u.hash = '';
    u.search = '';
    if (!['http:', 'https:'].includes(u.protocol)) return null;
    return u.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

function extractText(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 5000); // cap to keep memory sane
}

function extractTagContent(html: string, tag: string): string[] {
  const regex = new RegExp(`<${tag}[^>]*>([^<]*)<\/${tag}>`, 'gi');
  const results: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = regex.exec(html)) !== null) {
    const text = m[1]?.trim();
    if (text) results.push(text);
  }
  return results;
}

function extractMeta(html: string, name: string): string {
  const m = html.match(new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]+content=["']([^"']+)["']`, 'i'))
    || html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']${name}["']`, 'i'));
  return m?.[1]?.trim() ?? '';
}

function extractLinks(html: string, baseUrl: string, domain: string): string[] {
  const links: string[] = [];
  const regex = /href=["']([^"'#?]+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(html)) !== null) {
    const normalised = normaliseUrl(baseUrl, m[1]!);
    if (normalised && parseDomain(normalised) === domain) {
      links.push(normalised);
    }
  }
  return [...new Set(links)];
}

function extractImageAlts(html: string): string[] {
  const alts: string[] = [];
  const regex = /<img[^>]+alt=["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(html)) !== null) {
    if (m[1]?.trim()) alts.push(m[1].trim());
  }
  return alts;
}

async function fetchPage(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'AlphaNoetics-SEO-Crawler/1.0 (compatible; research bot)',
        'Accept': 'text/html,application/xhtml+xml',
      },
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('text/html')) return null;
    return res.text();
  } catch {
    return null;
  }
}

async function checkRobotsTxt(rootUrl: string): Promise<Set<string>> {
  const disallowed = new Set<string>();
  try {
    const robotsUrl = new URL('/robots.txt', rootUrl).toString();
    const html = await fetchPage(robotsUrl);
    if (!html) return disallowed;
    let inOurAgent = false;
    for (const line of html.split('\n')) {
      const l = line.trim().toLowerCase();
      if (l.startsWith('user-agent:')) {
        inOurAgent = l.includes('*') || l.includes('alphanoe');
      }
      if (inOurAgent && l.startsWith('disallow:')) {
        const path = line.split(':')[1]?.trim();
        if (path) disallowed.add(path);
      }
    }
  } catch { /* ignore */ }
  return disallowed;
}

function isDisallowed(url: string, disallowed: Set<string>): boolean {
  try {
    const path = new URL(url).pathname;
    for (const d of disallowed) {
      if (d && path.startsWith(d)) return true;
    }
  } catch { /* ignore */ }
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

export async function crawlUrl(rootUrl: string, maxPages = 20): Promise<PageContent[]> {
  const domain = parseDomain(rootUrl);
  if (!domain) return [];

  const disallowed = await checkRobotsTxt(rootUrl);

  const visited = new Set<string>();
  const queue: Array<{ url: string; depth: number }> = [{ url: rootUrl.replace(/\/$/, ''), depth: 0 }];
  const pages: PageContent[] = [];

  while (queue.length > 0 && pages.length < maxPages) {
    const item = queue.shift()!;
    const { url, depth } = item;
    if (visited.has(url) || isDisallowed(url, disallowed)) continue;
    visited.add(url);

    logger.info({ module: 'crawler', url, depth }, 'Crawling page');
    const html = await fetchPage(url);
    if (!html) continue;

    const title = extractTagContent(html, 'title')[0] ?? '';
    const metaDescription = extractMeta(html, 'description');
    const h1 = extractTagContent(html, 'h1');
    const h2 = extractTagContent(html, 'h2');
    const h3 = extractTagContent(html, 'h3');
    const bodyText = extractText(html);
    const imageAlts = extractImageAlts(html);
    const links = depth < 2 ? extractLinks(html, url, domain) : [];

    pages.push({ url, title, metaDescription, h1, h2, h3, bodyText, links, imageAlts });

    // Enqueue new internal links (depth 0 and 1 only)
    if (depth < 2) {
      for (const link of links) {
        if (!visited.has(link) && !isDisallowed(link, disallowed)) {
          queue.push({ url: link, depth: depth + 1 });
        }
      }
    }

    await sleep(1000); // 1 request/second
  }

  return pages;
}
