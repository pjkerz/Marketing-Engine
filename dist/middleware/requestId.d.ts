import { Request, Response, NextFunction } from 'express';
declare global {
    namespace Express {
        interface Request {
            requestId: string;
            startTime: number;
        }
    }
}
export declare function requestId(req: Request, _res: Response, next: NextFunction): void;
//# sourceMappingURL=requestId.d.ts.map