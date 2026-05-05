export declare function listTenants(): Promise<{
    tenants: any[];
    total: number | null;
}>;
export declare function getTenantConfig(input: {
    businessSlug: string;
}): Promise<any>;
export declare function getTeamUsers(input: {
    businessSlug: string;
}): Promise<{
    users: {
        username: string;
        email: string | null;
    }[];
    total: number;
    note: string;
}>;
