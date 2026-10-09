import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Menu, ShoppingBag, X } from 'lucide-react';
import { useApi } from '../lib/hooks';
import { setCurrency } from '../lib/format';
import { FeedbackButton, useMeta } from '../components/Feedback';
import { CartDrawer } from './Cart';
import './site.css';

export interface PublicInfo {
  property: {
    name: string;
    address: string;
    phone: string;
    email: string;
    currency: string;
    check_in_time: string;
    check_out_time: string;
    vat_rate: number;
    service_rate: number;
  };
  room_types: { id: number; name: string; code: string; base_rate: number; capacity: number; description: string; images: string[]; features: string[] }[];
  resources: { id: number; kind: string; label: string; capacity: number; price: number }[];
  club_nights: { id: number; title: string; date: string; dj: string | null; cover_charge: number; capacity: number; status: string }[];
}

/* ---------------------------------------------------------------- basket */

export interface BasketLine {
  id: number;
  name: string;
  price: number;
  qty: number;
  img?: string | null;
}

export type CartTab = 'basket' | 'orders';

/** Stays this device booked or looked up — lets "My booking" reopen them in one tap. */
export interface SavedStay {
  code: string;
  last_name: string;
}

interface BasketState {
  lines: BasketLine[];
  add: (l: Omit<BasketLine, 'qty'>, qty?: number) => void;
  setQty: (id: number, qty: number) => void;
  clear: () => void;
  count: number;
  /** cart panel */
  cartOpen: boolean;
  cartTab: CartTab;
  openCart: (tab?: CartTab) => void;
  closeCart: () => void;
  setCartTab: (t: CartTab) => void;
  /** order codes placed (or tracked) on this device, newest first */
  orders: string[];
  rememberOrder: (code: string) => void;
  stays: SavedStay[];
  rememberStay: (s: SavedStay) => void;
  forgetStay: (code: string) => void;
}

const BasketContext = createContext<BasketState | null>(null);
export const useBasket = () => useContext(BasketContext)!;
const BASKET_KEY = 'marlowe.basket';
const ORDERS_KEY = 'marlowe.orders';
const STAYS_KEY = 'marlowe.stays';

/** localStorage-backed state that degrades to memory when storage is unavailable. */
function useStored<T>(key: string, fallback: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
      return fallback;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* storage unavailable */
    }
  }, [key, value]);
  return [value, setValue] as const;
}

function BasketProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useStored<BasketLine[]>(BASKET_KEY, []);
  const [orders, setOrders] = useStored<string[]>(ORDERS_KEY, []);
  const [stays, setStays] = useStored<SavedStay[]>(STAYS_KEY, []);
  const [cartOpen, setCartOpen] = useState(false);
  const [cartTab, setCartTab] = useState<CartTab>('basket');

  const value: BasketState = {
    lines,
    count: lines.reduce((s, l) => s + l.qty, 0),
    add: (l, qty = 1) =>
      setLines((s) => {
        const hit = s.find((x) => x.id === l.id);
        return hit ? s.map((x) => (x.id === l.id ? { ...x, qty: x.qty + qty } : x)) : [...s, { ...l, qty }];
      }),
    setQty: (id, qty) => setLines((s) => (qty <= 0 ? s.filter((x) => x.id !== id) : s.map((x) => (x.id === id ? { ...x, qty } : x)))),
    clear: () => setLines([]),
    cartOpen,
    cartTab,
    openCart: (tab) => {
      setCartTab(tab ?? (lines.length === 0 && orders.length > 0 ? 'orders' : 'basket'));
      setCartOpen(true);
    },
    closeCart: () => setCartOpen(false),
    setCartTab,
    orders,
    rememberOrder: (code) => setOrders((o) => [code, ...o.filter((c) => c !== code)].slice(0, 30)),
    stays,
    rememberStay: (st) => setStays((list) => [{ code: st.code.toUpperCase(), last_name: st.last_name }, ...list.filter((x) => x.code !== st.code.toUpperCase())].slice(0, 10)),
    forgetStay: (code) => setStays((list) => list.filter((x) => x.code !== code)),
  };
  return <BasketContext.Provider value={value}>{children}</BasketContext.Provider>;
}

/* ---------------------------------------------------------------- layout */

export function usePublicInfo() {
  const q = useApi<PublicInfo>('/public/info');
  useEffect(() => {
    if (q.data) setCurrency(q.data.property.currency);
  }, [q.data]);
  return q;
}

export function SiteLayout() {
  return (
    <BasketProvider>
      <SiteShell />
    </BasketProvider>
  );
}

function SiteShell() {
  const { data } = usePublicInfo();
  const basket = useBasket();
  const meta = useMeta();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  useEffect(() => {
    setOpen(false);
    window.scrollTo(0, 0);
  }, [loc.pathname]);

  const name = data?.property.name ?? 'The Marlowe';
  return (
    <div className="site">
      <div className="site-announce">
        {meta?.demo ? (
          <>
            Test version — bookings and orders here aren’t real. Try anything, then tell us what you think with the Feedback button.
          </>
        ) : (
          <>
            Book direct for our best rate · pay with MoMo or card · <Link to="/visit/stay">Check dates</Link>
          </>
        )}
      </div>
      <header className="site-nav">
        <div className="inner">
          <Link to="/visit" className="site-logo" aria-label={name}>
            {name.replace(/^the\s+/i, '')}
            <span className="dot">.</span>
            <small>Accra</small>
          </Link>
          <nav className={`site-links ${open ? 'open' : ''}`}>
            <NavLink to="/visit/stay">Stay</NavLink>
            <NavLink to="/visit/dine">Dine</NavLink>
            <NavLink to="/visit/rooftop">Skydeck</NavLink>
            <NavLink to="/visit/events">Celebrate</NavLink>
            <NavLink to="/visit/booking">My booking</NavLink>
          </nav>
          <span className="grow" />
          <button type="button" className="icon-btn cart-btn" aria-label={`Your basket and orders${basket.count ? `, ${basket.count} items` : ''}`} onClick={() => basket.openCart()}>
            <ShoppingBag size={19} />
            {basket.count > 0 && <span className="n">{basket.count}</span>}
          </button>
          <Link to="/visit/stay" className="btn">
            Book a stay
          </Link>
          <button className="icon-btn site-burger" onClick={() => setOpen(!open)} aria-label="Menu">
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </header>

      <main className="site-main">
        <Outlet />
      </main>

      <footer className="site-foot">
        <div className="band" />
        <div className="s-wrap">
          <div className="cols">
            <div>
              <div className="big">{name}</div>
              <p style={{ margin: 0 }}>A hotel, a restaurant, a rooftop club & pool, and a garden for celebrations — all under one roof in Accra.</p>
              <div className="pays">
                <span>MTN MoMo</span>
                <span>Telecel Cash</span>
                <span>VISA</span>
                <span>Mastercard</span>
              </div>
            </div>
            <div>
              <h5>Visit</h5>
              <span>{data?.property.address}</span>
              <a href={`tel:${data?.property.phone}`}>{data?.property.phone}</a>
              <a href={`mailto:${data?.property.email}`}>{data?.property.email}</a>
            </div>
            <div>
              <h5>Explore</h5>
              <Link to="/visit/stay">Rooms & suites</Link>
              <Link to="/visit/dine">Ember & Salt</Link>
              <Link to="/visit/rooftop">Skydeck club & pool</Link>
              <Link to="/visit/events">The Garden</Link>
            </div>
            <div>
              <h5>Hours</h5>
              <span>Check-in from {data?.property.check_in_time}</span>
              <span style={{ display: 'block' }}>Check-out by {data?.property.check_out_time}</span>
              <span style={{ display: 'block' }}>Restaurant 12:00–23:00</span>
              <span style={{ display: 'block' }}>Skydeck pool 08:00–20:00 · club till late</span>
            </div>
          </div>
          <div className="base">
            <span>© {new Date().getFullYear()} {name}</span>
            <Link to="/">Staff sign-in</Link>
          </div>
        </div>
      </footer>
      <CartDrawer />
      <FeedbackButton area="site" />
    </div>
  );
}

export const MAX_NIGHTS = 30;

/** Editable length of stay: − / number / +, or type a number. Moves the departure date. */
export const clampNights = (n: number) => Math.min(MAX_NIGHTS, Math.max(1, Math.round(n) || 1));

export function NightsStepper({ nights, onChange, onStep }: { nights: number; onChange: (n: number) => void; onStep: (delta: 1 | -1) => void }) {
  const clamp = clampNights;
  return (
    <div className="f nights-f">
      <label htmlFor="nights-input">Nights</label>
      <div className="stepper">
        <button type="button" onClick={() => onStep(-1)} disabled={nights <= 1} aria-label="One night fewer">
          −
        </button>
        <input
          id="nights-input"
          type="number"
          inputMode="numeric"
          min={1}
          max={MAX_NIGHTS}
          value={nights}
          onChange={(e) => e.target.value !== '' && onChange(clamp(Number(e.target.value)))}
        />
        <button type="button" onClick={() => onStep(1)} disabled={nights >= MAX_NIGHTS} aria-label="One night more">
          +
        </button>
      </div>
    </div>
  );
}

/** Line glyphs for each venue. */
export function VenueGlyph({ kind, size = 110 }: { kind: 'hotel' | 'dining' | 'roof' | 'garden'; size?: number }) {
  const common = { width: size, height: size, viewBox: '0 0 100 100', fill: 'none', stroke: 'currentColor', strokeWidth: 1.4 };
  if (kind === 'hotel')
    return (
      <svg {...common}>
        <path d="M20 92V30h60v62" />
        {[0, 1, 2, 3].map((r) => [0, 1, 2].map((c) => <rect key={`${r}${c}`} x={28 + c * 16} y={38 + r * 12} width={8} height={7} />))}
        <path d="M44 92V82h12v10M12 92h76" />
      </svg>
    );
  if (kind === 'dining')
    return (
      <svg {...common}>
        <circle cx="50" cy="58" r="26" />
        <circle cx="50" cy="58" r="18" />
        <path d="M14 36v20M10 36v10a4 4 0 008 0V36M14 56v30M86 36c-6 4-6 16 0 20v30" />
      </svg>
    );
  if (kind === 'roof')
    return (
      <svg {...common}>
        <path d="M30 50q20-22 40 0zM50 50v34" />
        <path d="M12 86h76M18 78c6-4 12-4 18 0s12 4 18 0 12-4 18 0 12 4 16 1" />
        <circle cx="80" cy="22" r="6" />
      </svg>
    );
  return (
    <svg {...common}>
      <path d="M30 88V58l20-14 20 14v30M30 58h40" />
      <circle cx="16" cy="70" r="9" />
      <path d="M16 79v9" />
      <circle cx="86" cy="66" r="10" />
      <path d="M86 76v12M6 88h88" />
      <path d="M20 30q15 8 30 0t30 0" strokeDasharray="2 4" />
    </svg>
  );
}
