import { all, get, run, setting } from '../db.ts';
import { round2 } from '../util.ts';

export const ORDER_SQL = `
  SELECT o.*, t.label AS table_label, u.name AS server_name, rm.number AS room_number
    FROM orders o
    LEFT JOIN dining_tables t ON t.id = o.table_id
    LEFT JOIN users u ON u.id = o.opened_by
    LEFT JOIN reservations x ON x.id = o.reservation_id
    LEFT JOIN rooms rm ON rm.id = x.room_id`;

export function recalc(orderId: number) {
  const subtotal = round2(
    (get<{ s: number }>(`SELECT COALESCE(SUM(qty * unit_price), 0) AS s FROM order_items WHERE order_id = ? AND status != 'void'`, orderId)?.s ?? 0),
  );
  const serviceRate = Number(setting('service_rate') || 0) / 100;
  const vatRate = Number(setting('vat_rate') || 0) / 100;
  const service = round2(subtotal * serviceRate);
  const tax = round2((subtotal + service) * vatRate);
  run('UPDATE orders SET subtotal = ?, service_charge = ?, tax = ?, total = ? WHERE id = ?', subtotal, service, tax, round2(subtotal + service + tax), orderId);
}

export function orderDetail(id: number | string) {
  const o = get(`${ORDER_SQL} WHERE o.id = ?`, id);
  if (!o) return null;
  return { ...o, items: all('SELECT * FROM order_items WHERE order_id = ? ORDER BY id', id) };
}

export function addItem(orderId: number, menuItemId: number, qty: number, notes: string | null, fired: boolean) {
  const m = get<any>('SELECT * FROM menu_items WHERE id = ? AND deleted = 0', menuItemId);
  if (!m) throw new Error('Unknown menu item');
  if (!fired && !notes) {
    const same = get<{ id: number }>(`SELECT id FROM order_items WHERE order_id = ? AND menu_item_id = ? AND status = 'pending' AND notes IS NULL`, orderId, menuItemId);
    if (same) {
      run('UPDATE order_items SET qty = qty + ? WHERE id = ?', qty, same.id);
      recalc(orderId);
      return;
    }
  }
  run(
    `INSERT INTO order_items (order_id, menu_item_id, name, qty, unit_price, notes, station, status, fired_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, CASE WHEN ? THEN datetime('now') ELSE NULL END)`,
    orderId,
    m.id,
    m.name,
    qty,
    m.price,
    notes,
    m.station,
    fired ? 'fired' : 'pending',
    fired,
  );
  recalc(orderId);
}
