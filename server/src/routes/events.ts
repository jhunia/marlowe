import { Router } from 'express';
import { z } from 'zod';
import { all, get, logActivity, run, tx } from '../db.ts';
import { requireArea } from '../auth.ts';
import { addDays, conflict, DATE_RE, notFound, parse, round2, TIME_RE, today } from '../util.ts';
import { createEvent, EVENT_SQL } from '../services/events.ts';

export const events = Router();
events.use(['/events', '/event-tasks'], requireArea('events'));

const VENUES = ['garden', 'pavilion', 'rooftop', 'restaurant_private'] as const;
const eventSchema = z.object({
  title: z.string().trim().min(1),
  client_name: z.string().trim().min(1),
  client_phone: z.string().nullable().optional(),
  client_email: z.string().nullable().optional(),
  event_type: z.string().min(1),
  venue: z.enum(VENUES),
  date: z.string().regex(DATE_RE),
  start_time: z.string().regex(TIME_RE),
  end_time: z.string().regex(TIME_RE),
  guests: z.number().int().min(1),
  notes: z.string().nullable().optional(),
});

events.get('/events', (req, res) => {
  const from = DATE_RE.test(String(req.query.from)) ? String(req.query.from) : null;
  const to = DATE_RE.test(String(req.query.to)) ? String(req.query.to) : null;
  if (from && to) return res.json(all(`${EVENT_SQL} WHERE e.date BETWEEN ? AND ? ORDER BY e.date, e.start_time`, from, to));
  const scope = req.query.scope === 'all' ? 'all' : 'upcoming';
  res.json(all(`${EVENT_SQL} ${scope === 'upcoming' ? 'WHERE e.date >= ?' : 'WHERE ? IS NOT NULL'} ORDER BY e.date`, addDays(today(), -30)));
});

events.post('/events', (req, res) => {
  const b = parse(eventSchema, req.body);
  const e = createEvent({ ...b, source: 'staff' });
  logActivity(req.user!.id, `Event inquiry ${e.code}: ${b.title}`, 'events');
  res.status(201).json(e);
});

function detail(id: number | string) {
  const e = get<any>(`${EVENT_SQL} WHERE e.id = ?`, id);
  if (!e) throw notFound('Event');
  return {
    ...e,
    items: all('SELECT * FROM event_items WHERE event_id = ? ORDER BY id', id),
    tasks: all('SELECT * FROM event_tasks WHERE event_id = ? ORDER BY done, due_date, id', id),
    payments: all('SELECT * FROM payments WHERE event_id = ? ORDER BY created_at', id),
    clashes: all(
      `SELECT id, code, title, status FROM events WHERE venue = ? AND date = ? AND id != ? AND status IN ('tentative','confirmed')`,
      e.venue,
      e.date,
      e.id,
    ),
  };
}

events.get('/events/:id', (req, res) => res.json(detail(req.params.id)));

const FLOW: Record<string, string[]> = {
  inquiry: ['tentative', 'confirmed', 'cancelled'],
  tentative: ['confirmed', 'inquiry', 'cancelled'],
  confirmed: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

events.patch('/events/:id', (req, res) => {
  const e = detail(req.params.id);
  const b = parse(eventSchema.partial().extend({ status: z.enum(['inquiry', 'tentative', 'confirmed', 'completed', 'cancelled']).optional() }), req.body);
  if (b.status && b.status !== e.status) {
    if (!FLOW[e.status].includes(b.status)) throw conflict(`Cannot move from ${e.status} to ${b.status}`);
    if (b.status === 'confirmed' && e.paid <= 0) throw conflict('Record a deposit before confirming');
    if (b.status === 'completed' && e.date > today()) throw conflict('The event has not happened yet');
  }
  const next = { ...e, ...Object.fromEntries(Object.entries(b).filter(([, v]) => v !== undefined)) };
  if (next.status === 'confirmed') {
    const clash = get<any>(`SELECT title FROM events WHERE venue = ? AND date = ? AND id != ? AND status = 'confirmed'`, next.venue, next.date, e.id);
    if (clash) throw conflict(`${next.venue} is already confirmed for “${clash.title}” that day`);
  }
  run(
    `UPDATE events SET title=?, client_name=?, client_phone=?, client_email=?, event_type=?, venue=?, date=?, start_time=?, end_time=?, guests=?, notes=?, status=? WHERE id=?`,
    next.title,
    next.client_name,
    next.client_phone ?? null,
    next.client_email ?? null,
    next.event_type,
    next.venue,
    next.date,
    next.start_time,
    next.end_time,
    next.guests,
    next.notes ?? null,
    next.status,
    e.id,
  );
  if (b.status && b.status !== e.status) logActivity(req.user!.id, `${e.title} → ${b.status}`, 'events');
  res.json(detail(e.id));
});

const line = z.object({ description: z.string().trim().min(1), qty: z.number().positive(), unit_price: z.number().min(0) });

events.post('/events/:id/items', (req, res) => {
  const e = detail(req.params.id);
  if (e.status === 'completed' || e.status === 'cancelled') throw conflict('Quote is locked');
  const b = parse(z.union([z.object({ items: z.array(line).min(1) }), line]), req.body);
  const lines = 'items' in b ? b.items : [b];
  tx(() => {
    for (const l of lines) run('INSERT INTO event_items (event_id, description, qty, unit_price) VALUES (?, ?, ?, ?)', e.id, l.description, l.qty, l.unit_price);
  });
  res.status(201).json(detail(e.id));
});

events.delete('/events/:id/items/:itemId', (req, res) => {
  const e = detail(req.params.id);
  if (e.status === 'completed' || e.status === 'cancelled') throw conflict('Quote is locked');
  run('DELETE FROM event_items WHERE id = ? AND event_id = ?', req.params.itemId, e.id);
  res.json(detail(e.id));
});

events.post('/events/:id/tasks', (req, res) => {
  const e = detail(req.params.id);
  const b = parse(z.object({ title: z.string().trim().min(1), due_date: z.string().regex(DATE_RE).optional() }), req.body);
  run('INSERT INTO event_tasks (event_id, title, due_date) VALUES (?, ?, ?)', e.id, b.title, b.due_date ?? null);
  res.status(201).json(detail(e.id));
});

events.patch('/event-tasks/:id', (req, res) => {
  const b = parse(z.object({ done: z.number().int().min(0).max(1) }), req.body);
  const t = get('SELECT * FROM event_tasks WHERE id = ?', req.params.id);
  if (!t) throw notFound('Task');
  run('UPDATE event_tasks SET done = ? WHERE id = ?', b.done, req.params.id);
  res.json(get('SELECT * FROM event_tasks WHERE id = ?', req.params.id));
});

events.post('/events/:id/payments', (req, res) => {
  const e = detail(req.params.id);
  if (e.status === 'cancelled') throw conflict('Event is cancelled');
  const b = parse(z.object({ amount: z.number().positive(), method: z.enum(['cash', 'card', 'momo', 'transfer']), reference: z.string().optional() }), req.body);
  run('INSERT INTO payments (event_id, amount, method, reference, created_by) VALUES (?, ?, ?, ?, ?)', e.id, round2(b.amount), b.method, b.reference || null, req.user!.id);
  logActivity(req.user!.id, `Payment received for ${e.title}`, 'events');
  res.status(201).json(detail(e.id));
});
