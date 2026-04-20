"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getKeywordIdeas = getKeywordIdeas;
const logger_1 = require("../../lib/logger");
const GOOGLE_ADS_DEVELOPER_TOKEN = process.env['GOOGLE_ADS_DEVELOPER_TOKEN'] ?? '';
const GOOGLE_ADS_CLIENT_ID = process.env['GOOGLE_ADS_CLIENT_ID'] ?? '';
const GOOGLE_ADS_CLIENT_SECRET = process.env['GOOGLE_ADS_CLIENT_SECRET'] ?? '';
const GOOGLE_ADS_REFRESH_TOKEN = process.env['GOOGLE_ADS_REFRESH_TOKEN'] ?? '';
const GOOGLE_ADS_CUSTOMER_ID = process.env['GOOGLE_ADS_CUSTOMER_ID'] ?? '';
const isConfigured = () => GOOGLE_ADS_DEVELOPER_TOKEN && GOOGLE_ADS_CLIENT_ID && GOOGLE_ADS_CLIENT_SECRET && GOOGLE_ADS_CUSTOMER_ID;
// Simple competition mapping
function mapCompetition(level) {
    if (level < 0.33)
        return 'low';
    if (level < 0.66)
        return 'medium';
    return 'high';
}
async function getAccessToken() {
    const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            client_id: GOOGLE_ADS_CLIENT_ID,
            client_secret: GOOGLE_ADS_CLIENT_SECRET,
            refresh_token: GOOGLE_ADS_REFRESH_TOKEN,
            grant_type: 'refresh_token',
        }),
    });
    const d = await res.json();
    if (!d.access_token)
        throw new Error('Google Ads: failed to get access token');
    return d.access_token;
}
async function getKeywordIdeas(seedKeywords) {
    if (!isConfigured()) {
        logger_1.logger.warn({ module: 'googleAdsClient' }, 'Google Ads not configured — returning mock data');
        return generateMockKeywords(seedKeywords, 'google');
    }
    try {
        const accessToken = await getAccessToken();
        const customerId = GOOGLE_ADS_CUSTOMER_ID.replace(/-/g, '');
        // Google Ads REST API — KeywordPlanIdeaService
        const res = await fetch(`https://googleads.googleapis.com/v17/customers/${customerId}/googleAds:generateKeywordIdeas`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`,
                'developer-token': GOOGLE_ADS_DEVELOPER_TOKEN,
            },
            body: JSON.stringify({
                keywordSeed: { keywords: seedKeywords },
                language: 'languageConstants/1000', // English
                geoTargetConstants: ['geoTargetConstants/2840'], // US
                includeAdultKeywords: false,
                keywordPlanNetwork: 'GOOGLE_SEARCH_AND_PARTNERS',
            }),
        });
        const d = await res.json();
        if (!res.ok)
            throw new Error(`Google Ads API error: ${JSON.stringify(d)}`);
        return (d.results ?? []).map(r => ({
            keyword: r.text ?? '',
            monthlyVolume: parseInt(r.keywordIdeaMetrics?.avgMonthlySearches ?? '0') || 0,
            cpcEstimate: (parseInt(r.keywordIdeaMetrics?.averageCpcMicros ?? '0') / 1_000_000) || 0,
            competition: mapCompetition(r.keywordIdeaMetrics?.competitionIndex ?? 0.5),
            source: 'google',
        })).filter(k => k.keyword && k.monthlyVolume > 0);
    }
    catch (err) {
        logger_1.logger.error({ module: 'googleAdsClient', err }, 'Google Ads API failed — using mock data');
        return generateMockKeywords(seedKeywords, 'google');
    }
}
// Returns realistic mock data when API is not configured (for dev/testing)
function generateMockKeywords(seeds, source) {
    const suffixes = ['tools', 'strategy', 'tips', 'guide', 'software', 'services', 'platform', 'app', 'online', 'best'];
    const results = [];
    for (const seed of seeds) {
        results.push({ keyword: seed, monthlyVolume: 1000 + Math.floor(Math.random() * 9000), cpcEstimate: 0.5 + Math.random() * 4, competition: 'medium', source, trend: 'stable' });
        for (const suffix of suffixes.slice(0, 5)) {
            results.push({
                keyword: `${seed} ${suffix}`,
                monthlyVolume: 100 + Math.floor(Math.random() * 2000),
                cpcEstimate: 0.3 + Math.random() * 3,
                competition: ['low', 'medium', 'high'][Math.floor(Math.random() * 3)],
                source,
                trend: ['rising', 'stable', 'declining'][Math.floor(Math.random() * 3)],
            });
        }
    }
    return results;
}
//# sourceMappingURL=googleAdsClient.js.map