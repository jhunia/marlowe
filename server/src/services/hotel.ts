import { all, get, run, scalar, tx, withImages } from '../db.ts';
import { addDays, bad, conflict, makeCode, nights, round2, today } from '../util.ts';

/** Is the room free for [from, to) ignoring reservation `exceptId`? */
export function roomIsFree(roomId: number, from: string, to: string, exceptId = 0) {
  return !get(
    `SELECT 1 FROM reservations WHERE room_id = ? AND id != ? AND status IN ('booked','checked_in')
       AND check_in < ? AND check_out > ?`,
    roomId,
    exceptId,
    to,
    from,
  );
}

export function availability(from: string, to: string, typeId?: number) {
  const types = all<{ id: number; name: string; code: string; base_rate: number; capacity: number; description: string; images: string }>(
    `SELECT * FROM room_types ${typeId ? 'WHERE id = ?' : ''} ORDER BY base_rate`,
    ...(typeId ? [typeId] : []),
  );
  return types.map((t) => {
    const rooms = all<{ id: number; number: string; floor: number; status: string }>(
      `SELECT r.id, r.number, r.floor, r.status FROM rooms r
        WHERE r.room_type_id = ? AND r.status != 'out_of_order'
          AND NOT EXISTS (SELECT 1 FROM reservations x WHERE x.room_id = r.id AND x.status IN ('booked','checked_in')
                          AND x.check_in < ? AND x.check_out > ?)
        ORDER BY r.number`,
      t.id,
      to,
      from,
    );
    const unassigned = scalar<number>(
      `SELECT COUNT(*) FROM reservations WHERE room_type_id = ? AND room_id IS NULL AND status = 'booked'
         AND check_in < ? AND check_out > ?`,
      t.id,
      to,
      from,
    );
    return { ...withImages(t), available: Math.max(0, rooms.length - unassigned), rooms };
  });
}

export function folioTotals(resId: number) {
  const charges = scalar<number>('SELECT COALESCE(SUM(amount),0) FROM folio_items WHERE reservation_id = ?', resId) ?? 0;
  const paid = scalar<number>('SELECT COALESCE(SUM(amount),0) FROM payments WHERE reservation_id = ?', resId) ?? 0;
  return { charges: round2(charges), paid: round2(paid), balance: round2(charges - paid) };
}

/** Post one room-night folio line for every night in [from, to) not already posted. */
export function postRoomNights(resId: number, from: string, to: string, rate: number, roomNumber: string, userId: number | null) {
  for (let d = from; d < to; d = addDays(d, 1)) {
    const exists = get(`SELECT 1 FROM folio_items WHERE reservation_id = ? AND category = 'room' AND date = ?`, resId, d);
    if (!exists) {
      run(
        `INSERT INTO folio_items (reservation_id, date, description, category, amount, created_by) VALUES (?, ?, ?, 'room', ?, ?)`,
        resId,
        d,
        `Room ${roomNumber} — night of ${d}`,
        rate,
        userId,
      );
    }
  }
}

export function removeRoomNightsFrom(resId: number, from: string) {
  run(`DELETE FROM folio_items WHERE reservation_id = ? AND category = 'room' AND date >= ?`, resId, from);
}

export interface NewReservation {
  guest_id: number;
  room_type_id: number;
  room_id?: number | null;
  check_in: string;
  check_out: string;
  adults: number;
  children: number;
  rate?: number;
  source: string;
  notes?: string | null;
}

export function createReservation(input: NewReservation) {
  if (nights(input.check_in, input.check_out) <= 0) throw bad('Check-out must be after check-in');
  if (input.check_in < addDays(today(), -1) && input.source === 'website') throw bad('Arrival date is in the past');
  const type = get<{ id: number; base_rate: number; capacity: number; name: string }>('SELECT * FROM room_types WHERE id = ?', input.room_type_id);
  if (!type) throw bad('Unknown room type');
  if (input.adults + input.children > type.capacity + 1) throw bad(`${type.name} sleeps ${type.capacity}`);

  return tx(() => {
    if (input.room_id) {
      const room = get<{ room_type_id: number; status: string; number: string }>('SELECT * FROM rooms WHERE id = ?', input.room_id);
      if (!room) throw bad('Unknown room');
      if (room.room_type_id !== input.room_type_id) throw bad('Room does not match the room type');
      if (room.status === 'out_of_order') throw conflict(`Room ${room.number} is out of order`);
      if (!roomIsFree(input.room_id, input.check_in, input.check_out)) throw conflict(`Room ${room.number} is already booked for those dates`);
    } else {
      const [t] = availability(input.check_in, input.check_out, input.room_type_id);
      if (!t || t.available <= 0) throw conflict(`No ${type.name} rooms available for those dates`);
    }
    const code = makeCode('MR', 'reservations');
    const { id } = run(
      `INSERT INTO reservations (code, guest_id, room_id, room_type_id, check_in, check_out, adults, children, rate, source, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      code,
      input.guest_id,
      input.room_id ?? null,
      input.room_type_id,
      input.check_in,
      input.check_out,
      input.adults,
      input.children,
      input.rate ?? type.base_rate,
      input.source,
      input.notes ?? null,
    );
    return { id, code };
  });
}

export function findOrCreateGuest(g: { first_name: string; last_name: string; email?: string | null; phone?: string | null; nationality?: string | null }) {
  if (g.email) {
    const existing = get<{ id: number }>('SELECT id FROM guests WHERE lower(email) = lower(?)', g.email);
    if (existing) return existing.id;
  }
  return run(
    'INSERT INTO guests (first_name, last_name, email, phone, nationality) VALUES (?, ?, ?, ?, ?)',
    g.first_name.trim(),
    g.last_name.trim(),
    g.email || null,
    g.phone || null,
    g.nationality || null,
  ).id;
}

/** Post an outlet charge to a checked-in guest's folio. */
export function chargeToRoom(resId: number, category: string, description: string, amount: number, ref: string, userId: number | null) {
  const r = get<{ status: string }>('SELECT status FROM reservations WHERE id = ?', resId);
  if (!r) throw bad('Reservation not found');
  if (r.status !== 'checked_in') throw conflict('Only checked-in guests can charge to their room');
  run(
    `INSERT INTO folio_items (reservation_id, date, description, category, amount, source_ref, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    resId,
    today(),
    description,
    category,
    round2(amount),
    ref,
    userId,
  );
}
