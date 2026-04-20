import { Request, Response, NextFunction } from 'express';
export type Role = 'affiliate' | 'admin' | 'system';
export declare const ALPHABOOST_BUSINESS_ID = "00000000-0000-0000-0000-000000000001";
declare global {
    namespace Express {
        interface Request {
            actor?: {
                role: Role;
                businessId: string;
                affiliateCode?: string;
                sessionId?: string;
            };
        }
    }
}
export declare function issueOnboardingToken(affiliateCode: string, businessId?: string): string;
export declare function requireAuth(req: Request, _res: Response, next: NextFunction): void;
export declare function requireOnboardingToken(req: Request, _res: Response, next: NextFunction): void;
//# sourceMappingURL=auth.d.ts.map