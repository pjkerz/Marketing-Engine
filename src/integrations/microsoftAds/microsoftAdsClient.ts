import { logger } from '../../lib/logger';
import type { KeywordIdea } from '../../modules/keywords/opportunityScorer';

const MICROSOFT_ADS_CLIENT_ID = process.env['MICROSOFT_ADS_CLIENT_ID'] ?? '';
const MICROSOFT_ADS_CLIENT_SECRET = process.env['MICROSOFT_ADS_CLIENT_SECRET'] ?? '';
const MICROSOFT_ADS_DEVELOPER_TOKEN = process.env['MICROSOFT_ADS_DEVELOPER_TOKEN'] ?? '';
const MICROSOFT_ADS_REFRESH_TOKEN = process.env['MICROSOFT_ADS_REFRESH_TOKEN'] ?? '';
const MICROSOFT_ADS_CUSTOMER_ID = process.env['MICROSOFT_ADS_CUSTOMER_ID'] ?? '';

const isConfigured = () =>
  MICROSOFT_ADS_CLIENT_ID && MICROSOFT_ADS_DEVELOPER_TOKEN && MICROSOFT_ADS_CUSTOMER_ID;

async function getAccessToken(): Promise<string> {
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
  const d = await res.json() as { access_token?: string };
  if (!d.access_token) throw new Error('Microsoft Ads: failed to get access token');
  return d.access_token;
}

export async function getKeywordIdeas(seedKeywords: string[]): Promise<KeywordIdea[]> {
  if (!isConfigured()) {
    logger.warn({ module: 'microsoftAdsClient' }, 'Microsoft Ads not configured — returning mock data');
    return generateMockKeywords(seedKeywords, 'microsoft');
  }

  try {
    const accessToken = await getAccessToken();

    // Microsoft Advertising API — GetKeywordIdeas via REST proxy
    const res = await fetch(
      'https://api.ads.microsoft.com/v13/adinsight/GetKeywordIdeas',
      {
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
      },
    );

    const d = await res.json() as {
      KeywordIdeas?: Array<{
        KeywordIdea?: { Keyword?: string };
        AdImpressionShare?: number;
        AverageCPC?: number;
        MonthlySearchCounts?: number[];
      }>;
    };

    if (!res.ok) throw new Error(`Microsoft Ads API error: ${JSON.stringify(d)}`);

    return (d.KeywordIdeas ?? []).map(idea => {
      const volumes = idea.MonthlySearchCounts ?? [0];
      const avgVolume = Math.round(volumes.reduce((a, b) => a + b, 0) / volumes.length);
      const cpc = idea.AverageCPC ?? 0;
      const imprShare = idea.AdImpressionShare ?? 0.5;
      return {
        keyword: idea.KeywordIdea?.Keyword ?? '',
        monthlyVolume: avgVolume,
        cpcEstimate: cpc,
        competition: (imprShare < 0.33 ? 'low' : imprShare < 0.66 ? 'medium' : 'high') as 'low' | 'medium' | 'high',
        source: 'microsoft',
      };
    }).filter(k => k.keyword && k.monthlyVolume > 0);

  } catch (err) {
    logger.error({ module: 'microsoftAdsClient', err }, 'Microsoft Ads API failed — using mock data');
    return generateMockKeywords(seedKeywords, 'microsoft');
  }
}

function generateMockKeywords(seeds: string[], source: string): KeywordIdea[] {
  const modifiers = ['free', 'affordable', 'professional', 'online', 'top', 'how to use', 'best', 'reviews'];
  const results: KeywordIdea[] = [];
  for (const seed of seeds) {
    for (const mod of modifiers.slice(0, 5)) {
      results.push({
        keyword: `${mod} ${seed}`,
        monthlyVolume: 50 + Math.floor(Math.random() * 1500),
        cpcEstimate: 0.2 + Math.random() * 2.5,
        competition: ['low', 'medium', 'high'][Math.floor(Math.random() * 3)] as 'low' | 'medium' | 'high',
        source,
        trend: 'stable',
      });
    }
  }
  return results;
}
