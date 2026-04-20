"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.crawlUrl = crawlUrl;
const logger_1 = require("../../lib/logger");
function parseDomain(url) {
    try {
        return new URL(url).hostname;
    }
    catch {
        return '';
    }
}
function normaliseUrl(base, href) {
    try {
        const u = new URL(href, base);
        u.hash = '';
        u.search = '';
        if (!['http:', 'https:'].includes(u.protocol))
            return null;
        return u.toString().replace(/\/$/, '');
    }
    catch {
        return null;
    }
}
function extractText(html) {
    return html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 5000); // cap to keep memory sane
}
function extractTagContent(html, tag) {
    const regex = new RegExp(`<${tag}[^>]*>([^<]*)<\/${tag}>`, 'gi');
    const results = [];
    let m;
    while ((m = regex.exec(html)) !== null) {
        const text = m[1]?.trim();
        if (text)
            results.push(text);
    }
    return results;
}
function extractMeta(html, name) {
    const m = html.match(new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]+content=["']([^"']+)["']`, 'i'))
        || html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']${name}["']`, 'i'));
    return m?.[1]?.trim() ?? '';
}
function extractLinks(html, baseUrl, domain) {
    const links = [];
    const regex = /href=["']([^"'#?]+)["']/gi;
    let m;
    while ((m = regex.exec(html)) !== null) {
        const normalised = normaliseUrl(baseUrl, m[1]);
        if (normalised && parseDomain(normalised) === domain) {
            links.push(normalised);
        }
    }
    return [...new Set(links)];
}
function extractImageAlts(html) {
    const alts = [];
    const regex = /<img[^>]+alt=["']([^"']+)["']/gi;
    let m;
    while ((m = regex.exec(html)) !== null) {
        if (m[1]?.trim())
            alts.push(m[1].trim());
    }
    return alts;
}
async function fetchPage(url) {
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
        if (!res.ok)
            return null;
        const ct = res.headers.get('content-type') || '';
        if (!ct.includes('text/html'))
            return null;
        return res.text();
    }
    catch {
        return null;
    }
}
async function checkRobotsTxt(rootUrl) {
    const disallowed = new Set();
    try {
        const robotsUrl = new URL('/robots.txt', rootUrl).toString();
        const html = await fetchPage(robotsUrl);
        if (!html)
            return disallowed;
        let inOurAgent = false;
        for (const line of html.split('\n')) {
            const l = line.trim().toLowerCase();
            if (l.startsWith('user-agent:')) {
                inOurAgent = l.includes('*') || l.includes('alphanoe');
            }
            if (inOurAgent && l.startsWith('disallow:')) {
                const path = line.split(':')[1]?.trim();
                if (path)
                    disallowed.add(path);
            }
        }
    }
    catch { /* ignore */ }
    return disallowed;
}
function isDisallowed(url, disallowed) {
    try {
        const path = new URL(url).pathname;
        for (const d of disallowed) {
            if (d && path.startsWith(d))
                return true;
        }
    }
    catch { /* ignore */ }
    return false;
}
function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}
async function crawlUrl(rootUrl, maxPages = 20) {
    const domain = parseDomain(rootUrl);
    if (!domain)
        return [];
    const disallowed = await checkRobotsTxt(rootUrl);
    const visited = new Set();
    const queue = [{ url: rootUrl.replace(/\/$/, ''), depth: 0 }];
    const pages = [];
    while (queue.length > 0 && pages.length < maxPages) {
        const item = queue.shift();
        const { url, depth } = item;
        if (visited.has(url) || isDisallowed(url, disallowed))
            continue;
        visited.add(url);
        logger_1.logger.info({ module: 'crawler', url, depth }, 'Crawling page');
        const html = await fetchPage(url);
        if (!html)
            continue;
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
//# sourceMappingURL=crawler.js.map