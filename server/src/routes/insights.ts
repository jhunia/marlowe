import { Router } from 'express';
import { all, get, scalar } from '../db.ts';
import { requireArea } from '../auth.ts';
import { can } from '../permissions.ts';
import { addDays, bad, DATE_RE, dateRange, round2, today } from '../util.ts';

export const insights = Router();

type Day = { date: string; hotel: number; restaurant: number; rooftop: number; events: number };

export function revenueByDay(from: string, to: string): Day[] {
  const days = new Map<string, Day>(dateRange(from, to).map((d) => [d, { date: d, hotel: 0, restaurant: 0, rooftop: 0, events: 0 }]));
  const add = (rows: { d: string; v: number }[], k: keyof Omit<Day, 'date'>) => {
    for (const r of rows) {
      const day = days.get(r.d);
      if (day) day[k] = round2(day[k] + r.v);
    }
  };
  add(all(`SELECT date AS d, SUM(amount) AS v FROM folio_items WHERE category NOT IN ('restaurant','bar','pool') AND date BETWEEN ? AND ? GROUP BY date`, from, to), 'hotel');
  const orders = (outlet: string) =>
    all(
      `SELECT date(closed_at, 'localtime') AS d, SUM(total) AS v FROM orders
        WHERE outlet = ? AND status IN ('paid','charged') AND date(closed_at, 'localtime') BETWEEN ? AND ? GROUP BY d`,
      outlet,
      from,
      to,
    );
  add(orders('restaurant'), 'restaurant');
  add(orders('rooftop'), 'rooftop');
  add(all(`SELECT date AS d, SUM(price) AS v FROM resource_bookings WHERE status != 'cancelled' AND settlement IN ('paid','room') AND date BETWEEN ? AND ? GROUP BY date`, from, to), 'rooftop');
  add(
    all(
      `SELECT n.date AS d, SUM(g.pax) * n.cover_charge AS v FROM guest_list g JOIN club_nights n ON n.id = g.night_id
        WHERE g.checked_in = 1 AND g.cover_paid = 1 AND n.date BETWEEN ? AND ? GROUP BY n.id`,
      from,
      to,
    ),
    'rooftop',
  );
  add(all(`SELECT date(created_at, 'localtime') AS d, SUM(amount) AS v FROM payments WHERE event_id IS NOT NULL AND date(created_at, 'localtime') BETWEEN ? AND ? GROUP BY d`, from, to), 'events');
  return [...days.values()];
}

insights.get('/nav-counts', (req, res) => {
  const t = today();
  const role = req.user!.role;
  res.json({
    arrivals: can(role, 'front_office') ? scalar(`SELECT COUNT(*) FROM reservations WHERE status = 'booked' AND check_in <= ? AND check_out > ?`, t, t) : 0,
    departures: can(role, 'front_office') ? scalar(`SELECT COUNT(*) FROM reservations WHERE status = 'checked_in' AND check_out <= ?`, t) : 0,
    hk_open: can(role, 'housekeeping') ? scalar(`SELECT COUNT(*) FROM housekeeping_tasks WHERE status != 'done'`) : 0,
    kitchen: scalar(`SELECT COUNT(DISTINCT i.order_id) FROM order_items i JOIN orders o ON o.id = i.order_id WHERE o.outlet = 'restaurant' AND o.status != 'void' AND i.status IN ('fired','ready')`),
    bar: scalar(`SELECT COUNT(DISTINCT i.order_id) FROM order_items i JOIN orders o ON o.id = i.order_id WHERE o.outlet = 'rooftop' AND o.status != 'void' AND i.status IN ('fired','ready')`),
    low_stock: can(role, 'inventory') ? scalar(`SELECT COUNT(*) FROM inventory_items WHERE qty <= par_level`) : 0,
    inquiries: can(role, 'events') ? scalar(`SELECT COUNT(*) FROM events WHERE status = 'inquiry'`) : 0,
    online_orders: scalar(`SELECT COUNT(*) FROM orders WHERE channel = 'online' AND status = 'open'`),
  });
});

insights.get('/dashboard', (_req, res) => {
  const t = today();
  const RES = `SELECT x.*, g.first_name || ' ' || g.last_name AS guest_name, g.vip, r.number AS room_number, rt.name AS type_name,
      ROUND((SELECT COALESCE(SUM(amount),0) FROM folio_items f WHERE f.reservation_id = x.id) - (SELECT COALESCE(SUM(amount),0) FROM payments p WHERE p.reservation_id = x.id), 2) AS balance
    FROM reservations x JOIN guests g ON g.id = x.guest_id JOIN room_types rt ON rt.id = x.room_type_id LEFT JOIN rooms r ON r.id = x.room_id`;
  const rooms = get<any>(
    `SELECT COUNT(*) AS total, SUM(status = 'occupied') AS occupied, SUM(status = 'out_of_order') AS out_of_order,
            SUM(status = 'vacant_dirty') AS dirty, SUM(status IN ('vacant_clean','inspected')) AS clean FROM rooms`,
  );
  const week = revenueByDay(addDays(t, -6), t);
  const todayRev = week[week.length - 1];
  const tonight = get(
    `SELECT n.*, (SELECT COALESCE(SUM(pax),0) FROM guest_list g WHERE g.night_id = n.id AND g.checked_in = 1) AS checked_in_pax
       FROM club_nights n WHERE n.date = ? AND n.status != 'cancelled' LIMIT 1`,
    t,
  );
  const monthStart = t.slice(0, 8) + '01';
  res.json({
    date: t,
    rooms,
    arrivals: all(`${RES} WHERE x.status = 'booked' AND x.check_in <= ? AND x.check_out > ? ORDER BY x.check_in`, t, t),
    departures: all(`${RES} WHERE x.status = 'checked_in' AND x.check_out <= ?`, t),
    in_house: scalar(`SELECT COALESCE(SUM(adults + children),0) FROM reservations WHERE status = 'checked_in'`),
    revenue_today: { hotel: todayRev.hotel, restaurant: todayRev.restaurant, rooftop: todayRev.rooftop, events: todayRev.events },
    revenue_7d: week,
    restaurant: {
      open_checks: scalar(`SELECT COUNT(*) FROM orders WHERE outlet = 'restaurant' AND status = 'open'`),
      covers_today: scalar(`SELECT COALESCE(SUM(covers),0) FROM orders WHERE outlet = 'restaurant' AND status != 'void' AND date(created_at, 'localtime') = ?`, t),
      bookings_today: scalar(`SELECT COUNT(*) FROM table_bookings WHERE outlet = 'restaurant' AND date = ? AND status IN ('booked','seated','completed')`, t),
      tickets: scalar(`SELECT COUNT(DISTINCT i.order_id) FROM order_items i JOIN orders o ON o.id = i.order_id WHERE o.outlet = 'restaurant' AND i.status IN ('fired','ready')`),
    },
    rooftop: {
      cabanas_booked: scalar(`SELECT COUNT(DISTINCT resource_id) FROM resource_bookings WHERE date = ? AND status != 'cancelled'`, t),
      cabanas_total: scalar(`SELECT COUNT(*) FROM resources WHERE venue = 'rooftop'`),
      tonight: tonight ?? null,
      open_tabs: scalar(`SELECT COUNT(*) FROM orders WHERE outlet = 'rooftop' AND status = 'open'`),
    },
    events: {
      upcoming: all(
        `SELECT e.*, (SELECT COALESCE(SUM(qty*unit_price),0) FROM event_items i WHERE i.event_id = e.id) AS quote_total
           FROM events e WHERE e.date >= ? AND e.status IN ('inquiry','tentative','confirmed') ORDER BY e.date LIMIT 5`,
        t,
      ),
      pipeline_value: scalar(`SELECT COALESCE(SUM(i.qty*i.unit_price),0) FROM event_items i JOIN events e ON e.id = i.event_id WHERE e.status IN ('inquiry','tentative') AND e.date >= ?`, t),
      this_month: scalar(`SELECT COUNT(*) FROM events WHERE date BETWEEN ? AND ? AND status IN ('confirmed','completed')`, monthStart, t.slice(0, 8) + '31'),
    },
    housekeeping_open: scalar(`SELECT COUNT(*) FROM housekeeping_tasks WHERE status != 'done'`),
    low_stock: scalar(`SELECT COUNT(*) FROM inventory_items WHERE qty <= par_level`),
    activity: all(`SELECT a.*, u.name AS user_name FROM activity_log a LEFT JOIN users u ON u.id = a.user_id ORDER BY a.created_at DESC, a.id DESC LIMIT 14`),
  });
});

insights.get('/reports/summary', requireArea('reports'), (req, res) => {
  const from = String(req.query.from ?? '');
  const to = String(req.query.to ?? '');
  if (!DATE_RE.test(from) || !DATE_RE.test(to) || to < from) throw bad('Provide a valid date range');
  const daily = revenueByDay(from, to);
  const revenue = daily.reduce(
    (s, d) => ({ hotel: s.hotel + d.hotel, restaurant: s.restaurant + d.restaurant, rooftop: s.rooftop + d.rooftop, events: s.events + d.events }),
    { hotel: 0, restaurant: 0, rooftop: 0, events: 0 },
  );
  const totalRooms = scalar<number>(`SELECT COUNT(*) FROM rooms`) || 1;
  const stays = all<{ check_in: string; check_out: string; rate: number }>(
    `SELECT check_in, check_out, rate FROM reservations WHERE status IN ('checked_in','checked_out') AND check_in <= ? AND check_out > ?`,
    to,
    from,
  );
  const occupancy = dateRange(from, to).map((d) => ({ date: d, occupied: stays.filter((s) => s.check_in <= d && s.check_out > d).length, total: totalRooms }));
  let roomNights = 0;
  let roomRevenue = 0;
  for (const d of occupancy) {
    for (const s of stays) if (s.check_in <= d.date && s.check_out > d.date) {
      roomNights++;
      roomRevenue += s.rate;
    }
  }
  const days = occupancy.length;
  res.json({
    from,
    to,
    revenue: { ...Object.fromEntries(Object.entries(revenue).map(([k, v]) => [k, round2(v)])), total: round2(revenue.hotel + revenue.restaurant + revenue.rooftop + revenue.events) },
    daily,
    occupancy,
    occupancy_pct: round2((roomNights / (totalRooms * days)) * 100),
    adr: roomNights ? round2(roomRevenue / roomNights) : 0,
    revpar: round2(roomRevenue / (totalRooms * days)),
    room_nights: roomNights,
    top_items: all(
      `SELECT i.name, o.outlet, SUM(i.qty) AS qty, SUM(i.qty * i.unit_price) AS revenue FROM order_items i JOIN orders o ON o.id = i.order_id
        WHERE o.status IN ('paid','charged') AND i.status != 'void' AND date(o.closed_at, 'localtime') BETWEEN ? AND ?
        GROUP BY i.name, o.outlet ORDER BY revenue DESC LIMIT 10`,
      from,
      to,
    ),
    payment_mix: all(`SELECT method, ROUND(SUM(amount), 2) AS amount FROM payments WHERE date(created_at, 'localtime') BETWEEN ? AND ? GROUP BY method ORDER BY amount DESC`, from, to),
    sources: all(`SELECT source, COUNT(*) AS count FROM reservations WHERE check_in BETWEEN ? AND ? AND status != 'cancelled' GROUP BY source ORDER BY count DESC`, from, to),
  });
});
