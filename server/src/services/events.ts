import { get, run, tx } from '../db.ts';
import { addDays, makeCode, today } from '../util.ts';

export const EVENT_SQL = `
  SELECT e.*,
    (SELECT COALESCE(SUM(qty * unit_price), 0) FROM event_items i WHERE i.event_id = e.id) AS quote_total,
    (SELECT COALESCE(SUM(amount), 0) FROM payments p WHERE p.event_id = e.id) AS paid
  FROM events e`;

const STANDARD_TASKS: [string, number][] = [
  ['Site visit with client', -45],
  ['Send quote & terms', -40],
  ['Collect 50% deposit', -30],
  ['Menu tasting', -21],
  ['Confirm final headcount', -7],
  ['Brief vendors & security', -3],
  ['Set-up, sound & light check', 0],
];

export function createEvent(b: {
  title: string;
  client_name: string;
  client_phone?: string | null;
  client_email?: string | null;
  event_type: string;
  venue: string;
  date: string;
  start_time: string;
  end_time: string;
  guests: number;
  notes?: string | null;
  source: string;
}) {
  return tx(() => {
    const code = makeCode('EV', 'events');
    const { id } = run(
      `INSERT INTO events (code, title, client_name, client_phone, client_email, event_type, venue, date, start_time, end_time, guests, notes, source)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      code,
      b.title,
      b.client_name,
      b.client_phone || null,
      b.client_email || null,
      b.event_type,
      b.venue,
      b.date,
      b.start_time,
      b.end_time,
      b.guests,
      b.notes || null,
      b.source,
    );
    for (const [title, offset] of STANDARD_TASKS) {
      const due = addDays(b.date, offset);
      run('INSERT INTO event_tasks (event_id, title, due_date) VALUES (?, ?, ?)', id, title, due < today() ? today() : due);
    }
    return get<any>(`${EVENT_SQL} WHERE e.id = ?`, id);
  });
}
