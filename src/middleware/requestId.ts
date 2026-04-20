import { Request, Response, NextFunction } from 'express';
import { randomBytes } from 'crypto';

declare global {
  namespace Express {
    interface Request {
      requestId: string;
      startTime: number;
    }
  }
}

export function requestId(req: Request, _res: Response, next: NextFunction): void {
  req.requestId = `req_${randomBytes(8).toString('hex')}`;
  req.startTime = Date.now();
  next();
}
