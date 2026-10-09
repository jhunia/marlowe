import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Minus, Plus } from 'lucide-react';
import { useApi } from '../lib/hooks';
import { api } from '../lib/api';
import { addDays, fmtDate, isoDate, price } from '../lib/format';
import { DateInput } from './DateInput';
import { Field, Segmented } from '../components/ui';
import { useBasket } from './SiteLayout';
import { CheckoutPanel } from './Cart';
import { photo } from '../lib/img';

interface PublicMenu {
  categories: { id: number; name: string }[];
  items: { id: number; category_id: number; name: string; description: string | null; price: number; available: number; image_url: string | null }[];
}

export function Dine() {
  const [params] = useSearchParams();
  const [tab, setTab] = useState<'order' | 'table'>(params.get('tab') === 'table' ? 'table' : 'order');
  return (
    <section className="sec venue-dining">
      <div className="s-wrap">
        <div className="sec-head">
          <h2>
            Ember <em>&</em> Salt
          </h2>
          <p>Wood fire, Ghanaian pantry, open 12:00–23:00. Order for pickup, have it sent to your room or sunbed, or book a table.</p>
        </div>
        <div style={{ marginBottom: 28 }}>
          <Segmented
            value={tab}
            onChange={setTab}
            options={[
              { value: 'order', label: 'Order food' },
              { value: 'table', label: 'Book a table' },
            ]}
          />
        </div>
        {tab === 'order' ? <OrderFood /> : <BookTable />}
      </div>
    </section>
  );
}

function OrderFood() {
  const { data: menu } = useApi<PublicMenu>('/public/menu');
  const basket = useBasket();
  const qtyOf = (id: number) => basket.lines.find((l) => l.id === id)?.qty ?? 0;
  const basketTotal = basket.lines.reduce((s, l) => s + l.price * l.qty, 0);

  return (
    <div className="menu-layout">
      <nav className="menu-cats">
        {menu?.categories.map((c) => (
          <a key={c.id} href={`#cat-${c.id}`}>
            {c.name}
          </a>
        ))}
      </nav>
      <div>
        {menu?.categories.map((c) => (
          <div key={c.id} id={`cat-${c.id}`} className="menu-section">
            <h3>{c.name}</h3>
            {menu.items
              .filter((i) => i.category_id === c.id)
              .map((i) => {
                const q = qtyOf(i.id);
                return (
                  <div key={i.id} className={`dish ${i.available ? '' : 'out'} ${i.image_url ? 'has-photo' : ''}`}>
                    {i.image_url && <img className="dish-photo" src={photo(i.image_url, 360)} alt={i.name} loading="lazy" />}
                    <div>
                      <h4>{i.name}</h4>
                      {i.description && <p>{i.description}</p>}
                    </div>
                    <div className="stack tight" style={{ alignItems: 'flex-end' }}>
                      <span className="p">{price(i.price)}</span>
                      {!i.available ? (
                        <span className="small muted">Sold out today</span>
                      ) : q ? (
                        <span className="qty-ctl">
                          <button onClick={() => basket.setQty(i.id, q - 1)} aria-label="Remove one">
                            <Minus size={13} />
                          </button>
                          <span>{q}</span>
                          <button onClick={() => basket.setQty(i.id, q + 1)} aria-label="Add one">
                            <Plus size={13} />
                          </button>
                        </span>
                      ) : (
                        <button className="btn sm ghost" onClick={() => basket.add({ id: i.id, name: i.name, price: i.price, img: i.image_url })}>
                          <Plus size={13} /> Add
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
          </div>
        ))}
      </div>
      <aside className="basket" id="basket">
        <div className="basket-head">
          <h4>Your order</h4>
          <span className="small muted">
            {basket.count} item{basket.count === 1 ? '' : 's'}
          </span>
        </div>
        <CheckoutPanel />
      </aside>
      {basket.count > 0 && (
        <button className="basket-bar" onClick={() => basket.openCart('basket')}>
          <span className="n">{basket.count}</span>
          View basket
          <b>{price(basketTotal)}</b>
        </button>
      )}
    </div>
  );
}

const STAGES = [
  ['received', 'Received', 'The kitchen has your ticket.'],
  ['preparing', 'On the fire', 'Your food is being cooked.'],
  ['ready', 'Ready', 'Out of the kitchen and on its way.'],
  ['completed', 'Enjoy', 'Handed over — bon appétit.'],
] as const;

export function OrderTrack() {
  const { code } = useParams();
  const basket = useBasket();
  // opening a tracking link on this device adds it to "My orders"
  useEffect(() => {
    if (code) basket.rememberOrder(code.toUpperCase());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);
  const { data, error } = useApi<{ code: string; stage: string; total: number; fulfilment: string; items: { name: string; qty: number; unit_price: number }[] }>(`/public/order/${code}`, {
    refetchInterval: 10000,
  });
  if (error) return <section className="sec"><div className="s-wrap"><div className="form-error">We couldn’t find that order.</div></div></section>;
  if (!data) return <div className="loading">Finding your order…</div>;
  const idx = STAGES.findIndex((s) => s[0] === data.stage);
  return (
    <section className="sec venue-dining">
      <div className="s-wrap narrow">
        <div className="eyebrow">Order {data.code}</div>
        <h2 style={{ fontSize: 44, fontStretch: '125%', letterSpacing: '-0.03em' }}>{data.stage === 'cancelled' ? 'This order was cancelled.' : STAGES[idx]?.[2]}</h2>
        {data.stage !== 'cancelled' && (
          <div className="tracker">
            {STAGES.map(([k, t], i) => (
              <div key={k} className={`${i <= idx ? 'done' : ''} ${i === idx && k !== 'completed' ? 'now' : ''}`}>
                <b>{t}</b>
              </div>
            ))}
          </div>
        )}
        <div className="form-panel">
          {data.items.map((i, n) => (
            <div key={n} className="row between" style={{ padding: '6px 0', borderBottom: '1px dotted var(--rule)' }}>
              <span>
                {i.qty}× {i.name}
              </span>
              <span>{price(i.qty * i.unit_price)}</span>
            </div>
          ))}
          <div className="row between" style={{ paddingTop: 10, fontWeight: 800, fontSize: 20 }}>
            <span>Total incl. service & taxes</span>
            <span>{price(data.total)}</span>
          </div>
        </div>
        <p className="small muted">This page updates by itself. Keep it open, or bookmark it.</p>
        <div className="row wrap">
          <button className="btn venue" onClick={() => basket.openCart('orders')}>
            All my orders
          </button>
          <Link to="/visit/dine" className="btn ghost">
            Back to the menu
          </Link>
        </div>
      </div>
    </section>
  );
}

function BookTable() {
  const blank = { name: '', phone: '', email: '', party_size: 2, date: isoDate(), time: '19:30', notes: '' };
  const [f, setF] = useState(blank);
  const [err, setErr] = useState('');
  const [done, setDone] = useState<{ reference: string; date: string; time: string; party_size: number } | null>(null);
  const times: string[] = [];
  for (let h = 12; h <= 22; h++) for (const m of ['00', '30']) if (!(h === 22 && m === '30')) times.push(`${String(h).padStart(2, '0')}:${m}`);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    try {
      setDone(await api.post('/public/table-booking', f));
    } catch (x) {
      setErr((x as Error).message);
    }
  };

  if (done)
    return (
      <div className="success-note" style={{ maxWidth: 560 }}>
        <h4>Table requested — {done.reference}</h4>
        We’re holding a table for {done.party_size} on {fmtDate(done.date, 'long')} at {done.time}. We’ll call to confirm if anything changes.
        <div style={{ marginTop: 12 }}>
          <button className="btn sm ghost" onClick={() => { setDone(null); setF(blank); }}>
            Book another
          </button>
        </div>
      </div>
    );

  return (
    <form className="form-panel stack" style={{ maxWidth: 640 }} onSubmit={submit}>
      <h3>Reserve a table</h3>
      <p className="muted small" style={{ margin: 0 }}>For parties larger than 12, use the events form — the private room seats 18.</p>
      {err && <div className="form-error">{err}</div>}
      <div className="grid-2">
        <Field label="Date">
          <DateInput required value={f.date} min={isoDate()} max={addDays(isoDate(), 90)} onChange={(v) => setF({ ...f, date: v })} />
        </Field>
        <Field label="Time">
          <select value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })}>
            {times.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </Field>
        <Field label="Guests">
          <select value={f.party_size} onChange={(e) => setF({ ...f, party_size: Number(e.target.value) })}>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Name">
          <input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoComplete="name" />
        </Field>
        <Field label="Phone">
          <input required type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} autoComplete="tel" />
        </Field>
        <Field label="Email (optional)">
          <input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} autoComplete="email" />
        </Field>
        <Field label="Occasion or requests" className="span-2">
          <textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="Birthday, high chair, window seat…" />
        </Field>
      </div>
      <button className="btn venue lg">Request table</button>
    </form>
  );
}
