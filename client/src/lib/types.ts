export type Role =
  | 'admin'
  | 'manager'
  | 'front_desk'
  | 'housekeeping'
  | 'restaurant'
  | 'bar'
  | 'events'
  | 'accounts';

export interface User {
  id: number;
  name: string;
  email: string;
  role: Role;
  active: number;
  created_at?: string;
}

export interface Settings {
  property_name: string;
  currency: string;
  vat_rate: string;
  service_rate: string;
  address: string;
  phone: string;
  email: string;
  check_in_time: string;
  check_out_time: string;
}

export interface RoomType {
  id: number;
  name: string;
  code: string;
  base_rate: number;
  capacity: number;
  description: string;
  room_count?: number;
  images: string[];
  features: string[];
}

export type RoomStatus = 'vacant_clean' | 'vacant_dirty' | 'inspected' | 'occupied' | 'out_of_order';

export interface Room {
  id: number;
  number: string;
  floor: number;
  room_type_id: number;
  type_name: string;
  type_code: string;
  base_rate: number;
  status: RoomStatus;
  notes: string | null;
  guest_name?: string | null;
  reservation_id?: number | null;
  check_out?: string | null;
  arriving?: string | null;
}

export interface Guest {
  id: number;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  nationality: string | null;
  id_type: string | null;
  id_number: string | null;
  vip: number;
  notes: string | null;
  created_at: string;
  stays?: number;
  spend?: number;
  last_stay?: string | null;
}

export type ResStatus = 'booked' | 'checked_in' | 'checked_out' | 'cancelled' | 'no_show';

export interface Reservation {
  id: number;
  code: string;
  guest_id: number;
  guest_name: string;
  guest_phone?: string | null;
  guest_email?: string | null;
  vip?: number;
  room_id: number | null;
  room_number: string | null;
  room_type_id: number;
  type_name: string;
  check_in: string;
  check_out: string;
  adults: number;
  children: number;
  rate: number;
  status: ResStatus;
  source: string;
  notes: string | null;
  created_at: string;
  balance?: number;
}

export interface FolioItem {
  id: number;
  date: string;
  description: string;
  category: string;
  amount: number;
  created_at: string;
}

export interface Payment {
  id: number;
  amount: number;
  method: string;
  reference: string | null;
  created_at: string;
}

export interface ReservationDetail extends Reservation {
  folio: FolioItem[];
  payments: Payment[];
  charges: number;
  paid: number;
  balance: number;
  guest: Guest;
}

export interface HousekeepingTask {
  id: number;
  room_id: number;
  room_number: string;
  room_status: RoomStatus;
  type: string;
  priority: 'low' | 'normal' | 'high';
  status: 'open' | 'in_progress' | 'done';
  assigned_to: number | null;
  assignee: string | null;
  notes: string | null;
  created_at: string;
  completed_at: string | null;
}

export type Outlet = 'restaurant' | 'rooftop';

export interface MenuCategory {
  id: number;
  outlet: Outlet;
  name: string;
  sort: number;
}

export interface MenuItem {
  id: number;
  category_id: number;
  category_name?: string;
  outlet: Outlet;
  name: string;
  description: string | null;
  price: number;
  available: number;
  station: 'kitchen' | 'bar';
  image_url?: string | null;
}

export interface DiningTable {
  id: number;
  outlet: Outlet;
  label: string;
  seats: number;
  zone: string;
  x: number;
  y: number;
  shape: 'round' | 'square' | 'long';
  status: 'free' | 'seated' | 'reserved' | 'dirty';
  order_id?: number | null;
  order_total?: number | null;
  opened_at?: string | null;
  covers?: number | null;
}

export interface OrderItem {
  id: number;
  order_id: number;
  menu_item_id: number;
  name: string;
  qty: number;
  unit_price: number;
  notes: string | null;
  status: 'pending' | 'fired' | 'ready' | 'served' | 'void';
  station: string;
  fired_at: string | null;
}

export interface Order {
  id: number;
  code: string;
  outlet: Outlet;
  table_id: number | null;
  table_label: string | null;
  guest_name: string | null;
  reservation_id: number | null;
  room_number?: string | null;
  covers: number;
  status: 'open' | 'paid' | 'void' | 'charged';
  subtotal: number;
  service_charge: number;
  tax: number;
  total: number;
  payment_method: string | null;
  created_at: string;
  closed_at: string | null;
  server_name?: string | null;
  channel?: string | null;
  fulfilment?: 'pickup' | 'room' | 'poolside' | null;
  kitchen_started_at?: string | null;
  items?: OrderItem[];
}

export interface TableBooking {
  id: number;
  outlet: Outlet;
  guest_name: string;
  phone: string | null;
  party_size: number;
  date: string;
  time: string;
  table_id: number | null;
  table_label?: string | null;
  status: 'booked' | 'seated' | 'completed' | 'cancelled' | 'no_show';
  notes: string | null;
}

export interface Resource {
  id: number;
  venue: string;
  kind: string;
  label: string;
  capacity: number;
  price: number;
}

export interface ResourceBooking {
  id: number;
  resource_id: number;
  resource_label: string;
  kind: string;
  guest_name: string;
  reservation_id: number | null;
  room_number?: string | null;
  date: string;
  start_time: string;
  end_time: string;
  pax: number;
  price: number;
  status: 'booked' | 'arrived' | 'completed' | 'cancelled';
  settlement: 'unpaid' | 'paid' | 'room';
  notes: string | null;
}

export interface ClubNight {
  id: number;
  title: string;
  date: string;
  dj: string | null;
  cover_charge: number;
  capacity: number;
  status: 'scheduled' | 'live' | 'closed' | 'cancelled';
  notes: string | null;
  list_count?: number;
  list_pax?: number;
  checked_in_pax?: number;
  cover_revenue?: number;
}

export interface GuestListEntry {
  id: number;
  night_id: number;
  name: string;
  pax: number;
  type: 'guestlist' | 'vip' | 'table' | 'walk_in';
  checked_in: number;
  checked_in_at: string | null;
  cover_paid: number;
  notes: string | null;
}

export interface ClubNightDetail extends ClubNight {
  guests: GuestListEntry[];
}

export type EventStatus = 'inquiry' | 'tentative' | 'confirmed' | 'completed' | 'cancelled';

export interface EventRec {
  id: number;
  code: string;
  title: string;
  client_name: string;
  client_phone: string | null;
  client_email: string | null;
  event_type: string;
  venue: 'garden' | 'rooftop' | 'restaurant_private' | 'pavilion';
  date: string;
  start_time: string;
  end_time: string;
  guests: number;
  status: EventStatus;
  notes: string | null;
  quote_total: number;
  paid: number;
  created_at: string;
}

export interface EventItem {
  id: number;
  event_id: number;
  description: string;
  qty: number;
  unit_price: number;
}

export interface EventTask {
  id: number;
  event_id: number;
  title: string;
  due_date: string | null;
  done: number;
}

export interface EventDetail extends EventRec {
  items: EventItem[];
  tasks: EventTask[];
  payments: Payment[];
  clashes: { id: number; code: string; title: string; status: string }[];
}

export interface InventoryItem {
  id: number;
  name: string;
  sku: string;
  store: 'kitchen' | 'bar' | 'housekeeping' | 'maintenance';
  unit: string;
  qty: number;
  par_level: number;
  cost: number;
  supplier: string | null;
}

export interface StockMovement {
  id: number;
  item_id: number;
  item_name: string;
  unit: string;
  change: number;
  reason: string;
  note: string | null;
  user_name: string | null;
  created_at: string;
}

export interface Staff {
  id: number;
  name: string;
  department: string;
  position: string;
  phone: string | null;
  email: string | null;
  status: 'active' | 'leave' | 'inactive';
  hired_on: string | null;
}

export interface Shift {
  id: number;
  staff_id: number;
  staff_name?: string;
  date: string;
  start_time: string;
  end_time: string;
  department: string;
  notes: string | null;
}

export interface Activity {
  id: number;
  user_name: string | null;
  action: string;
  venue: string;
  created_at: string;
}

export interface Dashboard {
  date: string;
  rooms: { total: number; occupied: number; out_of_order: number; dirty: number; clean: number };
  arrivals: Reservation[];
  departures: Reservation[];
  in_house: number;
  revenue_today: { hotel: number; restaurant: number; rooftop: number; events: number };
  revenue_7d: { date: string; hotel: number; restaurant: number; rooftop: number; events: number }[];
  restaurant: { open_checks: number; covers_today: number; bookings_today: number; tickets: number };
  rooftop: { cabanas_booked: number; cabanas_total: number; tonight: ClubNight | null; open_tabs: number };
  events: { upcoming: EventRec[]; pipeline_value: number; this_month: number };
  housekeeping_open: number;
  low_stock: number;
  activity: Activity[];
}

export interface ReportSummary {
  from: string;
  to: string;
  revenue: { hotel: number; restaurant: number; rooftop: number; events: number; total: number };
  daily: { date: string; hotel: number; restaurant: number; rooftop: number; events: number }[];
  occupancy: { date: string; occupied: number; total: number }[];
  occupancy_pct: number;
  adr: number;
  revpar: number;
  room_nights: number;
  top_items: { name: string; outlet: string; qty: number; revenue: number }[];
  payment_mix: { method: string; amount: number }[];
  sources: { source: string; count: number }[];
}
