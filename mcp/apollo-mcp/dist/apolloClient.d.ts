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
export declare function searchPeople(filters: ContactSearchFilters): Promise<ApolloSearchResponse>;
export declare function enrichPerson(params: EnrichContactParams): Promise<ApolloEnrichResponse>;
