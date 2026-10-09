/**
 * Runtime configuration. In production (NODE_ENV=production) the secrets below
 * are required — the server refuses to start rather than run with defaults.
 *
 *   JWT_SECRET      long random string used to sign staff sessions
 *   ADMIN_PASSWORD  password for the first admin account (created on first boot)
 *   ADMIN_EMAIL     optional, defaults to admin@marlowe.test
 *   DB_PATH         where the SQLite file lives (point it at a persistent volume)
 *   SEED_MODE       "demo" (default) fills sample bookings & sales; "clean" keeps only
 *                   the property setup (rooms, menus, tables, staff) with no transactions
 *   PORT            port to listen on (Railway sets this automatically)
 *
 *   DEMO_MODE=true  public test version: sample data, every demo login works with the
 *                   demo password (shown on the login page), account/settings changes are
 *                   blocked, and the data is rebuilt every DEMO_RESET_HOURS (default 24).
 *                   ADMIN_PASSWORD is not needed in demo mode.
 */
export const isProd = process.env.NODE_ENV === 'production';
export const isDemo = process.env.DEMO_MODE === 'true';
export const DEMO_PASSWORD = 'marlowe123';

function required(name: string, minLength: number): string {
  const v = process.env[name];
  if (!v || v.length < minLength) {
    console.error(`\n✖ ${name} must be set (at least ${minLength} characters) when NODE_ENV=production.\n`);
    process.exit(1);
  }
  return v;
}

export const config = {
  jwtSecret: isProd ? required('JWT_SECRET', 32) : process.env.JWT_SECRET ?? 'keyhouse-dev-secret-change-me',
  adminPassword: isDemo ? DEMO_PASSWORD : isProd ? required('ADMIN_PASSWORD', 10) : process.env.ADMIN_PASSWORD ?? DEMO_PASSWORD,
  adminEmail: isDemo ? 'admin@marlowe.test' : process.env.ADMIN_EMAIL ?? 'admin@marlowe.test',
  seedMode: !isDemo && process.env.SEED_MODE === 'clean' ? 'clean' : 'demo',
  demoResetHours: Math.max(1, Number(process.env.DEMO_RESET_HOURS ?? 24)),
  port: Number(process.env.PORT ?? process.env.API_PORT ?? 4000),
} as const;
