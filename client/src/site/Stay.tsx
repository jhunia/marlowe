import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Users } from 'lucide-react';
import { useApi } from '../lib/hooks';
import { api, qs } from '../lib/api';
import { addDays, fmtDate, isoDate, money, nightsBetween } from '../lib/format';
import { Field } from '../components/ui';
import { usePublicInfo } from './SiteLayout';
import { photo } from '../lib/img';

interface Avail {
  id: number;
  name: string;
  description: string;
  images: string[];
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

  const set = (k: string, v: string) => {
    const p = new URLSearchParams(params);
    p.set(k, v);
    if (k === 'from' && v >= to) p.set('to', addDays(v, 1));
    setParams(p, { replace: true });
    setChoice(null);
  };

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
            <div className="bookbar" style={{ marginTop: 0, marginBottom: 32, boxShadow: 'none' }}>
              <div className="f">
                <label>Arrive</label>
                <input type="date" value={from} min={isoDate()} onChange={(e) => e.target.value && set('from', e.target.value)} />
              </div>
              <div className="f">
                <label>Depart</label>
                <input type="date" value={to} min={addDays(from, 1)} onChange={(e) => e.target.value && set('to', e.target.value)} />
              </div>
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
              <div className="f" style={{ justifyContent: 'center', borderRight: 0 }}>
                <span className="small muted">{valid ? `${nightsBetween(from, to)} night${nightsBetween(from, to) > 1 ? 's' : ''}` : 'Pick valid dates'}</span>
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
                      <div className="meta">
                        <span>
                          <Users size={13} style={{ verticalAlign: -2 }} /> sleeps {t.capacity}
                        </span>
                        <span>{money(t.rate)} / night</span>
                        {t.available > 0 && t.available <= 2 && <span style={{ color: 'var(--dining)' }}>Only {t.available} left</span>}
                      </div>
                    </div>
                    <div className="price">
                      <b>{money(t.total, { compact: true })}</b>
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

function RoomGallery({ images, name }: { images: string[]; name: string }) {
  const [i, setI] = useState(0);
  if (!images.length) return <div className="room-plate" />;
  return (
    <div className="room-gallery">
      <img src={photo(images[i], 900)} alt={`${name} — photo ${i + 1} of ${images.length}`} />
      {images.length > 1 && (
        <div className="thumbs">
          {images.map((src, n) => (
            <button key={src} type="button" className={n === i ? 'on' : ''} onClick={() => setI(n)} aria-label={`Show photo ${n + 1}`}>
              <img src={photo(src, 160)} alt="" />
            </button>
          ))}
        </div>
      )}
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
  const bind = (k: keyof typeof f) => ({
    value: f[k] as string | number,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.type === 'number' || e.target.tagName === 'SELECT' ? Number(e.target.value) : e.target.value }),
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      onDone(await api.post<Confirmation>('/public/book-room', { ...f, room_type_id: choice.id, check_in: from, check_out: to }));
    } catch (x) {
      setErr((x as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="two-col">
      <form className="form-panel stack" onSubmit={submit}>
        <button type="button" className="btn quiet sm" style={{ alignSelf: 'flex-start' }} onClick={onBack}>
          <ArrowLeft size={14} /> Change room
        </button>
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
          {busy ? 'Reserving…' : `Reserve · ${money(choice.total)}`}
        </button>
        <p className="small muted" style={{ margin: 0 }}>
          Free cancellation up to 48 hours before arrival. Payment is taken at the hotel.
        </p>
      </form>

      <aside className="summary-card">
        {choice.images[0] && <img className="summary-photo" src={photo(choice.images[0], 700)} alt={choice.name} />}
        <div className="eyebrow">Your stay</div>
        <h4>{choice.name}</h4>
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
            {money(choice.rate)} × {choice.nights} night{choice.nights > 1 ? 's' : ''}
          </span>
          <span className="mono">{money(choice.total)}</span>
        </div>
        <div className="total">
          <span className="small muted" style={{ fontFamily: 'var(--f-ui)' }}>
            Total
          </span>
          <span>{money(choice.total)}</span>
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
              {money(c.total)} · {c.nights} night{c.nights > 1 ? 's' : ''}
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

export function ManageBooking() {
  const [code, setCode] = useState('');
  const [last, setLast] = useState('');
  const [res, setRes] = useState<any>(null);
  const [err, setErr] = useState('');
  const look = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    setRes(null);
    try {
      setRes(await api.get(`/public/booking${qs({ code, last_name: last })}`));
    } catch (x) {
      setErr((x as Error).message === 'Booking not found' ? 'We couldn’t find a booking with that code and last name.' : (x as Error).message);
    }
  };
  const status: Record<string, string> = {
    booked: 'Confirmed — we look forward to welcoming you.',
    checked_in: 'You’re in house. Enjoy your stay.',
    checked_out: 'Checked out. Thank you for staying with us.',
    cancelled: 'This booking was cancelled.',
    no_show: 'This booking was marked as a no-show.',
  };
  return (
    <section className="sec venue-hotel">
      <div className="s-wrap narrow">
        <div className="sec-head">
          <h2>
            Find my <em>booking</em>
          </h2>
        </div>
        <div className="two-col" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <form className="form-panel stack" onSubmit={look}>
            <Field label="Booking code">
              <input required value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="MR-XXXXX" />
            </Field>
            <Field label="Last name">
              <input required value={last} onChange={(e) => setLast(e.target.value)} />
            </Field>
            <button className="btn venue">Look up</button>
            {err && <div className="form-error">{err}</div>}
          </form>
          {res && (
            <div className="keycard">
              <div className="code" style={{ fontSize: 26 }}>
                {res.code}
              </div>
              <dl>
                <dt>Guest</dt>
                <dd>
                  {res.first_name} {res.last_name}
                </dd>
                <dt>Room</dt>
                <dd>{res.room_type}</dd>
                <dt>Dates</dt>
                <dd>
                  {fmtDate(res.check_in, 'day')} → {fmtDate(res.check_out, 'day')}
                </dd>
                <dt>Status</dt>
                <dd>{status[res.status] ?? res.status}</dd>
              </dl>
              {res.status === 'checked_in' && (
                <Link to={`/visit/dine?to=room&code=${res.code}&last=${encodeURIComponent(res.last_name)}`} className="btn" style={{ marginTop: 20, background: '#ffc233', borderColor: '#ffc233', color: 'var(--ink)' }}>
                  Order room service
                </Link>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
