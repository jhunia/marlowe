import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Check, Expand, Users, X } from 'lucide-react';
import { useApi } from '../lib/hooks';
import { api, qs } from '../lib/api';
import { addDays, fmtDate, isoDate, nightsBetween, price } from '../lib/format';
import { DateInput } from './DateInput';
import { Field } from '../components/ui';
import { clampNights, NightsStepper, useBasket, usePublicInfo } from './SiteLayout';
import { PhotoViewer } from './PhotoViewer';
import { MyOrders } from './Cart';
import { photo } from '../lib/img';

interface Avail {
  id: number;
  name: string;
  description: string;
  images: string[];
  features: string[];
  capacity: number;
  rate: number;
  available: number;
  nights: number;
  total: number;
}

interface Confirmation {
  code: string;
  check_in: string;
  check_out: string;
  room_type: string;
  nights: number;
  total: number;
  adults: number;
  children: number;
}

export function Stay() {
  const [params, setParams] = useSearchParams();
  const { data: info } = usePublicInfo();
  const from = params.get('from') ?? addDays(isoDate(), 1);
  const to = params.get('to') ?? addDays(from, 2);
  const guests = Number(params.get('guests') ?? 2);
  const valid = from >= isoDate() && to > from;
  const avail = useApi<Avail[]>(valid ? `/public/availability${qs({ from, to })}` : null);
  const [choice, setChoice] = useState<Avail | null>(null);
  const [done, setDone] = useState<Confirmation | null>(null);

  const stayNights = valid ? nightsBetween(from, to) : 2;
  const update = (changes: Record<string, string>) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) p.set(k, v);
    setParams(p, { replace: true });
    setChoice(null);
  };
  const set = (k: string, v: string) => {
    // moving the arrival keeps the same number of nights
    if (k === 'from') update({ from: v, to: addDays(v, stayNights) });
    else update({ [k]: v });
  };
  const setNights = (n: number) => update({ to: addDays(from, n) });
  // step from the URL as it is right now, so rapid taps all count
  const stepNights = (d: 1 | -1) =>
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        const f = p.get('from') ?? from;
        const t = p.get('to') ?? to;
        p.set('to', addDays(f, clampNights(Math.max(1, nightsBetween(f, t)) + d)));
        return p;
      },
      { replace: true },
    );

  if (done) return <Confirmed c={done} />;

  const step = choice ? 2 : 1;
  return (
    <section className="sec venue-hotel">
      <div className="s-wrap">
        <div className="sec-head">
          <h2>
            Book your <em>stay</em>
          </h2>
          <p>Best rate when you book here. Pay at the hotel — no card needed to reserve.</p>
        </div>

        <div className="steps">
          <div className={step === 1 ? 'on' : ''}>
            <b>01</b>Dates & room
          </div>
          <div className={step === 2 ? 'on' : ''}>
            <b>02</b>Your details
          </div>
          <div>
            <b>03</b>Confirmation
          </div>
        </div>

        {step === 1 ? (
          <>
            <div className="bookbar bookbar-stay" style={{ marginTop: 0, marginBottom: 32, boxShadow: 'none' }}>
              <div className="f">
                <label htmlFor="st-in">Arrive</label>
                <DateInput id="st-in" value={from} min={isoDate()} onChange={(v) => v && set('from', v)} />
              </div>
              <div className="f">
                <label htmlFor="st-out">Depart</label>
                <DateInput id="st-out" value={to} min={addDays(from, 1)} onChange={(v) => v && v > from && set('to', v)} />
              </div>
              <NightsStepper nights={stayNights} onChange={setNights} onStep={stepNights} />
              <div className="f">
                <label>Guests</label>
                <select value={guests} onChange={(e) => set('guests', e.target.value)}>
                  {[1, 2, 3, 4].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {avail.isLoading && <div className="loading">Checking which rooms are free…</div>}
            {avail.error && <div className="form-error">{(avail.error as Error).message}</div>}
            <div className="rooms-list">
              {avail.data?.map((t) => {
                const fits = t.capacity + 1 >= guests;
                const ok = t.available > 0 && fits;
                return (
                  <div key={t.id} className={`room-row ${ok ? '' : 'sold'}`}>
                    <RoomGallery images={t.images} name={t.name} />
                    <div>
                      <h3>{t.name}</h3>
                      <div className="muted">{t.description}</div>
                      <FeatureList features={t.features} limit={4} />
                      <div className="meta">
                        <span>
                          <Users size={13} style={{ verticalAlign: -2 }} /> sleeps {t.capacity}
                        </span>
                        <span>{price(t.rate)} / night</span>
                        {t.available > 0 && t.available <= 2 && <span style={{ color: 'var(--dining)' }}>Only {t.available} left</span>}
                      </div>
                    </div>
                    <div className="price">
                      <b>{price(t.total)}</b>
                      <span className="small muted">
                        total · {t.nights} night{t.nights > 1 ? 's' : ''}
                      </span>
                      <div style={{ marginTop: 10 }}>
                        <button className="btn venue" disabled={!ok} onClick={() => setChoice(t)}>
                          {t.available === 0 ? 'Sold out' : !fits ? 'Too small' : 'Select'}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <GuestDetails choice={choice!} from={from} to={to} guests={guests} onBack={() => setChoice(null)} onDone={setDone} checkIn={info?.property.check_in_time} />
        )}
      </div>
    </section>
  );
}

/** Bed, size, view, what's included — the things guests compare rooms on. */
export function FeatureList({ features, limit }: { features: string[]; limit?: number }) {
  if (!features?.length) return null;
  const shown = limit ? features.slice(0, limit) : features;
  const more = features.length - shown.length;
  return (
    <ul className="features">
      {shown.map((f) => (
        <li key={f}>
          <Check size={13} strokeWidth={2.6} /> {f}
        </li>
      ))}
      {more > 0 && <li className="more">+{more} more</li>}
    </ul>
  );
}

function RoomGallery({ images, name }: { images: string[]; name: string }) {
  const [i, setI] = useState(0);
  const [viewer, setViewer] = useState<number | null>(null);
  if (!images.length) return <div className="room-plate" />;
  return (
    <div className="room-gallery">
      <button type="button" className="gallery-open" onClick={() => setViewer(i)} aria-label={`View all ${images.length} photos of ${name}`}>
        <img src={photo(images[i], 900)} alt={`${name} — photo ${i + 1} of ${images.length}`} />
        <span className="gallery-count">
          <Expand size={12} /> {images.length} photos
        </span>
      </button>
      {images.length > 1 && (
        <div className="thumbs">
          {images.map((src, n) => (
            <button key={src} type="button" className={n === i ? 'on' : ''} onClick={() => setI(n)} aria-label={`Show photo ${n + 1}`}>
              <img src={photo(src, 160)} alt="" />
            </button>
          ))}
        </div>
      )}
      {viewer !== null && <PhotoViewer images={images} start={viewer} title={name} onClose={() => setViewer(null)} />}
    </div>
  );
}

/** Selected room: big photo + every other photo as a grid, all openable full screen. */
function RoomShowcase({ images, name }: { images: string[]; name: string }) {
  const [viewer, setViewer] = useState<number | null>(null);
  if (!images.length) return null;
  return (
    <div className="room-showcase">
      <button type="button" className="hero-shot" onClick={() => setViewer(0)} aria-label={`View photos of ${name}`}>
        <img src={photo(images[0], 1200)} alt={`${name} — main photo`} />
        <span className="gallery-count">
          <Expand size={12} /> View all {images.length} photos
        </span>
      </button>
      {images.length > 1 && (
        <div className="side-shots">
          {images.slice(1, 5).map((src, k) => (
            <button key={src} type="button" onClick={() => setViewer(k + 1)} aria-label={`View photo ${k + 2}`}>
              <img src={photo(src, 500)} alt={`${name} — photo ${k + 2}`} />
            </button>
          ))}
        </div>
      )}
      {viewer !== null && <PhotoViewer images={images} start={viewer} title={name} onClose={() => setViewer(null)} />}
    </div>
  );
}

function GuestDetails({
  choice,
  from,
  to,
  guests,
  onBack,
  onDone,
  checkIn,
}: {
  choice: Avail;
  from: string;
  to: string;
  guests: number;
  onBack: () => void;
  onDone: (c: Confirmation) => void;
  checkIn?: string;
}) {
  const [f, setF] = useState({ first_name: '', last_name: '', email: '', phone: '', notes: '', adults: Math.min(guests, choice.capacity), children: 0 });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const basket = useBasket();
  const bind = (k: keyof typeof f) => ({
    value: f[k] as string | number,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.type === 'number' || e.target.tagName === 'SELECT' ? Number(e.target.value) : e.target.value }),
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      const c = await api.post<Confirmation>('/public/book-room', { ...f, room_type_id: choice.id, check_in: from, check_out: to });
      basket.rememberStay({ code: c.code, last_name: f.last_name });
      onDone(c);
    } catch (x) {
      setErr((x as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="two-col details-step">
      <div className="stack">
      <div className="row between wrap">
        <button type="button" className="btn quiet sm" onClick={onBack}>
          <ArrowLeft size={14} /> Change room
        </button>
        <span className="eyebrow">{choice.name}</span>
      </div>
      <RoomShowcase images={choice.images} name={choice.name} />
      <form className="form-panel stack" onSubmit={submit}>
        <h3>Who’s staying?</h3>
        {err && <div className="form-error">{err}</div>}
        <div className="grid-2">
          <Field label="First name">
            <input required {...bind('first_name')} autoComplete="given-name" />
          </Field>
          <Field label="Last name">
            <input required {...bind('last_name')} autoComplete="family-name" />
          </Field>
          <Field label="Email" hint="Your confirmation code is shown on the next screen.">
            <input required type="email" {...bind('email')} autoComplete="email" />
          </Field>
          <Field label="Phone">
            <input required type="tel" {...bind('phone')} autoComplete="tel" />
          </Field>
          <Field label="Adults">
            <select {...bind('adults')}>
              {Array.from({ length: choice.capacity }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Children">
            <select {...bind('children')}>
              {[0, 1, 2].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Anything we should know?" className="span-2">
            <textarea {...bind('notes')} placeholder="Arrival time, celebrations, dietary needs…" />
          </Field>
        </div>
        <button className="btn venue lg" disabled={busy}>
          {busy ? 'Reserving…' : `Reserve · ${price(choice.total)}`}
        </button>
        <p className="small muted" style={{ margin: 0 }}>
          Free cancellation up to 48 hours before arrival. Payment is taken at the hotel.
        </p>
      </form>
      </div>

      <aside className="summary-card">
        <div className="eyebrow">Your stay</div>
        <h4>{choice.name}</h4>
        <FeatureList features={choice.features} />
        <div className="line">
          <span>Arrive</span>
          <span>
            {fmtDate(from, 'day')} {checkIn && `· from ${checkIn}`}
          </span>
        </div>
        <div className="line">
          <span>Depart</span>
          <span>{fmtDate(to, 'day')}</span>
        </div>
        <div className="line">
          <span>
            {price(choice.rate)} × {choice.nights} night{choice.nights > 1 ? 's' : ''}
          </span>
          <span>{price(choice.total)}</span>
        </div>
        <div className="total">
          <span className="small muted" style={{ fontFamily: 'var(--f-ui)' }}>
            Total
          </span>
          <span>{price(choice.total)}</span>
        </div>
      </aside>
    </div>
  );
}

function Confirmed({ c }: { c: Confirmation }) {
  return (
    <section className="sec venue-hotel">
      <div className="s-wrap stack loose" style={{ alignItems: 'flex-start' }}>
        <div>
          <div className="eyebrow">Step 03 · Confirmed</div>
          <h2 style={{ fontSize: 48, fontStretch: '125%', letterSpacing: '-0.03em' }}>We’ll have the room ready.</h2>
        </div>
        <div className="keycard">
          <div className="eyebrow" style={{ color: 'rgba(255,255,255,.8)' }}>
            Booking code
          </div>
          <div className="code">{c.code}</div>
          <dl>
            <dt>Room</dt>
            <dd>{c.room_type}</dd>
            <dt>Arrive</dt>
            <dd>{fmtDate(c.check_in, 'long')}</dd>
            <dt>Depart</dt>
            <dd>{fmtDate(c.check_out, 'long')}</dd>
            <dt>Guests</dt>
            <dd>
              {c.adults} adult{c.adults > 1 ? 's' : ''}
              {c.children ? `, ${c.children} child${c.children > 1 ? 'ren' : ''}` : ''}
            </dd>
            <dt>Total</dt>
            <dd>
              {price(c.total)} · {c.nights} night{c.nights > 1 ? 's' : ''}
            </dd>
          </dl>
        </div>
        <p className="muted" style={{ maxWidth: 520 }}>
          Keep your code — with your last name it lets you look up this booking and order room service once you’ve checked in.
        </p>
        <div className="row wrap">
          <Link to="/visit/dine" className="btn ghost">
            Book dinner at Ember & Salt
          </Link>
          <Link to="/visit/rooftop" className="btn ghost">
            Reserve a cabana
          </Link>
        </div>
      </div>
    </section>
  );
}

interface BookingLookup {
  code: string;
  check_in: string;
  check_out: string;
  status: string;
  adults: number;
  children: number;
  rate: number;
  room_type: string;
  images: string[];
  first_name: string;
  last_name: string;
  nights: number;
  total: number;
}

const STATUS_TEXT: Record<string, [string, string]> = {
  booked: ['Confirmed', 'We look forward to welcoming you.'],
  checked_in: ['In house', 'Enjoy your stay — order room service any time.'],
  checked_out: ['Checked out', 'Thank you for staying with us.'],
  cancelled: ['Cancelled', 'This booking was cancelled.'],
  no_show: ['No-show', 'This booking was marked as a no-show.'],
};

export function ManageBooking() {
  const basket = useBasket();
  const [code, setCode] = useState('');
  const [last, setLast] = useState('');
  const [res, setRes] = useState<BookingLookup | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [viewer, setViewer] = useState(false);

  const lookUp = async (c: string, l: string) => {
    setErr('');
    setBusy(true);
    try {
      const r = await api.get<BookingLookup>(`/public/booking${qs({ code: c, last_name: l })}`);
      setRes(r);
      basket.rememberStay({ code: r.code, last_name: r.last_name });
    } catch (x) {
      setRes(null);
      setErr((x as Error).message === 'Booking not found' ? 'We couldn’t find a booking with that code and last name.' : (x as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const [label, sub] = res ? STATUS_TEXT[res.status] ?? [res.status, ''] : ['', ''];
  return (
    <section className="sec venue-hotel">
      <div className="s-wrap narrow">
        <div className="sec-head">
          <h2>
            My <em>booking</em>
          </h2>
          <p>Look up a stay with your booking code and last name. Your food orders from this phone are listed below.</p>
        </div>

        <div className="manage">
          <div className="stack">
            <form
              className="form-panel stack"
              onSubmit={(e) => {
                e.preventDefault();
                lookUp(code, last);
              }}
            >
              <div className="grid-2">
                <Field label="Booking code">
                  <input required value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="MR-XXXXX" autoCapitalize="characters" />
                </Field>
                <Field label="Last name">
                  <input required value={last} onChange={(e) => setLast(e.target.value)} autoComplete="family-name" />
                </Field>
              </div>
              <button className="btn venue" disabled={busy}>
                {busy ? 'Looking up…' : 'Find booking'}
              </button>
              {err && <div className="form-error">{err}</div>}
            </form>

            {basket.stays.length > 0 && (
              <div className="saved-stays">
                <span className="eyebrow">On this device</span>
                {basket.stays.map((st) => (
                  <span key={st.code} className={`saved-stay ${res?.code === st.code ? 'on' : ''}`}>
                    <button
                      type="button"
                      onClick={() => {
                        setCode(st.code);
                        setLast(st.last_name);
                        lookUp(st.code, st.last_name);
                      }}
                    >
                      <b className="mono">{st.code}</b> · {st.last_name}
                    </button>
                    <button type="button" className="x" aria-label={`Forget ${st.code}`} onClick={() => basket.forgetStay(st.code)}>
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {res && (
            <article className="booking-card">
              {res.images[0] && (
                <button type="button" className="booking-photo" onClick={() => setViewer(true)} aria-label={`View photos of ${res.room_type}`}>
                  <img src={photo(res.images[0], 900)} alt={res.room_type} />
                  {res.images.length > 1 && (
                    <span className="gallery-count">
                      <Expand size={12} /> {res.images.length} photos
                    </span>
                  )}
                </button>
              )}
              <div className="booking-body">
                <div className="row between wrap">
                  <b className="mono booking-code">{res.code}</b>
                  <span className={`stamp ${res.status === 'cancelled' || res.status === 'no_show' ? 'bad' : res.status === 'checked_in' ? 'ok' : 'info'}`}>{label}</span>
                </div>
                <h3>{res.room_type}</h3>
                <p className="muted small" style={{ margin: 0 }}>{sub}</p>
                <dl className="booking-facts">
                  <div>
                    <dt>Guest</dt>
                    <dd>
                      {res.first_name} {res.last_name}
                    </dd>
                  </div>
                  <div>
                    <dt>Check-in</dt>
                    <dd>{fmtDate(res.check_in, 'day')}</dd>
                  </div>
                  <div>
                    <dt>Check-out</dt>
                    <dd>{fmtDate(res.check_out, 'day')}</dd>
                  </div>
                  <div>
                    <dt>Stay</dt>
                    <dd>
                      {res.nights} night{res.nights > 1 ? 's' : ''} · {res.adults + res.children} guest{res.adults + res.children > 1 ? 's' : ''}
                    </dd>
                  </div>
                  <div>
                    <dt>Room total</dt>
                    <dd>{price(res.total)}</dd>
                  </div>
                </dl>
                {res.status === 'checked_in' && (
                  <Link to={`/visit/dine?to=room&code=${res.code}&last=${encodeURIComponent(res.last_name)}`} className="btn brand block">
                    Order room service
                  </Link>
                )}
              </div>
              {viewer && <PhotoViewer images={res.images} title={res.room_type} onClose={() => setViewer(false)} />}
            </article>
          )}
        </div>

        <div className="manage-orders">
          <div className="row between wrap" style={{ marginBottom: 14 }}>
            <h3 className="sub-title">My food orders</h3>
            <Link to="/visit/dine" className="btn sm ghost">
              Order food
            </Link>
          </div>
          <MyOrders compact />
        </div>
      </div>
    </section>
  );
}
