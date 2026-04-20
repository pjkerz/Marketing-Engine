import { Request, Response, NextFunction } from 'express';
import { Role } from './auth';
export declare function requireRole(...roles: Role[]): (req: Request, _res: Response, next: NextFunction) => void;
export declare function requireOwnAffiliate(req: Request, _res: Response, next: NextFunction): void;
//# sourceMappingURL=rbac.d.ts.map