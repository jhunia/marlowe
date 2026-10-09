import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Minus, Plus, RotateCcw, ShoppingBag } from 'lucide-react';
import { api } from '../lib/api';
import { useApi } from '../lib/hooks';
import { fmtDateTime, price } from '../lib/format';
import { photo } from '../lib/img';
import { Drawer, Field, Segmented } from '../components/ui';
import { useToast } from '../components/Toast';
import { useBasket, usePublicInfo } from './SiteLayout';

interface PublicMenuItem {
  id: number;
  name: string;
  price: number;
  available: number;
  image_url: string | null;
}

export interface OrderSummary {
  code: string;
  status: string;
  stage: 'received' | 'preparing' | 'ready' | 'completed' | 'cancelled';
  total: number;
  fulfilment: 'pickup' | 'room' | 'poolside';
  created_at: string;
  items: { menu_item_id: number; name: string; qty: number; unit_price: number; image_url: string | null }[];
}

const STAGE_LABEL: Record<OrderSummary['stage'], [string, string]> = {
  received: ['Received', 'warn'],
  preparing: ['On the fire', 'dining'],
  ready: ['Ready', 'ok'],
  completed: ['Completed', 'neutral'],
  cancelled: ['Cancelled', 'bad'],
};
const FULFIL: Record<OrderSummary['fulfilment'], string> = { pickup: 'Pickup', room: 'Room service', poolside: 'Poolside' };

/** The slide-in cart: basket + checkout, and this device's past orders. */
export function CartDrawer() {
  const basket = useBasket();
  return (
    <Drawer
      open={basket.cartOpen}
      onClose={basket.closeCart}
      eyebrow="Ember & Salt"
      title={basket.cartTab === 'basket' ? 'Your basket' : 'My orders'}
    >
      <div className="cart-tabs">
        <button className={basket.cartTab === 'basket' ? 'on' : ''} onClick={() => basket.setCartTab('basket')}>
          Basket {basket.count > 0 && <span className="n">{basket.count}</span>}
        </button>
        <button className={basket.cartTab === 'orders' ? 'on' : ''} onClick={() => basket.setCartTab('orders')}>
          My orders {basket.orders.length > 0 && <span className="n">{basket.orders.length}</span>}
        </button>
      </div>
      {basket.cartTab === 'basket' ? <CheckoutPanel /> : <MyOrders />}
    </Drawer>
  );
}

/** Basket lines, totals, delivery choice and the order form. Used in the cart panel and beside the menu. */
export function CheckoutPanel() {
  const basket = useBasket();
  const { data: info } = usePublicInfo();
  const nav = useNavigate();
  const { data: menu } = useApi<{ items: PublicMenuItem[] }>('/public/menu');
  const imgOf = (id: number) => menu?.items.find((m) => m.id === id)?.image_url;
  const [params] = useSearchParams();
  const [to, setTo] = useState<'pickup' | 'room' | 'poolside'>(params.get('to') === 'room' ? 'room' : 'pickup');
  const [f, setF] = useState({ name: '', phone: '', room_code: params.get('code') ?? basket.stays[0]?.code ?? '', last_name: params.get('last') ?? basket.stays[0]?.last_name ?? '', notes: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const sub = basket.lines.reduce((s, l) => s + l.price * l.qty, 0);
  const svc = sub * ((info?.property.service_rate ?? 0) / 100);
  const vat = (sub + svc) * ((info?.property.vat_rate ?? 0) / 100);

  const place = async () => {
    setErr('');
    setBusy(true);
    try {
      const r = await api.post<{ code: string }>('/public/order', {
        ...f,
        fulfilment: to,
        room_code: to === 'room' ? f.room_code : undefined,
        last_name: to === 'room' ? f.last_name : undefined,
        items: basket.lines.map((l) => ({ menu_item_id: l.id, qty: l.qty })),
      });
      basket.rememberOrder(r.code);
      basket.clear();
      basket.closeCart();
      nav(`/visit/order/${r.code}`);
    } catch (x) {
      setErr((x as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (basket.lines.length === 0) {
    return (
      <div className="cart-empty">
        <ShoppingBag size={34} />
        <h4>Your basket is empty</h4>
        <p className="muted small">Add dishes from the Ember & Salt menu.</p>
        <Link to="/visit/dine" className="btn venue" onClick={basket.closeCart}>
          Browse the menu
        </Link>
        {basket.orders.length > 0 && (
          <button className="btn ghost" onClick={() => basket.setCartTab('orders')}>
            See my previous orders
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="checkout">
      <div className="basket-lines">
        {basket.lines.map((l) => {
          const img = l.img ?? imgOf(l.id);
          return (
            <div key={l.id} className="basket-line">
              {img ? <img className="basket-thumb" src={photo(img, 120)} alt="" /> : <span className="basket-thumb" />}
              <span>
                {l.name}
                <div className="small muted">{price(l.price * l.qty)}</div>
              </span>
              <span className="qty-ctl">
                <button onClick={() => basket.setQty(l.id, l.qty - 1)} aria-label={`Remove one ${l.name}`}>
                  <Minus size={12} />
                </button>
                <span>{l.qty}</span>
                <button onClick={() => basket.setQty(l.id, l.qty + 1)} aria-label={`Add one ${l.name}`}>
                  <Plus size={12} />
                </button>
              </span>
            </div>
          );
        })}
      </div>
      <div className="basket-foot stack tight">
        <div className="row">
          <span>Subtotal</span>
          <span>{price(sub)}</span>
        </div>
        <div className="row">
          <span>Service ({info?.property.service_rate}%)</span>
          <span>{price(svc)}</span>
        </div>
        <div className="row">
          <span>Taxes & levies ({info?.property.vat_rate}%)</span>
          <span>{price(vat)}</span>
        </div>
        <div className="row grand">
          <span>Total</span>
          <span>{price(sub + svc + vat)}</span>
        </div>

        <div style={{ marginTop: 10 }}>
          <Segmented
            value={to}
            onChange={setTo}
            options={[
              { value: 'pickup', label: 'Pickup' },
              { value: 'room', label: 'To my room' },
              { value: 'poolside', label: 'Poolside' },
            ]}
          />
        </div>
        {err && <div className="form-error">{err}</div>}
        <Field label="Name">
          <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoComplete="name" />
        </Field>
        <Field label="Phone">
          <input type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} autoComplete="tel" />
        </Field>
        {to === 'room' && (
          <div className="grid-2">
            <Field label="Booking code">
              <input value={f.room_code} onChange={(e) => setF({ ...f, room_code: e.target.value.toUpperCase() })} placeholder="MR-XXXXX" />
            </Field>
            <Field label="Last name">
              <input value={f.last_name} onChange={(e) => setF({ ...f, last_name: e.target.value })} />
            </Field>
          </div>
        )}
        <Field label="Notes for the kitchen">
          <input value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="Allergies, spice level…" />
        </Field>
        <button className="btn venue lg block" disabled={busy || !f.name || !f.phone} onClick={place}>
          {busy ? 'Sending to the kitchen…' : `Place order · ${price(sub + svc + vat)}`}
        </button>
        <p className="small muted" style={{ margin: 0 }}>
          {to === 'room' ? 'Added to your room bill — settle at checkout.' : to === 'poolside' ? 'Delivered to the Skydeck — pay your server.' : 'Pay when you collect at the Ember & Salt counter.'}
        </p>
      </div>
    </div>
  );
}

/** Orders placed from this device, with live status and "order again". */
export function MyOrders({ compact }: { compact?: boolean }) {
  const basket = useBasket();
  const codes = basket.orders;
  const { data, isLoading } = useApi<OrderSummary[]>(codes.length ? `/public/orders?codes=${codes.join(',')}` : null, { refetchInterval: 15000 });
  const { data: menu } = useApi<{ items: PublicMenuItem[] }>('/public/menu');
  const toast = useToast();

  if (!codes.length) {
    return (
      <div className="cart-empty">
        <RotateCcw size={30} />
        <h4>No orders yet</h4>
        <p className="muted small">Orders you place on this device show up here, with live status.</p>
      </div>
    );
  }
  if (isLoading || !data) return <div className="loading">Fetching your orders…</div>;

  const orderAgain = (o: OrderSummary) => {
    let skipped = 0;
    for (const it of o.items) {
      const m = menu?.items.find((x) => x.id === it.menu_item_id);
      if (!m || !m.available) {
        skipped++;
        continue;
      }
      basket.add({ id: m.id, name: m.name, price: m.price, img: m.image_url }, it.qty);
    }
    basket.openCart('basket');
    toast(skipped ? `Added to your basket — ${skipped} item${skipped > 1 ? 's' : ''} no longer on the menu left out` : 'Added to your basket');
  };

  return (
    <div className={`order-list ${compact ? 'compact' : ''}`}>
      {data.map((o) => {
        const [label, tone] = STAGE_LABEL[o.stage];
        const count = o.items.reduce((s, i) => s + i.qty, 0);
        const live = o.stage !== 'completed' && o.stage !== 'cancelled';
        return (
          <article key={o.code} className={`order-card ${live ? 'live' : ''}`}>
            <header>
              <div>
                <b className="mono">{o.code}</b>
                <div className="small muted">
                  {fmtDateTime(o.created_at)} · {FULFIL[o.fulfilment]}
                </div>
              </div>
              <span className={`stamp ${tone}`}>{label}</span>
            </header>
            <div className="order-thumbs">
              {o.items.slice(0, 5).map((i) =>
                i.image_url ? <img key={i.menu_item_id} src={photo(i.image_url, 120)} alt={i.name} title={i.name} /> : <span key={i.menu_item_id} className="ph" title={i.name} />,
              )}
            </div>
            <ul className="order-items">
              {o.items.map((i) => (
                <li key={i.menu_item_id}>
                  <span>
                    {i.qty}× {i.name}
                  </span>
                  <span>{price(i.qty * i.unit_price)}</span>
                </li>
              ))}
            </ul>
            <footer>
              <span>
                {count} item{count > 1 ? 's' : ''} · <b>{price(o.total)}</b>
              </span>
              <span className="row" style={{ gap: 6 }}>
                <Link to={`/visit/order/${o.code}`} className="btn sm ghost" onClick={basket.closeCart}>
                  {live ? 'Track' : 'Details'}
                </Link>
                <button className="btn sm venue" onClick={() => orderAgain(o)}>
                  Order again
                </button>
              </span>
            </footer>
          </article>
        );
      })}
      {data.length < codes.length && <p className="small muted">Some older orders are no longer available.</p>}
    </div>
  );
}
