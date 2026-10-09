import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const DB_PATH = process.env.DB_PATH ?? join(here, '..', 'data', 'keyhouse.db');
mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');

type Param = string | number | bigint | null | Uint8Array;
function clean(params: unknown[]): Param[] {
  return params.map((p) => {
    if (p === undefined) return null;
    if (typeof p === 'boolean') return p ? 1 : 0;
    return p as Param;
  });
}

export function all<T = any>(sql: string, ...params: unknown[]): T[] {
  return db.prepare(sql).all(...clean(params)) as T[];
}

export function get<T = any>(sql: string, ...params: unknown[]): T | undefined {
  return db.prepare(sql).get(...clean(params)) as T | undefined;
}

export function run(sql: string, ...params: unknown[]) {
  const r = db.prepare(sql).run(...clean(params));
  return { changes: Number(r.changes), id: Number(r.lastInsertRowid) };
}

export function scalar<T = number>(sql: string, ...params: unknown[]): T {
  const row = get<Record<string, T>>(sql, ...params);
  return row ? (Object.values(row)[0] as T) : (null as T);
}

let depth = 0;
/** Run fn in a transaction; nested calls join the outer transaction. */
export function tx<T>(fn: () => T): T {
  if (depth > 0) return fn();
  depth++;
  db.exec('BEGIN');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  } finally {
    depth--;
  }
}

export function setting(key: string): string {
  return get<{ value: string }>('SELECT value FROM settings WHERE key = ?', key)?.value ?? '';
}

export function logActivity(userId: number | null, action: string, venue: 'hotel' | 'restaurant' | 'rooftop' | 'events' | 'office') {
  run('INSERT INTO activity_log (user_id, action, venue) VALUES (?, ?, ?)', userId, action, venue);
}

export function migrate() {
  db.exec(`
  CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS room_types (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    code TEXT NOT NULL UNIQUE,
    base_rate REAL NOT NULL,
    capacity INTEGER NOT NULL DEFAULT 2,
    description TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS rooms (
    id INTEGER PRIMARY KEY,
    number TEXT NOT NULL UNIQUE,
    floor INTEGER NOT NULL,
    room_type_id INTEGER NOT NULL REFERENCES room_types(id),
    status TEXT NOT NULL DEFAULT 'vacant_clean',
    notes TEXT
  );

  CREATE TABLE IF NOT EXISTS guests (
    id INTEGER PRIMARY KEY,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    nationality TEXT,
    id_type TEXT,
    id_number TEXT,
    vip INTEGER NOT NULL DEFAULT 0,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS reservations (
    id INTEGER PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    guest_id INTEGER NOT NULL REFERENCES guests(id),
    room_id INTEGER REFERENCES rooms(id),
    room_type_id INTEGER NOT NULL REFERENCES room_types(id),
    check_in TEXT NOT NULL,
    check_out TEXT NOT NULL,
    adults INTEGER NOT NULL DEFAULT 1,
    children INTEGER NOT NULL DEFAULT 0,
    rate REAL NOT NULL,
    status TEXT NOT NULL DEFAULT 'booked',
    source TEXT NOT NULL DEFAULT 'direct',
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    checked_in_at TEXT,
    checked_out_at TEXT
  );
  CREATE INDEX IF NOT EXISTS ix_res_dates ON reservations(check_in, check_out);
  CREATE INDEX IF NOT EXISTS ix_res_room ON reservations(room_id);

  CREATE TABLE IF NOT EXISTS folio_items (
    id INTEGER PRIMARY KEY,
    reservation_id INTEGER NOT NULL REFERENCES reservations(id),
    date TEXT NOT NULL,
    description TEXT NOT NULL,
    category TEXT NOT NULL,
    amount REAL NOT NULL,
    source_ref TEXT,
    created_by INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS ix_folio_res ON folio_items(reservation_id);

  CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY,
    reservation_id INTEGER REFERENCES reservations(id),
    event_id INTEGER REFERENCES events(id),
    order_id INTEGER REFERENCES orders(id),
    resource_booking_id INTEGER REFERENCES resource_bookings(id),
    amount REAL NOT NULL,
    method TEXT NOT NULL,
    reference TEXT,
    created_by INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS housekeeping_tasks (
    id INTEGER PRIMARY KEY,
    room_id INTEGER NOT NULL REFERENCES rooms(id),
    type TEXT NOT NULL,
    priority TEXT NOT NULL DEFAULT 'normal',
    status TEXT NOT NULL DEFAULT 'open',
    assigned_to INTEGER REFERENCES staff(id),
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    completed_at TEXT
  );

  CREATE TABLE IF NOT EXISTS menu_categories (
    id INTEGER PRIMARY KEY,
    outlet TEXT NOT NULL,
    name TEXT NOT NULL,
    sort INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS menu_items (
    id INTEGER PRIMARY KEY,
    category_id INTEGER NOT NULL REFERENCES menu_categories(id),
    outlet TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    price REAL NOT NULL,
    available INTEGER NOT NULL DEFAULT 1,
    station TEXT NOT NULL DEFAULT 'kitchen',
    deleted INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS dining_tables (
    id INTEGER PRIMARY KEY,
    outlet TEXT NOT NULL,
    label TEXT NOT NULL,
    seats INTEGER NOT NULL,
    zone TEXT NOT NULL,
    x INTEGER NOT NULL,
    y INTEGER NOT NULL,
    shape TEXT NOT NULL DEFAULT 'square',
    status TEXT NOT NULL DEFAULT 'free'
  );

  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    outlet TEXT NOT NULL,
    table_id INTEGER REFERENCES dining_tables(id),
    guest_name TEXT,
    reservation_id INTEGER REFERENCES reservations(id),
    covers INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'open',
    channel TEXT NOT NULL DEFAULT 'pos',
    contact_phone TEXT,
    fulfilment TEXT,
    subtotal REAL NOT NULL DEFAULT 0,
    service_charge REAL NOT NULL DEFAULT 0,
    tax REAL NOT NULL DEFAULT 0,
    total REAL NOT NULL DEFAULT 0,
    payment_method TEXT,
    opened_by INTEGER REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    closed_at TEXT
  );

  CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES orders(id),
    menu_item_id INTEGER NOT NULL REFERENCES menu_items(id),
    name TEXT NOT NULL,
    qty INTEGER NOT NULL,
    unit_price REAL NOT NULL,
    notes TEXT,
    station TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    fired_at TEXT
  );
  CREATE INDEX IF NOT EXISTS ix_items_order ON order_items(order_id);

  CREATE TABLE IF NOT EXISTS table_bookings (
    id INTEGER PRIMARY KEY,
    outlet TEXT NOT NULL,
    guest_name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    party_size INTEGER NOT NULL,
    date TEXT NOT NULL,
    time TEXT NOT NULL,
    table_id INTEGER REFERENCES dining_tables(id),
    status TEXT NOT NULL DEFAULT 'booked',
    source TEXT NOT NULL DEFAULT 'staff',
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS resources (
    id INTEGER PRIMARY KEY,
    venue TEXT NOT NULL,
    kind TEXT NOT NULL,
    label TEXT NOT NULL,
    capacity INTEGER NOT NULL,
    price REAL NOT NULL
  );

  CREATE TABLE IF NOT EXISTS resource_bookings (
    id INTEGER PRIMARY KEY,
    resource_id INTEGER NOT NULL REFERENCES resources(id),
    guest_name TEXT NOT NULL,
    phone TEXT,
    reservation_id INTEGER REFERENCES reservations(id),
    date TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    pax INTEGER NOT NULL,
    price REAL NOT NULL,
    status TEXT NOT NULL DEFAULT 'booked',
    settlement TEXT NOT NULL DEFAULT 'unpaid',
    source TEXT NOT NULL DEFAULT 'staff',
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS club_nights (
    id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    date TEXT NOT NULL,
    dj TEXT,
    cover_charge REAL NOT NULL DEFAULT 0,
    capacity INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'scheduled',
    notes TEXT
  );

  CREATE TABLE IF NOT EXISTS guest_list (
    id INTEGER PRIMARY KEY,
    night_id INTEGER NOT NULL REFERENCES club_nights(id),
    name TEXT NOT NULL,
    phone TEXT,
    pax INTEGER NOT NULL DEFAULT 1,
    type TEXT NOT NULL DEFAULT 'guestlist',
    checked_in INTEGER NOT NULL DEFAULT 0,
    checked_in_at TEXT,
    cover_paid INTEGER NOT NULL DEFAULT 0,
    notes TEXT
  );

  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    client_name TEXT NOT NULL,
    client_phone TEXT,
    client_email TEXT,
    event_type TEXT NOT NULL,
    venue TEXT NOT NULL,
    date TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    guests INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'inquiry',
    source TEXT NOT NULL DEFAULT 'staff',
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS event_items (
    id INTEGER PRIMARY KEY,
    event_id INTEGER NOT NULL REFERENCES events(id),
    description TEXT NOT NULL,
    qty REAL NOT NULL,
    unit_price REAL NOT NULL
  );

  CREATE TABLE IF NOT EXISTS event_tasks (
    id INTEGER PRIMARY KEY,
    event_id INTEGER NOT NULL REFERENCES events(id),
    title TEXT NOT NULL,
    due_date TEXT,
    done INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS inventory_items (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    sku TEXT NOT NULL UNIQUE,
    store TEXT NOT NULL,
    unit TEXT NOT NULL,
    qty REAL NOT NULL DEFAULT 0,
    par_level REAL NOT NULL DEFAULT 0,
    cost REAL NOT NULL DEFAULT 0,
    supplier TEXT
  );

  CREATE TABLE IF NOT EXISTS stock_movements (
    id INTEGER PRIMARY KEY,
    item_id INTEGER NOT NULL REFERENCES inventory_items(id),
    change REAL NOT NULL,
    reason TEXT NOT NULL,
    note TEXT,
    user_id INTEGER REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS staff (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    department TEXT NOT NULL,
    position TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    hired_on TEXT
  );

  CREATE TABLE IF NOT EXISTS shifts (
    id INTEGER PRIMARY KEY,
    staff_id INTEGER NOT NULL REFERENCES staff(id),
    date TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    department TEXT NOT NULL,
    notes TEXT
  );

  CREATE TABLE IF NOT EXISTS activity_log (
    id INTEGER PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    action TEXT NOT NULL,
    venue TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  `);

  db.exec(`
  CREATE TABLE IF NOT EXISTS feedback (
    id INTEGER PRIMARY KEY,
    rating INTEGER,
    message TEXT NOT NULL,
    page TEXT,
    area TEXT NOT NULL DEFAULT 'site',
    role TEXT,
    name TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  `);

  // additive column migrations for databases created before photos existed
  addColumn('room_types', 'images', "TEXT NOT NULL DEFAULT '[]'");
  addColumn('menu_items', 'image_url', 'TEXT');
  addColumn('room_types', 'features', "TEXT NOT NULL DEFAULT '[]'");
}

function addColumn(table: string, column: string, type: string) {
  const cols = all<{ name: string }>(`PRAGMA table_info(${table})`);
  if (!cols.some((c) => c.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
}

function jsonList(v: unknown): string[] {
  try {
    return typeof v === 'string' ? JSON.parse(v) : Array.isArray(v) ? (v as string[]) : [];
  } catch {
    return [];
  }
}

/** room_types.images (photo URLs) and room_types.features (short labels) are stored as JSON arrays. */
export function withImages<T extends { images?: unknown; features?: unknown }>(row: T): T & { images: string[]; features: string[] } {
  return { ...row, images: jsonList(row.images), features: jsonList(row.features) };
}
