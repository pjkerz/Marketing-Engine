export interface EnrichContactInput {
    personId?: string;
    email?: string;
    linkedinUrl?: string;
    name?: string;
    organizationName?: string;
}
export interface EnrichContactResult {
    found: boolean;
    person: {
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
    } | null;
    note: string;
}
export declare function enrichContact(input: EnrichContactInput): Promise<EnrichContactResult>;
