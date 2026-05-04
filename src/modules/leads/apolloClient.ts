import { logger } from '../../lib/logger';

const APOLLO_BASE = 'https://api.apollo.io/api/v1';

export interface ApolloPersonResult {
  id: string;
  first_name: string | null;
  last_name: string | null;
  name: string | null;
  title: string | null;
  email: string | null;
  phone_numbers: Array<{ raw_number: string; type: string }>;
  organization_name: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  linkedin_url: string | null;
  employment_history: Array<{ current: boolean; title: string }>;
  // open_to_work is surfaced via show_intent signals
  intent_strength: string | null;
}

export interface ApolloSearchResponse {
  people: ApolloPersonResult[];
  pagination: {
    page: number;
    per_page: number;
    total_entries: number;
    total_pages: number;
  };
}

export async function searchOpenToWork(params: {
  titles: string[];
  page: number;
  perPage?: number;
  apiKey: string;
}): Promise<ApolloSearchResponse> {
  const { titles, page, perPage = 100, apiKey } = params;

  const body = {
    person_titles: titles,
    // USA only
    person_locations: ['United States'],
    // Open to work / actively looking filter
    currently_in_market: true,
    person_seniority: [],
    per_page: perPage,
    page,
  };

  const res = await fetch(`${APOLLO_BASE}/mixed_people/api_search`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      'X-Api-Key': apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    logger.error({ module: 'apolloClient', status: res.status, body: text }, 'Apollo API error');
    throw new Error(`Apollo API ${res.status}: ${text}`);
  }

  return res.json() as Promise<ApolloSearchResponse>;
}

export function extractPhone(person: ApolloPersonResult): string | null {
  const mobile = person.phone_numbers?.find(p => p.type === 'mobile');
  const direct = person.phone_numbers?.find(p => p.type === 'direct');
  const any = person.phone_numbers?.[0];
  return mobile?.raw_number ?? direct?.raw_number ?? any?.raw_number ?? null;
}
