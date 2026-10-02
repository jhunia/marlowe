import { Router } from 'express';
import { z } from 'zod';
import { all, get, logActivity, run, tx } from '../db.ts';
import { requireArea } from '../auth.ts';
import { bad, conflict, DATE_RE, notFound, parse, TIME_RE, today } from '../util.ts';
import { chargeToRoom } from '../services/hotel.ts';

export const rooftop = Router();

/* ------------------------------------------------------ pool & cabanas */

rooftop.get('/resources', (req, res) => {
  const venue = String(req.query.venue ?? 'rooftop');
  res.json(all('SELECT * FROM resources WHERE venue = ? ORDER BY kind, id', venue));
});

export const RB_SQL = `
  SELECT b.*, r.label AS resource_label, r.kind, rm.number AS room_number
    FROM resource_bookings b JOIN resources r ON r.id = b.resource_id
    LEFT JOIN reservations x ON x.id = b.reservation_id LEFT JOIN rooms rm ON rm.id = x.room_id`;

rooftop.get('/resource-bookings', requireArea('pool'), (req, res) => {
  const date = DATE_RE.test(String(req.query.date)) ? String(req.query.date) : today();
  res.json(all(`${RB_SQL} WHERE b.date = ? ORDER BY b.start_time`, date));
});

/** Throws if the resource is taken in the time window or too small. */
export function checkResourceSlot(resourceId: number, date: string, start: string, end: string, pax: number, exceptId = 0) {
  const r = get<any>('SELECT * FROM resources WHERE id = ?', resourceId);
  if (!r) throw bad('Unknown space');
  if (end <= start) throw bad('End time must be after start time');
  if (pax > r.capacity) throw conflict(`${r.label} takes up to ${r.capacity} guests`);
  const clash = get<any>(
    `SELECT * FROM resource_bookings WHERE resource_id = ? AND date = ? AND id != ? AND status != 'cancelled'
       AND start_time < ? AND end_time > ?`,
    resourceId,
    date,
    exceptId,
    end,
    start,
  );
  if (clash) throw conflict(`${r.label} is already booked ${clash.start_time}–${clash.end_time}`);
  return r;
}

const rbSchema = z.object({
  resource_id: z.number().int(),
  guest_name: z.string().trim().min(1),
  reservation_id: z.number().int().nullable().optional(),
  date: z.string().regex(DATE_RE),
  start_time: z.string().regex(TIME_RE),
  end_time: z.string().regex(TIME_RE),
  pax: z.number().int().min(1),
  price: z.number().min(0),
  settlement: z.enum(['unpaid', 'paid', 'room']).default('unpaid'),
  notes: z.string().nullable().optional(),
});

rooftop.post('/resource-bookings', requireArea('pool'), (req, res) => {
  const b = parse(rbSchema, req.body);
  const id = tx(() => {
    const r = checkResourceSlot(b.resource_id, b.date, b.start_time, b.end_time, b.pax);
    const { id } = run(
      `INSERT INTO resource_bookings (resource_id, guest_name, reservation_id, date, start_time, end_time, pax, price, settlement, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      b.resource_id,
      b.guest_name,
      b.reservation_id ?? null,
      b.date,
      b.start_time,
      b.end_time,
      b.pax,
      b.price,
      b.settlement,
      b.notes || null,
    );
    settle(id, b.settlement, b.reservation_id ?? null, b.price, r.label, req.user!.id);
    logActivity(req.user!.id, `${r.label} booked for ${b.guest_name} (${b.date})`, 'rooftop');
    return id;
  });
  res.status(201).json(get(`${RB_SQL} WHERE b.id = ?`, id));
});

function settle(id: number, settlement: string, resId: number | null, price: number, label: string, userId: number) {
  if (settlement === 'room') {
    if (!resId) throw bad('Link an in-house guest to charge the room');
    if (price > 0) chargeToRoom(resId, 'pool', `Skydeck ${label}`, price, `RB-${id}`, userId);
  } else if (settlement === 'paid' && price > 0) {
    run(`INSERT INTO payments (resource_booking_id, amount, method, created_by) VALUES (?, ?, 'card', ?)`, id, price, userId);
  }
}

rooftop.patch('/resource-bookings/:id', requireArea('pool'), (req, res) => {
  const bk = get<any>(`${RB_SQL} WHERE b.id = ?`, req.params.id);
  if (!bk) throw notFound('Booking');
  const b = parse(rbSchema.partial().extend({ status: z.enum(['booked', 'arrived', 'completed', 'cancelled']).optional() }), req.body);
  if (bk.status === 'cancelled' || bk.status === 'completed') throw conflict('Booking is closed');

  tx(() => {
    const next = { ...bk, ...Object.fromEntries(Object.entries(b).filter(([, v]) => v !== undefined)) };
    if (bk.settlement !== 'unpaid') {
      // money has moved — freeze the commercial terms
      next.price = bk.price;
      next.settlement = bk.settlement;
      next.reservation_id = bk.reservation_id;
    }
    if (next.status !== 'cancelled') checkResourceSlot(next.resource_id, next.date, next.start_time, next.end_time, next.pax, bk.id);
    run(
      `UPDATE resource_bookings SET resource_id=?, guest_name=?, reservation_id=?, date=?, start_time=?, end_time=?, pax=?, price=?, settlement=?, status=?, notes=? WHERE id=?`,
      next.resource_id,
      next.guest_name,
      next.reservation_id ?? null,
      next.date,
      next.start_time,
      next.end_time,
      next.pax,
      next.price,
      next.settlement,
      next.status,
      next.notes ?? null,
      bk.id,
    );
    if (bk.settlement === 'unpaid' && next.settlement !== 'unpaid') settle(bk.id, next.settlement, next.reservation_id, next.price, bk.resource_label, req.user!.id);
    if (next.status === 'cancelled' && bk.settlement === 'room' && bk.reservation_id) {
      const r = get<any>('SELECT status FROM reservations WHERE id = ?', bk.reservation_id);
      if (r?.status === 'checked_in') chargeToRoom(bk.reservation_id, 'pool', `Reversal · Skydeck ${bk.resource_label} cancelled`, -bk.price, `RB-${bk.id}`, req.user!.id);
    }
    if (next.status !== bk.status) logActivity(req.user!.id, `${bk.resource_label} · ${bk.guest_name} ${next.status}`, 'rooftop');
  });
  res.json(get(`${RB_SQL} WHERE b.id = ?`, bk.id));
});

/* ----------------------------------------------------------- club nights */

const NIGHT_SQL = `
  SELECT n.*,
    (SELECT COUNT(*) FROM guest_list g WHERE g.night_id = n.id) AS list_count,
    (SELECT COALESCE(SUM(pax),0) FROM guest_list g WHERE g.night_id = n.id) AS list_pax,
    (SELECT COALESCE(SUM(pax),0) FROM guest_list g WHERE g.night_id = n.id AND g.checked_in = 1) AS checked_in_pax,
    (SELECT COALESCE(SUM(pax),0) FROM guest_list g WHERE g.night_id = n.id AND g.checked_in = 1 AND g.cover_paid = 1) * n.cover_charge AS cover_revenue
  FROM club_nights n`;

rooftop.get('/club-nights', requireArea('club', 'events'), (req, res) => {
  const from = DATE_RE.test(String(req.query.from)) ? String(req.query.from) : '0000-00-00';
  const to = DATE_RE.test(String(req.query.to)) ? String(req.query.to) : '9999-12-31';
  res.json(all(`${NIGHT_SQL} WHERE n.date BETWEEN ? AND ? ORDER BY n.date DESC`, from, to));
});

const nightSchema = z.object({
  title: z.string().trim().min(1),
  date: z.string().regex(DATE_RE),
  dj: z.string().optional(),
  cover_charge: z.number().min(0),
  capacity: z.number().int().min(1),
  notes: z.string().optional(),
});

rooftop.post('/club-nights', requireArea('club'), (req, res) => {
  const b = parse(nightSchema, req.body);
  const { id } = run('INSERT INTO club_nights (title, date, dj, cover_charge, capacity, notes) VALUES (?, ?, ?, ?, ?, ?)', b.title, b.date, b.dj || null, b.cover_charge, b.capacity, b.notes || null);
  logActivity(req.user!.id, `Club night “${b.title}” scheduled for ${b.date}`, 'rooftop');
  res.status(201).json(get(`${NIGHT_SQL} WHERE n.id = ?`, id));
});

function nightDetail(id: number | string) {
  const n = get(`${NIGHT_SQL} WHERE n.id = ?`, id);
  if (!n) throw notFound('Club night');
  return { ...n, guests: all('SELECT * FROM guest_list WHERE night_id = ? ORDER BY checked_in, name', id) };
}

rooftop.get('/club-nights/:id', requireArea('club'), (req, res) => res.json(nightDetail(req.params.id)));

rooftop.patch('/club-nights/:id', requireArea('club'), (req, res) => {
  const n = get<any>('SELECT * FROM club_nights WHERE id = ?', req.params.id);
  if (!n) throw notFound('Club night');
  const b = parse(nightSchema.partial().extend({ status: z.enum(['scheduled', 'live', 'closed', 'cancelled']).optional() }), req.body);
  if (b.status === 'live' && n.date !== today()) throw conflict('Doors can only open on the night itself');
  const next = { ...n, ...Object.fromEntries(Object.entries(b).filter(([, v]) => v !== undefined)) };
  run('UPDATE club_nights SET title=?, date=?, dj=?, cover_charge=?, capacity=?, status=?, notes=? WHERE id=?', next.title, next.date, next.dj, next.cover_charge, next.capacity, next.status, next.notes, n.id);
  if (b.status) logActivity(req.user!.id, `${n.title}: ${b.status === 'live' ? 'doors open' : b.status}`, 'rooftop');
  res.json(nightDetail(n.id));
});

function insideCount(nightId: number) {
  return get<{ c: number }>('SELECT COALESCE(SUM(pax),0) AS c FROM guest_list WHERE night_id = ? AND checked_in = 1', nightId)!.c;
}

rooftop.post('/club-nights/:id/guests', requireArea('club'), (req, res) => {
  const n = get<any>('SELECT * FROM club_nights WHERE id = ?', req.params.id);
  if (!n) throw notFound('Club night');
  if (n.status === 'closed' || n.status === 'cancelled') throw conflict('This night is closed');
  const b = parse(
    z.object({ name: z.string().trim().min(1), pax: z.number().int().min(1).max(20), type: z.enum(['guestlist', 'vip', 'table', 'walk_in']), notes: z.string().optional(), walk_in: z.boolean().optional() }),
    req.body,
  );
  if (b.walk_in) {
    if (n.status !== 'live') throw conflict('Open the doors first');
    if (insideCount(n.id) + b.pax > n.capacity) throw conflict('At capacity — one in, one out');
  }
  const { id } = run(
    `INSERT INTO guest_list (night_id, name, pax, type, notes, checked_in, checked_in_at, cover_paid)
     VALUES (?, ?, ?, ?, ?, ?, CASE WHEN ? THEN datetime('now') END, ?)`,
    n.id,
    b.name,
    b.pax,
    b.walk_in ? 'walk_in' : b.type,
    b.notes || null,
    b.walk_in ? 1 : 0,
    !!b.walk_in,
    b.walk_in ? 1 : 0,
  );
  res.status(201).json(get('SELECT * FROM guest_list WHERE id = ?', id));
});

rooftop.patch('/guest-list/:id', requireArea('club'), (req, res) => {
  const g = get<any>('SELECT g.*, n.status AS night_status, n.capacity FROM guest_list g JOIN club_nights n ON n.id = g.night_id WHERE g.id = ?', req.params.id);
  if (!g) throw notFound('Guest');
  const b = parse(z.object({ checked_in: z.number().int().min(0).max(1).optional(), cover_paid: z.number().int().min(0).max(1).optional() }), req.body);
  if (g.night_status === 'closed' || g.night_status === 'cancelled') throw conflict('This night is closed');
  if (b.checked_in === 1 && !g.checked_in) {
    if (g.night_status !== 'live') throw conflict('Open the doors first');
    if (insideCount(g.night_id) + g.pax > g.capacity) throw conflict('At capacity — one in, one out');
  }
  run(
    `UPDATE guest_list SET checked_in = COALESCE(?, checked_in), cover_paid = COALESCE(?, cover_paid),
       checked_in_at = CASE WHEN ? = 1 AND checked_in = 0 THEN datetime('now') WHEN ? = 0 THEN NULL ELSE checked_in_at END WHERE id = ?`,
    b.checked_in,
    b.checked_in === 0 ? 0 : b.cover_paid,
    b.checked_in ?? -1,
    b.checked_in ?? -1,
    g.id,
  );
  res.json(get('SELECT * FROM guest_list WHERE id = ?', g.id));
});
