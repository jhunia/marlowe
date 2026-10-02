import { Router, type Request } from 'express';
import { z } from 'zod';
import { all, get, logActivity, run, scalar, tx } from '../db.ts';
import { assertArea, isManager } from '../auth.ts';
import { outletArea } from '../permissions.ts';
import { bad, conflict, DATE_RE, makeCode, notFound, parse, round2, TIME_RE, today } from '../util.ts';
import { addItem, ORDER_SQL, orderDetail, recalc } from '../services/orders.ts';
import { chargeToRoom } from '../services/hotel.ts';

export const dining = Router();
const outletEnum = z.enum(['restaurant', 'rooftop']);
const outletOf = (req: Request) => outletEnum.parse(req.query.outlet ?? 'restaurant');
const venueName = (o: string) => (o === 'rooftop' ? 'rooftop' : 'restaurant') as 'rooftop' | 'restaurant';

function loadOrder(req: Request) {
  const o = get<any>('SELECT * FROM orders WHERE id = ?', req.params.id);
  if (!o) throw notFound('Check');
  assertArea(req, outletArea(o.outlet));
  return o;
}

/* ------------------------------------------------------------------ menu */

dining.get('/menu/categories', (req, res) => {
  const outlet = outletOf(req);
  res.json(all('SELECT * FROM menu_categories WHERE outlet = ? ORDER BY sort, id', outlet));
});

dining.post('/menu/categories', (req, res) => {
  const b = parse(z.object({ outlet: outletEnum, name: z.string().trim().min(1) }), req.body);
  assertArea(req, outletArea(b.outlet));
  const sort = scalar<number>('SELECT COALESCE(MAX(sort), 0) + 1 FROM menu_categories WHERE outlet = ?', b.outlet);
  const { id } = run('INSERT INTO menu_categories (outlet, name, sort) VALUES (?, ?, ?)', b.outlet, b.name, sort);
  res.status(201).json(get('SELECT * FROM menu_categories WHERE id = ?', id));
});

dining.get('/menu/items', (req, res) => {
  const outlet = outletOf(req);
  res.json(
    all(
      `SELECT m.*, c.name AS category_name FROM menu_items m JOIN menu_categories c ON c.id = m.category_id
        WHERE m.outlet = ? AND m.deleted = 0 ORDER BY c.sort, m.name`,
      outlet,
    ),
  );
});

const itemSchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().nullable().optional(),
  price: z.number().min(0),
  category_id: z.number().int(),
  station: z.enum(['kitchen', 'bar']),
  available: z.number().int().min(0).max(1).default(1),
  image_url: z.string().url('must be a full https:// link').nullable().optional().or(z.literal('')),
});

dining.post('/menu/items', (req, res) => {
  const b = parse(itemSchema.extend({ outlet: outletEnum }), req.body);
  assertArea(req, outletArea(b.outlet));
  const { id } = run(
    'INSERT INTO menu_items (category_id, outlet, name, description, price, available, station, image_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    b.category_id,
    b.outlet,
    b.name,
    b.description || null,
    b.price,
    b.available,
    b.station,
    b.image_url || null,
  );
  res.status(201).json(get('SELECT * FROM menu_items WHERE id = ?', id));
});

dining.patch('/menu/items/:id', (req, res) => {
  const m = get<any>('SELECT * FROM menu_items WHERE id = ?', req.params.id);
  if (!m) throw notFound('Menu item');
  assertArea(req, outletArea(m.outlet));
  const b = parse(itemSchema.partial(), req.body);
  const next = { ...m, ...b };
  run('UPDATE menu_items SET name=?, description=?, price=?, category_id=?, station=?, available=?, image_url=? WHERE id=?', next.name, next.description ?? null, next.price, next.category_id, next.station, next.available, next.image_url || null, m.id);
  if (b.available !== undefined && b.available !== m.available) logActivity(req.user!.id, `${m.name} ${b.available ? 'back on' : "86'd"}`, venueName(m.outlet));
  res.json(get('SELECT * FROM menu_items WHERE id = ?', m.id));
});

dining.delete('/menu/items/:id', (req, res) => {
  const m = get<any>('SELECT * FROM menu_items WHERE id = ?', req.params.id);
  if (!m) throw notFound('Menu item');
  assertArea(req, outletArea(m.outlet));
  run('UPDATE menu_items SET deleted = 1, available = 0 WHERE id = ?', m.id);
  res.json({ ok: true });
});

/* ---------------------------------------------------------------- tables */

dining.get('/tables', (req, res) => {
  const outlet = outletOf(req);
  assertArea(req, outletArea(outlet));
  res.json(
    all(
      `SELECT t.*, o.id AS order_id, o.total AS order_total, o.created_at AS opened_at, o.covers
         FROM dining_tables t LEFT JOIN orders o ON o.table_id = t.id AND o.status = 'open'
        WHERE t.outlet = ? ORDER BY t.id`,
      outlet,
    ),
  );
});

dining.patch('/tables/:id', (req, res) => {
  const t = get<any>('SELECT * FROM dining_tables WHERE id = ?', req.params.id);
  if (!t) throw notFound('Table');
  assertArea(req, outletArea(t.outlet));
  const b = parse(z.object({ status: z.enum(['free', 'reserved', 'dirty']) }), req.body);
  if (get(`SELECT 1 FROM orders WHERE table_id = ? AND status = 'open'`, t.id)) throw conflict('Table has an open check');
  run('UPDATE dining_tables SET status = ? WHERE id = ?', b.status, t.id);
  res.json(get('SELECT * FROM dining_tables WHERE id = ?', t.id));
});

/* ---------------------------------------------------------------- orders */

dining.get('/orders', (req, res) => {
  const outlet = outletOf(req);
  assertArea(req, outletArea(outlet));
  const status = req.query.status ? String(req.query.status) : null;
  res.json(all(`${ORDER_SQL} WHERE o.outlet = ? AND (? IS NULL OR o.status = ?) ORDER BY o.created_at DESC LIMIT 200`, outlet, status, status));
});

dining.get('/orders/summary', (req, res) => {
  const outlet = outletOf(req);
  assertArea(req, outletArea(outlet));
  const t = today();
  const s = get<any>(
    `SELECT COALESCE(SUM(total),0) AS revenue, COUNT(*) AS checks FROM orders
      WHERE outlet = ? AND status IN ('paid','charged') AND date(closed_at, 'localtime') = ?`,
    outlet,
    t,
  );
  const covers = scalar<number>(`SELECT COALESCE(SUM(covers),0) FROM orders WHERE outlet = ? AND status != 'void' AND date(created_at, 'localtime') = ?`, outlet, t);
  res.json({ revenue: round2(s.revenue), checks: s.checks, covers, avg: s.checks ? round2(s.revenue / s.checks) : 0 });
});

dining.post('/orders', (req, res) => {
  const b = parse(
    z.object({ outlet: outletEnum, table_id: z.number().int().nullable().optional(), covers: z.number().int().min(1).default(1), guest_name: z.string().optional() }),
    req.body,
  );
  assertArea(req, outletArea(b.outlet));
  const id = tx(() => {
    if (b.table_id) {
      const t = get<any>('SELECT * FROM dining_tables WHERE id = ?', b.table_id);
      if (!t || t.outlet !== b.outlet) throw bad('Unknown table');
      if (get(`SELECT 1 FROM orders WHERE table_id = ? AND status = 'open'`, t.id)) throw conflict(`Table ${t.label} already has an open check`);
      run(`UPDATE dining_tables SET status = 'seated' WHERE id = ?`, t.id);
    } else if (!b.guest_name?.trim()) throw bad('Give the tab a name');
    return run(
      'INSERT INTO orders (code, outlet, table_id, guest_name, covers, opened_by) VALUES (?, ?, ?, ?, ?, ?)',
      makeCode(b.outlet === 'rooftop' ? 'SK' : 'ES', 'orders'),
      b.outlet,
      b.table_id ?? null,
      b.guest_name?.trim() || null,
      b.covers,
      req.user!.id,
    ).id;
  });
  res.status(201).json(orderDetail(id));
});

dining.get('/orders/:id', (req, res) => {
  loadOrder(req);
  res.json(orderDetail(req.params.id));
});

dining.post('/orders/:id/items', (req, res) => {
  const o = loadOrder(req);
  if (o.status !== 'open') throw conflict('Check is closed');
  const b = parse(z.object({ menu_item_id: z.number().int(), qty: z.number().int().min(1).default(1), notes: z.string().optional() }), req.body);
  const m = get<any>('SELECT * FROM menu_items WHERE id = ? AND deleted = 0', b.menu_item_id);
  if (!m || m.outlet !== o.outlet) throw bad('Item is not on this menu');
  if (!m.available) throw conflict(`${m.name} is 86'd`);
  tx(() => addItem(o.id, m.id, b.qty, b.notes?.trim() || null, false));
  res.status(201).json(orderDetail(o.id));
});

dining.patch('/orders/:id/items/:itemId', (req, res) => {
  const o = loadOrder(req);
  if (o.status !== 'open') throw conflict('Check is closed');
  const it = get<any>('SELECT * FROM order_items WHERE id = ? AND order_id = ?', req.params.itemId, o.id);
  if (!it) throw notFound('Line');
  const b = parse(z.object({ qty: z.number().int().min(1).optional(), notes: z.string().optional(), status: z.literal('void').optional() }), req.body);
  if (b.status === 'void') {
    if (it.status === 'void') throw conflict('Already voided');
    if (it.status !== 'pending' && !isManager(req)) throw conflict('A manager must void items already sent');
    run(`UPDATE order_items SET status = 'void' WHERE id = ?`, it.id);
    logActivity(req.user!.id, `Voided ${it.qty}× ${it.name} on ${o.code}`, venueName(o.outlet));
  } else {
    if (it.status !== 'pending') throw conflict('Item already sent — void it instead');
    run('UPDATE order_items SET qty = COALESCE(?, qty), notes = CASE WHEN ? THEN ? ELSE notes END WHERE id = ?', b.qty, b.notes !== undefined, b.notes?.trim() || null, it.id);
  }
  recalc(o.id);
  res.json(orderDetail(o.id));
});

dining.delete('/orders/:id/items/:itemId', (req, res) => {
  const o = loadOrder(req);
  const it = get<any>('SELECT * FROM order_items WHERE id = ? AND order_id = ?', req.params.itemId, o.id);
  if (!it) throw notFound('Line');
  if (o.status !== 'open' || it.status !== 'pending') throw conflict('Only unsent items can be removed');
  run('DELETE FROM order_items WHERE id = ?', it.id);
  recalc(o.id);
  res.json(orderDetail(o.id));
});

dining.post('/orders/:id/fire', (req, res) => {
  const o = loadOrder(req);
  if (o.status !== 'open') throw conflict('Check is closed');
  const n = run(`UPDATE order_items SET status = 'fired', fired_at = datetime('now') WHERE order_id = ? AND status = 'pending'`, o.id).changes;
  if (!n) throw conflict('Nothing new to send');
  res.json(orderDetail(o.id));
});

dining.post('/orders/:id/pay', (req, res) => {
  const o = loadOrder(req);
  if (o.status !== 'open') throw conflict('Check is already closed');
  const b = parse(z.object({ method: z.enum(['cash', 'card', 'momo', 'transfer', 'room']), reservation_id: z.number().int().optional(), reference: z.string().max(60).optional() }), req.body);
  if (get(`SELECT 1 FROM order_items WHERE order_id = ? AND status = 'pending'`, o.id)) throw conflict('Send pending items before settling');
  recalc(o.id);
  const fresh = get<any>('SELECT * FROM orders WHERE id = ?', o.id);
  if (fresh.total <= 0) throw conflict('Nothing to settle');
  const outletLabel = o.outlet === 'rooftop' ? 'Skydeck bar' : 'Ember & Salt';

  tx(() => {
    if (b.method === 'room') {
      if (!b.reservation_id) throw bad('Choose the room to charge');
      chargeToRoom(b.reservation_id, o.outlet === 'rooftop' ? 'bar' : 'restaurant', `${outletLabel} · check ${o.code}`, fresh.total, o.code, req.user!.id);
      run(`UPDATE orders SET status = 'charged', payment_method = 'room', reservation_id = ?, closed_at = datetime('now') WHERE id = ?`, b.reservation_id, o.id);
    } else {
      run(`UPDATE orders SET status = 'paid', payment_method = ?, closed_at = datetime('now') WHERE id = ?`, b.method, o.id);
      run('INSERT INTO payments (order_id, amount, method, reference, created_by) VALUES (?, ?, ?, ?, ?)', o.id, fresh.total, b.method, b.reference || null, req.user!.id);
    }
    if (o.table_id) run(`UPDATE dining_tables SET status = 'dirty' WHERE id = ?`, o.table_id);
    run(`UPDATE table_bookings SET status = 'completed' WHERE table_id = ? AND status = 'seated'`, o.table_id);
    logActivity(req.user!.id, `${outletLabel} ${o.code} settled — ${b.method === 'room' ? 'charged to room' : b.method}`, venueName(o.outlet));
  });
  res.json(orderDetail(o.id));
});

dining.post('/orders/:id/void', (req, res) => {
  const o = loadOrder(req);
  if (o.status !== 'open') throw conflict('Check is already closed');
  const sent = scalar<number>(`SELECT COUNT(*) FROM order_items WHERE order_id = ? AND status IN ('fired','ready','served')`, o.id);
  if (sent && !isManager(req)) throw conflict('Items were already sent — a manager must void this check');
  tx(() => {
    run(`UPDATE order_items SET status = 'void' WHERE order_id = ?`, o.id);
    run(`UPDATE orders SET status = 'void', closed_at = datetime('now') WHERE id = ?`, o.id);
    recalc(o.id);
    if (o.table_id) run(`UPDATE dining_tables SET status = ? WHERE id = ?`, sent ? 'dirty' : 'free', o.table_id);
    logActivity(req.user!.id, `Check ${o.code} voided`, venueName(o.outlet));
  });
  res.json(orderDetail(o.id));
});

/* --------------------------------------------------------------- kitchen */

dining.get('/kitchen', (req, res) => {
  const outlet = outletOf(req);
  assertArea(req, outletArea(outlet));
  const station = req.query.station === 'kitchen' || req.query.station === 'bar' ? String(req.query.station) : null;
  const items = all<any>(
    `SELECT i.* FROM order_items i JOIN orders o ON o.id = i.order_id
      WHERE o.outlet = ? AND o.status != 'void' AND i.status IN ('fired','ready') AND (? IS NULL OR i.station = ?)
      ORDER BY i.fired_at, i.id`,
    outlet,
    station,
    station,
  );
  const ids = [...new Set(items.map((i) => i.order_id))];
  const orders = ids.map((id) => ({ ...get(`${ORDER_SQL} WHERE o.id = ?`, id), items: items.filter((i) => i.order_id === id) }));
  res.json(orders);
});

dining.post('/kitchen/items/:id/toggle', (req, res) => {
  const it = get<any>('SELECT i.*, o.outlet FROM order_items i JOIN orders o ON o.id = i.order_id WHERE i.id = ?', req.params.id);
  if (!it) throw notFound('Item');
  assertArea(req, outletArea(it.outlet));
  if (it.status !== 'fired' && it.status !== 'ready') throw conflict('Item is not on the pass');
  run('UPDATE order_items SET status = ? WHERE id = ?', it.status === 'fired' ? 'ready' : 'fired', it.id);
  res.json({ ok: true });
});

dining.post('/kitchen/orders/:id/bump', (req, res) => {
  const o = loadOrder(req);
  const station = req.query.station === 'kitchen' || req.query.station === 'bar' ? String(req.query.station) : null;
  run(`UPDATE order_items SET status = 'served' WHERE order_id = ? AND status IN ('fired','ready') AND (? IS NULL OR station = ?)`, o.id, station, station);
  res.json({ ok: true });
});

/* -------------------------------------------------------- table bookings */

const BOOKING_SQL = `SELECT b.*, t.label AS table_label FROM table_bookings b LEFT JOIN dining_tables t ON t.id = b.table_id`;

dining.get('/table-bookings', (req, res) => {
  const outlet = outletOf(req);
  assertArea(req, outletArea(outlet));
  const date = DATE_RE.test(String(req.query.date)) ? String(req.query.date) : today();
  res.json(all(`${BOOKING_SQL} WHERE b.outlet = ? AND b.date = ? ORDER BY b.time`, outlet, date));
});

dining.post('/table-bookings', (req, res) => {
  const b = parse(
    z.object({
      outlet: outletEnum,
      guest_name: z.string().trim().min(1),
      phone: z.string().optional(),
      party_size: z.number().int().min(1),
      date: z.string().regex(DATE_RE),
      time: z.string().regex(TIME_RE),
      table_id: z.number().int().nullable().optional(),
      notes: z.string().optional(),
    }),
    req.body,
  );
  assertArea(req, outletArea(b.outlet));
  if (b.table_id) checkTableSlot(b.table_id, b.date, b.time, 0, b.party_size);
  const { id } = run(
    'INSERT INTO table_bookings (outlet, guest_name, phone, party_size, date, time, table_id, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    b.outlet,
    b.guest_name,
    b.phone || null,
    b.party_size,
    b.date,
    b.time,
    b.table_id ?? null,
    b.notes || null,
  );
  logActivity(req.user!.id, `Table for ${b.party_size} booked — ${b.guest_name}, ${b.date} ${b.time}`, 'restaurant');
  res.status(201).json(get(`${BOOKING_SQL} WHERE b.id = ?`, id));
});

/** A table can hold one booking within a 2-hour window. */
export function checkTableSlot(tableId: number, date: string, time: string, exceptId: number, party: number) {
  const t = get<any>('SELECT * FROM dining_tables WHERE id = ?', tableId);
  if (!t) throw bad('Unknown table');
  if (t.seats < party) throw conflict(`Table ${t.label} seats ${t.seats}`);
  const toMin = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
  const clash = all<any>(`SELECT * FROM table_bookings WHERE table_id = ? AND date = ? AND id != ? AND status IN ('booked','seated')`, tableId, date, exceptId).find(
    (x) => Math.abs(toMin(x.time) - toMin(time)) < 120,
  );
  if (clash) throw conflict(`Table ${t.label} is held for ${clash.guest_name} at ${clash.time}`);
}

dining.patch('/table-bookings/:id', (req, res) => {
  const bk = get<any>('SELECT * FROM table_bookings WHERE id = ?', req.params.id);
  if (!bk) throw notFound('Booking');
  assertArea(req, outletArea(bk.outlet));
  const b = parse(z.object({ status: z.enum(['booked', 'cancelled', 'no_show', 'completed']).optional(), table_id: z.number().int().nullable().optional() }), req.body);
  if (b.table_id) checkTableSlot(b.table_id, bk.date, bk.time, bk.id, bk.party_size);
  run('UPDATE table_bookings SET status = COALESCE(?, status), table_id = CASE WHEN ? THEN ? ELSE table_id END WHERE id = ?', b.status, b.table_id !== undefined, b.table_id ?? null, bk.id);
  res.json(get(`${BOOKING_SQL} WHERE b.id = ?`, bk.id));
});

dining.post('/table-bookings/:id/seat', (req, res) => {
  const bk = get<any>('SELECT * FROM table_bookings WHERE id = ?', req.params.id);
  if (!bk) throw notFound('Booking');
  assertArea(req, outletArea(bk.outlet));
  if (bk.status !== 'booked') throw conflict('Booking is not waiting to be seated');
  if (!bk.table_id) throw bad('Assign a table first');
  const id = tx(() => {
    if (get(`SELECT 1 FROM orders WHERE table_id = ? AND status = 'open'`, bk.table_id)) throw conflict('That table still has an open check');
    run(`UPDATE dining_tables SET status = 'seated' WHERE id = ?`, bk.table_id);
    run(`UPDATE table_bookings SET status = 'seated' WHERE id = ?`, bk.id);
    return run(
      'INSERT INTO orders (code, outlet, table_id, guest_name, covers, opened_by) VALUES (?, ?, ?, ?, ?, ?)',
      makeCode('ES', 'orders'),
      bk.outlet,
      bk.table_id,
      bk.guest_name,
      bk.party_size,
      req.user!.id,
    ).id;
  });
  res.status(201).json(orderDetail(id));
});
