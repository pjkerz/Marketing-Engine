export interface ApolloPersonResult {
    id: string;
    first_name: string | null;
    last_name: string | null;
    name: string | null;
    title: string | null;
    email: string | null;
    phone_numbers: Array<{
        raw_number: string;
        type: string;
    }>;
    organization_name: string | null;
    city: string | null;
    state: string | null;
    country: string | null;
    linkedin_url: string | null;
    employment_history: Array<{
        current: boolean;
        title: string;
    }>;
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
export declare function searchOpenToWork(params: {
    titles: string[];
    page: number;
    perPage?: number;
    apiKey: string;
}): Promise<ApolloSearchResponse>;
export declare function extractPhone(person: ApolloPersonResult): string | null;
//# sourceMappingURL=apolloClient.d.ts.map