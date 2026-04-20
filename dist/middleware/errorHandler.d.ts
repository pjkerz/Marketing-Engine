import { Request, Response, NextFunction } from 'express';
export declare class AppError extends Error {
    readonly code: string;
    readonly message: string;
    readonly httpStatus: number;
    readonly details?: Record<string, unknown> | undefined;
    constructor(code: string, message: string, httpStatus: number, details?: Record<string, unknown> | undefined);
}
export declare function errorHandler(err: Error | AppError, req: Request, res: Response, _next: NextFunction): void;
export declare function notFound(req: Request, res: Response): void;
//# sourceMappingURL=errorHandler.d.ts.map