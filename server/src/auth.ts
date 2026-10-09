import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { NextFunction, Request, Response } from 'express';
import { get } from './db.ts';
import { HttpError } from './util.ts';
import { can, type Area, type Role } from './permissions.ts';
import { config } from './config.ts';

const SECRET = config.jwtSecret;

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  role: Role;
  active: number;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function hashPassword(pw: string) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(pw, salt, 64).toString('hex')}`;
}

export function verifyPassword(pw: string, stored: string) {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const a = Buffer.from(hash, 'hex');
  const b = scryptSync(pw, salt, 64);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function signToken(userId: number) {
  return jwt.sign({ sub: userId }, SECRET, { expiresIn: '12h' });
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next(new HttpError(401, 'Please sign in'));
  try {
    const payload = jwt.verify(token, SECRET) as unknown as { sub: number };
    const user = get<AuthUser>('SELECT id, name, email, role, active FROM users WHERE id = ?', payload.sub);
    if (!user || !user.active) return next(new HttpError(401, 'Account disabled'));
    req.user = user;
    next();
  } catch {
    next(new HttpError(401, 'Session expired — please sign in again'));
  }
}

/** Allow the request if the user's role can access ANY of the given areas. */
export function requireArea(...areas: Area[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new HttpError(401, 'Please sign in'));
    if (!areas.some((a) => can(req.user!.role, a))) return next(new HttpError(403, 'Your role does not have access to this'));
    next();
  };
}

export function assertArea(req: Request, ...areas: Area[]) {
  if (!req.user || !areas.some((a) => can(req.user!.role, a))) throw new HttpError(403, 'Your role does not have access to this');
}

export const isManager = (req: Request) => req.user?.role === 'admin' || req.user?.role === 'manager';
