import { Request, Response, NextFunction } from 'express';
import * as jwt from 'jsonwebtoken';
import * as fs from 'fs';
import { env } from '../config/env';
import { AppError } from './errorHandler';

export type Role = 'affiliate' | 'admin' | 'system';

export const ALPHABOOST_BUSINESS_ID = '00000000-0000-0000-0000-000000000001';

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

interface OnboardingTokenPayload {
  affiliateCode: string;
  businessId: string;
  purpose: 'onboarding';
  iat: number;
  exp: number;
}

function readLeadershipPassword(): string {
  try {
    const content = fs.readFileSync(env.CREDS_MD_PATH, 'utf8');
    const match = content.match(/^CONSOLE_PASSWORD=(.+)$/m);
    return match ? match[1].trim() : '';
  } catch {
    return '';
  }
}

export function issueOnboardingToken(affiliateCode: string, businessId: string = ALPHABOOST_BUSINESS_ID): string {
  return jwt.sign(
    { affiliateCode, businessId, purpose: 'onboarding' },
    env.V2_JWT_SECRET,
    { expiresIn: '7d' },
  );
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  // Try Bearer token (onboarding JWT or admin session)
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    try {
      const payload = jwt.verify(token, env.V2_JWT_SECRET) as OnboardingTokenPayload & { role?: Role };

      if (payload.purpose === 'onboarding' && payload.affiliateCode) {
        req.actor = {
          role: 'affiliate',
          businessId: payload.businessId || ALPHABOOST_BUSINESS_ID,
          affiliateCode: payload.affiliateCode,
        };
        next();
        return;
      }

      if (payload.role) {
        const p = payload as unknown as { role: Role; businessId?: string };
        req.actor = {
          role: p.role,
          businessId: p.businessId || ALPHABOOST_BUSINESS_ID,
        };
        next();
        return;
      }
    } catch {
      // fall through to check session cookie
    }
  }

  // Try admin session: X-Admin-Password header validated against CREDS.md
  const adminPassword = req.headers['x-admin-password'] as string | undefined;
  if (adminPassword) {
    const leadershipPassword = readLeadershipPassword();
    if (leadershipPassword && adminPassword === leadershipPassword) {
      req.actor = { role: 'admin', businessId: ALPHABOOST_BUSINESS_ID };
      next();
      return;
    }
  }

  next(new AppError('UNAUTHORIZED', 'Authentication required.', 401));
}

export function requireOnboardingToken(req: Request, _res: Response, next: NextFunction): void {
  const token = req.query.token as string | undefined;
  if (!token) {
    next(new AppError('UNAUTHORIZED', 'Onboarding token required.', 401));
    return;
  }
  try {
    const payload = jwt.verify(token, env.V2_JWT_SECRET) as OnboardingTokenPayload;
    if (payload.purpose !== 'onboarding' || !payload.affiliateCode) {
      throw new Error('Invalid token');
    }
    req.actor = {
      role: 'affiliate',
      businessId: payload.businessId || ALPHABOOST_BUSINESS_ID,
      affiliateCode: payload.affiliateCode,
    };
    next();
  } catch {
    next(new AppError('UNAUTHORIZED', 'Invalid or expired onboarding token.', 401));
  }
}
