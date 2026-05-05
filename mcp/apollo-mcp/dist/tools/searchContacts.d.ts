import { Seniority } from '../apolloClient';
export interface SearchContactsInput {
    titles?: string[];
    locations?: string[];
    industries?: string[];
    seniorities?: Seniority[];
    openToWork?: boolean;
    emailRequired?: boolean;
    page?: number;
    perPage?: number;
}
export interface ContactSummary {
    apolloId: string;
    name: string;
    title: string | null;
    email: string | null;
    emailStatus: string | null;
    phone: string | null;
    location: string | null;
    company: string | null;
    industry: string | null;
    linkedinUrl: string | null;
    seniority: string | null;
    departments: string[];
    openToWorkSignal: boolean;
}
export interface SearchContactsResult {
    contacts: ContactSummary[];
    pagination: {
        page: number;
        perPage: number;
        totalEntries: number;
        totalPages: number;
    };
    filters: SearchContactsInput;
    note: string;
}
export declare function searchContacts(input: SearchContactsInput): Promise<SearchContactsResult>;
