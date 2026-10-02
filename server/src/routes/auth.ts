import { Router } from 'express';
import { z } from 'zod';
import { get } from '../db.ts';
import { requireAuth, signToken, verifyPassword } from '../auth.ts';
import { HttpError, parse } from '../util.ts';
import { readSettings } from './office.ts';

export const authRoutes = Router();

const attempts = new Map<string, { n: number; until: number }>();

authRoutes.post('/auth/login', (req, res) => {
  const b = parse(z.object({ email: z.string().trim().min(1, 'is required'), password: z.string().min(1, 'is required') }), req.body);
  const key = `${req.ip}:${b.email.toLowerCase()}`;
  const a = attempts.get(key);
  if (a && a.n >= 5 && a.until > Date.now()) throw new HttpError(429, 'Too many attempts — wait a minute and try again');

  const user = get<any>('SELECT * FROM users WHERE email = ?', b.email);
  if (!user || !verifyPassword(b.password, user.password_hash)) {
    const n = (a && a.until > Date.now() ? a.n : 0) + 1;
    attempts.set(key, { n, until: Date.now() + 60_000 });
    throw new HttpError(401, 'Email or password is incorrect');
  }
  if (!user.active) throw new HttpError(403, 'This account has been disabled');
  attempts.delete(key);
  const { password_hash: _omit, ...safe } = user;
  res.json({ token: signToken(user.id), user: safe, settings: readSettings() });
});

authRoutes.get('/auth/me', requireAuth, (req, res) => {
  res.json({ user: req.user, settings: readSettings() });
});
