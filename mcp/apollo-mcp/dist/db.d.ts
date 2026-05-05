import { PoolClient } from 'pg';
export declare function closePool(): Promise<void>;
export declare function resolveBusinessId(slug: string): Promise<string>;
export declare function findOrCreateEmailList(businessId: string, listName: string): Promise<string>;
export interface SubscriberImportRecord {
    businessId: string;
    listId: string;
    email: string;
    name?: string;
    apolloId?: string;
    title?: string;
    company?: string;
    phone?: string;
    consentBasis: string;
    extraTags?: string[];
}
export interface UpsertResult {
    id: string;
    created: boolean;
    skipped: boolean;
    reason?: string;
}
export declare function upsertSubscriberProspect(rec: SubscriberImportRecord): Promise<UpsertResult>;
export interface AffiliateInsertRecord {
    businessId: string;
    name: string;
    email: string;
    code: string;
    title?: string;
    company?: string;
    linkedinUrl?: string;
    apolloId?: string;
    notes?: string;
}
export interface AffiliateInsertResult {
    id: string;
    code: string;
    created: boolean;
    alreadyExists: boolean;
    onboardingLink: string;
}
export declare function insertAffiliateCandidateWithClient(client: PoolClient, rec: AffiliateInsertRecord): Promise<AffiliateInsertResult>;
export declare function insertAffiliateCandidate(rec: AffiliateInsertRecord): Promise<AffiliateInsertResult>;
export declare function generateAffiliateCode(name: string): string;
