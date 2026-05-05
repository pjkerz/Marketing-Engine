export interface McpEnv {
    DATABASE_URL: string;
    APOLLO_API_KEY: string;
    APP_URL: string;
    V2_JWT_SECRET: string;
}
export declare function loadEnv(): McpEnv;
