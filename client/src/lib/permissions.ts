import type { Role } from './types';

/** Mirrors server/src/permissions.ts — the server is the source of truth. */
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

export function can(role: Role | undefined, area: Area) {
  return !!role && ACCESS[area].includes(role);
}

export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Administrator',
  manager: 'General manager',
  front_desk: 'Front desk',
  housekeeping: 'Housekeeping',
  restaurant: 'Restaurant',
  bar: 'Rooftop bar',
  events: 'Events',
  accounts: 'Accounts',
};
