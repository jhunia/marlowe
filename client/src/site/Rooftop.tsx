import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useApi } from '../lib/hooks';
import { api } from '../lib/api';
import { addDays, fmtDate, isoDate, parseDate, price } from '../lib/format';
import { DateInput } from './DateInput';
import { Field } from '../components/ui';
import { usePublicInfo } from './SiteLayout';
import { DECK_PHOTOS, photo } from '../lib/img';

interface CabanaDay {
  date: string;
  resources: { id: number; kind: string; label: string; capacity: number; price: number }[];
  taken: { resource_id: number; start_time: string; end_time: string }[];
}

const KIND: Record<string, string> = { cabana: 'Cabana', daybed: 'Daybed', vip_table: 'VIP table' };

export function Rooftop() {
  const [params] = useSearchParams();
  useEffect(() => {
    if (window.location.hash === '#club') setTimeout(() => document.getElementById('club')?.scrollIntoView({ behavior: 'smooth' }), 300);
  }, []);
  return (
    <>
      <Cabanas />
      <ClubNights preselect={params.get('night') ? Number(params.get('night')) : null} />
    </>
  );
}

function Cabanas() {
  const [date, setDate] = useState(isoDate());
  const { data, refetch } = useApi<CabanaDay>(`/public/cabanas?date=${date}`);
  const [sel, setSel] = useState<number | null>(null);
  const [f, setF] = useState({ name: '', phone: '', start_time: '10:00', end_time: '18:00', pax: 2, notes: '' });
  const [err, setErr] = useState('');
  const [done, setDone] = useState<{ reference: string; label: string; price: number; date: string; start_time: string; end_time: string } | null>(null);

  const res = data?.resources.find((r) => r.id === sel);
  const clash = (id: number) => (data?.taken ?? []).some((t) => t.resource_id === id && t.start_time < f.end_time && t.end_time > f.start_time);

  const book = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!res) return;
    setErr('');
    try {
      setDone(await api.post('/public/cabana', { ...f, resource_id: res.id, date }));
      setSel(null);
      refetch();
    } catch (x) {
      setErr((x as Error).message);
    }
  };

  const hours = ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00'];
  return (
    <section className="sec dark pool venue-roof" style={{ backgroundImage: `url(${photo(DECK_PHOTOS.pool, 1600)})` }}>
      <div className="s-wrap">
        <div className="sec-head">
          <h2>
            Pool & <em>cabanas</em>
          </h2>
          <p>Every booking includes towels, shade and a server on call. Pay on the deck or sign it to your room.</p>
        </div>

        <div className="row wrap" style={{ marginBottom: 24, gap: 16 }}>
          <div className="field" style={{ width: 190 }}>
            <label>Day</label>
            <DateInput value={date} min={isoDate()} max={addDays(isoDate(), 60)} onChange={(v) => { if (!v) return; setDate(v); setSel(null); setDone(null); }} />
          </div>
          <div className="field" style={{ width: 130 }}>
            <label>From</label>
            <select value={f.start_time} onChange={(e) => setF({ ...f, start_time: e.target.value })}>
              {hours.slice(0, -1).map((h) => (
                <option key={h}>{h}</option>
              ))}
            </select>
          </div>
          <div className="field" style={{ width: 130 }}>
            <label>Until</label>
            <select value={f.end_time} onChange={(e) => setF({ ...f, end_time: e.target.value })}>
              {hours.filter((h) => h > f.start_time).map((h) => (
                <option key={h}>{h}</option>
              ))}
            </select>
          </div>
        </div>

        {done && (
          <div className="success-note" style={{ marginBottom: 24, color: 'var(--ink)' }}>
            <h4>
              {done.label} is yours — ref {done.reference}
            </h4>
            {fmtDate(done.date, 'long')}, {done.start_time}–{done.end_time}. {price(done.price)} payable on the deck.
          </div>
        )}

        <div className="deck-grid">
          {data?.resources.map((r) => {
            const taken = clash(r.id);
            return (
              <button key={r.id} className={`deck-card ${sel === r.id ? 'on' : ''} ${taken ? 'taken' : ''}`} disabled={taken} onClick={() => setSel(r.id)}>
                {DECK_PHOTOS[r.kind] && <img className="deck-photo" src={photo(DECK_PHOTOS[r.kind], 500)} alt="" loading="lazy" />}
                <span className="k">{KIND[r.kind] ?? r.kind}</span>
                <h4>{r.label}</h4>
                <span className="small" style={{ opacity: 0.75 }}>
                  up to {r.capacity} guests
                </span>
                <span className="pr">{taken ? 'Booked for these hours' : price(r.price)}</span>
              </button>
            );
          })}
        </div>

        {res && (
          <form className="stack" style={{ marginTop: 28, maxWidth: 640 }} onSubmit={book}>
            <h3 style={{ fontSize: 26, color: '#fff' }}>
              Reserve {res.label} · {fmtDate(date, 'day')}
            </h3>
            {err && <div className="form-error">{err}</div>}
            <div className="grid-2">
              <Field label="Name">
                <input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoComplete="name" />
              </Field>
              <Field label="Phone">
                <input required type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} autoComplete="tel" />
              </Field>
              <Field label="Guests">
                <select value={f.pax} onChange={(e) => setF({ ...f, pax: Number(e.target.value) })}>
                  {Array.from({ length: res.capacity }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Requests">
                <input value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="Champagne on ice, birthday…" />
              </Field>
            </div>
            <div className="row">
              <button className="btn lg" style={{ background: 'var(--brass-2)', color: 'var(--ink)', borderColor: 'var(--brass-2)' }}>
                Reserve · {price(res.price)}
              </button>
              <button type="button" className="btn ghost" onClick={() => setSel(null)}>
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}

function ClubNights({ preselect }: { preselect: number | null }) {
  const { data } = usePublicInfo();
  const [night, setNight] = useState<number | null>(preselect);
  const [f, setF] = useState({ name: '', phone: '', pax: 1 });
  const [err, setErr] = useState('');
  const [done, setDone] = useState<{ title: string; date: string; pax: number; cover_charge: number } | null>(null);
  const n = data?.club_nights.find((x) => x.id === night);

  const join = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    try {
      setDone(await api.post('/public/guestlist', { ...f, night_id: night }));
    } catch (x) {
      setErr((x as Error).message);
    }
  };

  return (
    <section className="sec venue-roof" id="club">
      <div className="s-wrap">
        <div className="sec-head">
          <h2>
            Club <em>nights</em>
          </h2>
          <p>Get on the guest list for faster entry. Cover charge is paid at the door; smart-casual, 21+.</p>
        </div>
        <div className="two-col">
          <div style={{ borderTop: '1px solid var(--ink)' }}>
            {data?.club_nights.map((c) => {
              const d = parseDate(c.date);
              return (
                <div key={c.id} className="night-row" style={{ borderBottomColor: 'var(--rule)' }}>
                  <div className="date" style={{ color: 'var(--roof)' }}>
                    {d.getDate()}
                    <small>{d.toLocaleDateString('en-GB', { weekday: 'short', month: 'short' })}</small>
                  </div>
                  <div>
                    <h4>{c.title}</h4>
                    <div className="muted">
                      {c.dj ?? 'Line-up TBC'} · cover {price(c.cover_charge)}
                    </div>
                  </div>
                  <button className={`btn ${night === c.id ? 'venue' : 'ghost'}`} onClick={() => { setNight(c.id); setDone(null); }}>
                    {night === c.id ? 'Selected' : 'Join list'}
                  </button>
                </div>
              );
            })}
            {data && data.club_nights.length === 0 && <p className="muted">New dates announced soon.</p>}
          </div>
          <div>
            {done ? (
              <div className="success-note">
                <h4>You’re on the list.</h4>
                {done.title}, {fmtDate(done.date, 'long')} — {done.pax} {done.pax > 1 ? 'people' : 'person'}. Show your name at the door; cover {price(done.cover_charge)} each.
              </div>
            ) : n ? (
              <form className="form-panel stack" onSubmit={join}>
                <div className="eyebrow">{fmtDate(n.date, 'long')}</div>
                <h3>{n.title}</h3>
                {err && <div className="form-error">{err}</div>}
                <Field label="Name on the list">
                  <input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoComplete="name" />
                </Field>
                <Field label="Phone">
                  <input required type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} autoComplete="tel" />
                </Field>
                <Field label="How many (incl. you)">
                  <select value={f.pax} onChange={(e) => setF({ ...f, pax: Number(e.target.value) })}>
                    {[1, 2, 3, 4, 5, 6].map((x) => (
                      <option key={x} value={x}>
                        {x}
                      </option>
                    ))}
                  </select>
                </Field>
                <button className="btn venue">Add me to the list</button>
              </form>
            ) : (
              <div className="form-panel muted">Pick a night to join its guest list.</div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
