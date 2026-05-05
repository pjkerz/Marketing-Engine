import { ContactSummary } from './searchContacts';
export interface SaveLeadsInput {
    businessSlug: string;
    contacts: ContactSummary[];
}
export interface SaveLeadsResult {
    saved: number;
    skipped: number;
    errors: number;
    note: string;
}
export declare function saveLeads(input: SaveLeadsInput): Promise<SaveLeadsResult>;
