import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  BarChart3,
  BedDouble,
  Boxes,
  CalendarDays,
  CalendarRange,
  ChefHat,
  ClipboardList,
  Contact,
  GanttChartSquare,
  LayoutDashboard,
  LogOut,
  Martini,
  Menu,
  Music2,
  NotebookTabs,
  Settings as SettingsIcon,
  Sparkles,
  SquareMenu,
  Sun,
  Trees,
  Users,
  UtensilsCrossed,
  Waves,
} from 'lucide-react';
import { useAuth } from '../lib/auth';
import { can, ROLE_LABELS, type Area } from '../lib/permissions';
import { useApi, useNow } from '../lib/hooks';
import { initials } from '../lib/format';

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
  area?: Area;
  count?: number;
  end?: boolean;
}

interface NavCounts {
  arrivals: number;
  departures: number;
  hk_open: number;
  kitchen: number;
  bar: number;
  low_stock: number;
  inquiries: number;
}

export function Layout() {
  const { user, settings, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  const now = useNow(15000);
  const { data: counts } = useApi<NavCounts>('/nav-counts', { refetchInterval: 30000 });

  useEffect(() => setOpen(false), [loc.pathname, loc.search]);

  const groups: { title: string; color: string; items: NavItem[] }[] = [
    {
      title: 'Property',
      color: '#ff5a36',
      items: [{ to: '/', label: 'Overview', icon: <LayoutDashboard size={16} />, end: true }],
    },
    {
      title: 'Hotel',
      color: '#0f9d8a',
      items: [
        { to: '/front-desk', label: 'Front desk', icon: <GanttChartSquare size={16} />, area: 'front_office', count: counts?.arrivals },
        { to: '/reservations', label: 'Reservations', icon: <NotebookTabs size={16} />, area: 'front_office' },
        { to: '/rooms', label: 'Rooms board', icon: <BedDouble size={16} />, area: 'rooms' },
        { to: '/guests', label: 'Guests', icon: <Contact size={16} />, area: 'front_office' },
        { to: '/housekeeping', label: 'Housekeeping', icon: <Sparkles size={16} />, area: 'housekeeping', count: counts?.hk_open },
      ],
    },
    {
      title: 'Ember & Salt',
      color: '#f2662e',
      items: [
        { to: '/restaurant', label: 'Floor & POS', icon: <UtensilsCrossed size={16} />, area: 'restaurant', end: true },
        { to: '/kitchen?outlet=restaurant', label: 'Kitchen display', icon: <ChefHat size={16} />, area: 'restaurant', count: counts?.kitchen },
        { to: '/restaurant/bookings', label: 'Table bookings', icon: <CalendarDays size={16} />, area: 'restaurant' },
        { to: '/restaurant/menu', label: 'Menu', icon: <SquareMenu size={16} />, area: 'restaurant' },
      ],
    },
    {
      title: 'Skydeck rooftop',
      color: '#0ea5e9',
      items: [
        { to: '/rooftop', label: 'Bar & POS', icon: <Martini size={16} />, area: 'rooftop_bar', end: true },
        { to: '/kitchen?outlet=rooftop', label: 'Bar tickets', icon: <ClipboardList size={16} />, area: 'rooftop_bar', count: counts?.bar },
        { to: '/rooftop/pool', label: 'Pool & cabanas', icon: <Waves size={16} />, area: 'pool' },
        { to: '/rooftop/club', label: 'Club nights', icon: <Music2 size={16} />, area: 'club' },
        { to: '/rooftop/menu', label: 'Bar menu', icon: <SquareMenu size={16} />, area: 'rooftop_bar' },
      ],
    },
    {
      title: 'The Garden',
      color: '#4caf2a',
      items: [
        { to: '/events', label: 'Events pipeline', icon: <Trees size={16} />, area: 'events', end: true, count: counts?.inquiries },
        { to: '/events/calendar', label: 'Calendar', icon: <CalendarRange size={16} />, area: 'events' },
      ],
    },
    {
      title: 'Back office',
      color: '#7c3aed',
      items: [
        { to: '/inventory', label: 'Inventory', icon: <Boxes size={16} />, area: 'inventory', count: counts?.low_stock },
        { to: '/staff', label: 'Staff & rota', icon: <Users size={16} />, area: 'staff' },
        { to: '/reports', label: 'Reports', icon: <BarChart3 size={16} />, area: 'reports' },
        { to: '/settings', label: 'Settings', icon: <SettingsIcon size={16} />, area: 'settings' },
      ],
    },
  ];

  const hour = now.getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="shell">
      {open && <div className="scrim" style={{ zIndex: 25 }} onClick={() => setOpen(false)} />}
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="brand">
          <div className="brand-mark">K</div>
          <div>
            <div className="brand-name">Keyhouse</div>
            <div className="brand-sub">{settings?.property_name ?? 'The Marlowe'}</div>
          </div>
        </div>
        <nav className="nav">
          {groups.map((g) => {
            const items = g.items.filter((i) => !i.area || can(user?.role, i.area));
            if (!items.length) return null;
            return (
              <div className="nav-group" key={g.title}>
                <div className="nav-group-title" style={{ ['--dot' as string]: g.color }}>
                  <span className="dot" />
                  {g.title}
                </div>
                {items.map((i) => (
                  <NavLink
                    key={i.to}
                    to={i.to}
                    end={i.end}
                    style={{ ['--nav-c' as string]: g.color }}
                    className={({ isActive }) => {
                      // query-string routes (kitchen) need a manual active check
                      if (i.to.includes('?')) return loc.pathname + loc.search === i.to ? 'active' : '';
                      return isActive ? 'active' : '';
                    }}
                  >
                    {i.icon}
                    {i.label}
                    {!!i.count && <span className="badge-count">{i.count}</span>}
                  </NavLink>
                ))}
              </div>
            );
          })}
        </nav>
        <div className="sidebar-foot">
          <div className="avatar">{initials(user?.name ?? '')}</div>
          <div className="who">
            <b>{user?.name}</b>
            <span>{user ? ROLE_LABELS[user.role] : ''}</span>
          </div>
          <button className="icon-btn" onClick={logout} title="Sign out" aria-label="Sign out">
            <LogOut size={16} />
          </button>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <button className="icon-btn menu-btn" onClick={() => setOpen(true)} aria-label="Open navigation">
            <Menu size={18} />
          </button>
          <span className="date-line">
            {greeting}, {user?.name.split(' ')[0]} — {now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
          </span>
          <span className="grow" />
          {counts && (
            <span className="small muted row" style={{ gap: 14 }}>
              <span>
                <Sun size={13} style={{ verticalAlign: -2 }} /> {counts.arrivals} arriving · {counts.departures} departing
              </span>
            </span>
          )}
          <span className="clock">{now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>
        </header>
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

/** Brand mark: a single breeze-block unit — the screen that shades Accra's modernist buildings. */
export function KeyGlyph({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}>
      <rect x="2" y="2" width="20" height="20" strokeWidth={1.6} />
      <circle cx="12" cy="12" r="5.2" />
      <path d="M2 7a5 5 0 0 0 5-5M17 2a5 5 0 0 0 5 5M22 17a5 5 0 0 0-5 5M7 22a5 5 0 0 0-5-5" />
    </svg>
  );
}
