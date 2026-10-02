import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Minus, Plus } from 'lucide-react';
import { useApi } from '../lib/hooks';
import { api } from '../lib/api';
import { addDays, fmtDate, isoDate, money } from '../lib/format';
import { Field, Segmented } from '../components/ui';
import { useBasket, usePublicInfo } from './SiteLayout';
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
                      <span className="p">{money(i.price)}</span>
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
      <Basket />
    </div>
  );
}

function Basket() {
  const basket = useBasket();
  const { data: info } = usePublicInfo();
  const nav = useNavigate();
  const { data: menu } = useApi<PublicMenu>('/public/menu');
  const imgOf = (id: number) => menu?.items.find((m) => m.id === id)?.image_url;
  const [params] = useSearchParams();
  const [to, setTo] = useState<'pickup' | 'room' | 'poolside'>(params.get('to') === 'room' ? 'room' : 'pickup');
  const [f, setF] = useState({ name: '', phone: '', room_code: params.get('code') ?? '', last_name: params.get('last') ?? '', notes: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (window.location.hash === '#basket') document.getElementById('basket')?.scrollIntoView({ behavior: 'smooth' });
  }, []);

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
      basket.clear();
      nav(`/visit/order/${r.code}`);
    } catch (x) {
      setErr((x as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <aside className="basket" id="basket">
      <div className="basket-head">
        <h4>Your order</h4>
        <span className="small muted">{basket.count} item{basket.count === 1 ? '' : 's'}</span>
      </div>
      {basket.lines.length === 0 ? (
        <div className="empty small">Add a few dishes from the menu.</div>
      ) : (
        <>
          <div className="basket-lines">
            {basket.lines.map((l) => (
              <div key={l.id} className="basket-line">
                {(l.img ?? imgOf(l.id)) ? <img className="basket-thumb" src={photo(l.img ?? imgOf(l.id), 120)} alt="" /> : <span className="basket-thumb" />}
                <span>
                  {l.name}
                  <div className="small muted mono">{money(l.price * l.qty)}</div>
                </span>
                <span className="qty-ctl">
                  <button onClick={() => basket.setQty(l.id, l.qty - 1)} aria-label="Remove one">
                    <Minus size={12} />
                  </button>
                  <span>{l.qty}</span>
                  <button onClick={() => basket.setQty(l.id, l.qty + 1)} aria-label="Add one">
                    <Plus size={12} />
                  </button>
                </span>
              </div>
            ))}
          </div>
          <div className="basket-foot stack tight">
            <div className="row">
              <span>Subtotal</span>
              <span className="mono">{money(sub)}</span>
            </div>
            <div className="row">
              <span>Service ({info?.property.service_rate}%)</span>
              <span className="mono">{money(svc)}</span>
            </div>
            <div className="row">
              <span>Taxes & levies ({info?.property.vat_rate}%)</span>
              <span className="mono">{money(vat)}</span>
            </div>
            <div className="row grand">
              <span>Total</span>
              <span>{money(sub + svc + vat)}</span>
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
              {busy ? 'Sending to the kitchen…' : 'Place order'}
            </button>
            <p className="small muted" style={{ margin: 0 }}>
              {to === 'room' ? 'Added to your room bill — settle at checkout.' : to === 'poolside' ? 'Delivered to the Skydeck — pay your server.' : 'Pay when you collect at the Ember & Salt counter.'}
            </p>
          </div>
        </>
      )}
    </aside>
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
              <span className="mono">{money(i.qty * i.unit_price)}</span>
            </div>
          ))}
          <div className="row between" style={{ paddingTop: 10, fontWeight: 800, fontSize: 20 }}>
            <span>Total incl. service & taxes</span>
            <span>{money(data.total)}</span>
          </div>
        </div>
        <p className="small muted">This page updates by itself. Keep it open, or bookmark it.</p>
        <Link to="/visit/dine" className="btn ghost">
          Back to the menu
        </Link>
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
          <input type="date" required value={f.date} min={isoDate()} max={addDays(isoDate(), 90)} onChange={(e) => setF({ ...f, date: e.target.value })} />
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
