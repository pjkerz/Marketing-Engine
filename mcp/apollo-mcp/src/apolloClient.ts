import https from 'https';
import { loadEnv } from './env';

const APOLLO_HOST = 'api.apollo.io';
const APOLLO_BASE = '/api/v1';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ApolloPhoneNumber {
  raw_number: string;
  sanitized_number: string;
  type: 'mobile' | 'work' | 'home' | null;
  position: number;
  status: string;
  dnc_status: string | null;
}

export interface ApolloOrganization {
  name: string;
  industry: string | null;
  website_url: string | null;
  linkedin_url: string | null;
  estimated_num_employees: number | null;
  primary_domain: string | null;
}

export interface ApolloPerson {
  id: string;
  first_name: string | null;
  last_name: string | null;
  name: string;
  linkedin_url: string | null;
  title: string | null;
  email_status: 'verified' | 'guessed' | 'unavailable' | 'bounced' | null;
  email: string | null;
  phone_numbers: ApolloPhoneNumber[];
  city: string | null;
  state: string | null;
  country: string | null;
  organization: ApolloOrganization | null;
  employment_history: Array<{
    organization_name: string;
    title: string | null;
    start_date: string | null;
    end_date: string | null;
    current: boolean;
  }>;
  photo_url: string | null;
  twitter_url: string | null;
  github_url: string | null;
  facebook_url: string | null;
  extrapolated_email_confidence: number | null;
  seniority: string | null;
  departments: string[];
  functions: string[];
  intent_strength: string | null;
  show_intent: boolean;
}

export interface ApolloPagination {
  page: number;
  per_page: number;
  total_entries: number;
  total_pages: number;
}

export interface ApolloSearchResponse {
  people: ApolloPerson[];
  pagination: ApolloPagination;
}

export interface ApolloEnrichResponse {
  person: ApolloPerson | null;
  status?: string;
}

export type Seniority = 'owner' | 'founder' | 'c_suite' | 'partner' | 'vp' | 'head' | 'director' | 'manager' | 'senior' | 'entry' | 'intern';

export interface ContactSearchFilters {
  titles?: string[];
  locations?: string[];
  industries?: string[];
  seniorities?: Seniority[];
  openToWork?: boolean;
  emailRequired?: boolean;
  page?: number;
  perPage?: number;
}

export interface EnrichContactParams {
  personId?: string;
  email?: string;
  linkedinUrl?: string;
  name?: string;
  organizationName?: string;
}

// ── HTTP helper ────────────────────────────────────────────────────────────────

function apolloPost<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const env = loadEnv();
  const bodyStr = JSON.stringify({ ...body, api_key: env.APOLLO_API_KEY });

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: APOLLO_HOST,
      path: `${APOLLO_BASE}${path}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'Content-Length': Buffer.byteLength(bodyStr),
      },
    }, (res) => {
      let data = '';
      res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
      res.on('end', () => {
        if (res.statusCode === 429) {
          reject(new Error('Apollo rate limit hit — wait 60 seconds before retrying'));
          return;
        }
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`Apollo API ${res.statusCode}: ${data.slice(0, 300)}`));
          return;
        }
        try {
          resolve(JSON.parse(data) as T);
        } catch {
          reject(new Error(`Apollo returned non-JSON: ${data.slice(0, 200)}`));
        }
      });
    });
    req.on('error', reject);
    req.write(bodyStr);
    req.end();
  });
}

// ── Public API ─────────────────────────────────────────────────────────────────

export async function searchPeople(filters: ContactSearchFilters): Promise<ApolloSearchResponse> {
  const body: Record<string, unknown> = {
    page: filters.page ?? 1,
    per_page: filters.perPage ?? 25,
  };

  if (filters.titles?.length) body['person_titles'] = filters.titles;
  if (filters.locations?.length) body['person_locations'] = filters.locations;
  if (filters.seniorities?.length) body['person_seniorities'] = filters.seniorities;
  if (filters.industries?.length) body['q_organization_keyword_tags'] = filters.industries;

  // email_status filter: only return contacts where email is obtainable
  if (filters.emailRequired) {
    body['contact_email_status'] = ['verified', 'guessed'];
  }

  // Open-to-work signal: Apollo doesn't expose LinkedIn's badge directly.
  // Best proxy: filter for people who changed jobs recently (employment signals).
  // We mark these in the result metadata rather than filtering out at API level.
  if (filters.openToWork) {
    // Use person_changed_job_recently signal if available in the plan
    body['person_changed_job_recently'] = true;
  }

  return apolloPost<ApolloSearchResponse>('/mixed_people/search', body);
}

export async function enrichPerson(params: EnrichContactParams): Promise<ApolloEnrichResponse> {
  const body: Record<string, unknown> = {
    reveal_personal_emails: false,
    reveal_phone_number: true,
  };

  if (params.personId) body['id'] = params.personId;
  if (params.email) body['email'] = params.email;
  if (params.linkedinUrl) body['linkedin_url'] = params.linkedinUrl;
  if (params.name) body['name'] = params.name;
  if (params.organizationName) body['organization_name'] = params.organizationName;

  return apolloPost<ApolloEnrichResponse>('/people/match', body);
}
