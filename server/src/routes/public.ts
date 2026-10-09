import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { all, get, logActivity, run, scalar, tx, withImages } from '../db.ts';
import { addDays, bad, conflict, DATE_RE, HttpError, makeCode, nights, notFound, parse, round2, TIME_RE, today } from '../util.ts';
import { availability, createReservation, findOrCreateGuest } from '../services/hotel.ts';
import { addItem, recalc } from '../services/orders.ts';
import { createEvent } from '../services/events.ts';
import { checkResourceSlot } from './rooftop.ts';
import { readSettings } from './office.ts';
import { config, isDemo } from '../config.ts';

/** Customer-facing API — no staff login. Everything here is validated and rate-limited. */
export const publicApi = Router();

const hits = new Map<string, number[]>();
function limit(max: number, windowMs: number) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const key = `${req.ip}:${req.path}`;
    const now = Date.now();
    const list = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    if (list.length >= max) return next(new HttpError(429, 'Too many requests — please try again shortly'));
    list.push(now);
    hits.set(key, list);
    next();
  };
}
const writeLimit = limit(20, 10 * 60_000);

const phone = z.string().trim().min(7, 'looks too short').max(20);
const email = z.string().trim().email('is not a valid email');
const futureDate = z
  .string()
  .regex(DATE_RE, 'must be a date')
  .refine((d) => d >= today(), 'cannot be in the past')
  .refine((d) => d <= addDays(today(), 540), 'is too far ahead');

/* ------------------------------------------------------------------ meta */

/** Tells both apps whether this is the public test version. */
publicApi.get('/meta', (_req, res) => {
  res.json({ demo: isDemo, reset_hours: isDemo ? config.demoResetHours : null });
});

publicApi.post('/feedback', limit(10, 10 * 60_000), (req, res) => {
  const b = parse(
    z.object({
      rating: z.number().int().min(1).max(5).nullable().optional(),
      message: z.string().trim().min(3, 'tell us a little more').max(2000),
      page: z.string().max(200).optional(),
      area: z.enum(['site', 'console']).default('site'),
      role: z.string().max(40).optional(),
      name: z.string().trim().max(80).optional(),
    }),
    req.body,
  );
  run('INSERT INTO feedback (rating, message, page, area, role, name) VALUES (?, ?, ?, ?, ?, ?)', b.rating ?? null, b.message, b.page ?? null, b.area, b.role ?? null, b.name || null);
  res.status(201).json({ ok: true });
});

/* ------------------------------------------------------------------ info */

publicApi.get('/info', (_req, res) => {
  const s = readSettings();
  res.json({
    property: { name: s.property_name, address: s.address, phone: s.phone, email: s.email, currency: s.currency, check_in_time: s.check_in_time, check_out_time: s.check_out_time, vat_rate: Number(s.vat_rate), service_rate: Number(s.service_rate) },
    room_types: all('SELECT id, name, code, base_rate, capacity, description, images, features FROM room_types ORDER BY base_rate').map(withImages),
    resources: all(`SELECT id, kind, label, capacity, price FROM resources WHERE venue = 'rooftop' ORDER BY kind, id`),
    club_nights: all(
      `SELECT id, title, date, dj, cover_charge, capacity, status FROM club_nights WHERE date >= ? AND status IN ('scheduled','live') ORDER BY date LIMIT 6`,
      today(),
    ),
  });
});

publicApi.get('/menu', (req, res) => {
  const outlet = req.query.outlet === 'rooftop' ? 'rooftop' : 'restaurant';
  res.json({
    categories: all('SELECT id, name FROM menu_categories WHERE outlet = ? ORDER BY sort, id', outlet),
    items: all('SELECT id, category_id, name, description, price, available, image_url FROM menu_items WHERE outlet = ? AND deleted = 0 ORDER BY name', outlet),
  });
});

/* ----------------------------------------------------------------- rooms */

publicApi.get('/availability', (req, res) => {
  const from = String(req.query.from ?? '');
  const to = String(req.query.to ?? '');
  if (!DATE_RE.test(from) || !DATE_RE.test(to) || to <= from) throw bad('Choose your arrival and departure dates');
  if (from < today()) throw bad('Arrival cannot be in the past');
  if (nights(from, to) > 30) throw bad('For stays over 30 nights, please call us');
  res.json(
    availability(from, to).map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      images: t.images,
      features: t.features,
      capacity: t.capacity,
      rate: t.base_rate,
      available: t.available,
      nights: nights(from, to),
      total: round2(t.base_rate * nights(from, to)),
    })),
  );
});

publicApi.post('/book-room', writeLimit, (req, res) => {
  const b = parse(
    z.object({
      first_name: z.string().trim().min(1, 'is required').max(60),
      last_name: z.string().trim().min(1, 'is required').max(60),
      email,
      phone,
      room_type_id: z.number().int(),
      check_in: futureDate,
      check_out: z.string().regex(DATE_RE),
      adults: z.number().int().min(1).max(6),
      children: z.number().int().min(0).max(6).default(0),
      notes: z.string().max(500).optional(),
    }),
    req.body,
  );
  if (nights(b.check_in, b.check_out) > 30) throw bad('For stays over 30 nights, please call us');
  const r = tx(() => {
    const guestId = findOrCreateGuest(b);
    return createReservation({ ...b, guest_id: guestId, source: 'website', notes: b.notes ? `Online: ${b.notes}` : 'Booked online' });
  });
  const full = get<any>(
    `SELECT x.code, x.check_in, x.check_out, x.rate, x.adults, x.children, t.name AS room_type FROM reservations x JOIN room_types t ON t.id = x.room_type_id WHERE x.id = ?`,
    r.id,
  );
  logActivity(null, `Online booking ${r.code} — ${b.first_name} ${b.last_name}, ${full.room_type}`, 'hotel');
  res.status(201).json({ ...full, nights: nights(full.check_in, full.check_out), total: round2(full.rate * nights(full.check_in, full.check_out)) });
});

publicApi.get('/booking', limit(30, 10 * 60_000), (req, res) => {
  const code = String(req.query.code ?? '').trim().toUpperCase();
  const last = String(req.query.last_name ?? '').trim().toLowerCase();
  const r = get<any>(
    `SELECT x.code, x.check_in, x.check_out, x.status, x.adults, x.children, x.rate, t.name AS room_type, t.images, g.first_name, g.last_name
       FROM reservations x JOIN guests g ON g.id = x.guest_id JOIN room_types t ON t.id = x.room_type_id
      WHERE x.code = ? AND lower(g.last_name) = ?`,
    code,
    last,
  );
  if (!r) throw notFound('Booking');
  const n = nights(r.check_in, r.check_out);
  res.json({ ...withImages(r), nights: n, total: round2(r.rate * n) });
});

/* ------------------------------------------------------------ food order */

publicApi.post('/order', writeLimit, (req, res) => {
  const b = parse(
    z.object({
      name: z.string().trim().min(1, 'is required').max(80),
      phone,
      fulfilment: z.enum(['pickup', 'room', 'poolside']),
      room_code: z.string().trim().optional(),
      last_name: z.string().trim().optional(),
      notes: z.string().max(300).optional(),
      items: z.array(z.object({ menu_item_id: z.number().int(), qty: z.number().int().min(1).max(20), notes: z.string().max(120).optional() })).min(1, 'add at least one dish').max(30),
    }),
    req.body,
  );

  let reservationId: number | null = null;
  let roomNumber: string | null = null;
  if (b.fulfilment === 'room') {
    const r = get<any>(
      `SELECT x.id, x.status, rm.number FROM reservations x JOIN guests g ON g.id = x.guest_id LEFT JOIN rooms rm ON rm.id = x.room_id
        WHERE x.code = ? AND lower(g.last_name) = lower(?)`,
      (b.room_code ?? '').toUpperCase(),
      b.last_name ?? '',
    );
    if (!r || r.status !== 'checked_in') throw bad('Room service is for checked-in guests — check your booking code and last name');
    reservationId = r.id;
    roomNumber = r.number;
  }

  const order = tx(() => {
    const code = makeCode('ON', 'orders');
    const label = b.fulfilment === 'room' ? `Room ${roomNumber} · ${b.name}` : b.fulfilment === 'poolside' ? `Poolside · ${b.name}` : `Pickup · ${b.name}`;
    const { id } = run(
      `INSERT INTO orders (code, outlet, guest_name, reservation_id, covers, channel, contact_phone, fulfilment) VALUES (?, 'restaurant', ?, ?, 1, 'online', ?, ?)`,
      code,
      label,
      reservationId,
      b.phone,
      b.fulfilment,
    );
    for (const it of b.items) {
      const m = get<any>(`SELECT * FROM menu_items WHERE id = ? AND outlet = 'restaurant' AND deleted = 0`, it.menu_item_id);
      if (!m) throw bad('One of the dishes is no longer on the menu');
      if (!m.available) throw conflict(`Sorry — ${m.name} has just sold out`);
      addItem(id, m.id, it.qty, [it.notes?.trim(), b.notes?.trim()].filter(Boolean).join(' · ') || null, true);
    }
    recalc(id);
    return get<any>('SELECT code, subtotal, service_charge, tax, total, fulfilment FROM orders WHERE id = ?', id);
  });
  logActivity(null, `Online order ${order.code} (${b.fulfilment}) — ${b.name}`, 'restaurant');
  res.status(201).json(order);
});

/** Guest-safe view of an online order: no ids, staff names or phone numbers. */
function orderSummary(code: string) {
  const o = get<any>(`SELECT id, code, status, total, fulfilment, created_at FROM orders WHERE code = ? AND channel = 'online'`, code.toUpperCase());
  if (!o) return null;
  const items = all<any>(
    `SELECT i.menu_item_id, i.name, i.qty, i.unit_price, i.status, m.image_url
       FROM order_items i LEFT JOIN menu_items m ON m.id = i.menu_item_id
      WHERE i.order_id = ? AND i.status != 'void'`,
    o.id,
  );
  let stage: 'received' | 'preparing' | 'ready' | 'completed' | 'cancelled' = 'received';
  if (o.status === 'void') stage = 'cancelled';
  else if (o.status !== 'open' || (items.length && items.every((i) => i.status === 'served'))) stage = 'completed';
  else if (items.length && items.every((i) => i.status === 'ready' || i.status === 'served')) stage = 'ready';
  else if (items.some((i) => i.status === 'ready')) stage = 'preparing';
  else if (Date.now() - new Date(o.created_at.replace(' ', 'T') + 'Z').getTime() > 3 * 60_000) stage = 'preparing';
  const { id: _id, ...rest } = o;
  return { ...rest, stage, items: items.map(({ status: _s, ...i }) => i) };
}

publicApi.get('/order/:code', limit(120, 10 * 60_000), (req, res) => {
  const o = orderSummary(String(req.params.code));
  if (!o) throw notFound('Order');
  res.json(o);
});

/** Several orders at once — the "My orders" list on a guest's device. Unknown codes are skipped. */
publicApi.get('/orders', limit(120, 10 * 60_000), (req, res) => {
  const codes = String(req.query.codes ?? '')
    .split(',')
    .map((c) => c.trim())
    .filter((c) => /^ON-[A-Z0-9]{5}$/i.test(c))
    .slice(0, 30);
  res.json(codes.map(orderSummary).filter(Boolean));
});

/* ----------------------------------------------------------- table booking */

publicApi.post('/table-booking', writeLimit, (req, res) => {
  const b = parse(
    z.object({
      name: z.string().trim().min(1, 'is required').max(80),
      phone,
      email: email.optional().or(z.literal('')),
      party_size: z.number().int().min(1).max(12, 'for more than 12, send an event inquiry'),
      date: futureDate,
      time: z.string().regex(TIME_RE).refine((t) => t >= '12:00' && t <= '22:00', 'we seat between 12:00 and 22:00'),
      notes: z.string().max(300).optional(),
    }),
    req.body,
  );
  if (b.date === today()) {
    const now = new Date();
    const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    if (b.time <= hhmm) throw bad('That time has already passed today');
  }
  const booked = scalar<number>(`SELECT COALESCE(SUM(party_size),0) FROM table_bookings WHERE outlet = 'restaurant' AND date = ? AND time = ? AND status IN ('booked','seated')`, b.date, b.time);
  const seats = scalar<number>(`SELECT COALESCE(SUM(seats),0) FROM dining_tables WHERE outlet = 'restaurant'`);
  if (booked + b.party_size > seats * 0.6) throw conflict('That sitting is fully booked — try another time');
  const { id } = run(
    `INSERT INTO table_bookings (outlet, guest_name, phone, email, party_size, date, time, source, notes) VALUES ('restaurant', ?, ?, ?, ?, ?, ?, 'web', ?)`,
    b.name,
    b.phone,
    b.email || null,
    b.party_size,
    b.date,
    b.time,
    b.notes || null,
  );
  logActivity(null, `Online table request — ${b.name}, ${b.party_size} at ${b.time} on ${b.date}`, 'restaurant');
  res.status(201).json({ reference: `TB-${String(id).padStart(5, '0')}`, ...b });
});

/* ---------------------------------------------------------------- cabanas */

publicApi.get('/cabanas', (req, res) => {
  const date = DATE_RE.test(String(req.query.date)) ? String(req.query.date) : today();
  res.json({
    date,
    resources: all(`SELECT id, kind, label, capacity, price FROM resources WHERE venue = 'rooftop' ORDER BY kind, id`),
    taken: all(`SELECT resource_id, start_time, end_time FROM resource_bookings WHERE date = ? AND status != 'cancelled'`, date),
  });
});

publicApi.post('/cabana', writeLimit, (req, res) => {
  const b = parse(
    z.object({
      resource_id: z.number().int(),
      name: z.string().trim().min(1, 'is required').max(80),
      phone,
      date: futureDate,
      start_time: z.string().regex(TIME_RE).refine((t) => t >= '08:00', 'the deck opens at 08:00'),
      end_time: z.string().regex(TIME_RE).refine((t) => t <= '20:00', 'the deck closes at 20:00'),
      pax: z.number().int().min(1),
      notes: z.string().max(300).optional(),
    }),
    req.body,
  );
  const booking = tx(() => {
    const r = checkResourceSlot(b.resource_id, b.date, b.start_time, b.end_time, b.pax);
    const { id } = run(
      `INSERT INTO resource_bookings (resource_id, guest_name, phone, date, start_time, end_time, pax, price, source, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'web', ?)`,
      r.id,
      b.name,
      b.phone,
      b.date,
      b.start_time,
      b.end_time,
      b.pax,
      r.price,
      b.notes ? `Online: ${b.notes}` : 'Booked online',
    );
    logActivity(null, `Online ${r.label} booking — ${b.name} on ${b.date}`, 'rooftop');
    return { reference: `SD-${String(id).padStart(5, '0')}`, label: r.label, price: r.price };
  });
  res.status(201).json({ ...booking, date: b.date, start_time: b.start_time, end_time: b.end_time });
});

/* ------------------------------------------------------------- guest list */

publicApi.post('/guestlist', writeLimit, (req, res) => {
  const b = parse(z.object({ night_id: z.number().int(), name: z.string().trim().min(1, 'is required').max(80), phone, pax: z.number().int().min(1).max(6) }), req.body);
  const n = get<any>('SELECT * FROM club_nights WHERE id = ?', b.night_id);
  if (!n || n.date < today() || !['scheduled', 'live'].includes(n.status)) throw bad('That night is not taking names');
  const listed = scalar<number>('SELECT COALESCE(SUM(pax),0) FROM guest_list WHERE night_id = ?', n.id);
  if (listed + b.pax > n.capacity) throw conflict('The guest list is full — walk-ins subject to capacity');
  if (get('SELECT 1 FROM guest_list WHERE night_id = ? AND phone = ?', n.id, b.phone)) throw conflict('You are already on the list for this night');
  run(`INSERT INTO guest_list (night_id, name, phone, pax, type, notes) VALUES (?, ?, ?, ?, 'guestlist', 'Signed up online')`, n.id, b.name, b.phone, b.pax);
  res.status(201).json({ title: n.title, date: n.date, name: b.name, pax: b.pax, cover_charge: n.cover_charge });
});

/* ---------------------------------------------------------- event inquiry */

publicApi.post('/event-inquiry', writeLimit, (req, res) => {
  const b = parse(
    z.object({
      client_name: z.string().trim().min(1, 'is required').max(80),
      client_phone: phone,
      client_email: email,
      event_type: z.string().min(1),
      venue: z.enum(['garden', 'pavilion', 'rooftop', 'restaurant_private']),
      date: futureDate,
      start_time: z.string().regex(TIME_RE).default('14:00'),
      end_time: z.string().regex(TIME_RE).default('22:00'),
      guests: z.number().int().min(10, 'minimum of 10 guests').max(2000),
      notes: z.string().max(1000).optional(),
    }),
    req.body,
  );
  const e = createEvent({ ...b, title: `${b.event_type[0].toUpperCase()}${b.event_type.slice(1).replace('_', ' ')} — ${b.client_name}`, source: 'web' });
  logActivity(null, `Web event inquiry ${e.code} — ${b.client_name}, ${b.guests} guests`, 'events');
  res.status(201).json({ reference: e.code, date: e.date, venue: e.venue });
});
