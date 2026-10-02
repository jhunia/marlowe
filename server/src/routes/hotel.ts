import { Router } from 'express';
import { z } from 'zod';
import { all, get, logActivity, run, scalar, tx, withImages } from '../db.ts';
import { requireArea } from '../auth.ts';
import { addDays, bad, conflict, DATE_RE, notFound, parse, round2, today } from '../util.ts';
import {
  availability,
  createReservation,
  findOrCreateGuest,
  folioTotals,
  postRoomNights,
  removeRoomNightsFrom,
  roomIsFree,
} from '../services/hotel.ts';

export const hotel = Router();
const date = z.string().regex(DATE_RE, 'must be a date');

/* ------------------------------------------------------------ room types */

hotel.get('/room-types', (_req, res) => {
  res.json(all(`SELECT t.*, (SELECT COUNT(*) FROM rooms r WHERE r.room_type_id = t.id) AS room_count FROM room_types t ORDER BY base_rate`).map(withImages));
});

hotel.post('/room-types', requireArea('settings'), (req, res) => {
  const b = parse(z.object({ name: z.string().min(1), code: z.string().min(1).max(6), base_rate: z.number().min(0), capacity: z.number().int().min(1), description: z.string().default(''), images: z.array(z.string().url()).max(8).default([]) }), req.body);
  if (get('SELECT 1 FROM room_types WHERE code = ?', b.code)) throw conflict('That code is already used');
  const { id } = run('INSERT INTO room_types (name, code, base_rate, capacity, description, images) VALUES (?, ?, ?, ?, ?, ?)', b.name, b.code, b.base_rate, b.capacity, b.description, JSON.stringify(b.images));
  res.status(201).json(withImages(get('SELECT * FROM room_types WHERE id = ?', id)));
});

hotel.patch('/room-types/:id', requireArea('settings'), (req, res) => {
  const b = parse(z.object({ base_rate: z.number().min(0).optional(), name: z.string().min(1).optional(), description: z.string().optional(), images: z.array(z.string().url('must be a full https:// link')).max(8).optional() }), req.body);
  const t = get('SELECT * FROM room_types WHERE id = ?', req.params.id);
  if (!t) throw notFound('Room type');
  run(
    'UPDATE room_types SET base_rate = COALESCE(?, base_rate), name = COALESCE(?, name), description = COALESCE(?, description), images = COALESCE(?, images) WHERE id = ?',
    b.base_rate,
    b.name,
    b.description,
    b.images ? JSON.stringify(b.images) : null,
    req.params.id,
  );
  res.json(withImages(get('SELECT * FROM room_types WHERE id = ?', req.params.id)));
});

/* ----------------------------------------------------------------- rooms */

const ROOM_SQL = `
  SELECT r.*, t.name AS type_name, t.code AS type_code, t.base_rate,
    (SELECT g.first_name || ' ' || g.last_name FROM reservations x JOIN guests g ON g.id = x.guest_id
       WHERE x.room_id = r.id AND x.status = 'checked_in' LIMIT 1) AS guest_name,
    (SELECT x.id FROM reservations x WHERE x.room_id = r.id AND x.status = 'checked_in' LIMIT 1) AS reservation_id,
    (SELECT x.check_out FROM reservations x WHERE x.room_id = r.id AND x.status = 'checked_in' LIMIT 1) AS check_out,
    (SELECT g.first_name || ' ' || g.last_name FROM reservations x JOIN guests g ON g.id = x.guest_id
       WHERE x.room_id = r.id AND x.status = 'booked' AND x.check_in = ? LIMIT 1) AS arriving
  FROM rooms r JOIN room_types t ON t.id = r.room_type_id`;

hotel.get('/rooms', requireArea('rooms', 'front_office'), (req, res) => {
  const type = req.query.type ? Number(req.query.type) : null;
  res.json(all(`${ROOM_SQL} ${type ? 'WHERE r.room_type_id = ?' : ''} ORDER BY r.floor, r.number`, today(), ...(type ? [type] : [])));
});

hotel.post('/rooms', requireArea('settings'), (req, res) => {
  const b = parse(z.object({ number: z.string().min(1), floor: z.number().int(), room_type_id: z.number().int() }), req.body);
  if (get('SELECT 1 FROM rooms WHERE number = ?', b.number)) throw conflict(`Room ${b.number} already exists`);
  const { id } = run('INSERT INTO rooms (number, floor, room_type_id) VALUES (?, ?, ?)', b.number, b.floor, b.room_type_id);
  res.status(201).json(get(`${ROOM_SQL} WHERE r.id = ?`, today(), id));
});

hotel.patch('/rooms/:id', requireArea('rooms'), (req, res) => {
  const b = parse(z.object({ status: z.enum(['vacant_clean', 'vacant_dirty', 'inspected', 'out_of_order']).optional(), notes: z.string().nullable().optional() }), req.body);
  const room = get<{ id: number; status: string; number: string }>('SELECT * FROM rooms WHERE id = ?', req.params.id);
  if (!room) throw notFound('Room');
  if (b.status && room.status === 'occupied') throw conflict('Room is occupied — check the guest out first');
  run('UPDATE rooms SET status = COALESCE(?, status), notes = CASE WHEN ? THEN ? ELSE notes END WHERE id = ?', b.status, b.notes !== undefined, b.notes ?? null, room.id);
  if (b.status) logActivity(req.user!.id, `Room ${room.number} set to ${b.status.replace('_', ' ')}`, 'hotel');
  res.json(get(`${ROOM_SQL} WHERE r.id = ?`, today(), room.id));
});

/* ----------------------------------------------------------- availability */

hotel.get('/availability', requireArea('front_office'), (req, res) => {
  const from = String(req.query.from ?? '');
  const to = String(req.query.to ?? '');
  if (!DATE_RE.test(from) || !DATE_RE.test(to) || to <= from) throw bad('Provide a valid from/to range');
  res.json({ types: availability(from, to, req.query.room_type_id ? Number(req.query.room_type_id) : undefined) });
});

/* ------------------------------------------------------------ tape chart */

hotel.get('/tape-chart', requireArea('front_office'), (req, res) => {
  const from = DATE_RE.test(String(req.query.from)) ? String(req.query.from) : today();
  const days = Math.min(62, Math.max(7, Number(req.query.days) || 14));
  const to = addDays(from, days);
  res.json({
    rooms: all(`${ROOM_SQL} ORDER BY r.floor, r.number`, today()),
    reservations: all(
      `SELECT x.id, x.code, x.room_id, x.room_type_id, x.check_in, x.check_out, x.status, g.vip, t.name AS type_name,
              g.first_name || ' ' || g.last_name AS guest_name
         FROM reservations x JOIN guests g ON g.id = x.guest_id JOIN room_types t ON t.id = x.room_type_id
        WHERE x.room_id IS NOT NULL AND x.status IN ('booked','checked_in','checked_out') AND x.check_in < ? AND x.check_out > ?`,
      to,
      from,
    ),
    unassigned: all(
      `SELECT x.*, t.name AS type_name, g.first_name || ' ' || g.last_name AS guest_name
         FROM reservations x JOIN guests g ON g.id = x.guest_id JOIN room_types t ON t.id = x.room_type_id
        WHERE x.room_id IS NULL AND x.status = 'booked' AND x.check_out >= ? ORDER BY x.check_in`,
      today(),
    ),
  });
});

/* ---------------------------------------------------------------- guests */

hotel.get('/guests', requireArea('front_office'), (req, res) => {
  const q = String(req.query.q ?? '').trim();
  const like = `%${q}%`;
  const limit = Math.min(500, Number(req.query.limit) || 200);
  res.json(
    all(
      `SELECT g.*,
         (SELECT COUNT(*) FROM reservations x WHERE x.guest_id = g.id AND x.status IN ('checked_in','checked_out')) AS stays,
         (SELECT MAX(check_in) FROM reservations x WHERE x.guest_id = g.id AND x.status IN ('checked_in','checked_out')) AS last_stay,
         (SELECT COALESCE(SUM(f.amount),0) FROM folio_items f JOIN reservations x ON x.id = f.reservation_id WHERE x.guest_id = g.id) AS spend
       FROM guests g
       WHERE (? = '' OR g.first_name || ' ' || g.last_name LIKE ? OR g.email LIKE ? OR g.phone LIKE ?)
         AND (? = 0 OR g.vip = 1)
       ORDER BY g.last_name, g.first_name LIMIT ?`,
      q,
      like,
      like,
      like,
      req.query.vip ? 1 : 0,
      limit,
    ),
  );
});

const guestSchema = z.object({
  first_name: z.string().trim().min(1),
  last_name: z.string().trim().min(1),
  email: z.string().email().or(z.literal('')).nullable().optional(),
  phone: z.string().nullable().optional(),
  nationality: z.string().nullable().optional(),
  id_type: z.string().nullable().optional(),
  id_number: z.string().nullable().optional(),
  vip: z.coerce.number().int().min(0).max(1).optional(),
  notes: z.string().nullable().optional(),
});

hotel.post('/guests', requireArea('front_office'), (req, res) => {
  const b = parse(guestSchema, req.body);
  const { id } = run(
    'INSERT INTO guests (first_name, last_name, email, phone, nationality, id_type, id_number, vip, notes) VALUES (?,?,?,?,?,?,?,?,?)',
    b.first_name,
    b.last_name,
    b.email || null,
    b.phone || null,
    b.nationality || null,
    b.id_type || null,
    b.id_number || null,
    b.vip ?? 0,
    b.notes || null,
  );
  res.status(201).json(get('SELECT * FROM guests WHERE id = ?', id));
});

hotel.get('/guests/:id', requireArea('front_office'), (req, res) => {
  const g = get('SELECT * FROM guests WHERE id = ?', req.params.id);
  if (!g) throw notFound('Guest');
  const reservations = all(
    `SELECT x.*, r.number AS room_number, t.name AS type_name FROM reservations x
       LEFT JOIN rooms r ON r.id = x.room_id JOIN room_types t ON t.id = x.room_type_id
      WHERE x.guest_id = ? ORDER BY x.check_in DESC`,
    req.params.id,
  );
  res.json({ ...g, reservations });
});

hotel.patch('/guests/:id', requireArea('front_office'), (req, res) => {
  const b = parse(guestSchema, req.body);
  if (!get('SELECT 1 FROM guests WHERE id = ?', req.params.id)) throw notFound('Guest');
  run(
    'UPDATE guests SET first_name=?, last_name=?, email=?, phone=?, nationality=?, id_type=?, id_number=?, vip=?, notes=? WHERE id=?',
    b.first_name,
    b.last_name,
    b.email || null,
    b.phone || null,
    b.nationality || null,
    b.id_type || null,
    b.id_number || null,
    b.vip ?? 0,
    b.notes || null,
    req.params.id,
  );
  res.json(get('SELECT * FROM guests WHERE id = ?', req.params.id));
});

/* ---------------------------------------------------------- reservations */

const RES_SQL = `
  SELECT x.*, g.first_name || ' ' || g.last_name AS guest_name, g.phone AS guest_phone, g.email AS guest_email, g.vip,
         r.number AS room_number, t.name AS type_name,
         ROUND((SELECT COALESCE(SUM(amount),0) FROM folio_items f WHERE f.reservation_id = x.id)
             - (SELECT COALESCE(SUM(amount),0) FROM payments p WHERE p.reservation_id = x.id), 2) AS balance
    FROM reservations x
    JOIN guests g ON g.id = x.guest_id
    JOIN room_types t ON t.id = x.room_type_id
    LEFT JOIN rooms r ON r.id = x.room_id`;

const VIEWS: Record<string, string> = {
  upcoming: `x.status = 'booked' AND x.check_out > :today`,
  arrivals: `x.status = 'booked' AND x.check_in <= :today AND x.check_out > :today`,
  in_house: `x.status = 'checked_in'`,
  departures: `x.status = 'checked_in' AND x.check_out <= :today`,
  checked_out: `x.status = 'checked_out'`,
  cancelled: `x.status IN ('cancelled','no_show')`,
  all: `1 = 1`,
};

hotel.get('/reservations', requireArea('front_office'), (req, res) => {
  const view = VIEWS[String(req.query.view)] ? String(req.query.view) : 'upcoming';
  const q = String(req.query.q ?? '').trim();
  const t = today();
  const where = VIEWS[view].replaceAll(':today', `'${t}'`);
  const like = `%${q}%`;
  const order = view === 'checked_out' || view === 'cancelled' || view === 'all' ? 'x.check_in DESC' : 'x.check_in ASC';
  const rows = all(
    `${RES_SQL} WHERE ${where} AND (? = '' OR g.first_name || ' ' || g.last_name LIKE ? OR x.code LIKE ? OR r.number LIKE ?)
     ORDER BY ${order} LIMIT 300`,
    q,
    like,
    like,
    like,
  );
  const counts: Record<string, number> = {};
  for (const [k, w] of Object.entries(VIEWS)) counts[k] = scalar<number>(`SELECT COUNT(*) FROM reservations x WHERE ${w.replaceAll(':today', `'${t}'`)}`);
  res.json({ rows, counts });
});

/** Minimal in-house list for any outlet that needs to charge to a room. */
hotel.get('/in-house', (_req, res) => {
  res.json(all(`${RES_SQL} WHERE x.status = 'checked_in' ORDER BY r.number`));
});

hotel.post('/reservations', requireArea('front_office'), (req, res) => {
  const b = parse(
    z.object({
      guest_id: z.number().int().optional(),
      guest: z.object({ first_name: z.string().trim().min(1), last_name: z.string().trim().min(1), email: z.string().optional(), phone: z.string().optional(), nationality: z.string().optional() }).optional(),
      room_type_id: z.number().int(),
      room_id: z.number().int().nullable().optional(),
      check_in: date,
      check_out: date,
      adults: z.number().int().min(1),
      children: z.number().int().min(0).default(0),
      rate: z.number().min(0).optional(),
      source: z.string().default('direct'),
      notes: z.string().optional(),
    }),
    req.body,
  );
  const r = tx(() => {
    const guestId = b.guest_id ?? (b.guest ? findOrCreateGuest(b.guest) : null);
    if (!guestId) throw bad('A guest is required');
    return createReservation({ ...b, guest_id: guestId });
  });
  const full = get(`${RES_SQL} WHERE x.id = ?`, r.id);
  logActivity(req.user!.id, `New booking ${r.code} for ${full.guest_name}`, 'hotel');
  res.status(201).json(full);
});

function detail(id: number | string) {
  const r = get(`${RES_SQL} WHERE x.id = ?`, id);
  if (!r) throw notFound('Reservation');
  const folio = all('SELECT * FROM folio_items WHERE reservation_id = ? ORDER BY date, id', id);
  const payments = all('SELECT * FROM payments WHERE reservation_id = ? ORDER BY created_at', id);
  const guest = get('SELECT * FROM guests WHERE id = ?', r.guest_id);
  return { ...r, ...folioTotals(Number(id)), folio, payments, guest };
}

hotel.get('/reservations/:id', requireArea('front_office'), (req, res) => {
  res.json(detail(req.params.id));
});

hotel.patch('/reservations/:id', requireArea('front_office'), (req, res) => {
  const b = parse(
    z.object({
      room_id: z.number().int().nullable().optional(),
      check_in: date.optional(),
      check_out: date.optional(),
      rate: z.number().min(0).optional(),
      adults: z.number().int().min(1).optional(),
      children: z.number().int().min(0).optional(),
      notes: z.string().nullable().optional(),
    }),
    req.body,
  );
  const r = get<any>('SELECT x.*, rm.number AS room_number FROM reservations x LEFT JOIN rooms rm ON rm.id = x.room_id WHERE x.id = ?', req.params.id);
  if (!r) throw notFound('Reservation');
  if (r.status !== 'booked' && r.status !== 'checked_in') throw conflict('This reservation is closed');

  tx(() => {
    const checkIn = r.status === 'checked_in' ? r.check_in : (b.check_in ?? r.check_in);
    const checkOut = b.check_out ?? r.check_out;
    const rate = r.status === 'checked_in' ? r.rate : (b.rate ?? r.rate);
    if (checkOut <= checkIn) throw bad('Check-out must be after check-in');
    if (r.status === 'checked_in' && checkOut < today()) throw bad('Check-out cannot be in the past');

    let roomId = b.room_id === undefined ? r.room_id : b.room_id;
    if (r.status === 'checked_in' && roomId !== r.room_id) throw conflict('Use a room move at the desk for in-house guests');
    if (roomId) {
      const room = get<any>('SELECT * FROM rooms WHERE id = ?', roomId);
      if (!room) throw bad('Unknown room');
      if (room.room_type_id !== r.room_type_id) throw bad('Room does not match the booked room type');
      if (!roomIsFree(roomId, checkIn, checkOut, r.id)) throw conflict(`Room ${room.number} is not free for those dates`);
    } else if (checkIn !== r.check_in || checkOut !== r.check_out) {
      const [t] = availability(checkIn, checkOut, r.room_type_id);
      // our own unassigned booking is counted as taking a slot; add it back
      const overlapsSelf = r.check_in < checkOut && r.check_out > checkIn ? 1 : 0;
      if ((t?.available ?? 0) + overlapsSelf <= 0) throw conflict('No availability for the new dates');
    }
    run(
      'UPDATE reservations SET room_id=?, check_in=?, check_out=?, rate=?, adults=COALESCE(?, adults), children=COALESCE(?, children), notes=CASE WHEN ? THEN ? ELSE notes END WHERE id=?',
      roomId ?? null,
      checkIn,
      checkOut,
      rate,
      b.adults,
      b.children,
      b.notes !== undefined,
      b.notes ?? null,
      r.id,
    );
    if (r.status === 'checked_in' && checkOut !== r.check_out) {
      if (checkOut > r.check_out) postRoomNights(r.id, r.check_out, checkOut, r.rate, r.room_number, req.user!.id);
      else removeRoomNightsFrom(r.id, checkOut);
      logActivity(req.user!.id, `${r.code} stay changed to depart ${checkOut}`, 'hotel');
    }
  });
  res.json(detail(r.id));
});

hotel.post('/reservations/:id/check-in', requireArea('front_office'), (req, res) => {
  const b = parse(z.object({ room_id: z.number().int().nullable().optional() }), req.body);
  const r = get<any>(`${RES_SQL} WHERE x.id = ?`, req.params.id);
  if (!r) throw notFound('Reservation');
  if (r.status !== 'booked') throw conflict(`Cannot check in — reservation is ${r.status.replace('_', ' ')}`);
  if (r.check_in > today()) throw conflict('Arrival date is in the future');
  if (r.check_out <= today()) throw conflict('This stay has already ended — amend the dates first');
  const roomId = b.room_id ?? r.room_id;
  if (!roomId) throw bad('Assign a room to check in');

  tx(() => {
    const room = get<any>('SELECT * FROM rooms WHERE id = ?', roomId);
    if (!room) throw bad('Unknown room');
    if (room.room_type_id !== r.room_type_id) throw bad('Room does not match the booked room type');
    if (room.status === 'occupied') throw conflict(`Room ${room.number} is still occupied`);
    if (room.status === 'out_of_order') throw conflict(`Room ${room.number} is out of order`);
    if (!roomIsFree(roomId, r.check_in, r.check_out, r.id)) throw conflict(`Room ${room.number} is booked by someone else`);
    run(`UPDATE reservations SET status='checked_in', room_id=?, checked_in_at=datetime('now') WHERE id=?`, roomId, r.id);
    run(`UPDATE rooms SET status='occupied' WHERE id=?`, roomId);
    postRoomNights(r.id, r.check_in, r.check_out, r.rate, room.number, req.user!.id);
    logActivity(req.user!.id, `${r.guest_name} checked in to room ${room.number}`, 'hotel');
  });
  res.json(detail(r.id));
});

hotel.post('/reservations/:id/check-out', requireArea('front_office'), (req, res) => {
  const r = get<any>(`${RES_SQL} WHERE x.id = ?`, req.params.id);
  if (!r) throw notFound('Reservation');
  if (r.status !== 'checked_in') throw conflict('Guest is not checked in');
  tx(() => {
    const t = today();
    if (r.check_out > t) {
      // early departure: drop unused nights, keep at least the first night
      const keepFrom = t > r.check_in ? t : addDays(r.check_in, 1);
      removeRoomNightsFrom(r.id, keepFrom);
      run('UPDATE reservations SET check_out = ? WHERE id = ?', keepFrom, r.id);
    }
    const { balance } = folioTotals(r.id);
    if (balance > 0.009) throw conflict(`Folio has an outstanding balance of ${balance.toFixed(2)} — settle it first`);
    if (balance < -0.009) {
      // guest paid for nights they did not use: refund to the last payment method
      const last = get<{ method: string }>('SELECT method FROM payments WHERE reservation_id = ? AND amount > 0 ORDER BY id DESC LIMIT 1', r.id);
      run(`INSERT INTO payments (reservation_id, amount, method, reference, created_by) VALUES (?, ?, ?, 'Refund — early departure', ?)`, r.id, balance, last?.method ?? 'cash', req.user!.id);
      logActivity(req.user!.id, `Refund of ${Math.abs(balance).toLocaleString()} issued to ${r.guest_name} (early departure)`, 'hotel');
    }
    run(`UPDATE reservations SET status='checked_out', checked_out_at=datetime('now') WHERE id=?`, r.id);
    run(`UPDATE rooms SET status='vacant_dirty' WHERE id=?`, r.room_id);
    run(`INSERT INTO housekeeping_tasks (room_id, type, priority, notes) VALUES (?, 'clean', 'high', ?)`, r.room_id, `Departure clean after ${r.guest_name}`);
    logActivity(req.user!.id, `${r.guest_name} checked out of room ${r.room_number}`, 'hotel');
  });
  res.json(detail(r.id));
});

for (const [path, status, verb] of [
  ['cancel', 'cancelled', 'cancelled'],
  ['no-show', 'no_show', 'marked no-show'],
] as const) {
  hotel.post(`/reservations/:id/${path}`, requireArea('front_office'), (req, res) => {
    const r = get<any>(`${RES_SQL} WHERE x.id = ?`, req.params.id);
    if (!r) throw notFound('Reservation');
    if (r.status !== 'booked') throw conflict('Only reservations that have not arrived can be changed');
    if (status === 'no_show' && r.check_in > today()) throw conflict('Arrival date has not come yet');
    run('UPDATE reservations SET status = ? WHERE id = ?', status, r.id);
    logActivity(req.user!.id, `${r.code} (${r.guest_name}) ${verb}`, 'hotel');
    res.json(detail(r.id));
  });
}

hotel.post('/reservations/:id/charges', requireArea('folio'), (req, res) => {
  const b = parse(z.object({ description: z.string().trim().min(1), category: z.string().min(1), amount: z.number() }), req.body);
  const r = get<any>('SELECT * FROM reservations WHERE id = ?', req.params.id);
  if (!r) throw notFound('Reservation');
  if (r.status !== 'booked' && r.status !== 'checked_in') throw conflict('Folio is closed');
  if (b.amount < 0 && b.category !== 'adjustment') throw bad('Use the adjustment department for credits');
  run(
    'INSERT INTO folio_items (reservation_id, date, description, category, amount, created_by) VALUES (?, ?, ?, ?, ?, ?)',
    r.id,
    today(),
    b.description,
    b.category,
    round2(b.amount),
    req.user!.id,
  );
  res.status(201).json(detail(r.id));
});

hotel.post('/reservations/:id/payments', requireArea('folio'), (req, res) => {
  const b = parse(z.object({ amount: z.number().positive(), method: z.enum(['cash', 'card', 'momo', 'transfer']), reference: z.string().optional() }), req.body);
  const r = get<any>(`${RES_SQL} WHERE x.id = ?`, req.params.id);
  if (!r) throw notFound('Reservation');
  if (r.status === 'cancelled' || r.status === 'no_show') throw conflict('Reservation is closed');
  run('INSERT INTO payments (reservation_id, amount, method, reference, created_by) VALUES (?, ?, ?, ?, ?)', r.id, round2(b.amount), b.method, b.reference || null, req.user!.id);
  logActivity(req.user!.id, `Payment ${round2(b.amount).toLocaleString()} (${b.method}) on ${r.code}`, 'hotel');
  res.status(201).json(detail(r.id));
});

/* ---------------------------------------------------------- housekeeping */

const HK_SQL = `
  SELECT h.*, r.number AS room_number, r.status AS room_status, s.name AS assignee
    FROM housekeeping_tasks h JOIN rooms r ON r.id = h.room_id LEFT JOIN staff s ON s.id = h.assigned_to`;

hotel.get('/housekeeping', requireArea('housekeeping'), (_req, res) => {
  res.json(
    all(
      `${HK_SQL} WHERE h.status != 'done' OR date(h.completed_at, 'localtime') = ?
       ORDER BY CASE h.priority WHEN 'high' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END, h.created_at`,
      today(),
    ),
  );
});

hotel.post('/housekeeping', requireArea('housekeeping'), (req, res) => {
  const b = parse(
    z.object({
      room_id: z.number().int(),
      type: z.enum(['clean', 'turndown', 'inspect', 'maintenance']),
      priority: z.enum(['low', 'normal', 'high']).default('normal'),
      assigned_to: z.number().int().nullable().optional(),
      notes: z.string().optional(),
    }),
    req.body,
  );
  const room = get<any>('SELECT * FROM rooms WHERE id = ?', b.room_id);
  if (!room) throw bad('Unknown room');
  const { id } = run('INSERT INTO housekeeping_tasks (room_id, type, priority, assigned_to, notes) VALUES (?, ?, ?, ?, ?)', b.room_id, b.type, b.priority, b.assigned_to ?? null, b.notes || null);
  logActivity(req.user!.id, `${b.type} requested for room ${room.number}`, 'hotel');
  res.status(201).json(get(`${HK_SQL} WHERE h.id = ?`, id));
});

hotel.patch('/housekeeping/:id', requireArea('housekeeping'), (req, res) => {
  const b = parse(z.object({ status: z.enum(['open', 'in_progress', 'done']).optional(), assigned_to: z.number().int().nullable().optional() }), req.body);
  const t = get<any>(`${HK_SQL} WHERE h.id = ?`, req.params.id);
  if (!t) throw notFound('Task');
  tx(() => {
    if (b.assigned_to !== undefined) run('UPDATE housekeeping_tasks SET assigned_to = ? WHERE id = ?', b.assigned_to, t.id);
    if (b.status && b.status !== t.status) {
      run(`UPDATE housekeeping_tasks SET status = ?, completed_at = CASE WHEN ? = 'done' THEN datetime('now') ELSE NULL END WHERE id = ?`, b.status, b.status, t.id);
      if (b.status === 'done' && t.room_status !== 'occupied') {
        const next = t.type === 'clean' ? 'vacant_clean' : t.type === 'inspect' ? 'inspected' : t.type === 'maintenance' && t.room_status === 'out_of_order' ? 'vacant_dirty' : null;
        if (next) run('UPDATE rooms SET status = ? WHERE id = ?', next, t.room_id);
      }
      if (b.status === 'done') logActivity(req.user!.id, `Room ${t.room_number} ${t.type} completed`, 'hotel');
    }
  });
  res.json(get(`${HK_SQL} WHERE h.id = ?`, t.id));
});

