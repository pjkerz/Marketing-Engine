import { Request, Response, NextFunction } from 'express';
import { Role } from './auth';
import { AppError } from './errorHandler';

export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.actor) {
      next(new AppError('UNAUTHORIZED', 'Authentication required.', 401));
      return;
    }
    if (!roles.includes(req.actor.role)) {
      next(new AppError('FORBIDDEN', 'Insufficient permissions.', 403));
      return;
    }
    next();
  };
}

export function requireOwnAffiliate(req: Request, _res: Response, next: NextFunction): void {
  if (!req.actor) {
    next(new AppError('UNAUTHORIZED', 'Authentication required.', 401));
    return;
  }
  if (req.actor.role === 'admin') {
    next();
    return;
  }
  if (req.actor.role === 'affiliate' && req.actor.affiliateCode === req.params.code) {
    next();
    return;
  }
  next(new AppError('FORBIDDEN', 'Access to this affiliate is not permitted.', 403));
}
