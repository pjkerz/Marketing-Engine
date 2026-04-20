"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateSeoContent = generateSeoContent;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const prisma_1 = require("../../lib/prisma");
const logger_1 = require("../../lib/logger");
const GROQ_API_KEY = process.env['GROQ_API_KEY'] ?? '';
const BOK_BASE = path.join(process.env['HOME'] ?? '/Users/macmini', '.openclaw/businesses');
async function callGroq(systemPrompt, userPrompt) {
    if (!GROQ_API_KEY)
        throw new Error('GROQ_API_KEY not configured');
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${GROQ_API_KEY}`,
        },
        body: JSON.stringify({
            model: 'llama-3.3-70b-versatile',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
            ],
            max_tokens: 3000,
            temperature: 0.7,
        }),
    });
    const d = await res.json();
    return d.choices?.[0]?.message?.content ?? '';
}
function readBokChunks(businessSlug, keyword) {
    const bokDir = path.join(BOK_BASE, businessSlug, 'bok');
    if (!fs.existsSync(bokDir))
        return '';
    const chunks = [];
    const kws = keyword.toLowerCase().split(' ');
    try {
        for (const file of fs.readdirSync(bokDir)) {
            if (!file.endsWith('.md') && !file.endsWith('.txt'))
                continue;
            const content = fs.readFileSync(path.join(bokDir, file), 'utf-8');
            // Include file if it contains any keyword word
            if (kws.some(kw => content.toLowerCase().includes(kw))) {
                chunks.push(content.slice(0, 1000));
            }
        }
    }
    catch { /* ignore */ }
    return chunks.slice(0, 3).join('\n\n---\n\n');
}
async function generateSeoContent(keyword, businessId, contentType = 'blog-post', auditId) {
    const prisma = (0, prisma_1.getPrisma)();
    // Get business config for brand voice
    const config = await prisma.businessConfig.findUnique({ where: { businessId } });
    const brandVoice = config?.brandVoice ?? 'professional, direct, and helpful';
    const brandName = config?.brandName ?? 'AlphaBoost';
    // Get BOK context (use alphaboost slug for first tenant)
    const business = await prisma.business.findUnique({ where: { id: businessId }, select: { slug: true } });
    const bokContext = readBokChunks(business?.slug ?? 'alphaboost', keyword);
    const systemPrompt = `You are an SEO content writer for ${brandName}.
Brand voice: ${brandVoice}.
${bokContext ? `\nRelevant brand knowledge:\n${bokContext}` : ''}

Write high-quality, SEO-optimised content. Always include the target keyword naturally.`;
    let title = null;
    let html = null;
    let metaTitle = null;
    let metaDescription = null;
    let wordCount = null;
    if (contentType === 'blog-post' || contentType === 'page-copy') {
        const userPrompt = `Write a ${contentType === 'blog-post' ? '1500-2000 word blog post' : 'page copy section'} targeting the keyword: "${keyword}"

Requirements:
- Start with a compelling H1 title
- Use H2 subheadings to structure the content
- Include the keyword naturally throughout
- End with a conclusion and CTA referencing ${brandName}
- Format as clean HTML (h1, h2, p, ul/ol tags only)
- Word count: ${contentType === 'blog-post' ? '1500-2000' : '500-800'} words`;
        const raw = await callGroq(systemPrompt, userPrompt);
        html = raw;
        // Extract title from H1
        const h1Match = raw.match(/<h1[^>]*>([^<]+)<\/h1>/i);
        title = h1Match?.[1]?.trim() ?? keyword;
        wordCount = raw.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
        // Auto-generate meta from content
        const metaPrompt = `Based on this content about "${keyword}", write:
1. Meta title (under 60 characters, include keyword)
2. Meta description (under 160 characters, compelling CTA)

Return JSON: { "metaTitle": "...", "metaDescription": "..." }`;
        try {
            const metaRaw = await callGroq('You are an SEO meta writer. Return only valid JSON.', metaPrompt);
            const metaJson = JSON.parse(metaRaw.replace(/```json\n?|\n?```/g, '').trim());
            metaTitle = (metaJson.metaTitle ?? keyword).slice(0, 60);
            metaDescription = (metaJson.metaDescription ?? '').slice(0, 160);
        }
        catch { /* meta generation optional */ }
    }
    else if (contentType === 'meta') {
        const userPrompt = `Write SEO meta tags for the keyword: "${keyword}"

Return JSON only:
{
  "metaTitle": "under 60 characters, include keyword",
  "metaDescription": "under 160 characters, compelling and keyword-rich"
}`;
        const raw = await callGroq('You are an SEO meta writer. Return only valid JSON.', userPrompt);
        try {
            const parsed = JSON.parse(raw.replace(/```json\n?|\n?```/g, '').trim());
            metaTitle = (parsed.metaTitle ?? keyword).slice(0, 60);
            metaDescription = (parsed.metaDescription ?? '').slice(0, 160);
            title = metaTitle;
        }
        catch {
            metaTitle = keyword.slice(0, 60);
        }
    }
    else if (contentType === 'faq') {
        const userPrompt = `Write 5 FAQ questions and answers targeting the keyword: "${keyword}"
Format as clean HTML using <h3> for questions and <p> for answers.
Make answers 2-4 sentences. Include the keyword naturally.`;
        html = await callGroq(systemPrompt, userPrompt);
        title = `FAQs: ${keyword}`;
        wordCount = html.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
    }
    const saved = await prisma.seoContent.create({
        data: {
            businessId,
            auditId: auditId ?? null,
            keyword,
            contentType,
            title,
            metaTitle,
            metaDescription,
            html,
            wordCount,
            status: 'draft',
        },
    });
    logger_1.logger.info({ module: 'seoContentGenerator', id: saved.id, keyword, contentType }, 'SEO content generated');
    return { id: saved.id, title, html, metaTitle, metaDescription };
}
//# sourceMappingURL=seoContentGenerator.js.map