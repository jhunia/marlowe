import { Router } from 'express';
import { z } from 'zod';
import { all, get, logActivity, run, tx } from '../db.ts';
import { hashPassword, requireArea } from '../auth.ts';
import { ROLES } from '../permissions.ts';
import { addDays, bad, conflict, DATE_RE, notFound, parse, TIME_RE } from '../util.ts';

export const office = Router();

/* ------------------------------------------------------------- inventory */

office.get('/inventory', requireArea('inventory'), (req, res) => {
  const store = req.query.store ? String(req.query.store) : null;
  const q = String(req.query.q ?? '').trim();
  res.json(
    all(
      `SELECT * FROM inventory_items WHERE (? IS NULL OR store = ?) AND (? = '' OR name LIKE ? OR sku LIKE ?) AND (? = 0 OR qty <= par_level)
       ORDER BY CASE WHEN qty <= par_level THEN 0 ELSE 1 END, store, name`,
      store,
      store,
      q,
      `%${q}%`,
      `%${q}%`,
      req.query.low ? 1 : 0,
    ),
  );
});

office.get('/inventory/movements', requireArea('inventory'), (_req, res) => {
  res.json(
    all(
      `SELECT m.*, i.name AS item_name, i.unit, u.name AS user_name FROM stock_movements m
         JOIN inventory_items i ON i.id = m.item_id LEFT JOIN users u ON u.id = m.user_id
        ORDER BY m.created_at DESC, m.id DESC LIMIT 300`,
    ),
  );
});

const invSchema = z.object({
  name: z.string().trim().min(1),
  sku: z.string().trim().optional(),
  store: z.enum(['kitchen', 'bar', 'housekeeping', 'maintenance']),
  unit: z.string().trim().min(1),
  par_level: z.number().min(0),
  cost: z.number().min(0),
  supplier: z.string().nullable().optional(),
});

office.post('/inventory', requireArea('inventory'), (req, res) => {
  const b = parse(invSchema.extend({ qty: z.number().min(0).default(0) }), req.body);
  const sku = b.sku || `${b.store.slice(0, 3).toUpperCase()}-${Date.now().toString(36).toUpperCase().slice(-5)}`;
  if (get('SELECT 1 FROM inventory_items WHERE sku = ?', sku)) throw conflict('SKU already exists');
  const id = tx(() => {
    const { id } = run('INSERT INTO inventory_items (name, sku, store, unit, qty, par_level, cost, supplier) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', b.name, sku, b.store, b.unit, b.qty, b.par_level, b.cost, b.supplier || null);
    if (b.qty) run(`INSERT INTO stock_movements (item_id, change, reason, note, user_id) VALUES (?, ?, 'adjustment', 'Opening balance', ?)`, id, b.qty, req.user!.id);
    return id;
  });
  res.status(201).json(get('SELECT * FROM inventory_items WHERE id = ?', id));
});

office.patch('/inventory/:id', requireArea('inventory'), (req, res) => {
  const it = get<any>('SELECT * FROM inventory_items WHERE id = ?', req.params.id);
  if (!it) throw notFound('Stock item');
  const b = parse(invSchema.partial(), req.body);
  const n = { ...it, ...Object.fromEntries(Object.entries(b).filter(([, v]) => v !== undefined)) };
  run('UPDATE inventory_items SET name=?, sku=?, store=?, unit=?, par_level=?, cost=?, supplier=? WHERE id=?', n.name, n.sku, n.store, n.unit, n.par_level, n.cost, n.supplier ?? null, it.id);
  res.json(get('SELECT * FROM inventory_items WHERE id = ?', it.id));
});

office.post('/inventory/:id/movements', requireArea('inventory'), (req, res) => {
  const it = get<any>('SELECT * FROM inventory_items WHERE id = ?', req.params.id);
  if (!it) throw notFound('Stock item');
  const b = parse(z.object({ change: z.number().refine((v) => v !== 0, 'cannot be zero'), reason: z.enum(['purchase', 'usage', 'wastage', 'adjustment']), note: z.string().optional() }), req.body);
  if ((b.reason === 'purchase' && b.change < 0) || ((b.reason === 'usage' || b.reason === 'wastage') && b.change > 0)) throw bad('Quantity direction does not match the movement');
  if (it.qty + b.change < 0) throw conflict(`Only ${it.qty} ${it.unit} on hand`);
  tx(() => {
    run('UPDATE inventory_items SET qty = qty + ? WHERE id = ?', b.change, it.id);
    run('INSERT INTO stock_movements (item_id, change, reason, note, user_id) VALUES (?, ?, ?, ?, ?)', it.id, b.change, b.reason, b.note || null, req.user!.id);
    if (it.qty + b.change <= it.par_level && it.qty > it.par_level) logActivity(req.user!.id, `${it.name} fell below par (${it.qty + b.change} ${it.unit})`, 'office');
  });
  res.status(201).json(get('SELECT * FROM inventory_items WHERE id = ?', it.id));
});

/* ----------------------------------------------------------------- staff */

office.get('/staff', requireArea('staff', 'housekeeping'), (req, res) => {
  const dept = req.query.department ? String(req.query.department) : null;
  res.json(all(`SELECT * FROM staff WHERE (? IS NULL OR department = ?) ORDER BY status = 'inactive', department, name`, dept, dept));
});

const staffSchema = z.object({
  name: z.string().trim().min(1),
  department: z.string().min(1),
  position: z.string().trim().min(1),
  phone: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  status: z.enum(['active', 'leave', 'inactive']).default('active'),
  hired_on: z.string().nullable().optional(),
});

office.post('/staff', requireArea('staff'), (req, res) => {
  const b = parse(staffSchema, req.body);
  const { id } = run('INSERT INTO staff (name, department, position, phone, email, status, hired_on) VALUES (?, ?, ?, ?, ?, ?, ?)', b.name, b.department, b.position, b.phone || null, b.email || null, b.status, b.hired_on || null);
  res.status(201).json(get('SELECT * FROM staff WHERE id = ?', id));
});

office.patch('/staff/:id', requireArea('staff'), (req, res) => {
  const s = get<any>('SELECT * FROM staff WHERE id = ?', req.params.id);
  if (!s) throw notFound('Staff member');
  const b = parse(staffSchema.partial(), req.body);
  const n = { ...s, ...Object.fromEntries(Object.entries(b).filter(([, v]) => v !== undefined)) };
  run('UPDATE staff SET name=?, department=?, position=?, phone=?, email=?, status=?, hired_on=? WHERE id=?', n.name, n.department, n.position, n.phone, n.email, n.status, n.hired_on, s.id);
  if (n.status === 'inactive') run('DELETE FROM shifts WHERE staff_id = ? AND date >= date(\'now\', \'localtime\')', s.id);
  res.json(get('SELECT * FROM staff WHERE id = ?', s.id));
});

office.get('/shifts', requireArea('staff'), (req, res) => {
  const from = String(req.query.from ?? '');
  const to = String(req.query.to ?? '');
  if (!DATE_RE.test(from) || !DATE_RE.test(to)) throw bad('from/to required');
  res.json(all('SELECT sh.*, s.name AS staff_name FROM shifts sh JOIN staff s ON s.id = sh.staff_id WHERE sh.date BETWEEN ? AND ? ORDER BY sh.date, sh.start_time', from, to));
});

office.post('/shifts', requireArea('staff'), (req, res) => {
  const b = parse(
    z.object({
      staff_id: z.number().int(),
      date: z.string().regex(DATE_RE),
      start_time: z.string().regex(TIME_RE),
      end_time: z.string().regex(TIME_RE),
      department: z.string(),
      notes: z.string().optional(),
      repeat_days: z.number().int().min(1).max(14).default(1),
    }),
    req.body,
  );
  const s = get<any>('SELECT * FROM staff WHERE id = ?', b.staff_id);
  if (!s || s.status === 'inactive') throw bad('Staff member is not active');
  let created = 0;
  tx(() => {
    for (let i = 0; i < b.repeat_days; i++) {
      const d = addDays(b.date, i);
      const overlap = get(`SELECT 1 FROM shifts WHERE staff_id = ? AND date = ? AND start_time < ? AND end_time > ?`, s.id, d, b.end_time > b.start_time ? b.end_time : '24:00', b.start_time);
      if (overlap) {
        if (b.repeat_days === 1) throw conflict(`${s.name} already has a shift then`);
        continue;
      }
      run('INSERT INTO shifts (staff_id, date, start_time, end_time, department, notes) VALUES (?, ?, ?, ?, ?, ?)', s.id, d, b.start_time, b.end_time, b.department, b.notes || null);
      created++;
    }
  });
  res.status(201).json({ created });
});

office.delete('/shifts/:id', requireArea('staff'), (req, res) => {
  run('DELETE FROM shifts WHERE id = ?', req.params.id);
  res.json({ ok: true });
});

/* ----------------------------------------------------------------- users */

office.get('/users', requireArea('settings'), (_req, res) => {
  res.json(all('SELECT id, name, email, role, active, created_at FROM users ORDER BY active DESC, name'));
});

office.post('/users', requireArea('settings'), (req, res) => {
  const b = parse(z.object({ name: z.string().trim().min(1), email: z.string().email(), role: z.enum(ROLES as [string, ...string[]]), password: z.string().min(8) }), req.body);
  if (get('SELECT 1 FROM users WHERE email = ?', b.email)) throw conflict('That email already has an account');
  const { id } = run('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)', b.name, b.email, hashPassword(b.password), b.role);
  res.status(201).json(get('SELECT id, name, email, role, active FROM users WHERE id = ?', id));
});

office.patch('/users/:id', requireArea('settings'), (req, res) => {
  const u = get<any>('SELECT * FROM users WHERE id = ?', req.params.id);
  if (!u) throw notFound('User');
  const b = parse(z.object({ role: z.enum(ROLES as [string, ...string[]]).optional(), active: z.number().int().min(0).max(1).optional(), password: z.string().min(8).optional(), name: z.string().optional() }), req.body);
  if (u.id === req.user!.id && (b.role || b.active === 0)) throw conflict('You cannot change your own role or disable yourself');
  run(
    'UPDATE users SET role = COALESCE(?, role), active = COALESCE(?, active), name = COALESCE(?, name), password_hash = COALESCE(?, password_hash) WHERE id = ?',
    b.role,
    b.active,
    b.name,
    b.password ? hashPassword(b.password) : null,
    u.id,
  );
  res.json(get('SELECT id, name, email, role, active FROM users WHERE id = ?', u.id));
});

/* -------------------------------------------------------------- feedback */

office.get('/feedback', requireArea('settings'), (_req, res) => {
  res.json(all('SELECT * FROM feedback ORDER BY created_at DESC, id DESC LIMIT 1000'));
});

/* -------------------------------------------------------------- settings */

export const SETTING_KEYS = ['property_name', 'currency', 'vat_rate', 'service_rate', 'address', 'phone', 'email', 'check_in_time', 'check_out_time'] as const;

export function readSettings() {
  const rows = all<{ key: string; value: string }>('SELECT key, value FROM settings');
  return Object.fromEntries(rows.filter((r) => (SETTING_KEYS as readonly string[]).includes(r.key)).map((r) => [r.key, r.value]));
}

office.get('/settings', (_req, res) => res.json(readSettings()));

office.put('/settings', requireArea('settings'), (req, res) => {
  const b = parse(z.record(z.string(), z.union([z.string(), z.number()])), req.body);
  tx(() => {
    for (const k of SETTING_KEYS) {
      if (b[k] !== undefined) run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', k, String(b[k]));
    }
  });
  res.json(readSettings());
});
