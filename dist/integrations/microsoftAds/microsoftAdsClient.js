"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getKeywordIdeas = getKeywordIdeas;
const logger_1 = require("../../lib/logger");
const MICROSOFT_ADS_CLIENT_ID = process.env['MICROSOFT_ADS_CLIENT_ID'] ?? '';
const MICROSOFT_ADS_CLIENT_SECRET = process.env['MICROSOFT_ADS_CLIENT_SECRET'] ?? '';
const MICROSOFT_ADS_DEVELOPER_TOKEN = process.env['MICROSOFT_ADS_DEVELOPER_TOKEN'] ?? '';
const MICROSOFT_ADS_REFRESH_TOKEN = process.env['MICROSOFT_ADS_REFRESH_TOKEN'] ?? '';
const MICROSOFT_ADS_CUSTOMER_ID = process.env['MICROSOFT_ADS_CUSTOMER_ID'] ?? '';
const isConfigured = () => MICROSOFT_ADS_CLIENT_ID && MICROSOFT_ADS_DEVELOPER_TOKEN && MICROSOFT_ADS_CUSTOMER_ID;
async function getAccessToken() {
    const res = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            client_id: MICROSOFT_ADS_CLIENT_ID,
            client_secret: MICROSOFT_ADS_CLIENT_SECRET,
            refresh_token: MICROSOFT_ADS_REFRESH_TOKEN,
            grant_type: 'refresh_token',
            scope: 'https://ads.microsoft.com/msads.manage offline_access',
        }),
    });
    const d = await res.json();
    if (!d.access_token)
        throw new Error('Microsoft Ads: failed to get access token');
    return d.access_token;
}
async function getKeywordIdeas(seedKeywords) {
    if (!isConfigured()) {
        logger_1.logger.warn({ module: 'microsoftAdsClient' }, 'Microsoft Ads not configured — returning mock data');
        return generateMockKeywords(seedKeywords, 'microsoft');
    }
    try {
        const accessToken = await getAccessToken();
        // Microsoft Advertising API — GetKeywordIdeas via REST proxy
        const res = await fetch('https://api.ads.microsoft.com/v13/adinsight/GetKeywordIdeas', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`,
                'DeveloperToken': MICROSOFT_ADS_DEVELOPER_TOKEN,
                'CustomerId': MICROSOFT_ADS_CUSTOMER_ID,
            },
            body: JSON.stringify({
                ExpandIdeas: true,
                IdeaAttributes: ['AdImpressionShare', 'AverageCPC', 'MonthlySearchCounts', 'SuggestedBid'],
                SearchParameters: [
                    { Type: 'QuerySearchParameter', Queries: seedKeywords },
                    { Type: 'LanguageSearchParameter', Languages: [{ Id: '1033' }] }, // English
                ],
            }),
        });
        const d = await res.json();
        if (!res.ok)
            throw new Error(`Microsoft Ads API error: ${JSON.stringify(d)}`);
        return (d.KeywordIdeas ?? []).map(idea => {
            const volumes = idea.MonthlySearchCounts ?? [0];
            const avgVolume = Math.round(volumes.reduce((a, b) => a + b, 0) / volumes.length);
            const cpc = idea.AverageCPC ?? 0;
            const imprShare = idea.AdImpressionShare ?? 0.5;
            return {
                keyword: idea.KeywordIdea?.Keyword ?? '',
                monthlyVolume: avgVolume,
                cpcEstimate: cpc,
                competition: (imprShare < 0.33 ? 'low' : imprShare < 0.66 ? 'medium' : 'high'),
                source: 'microsoft',
            };
        }).filter(k => k.keyword && k.monthlyVolume > 0);
    }
    catch (err) {
        logger_1.logger.error({ module: 'microsoftAdsClient', err }, 'Microsoft Ads API failed — using mock data');
        return generateMockKeywords(seedKeywords, 'microsoft');
    }
}
function generateMockKeywords(seeds, source) {
    const modifiers = ['free', 'affordable', 'professional', 'online', 'top', 'how to use', 'best', 'reviews'];
    const results = [];
    for (const seed of seeds) {
        for (const mod of modifiers.slice(0, 5)) {
            results.push({
                keyword: `${mod} ${seed}`,
                monthlyVolume: 50 + Math.floor(Math.random() * 1500),
                cpcEstimate: 0.2 + Math.random() * 2.5,
                competition: ['low', 'medium', 'high'][Math.floor(Math.random() * 3)],
                source,
                trend: 'stable',
            });
        }
    }
    return results;
}
//# sourceMappingURL=microsoftAdsClient.js.map