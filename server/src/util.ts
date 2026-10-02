import type { ZodType } from 'zod';
import { get } from './db.ts';

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export const bad = (msg: string) => new HttpError(400, msg);
export const notFound = (what = 'Record') => new HttpError(404, `${what} not found`);
export const conflict = (msg: string) => new HttpError(409, msg);

export function parse<T>(schema: ZodType<T>, body: unknown): T {
  const r = schema.safeParse(body);
  if (!r.success) {
    const issue = r.error.issues[0];
    const field = issue.path.join('.');
    throw bad(field ? `${field.replace(/_/g, ' ')}: ${issue.message}` : issue.message);
  }
  return r.data;
}

/** Local calendar date, YYYY-MM-DD. */
export function isoDate(d: Date = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export const today = () => isoDate();

export function addDays(s: string, n: number) {
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + n);
  return isoDate(dt);
}

export function nights(from: string, to: string) {
  const a = from.split('-').map(Number);
  const b = to.split('-').map(Number);
  return Math.round((Date.UTC(b[0], b[1] - 1, b[2]) - Date.UTC(a[0], a[1] - 1, a[2])) / 86400000);
}

export function dateRange(from: string, to: string) {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

export const round2 = (n: number) => Math.round(n * 100) / 100;

/** Short human code like MR-7K2Q unique in table.column. */
export function makeCode(prefix: string, table: string, column = 'code') {
  const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  for (;;) {
    let s = '';
    for (let i = 0; i < 5; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
    const code = `${prefix}-${s}`;
    if (!get(`SELECT 1 FROM ${table} WHERE ${column} = ?`, code)) return code;
  }
}

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const TIME_RE = /^\d{2}:\d{2}$/;
