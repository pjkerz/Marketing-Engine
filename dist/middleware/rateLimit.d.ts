import { Request, Response, NextFunction } from 'express';
interface RateLimitConfig {
    max: number;
    windowSeconds: number;
    keyFn: (req: Request) => string;
}
export declare function rateLimit(config: RateLimitConfig): (req: Request, _res: Response, next: NextFunction) => Promise<void>;
export declare const uploadResumeLimit: (req: Request, _res: Response, next: NextFunction) => Promise<void>;
export declare const generateContentLimit: (req: Request, _res: Response, next: NextFunction) => Promise<void>;
export declare const generateImageLimit: (req: Request, _res: Response, next: NextFunction) => Promise<void>;
export declare const generalLimit: (req: Request, _res: Response, next: NextFunction) => Promise<void>;
export declare const adminLimit: (req: Request, _res: Response, next: NextFunction) => Promise<void>;
export declare const trackingLimit: (req: Request, _res: Response, next: NextFunction) => Promise<void>;
export declare const loginLimit: (req: Request, _res: Response, next: NextFunction) => Promise<void>;
export {};
//# sourceMappingURL=rateLimit.d.ts.map