export type Role = 'admin' | 'manager' | 'front_desk' | 'housekeeping' | 'restaurant' | 'bar' | 'events' | 'accounts';

export type Area =
  | 'front_office'
  | 'rooms'
  | 'housekeeping'
  | 'folio'
  | 'restaurant'
  | 'rooftop_bar'
  | 'pool'
  | 'club'
  | 'events'
  | 'inventory'
  | 'staff'
  | 'reports'
  | 'settings';

export const ROLES: Role[] = ['admin', 'manager', 'front_desk', 'housekeeping', 'restaurant', 'bar', 'events', 'accounts'];

const ACCESS: Record<Area, Role[]> = {
  front_office: ['admin', 'manager', 'front_desk', 'accounts'],
  rooms: ['admin', 'manager', 'front_desk', 'housekeeping'],
  housekeeping: ['admin', 'manager', 'front_desk', 'housekeeping'],
  folio: ['admin', 'manager', 'front_desk', 'accounts'],
  restaurant: ['admin', 'manager', 'restaurant'],
  rooftop_bar: ['admin', 'manager', 'bar'],
  pool: ['admin', 'manager', 'bar', 'front_desk'],
  club: ['admin', 'manager', 'bar'],
  events: ['admin', 'manager', 'events', 'accounts'],
  inventory: ['admin', 'manager', 'accounts', 'restaurant', 'bar', 'housekeeping'],
  staff: ['admin', 'manager'],
  reports: ['admin', 'manager', 'accounts'],
  settings: ['admin'],
};

export function can(role: Role, area: Area) {
  return ACCESS[area].includes(role);
}

export const outletArea = (outlet: string): Area => (outlet === 'rooftop' ? 'rooftop_bar' : 'restaurant');
