import { Pool } from 'pg';
export declare function getPool(): Pool;
export declare function getEnv(key: string, fallback?: string): string;
export declare function resolveBusinessId(slug: string): Promise<string>;
