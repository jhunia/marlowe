import { useState } from 'react';
import { api } from '../lib/api';
import { addDays, fmtDate, isoDate } from '../lib/format';
import { Field } from '../components/ui';
import { VenueGlyph } from './SiteLayout';

const SPACES = [
  { value: 'garden', label: 'Garden lawn', note: 'Up to 800 standing · 450 seated' },
  { value: 'pavilion', label: 'Garden pavilion', note: 'Up to 150 · covered' },
  { value: 'rooftop', label: 'Skydeck buy-out', note: 'Up to 220 · pool & DJ booth' },
  { value: 'restaurant_private', label: 'Private dining room', note: 'Up to 18 · set menus' },
];

const TYPES = [
  ['wedding', 'Wedding'],
  ['birthday', 'Birthday'],
  ['corporate', 'Corporate'],
  ['naming', 'Naming ceremony'],
  ['conference', 'Conference'],
  ['concert', 'Concert'],
  ['other', 'Something else'],
];

export function Celebrate() {
  const blank = {
    client_name: '',
    client_phone: '',
    client_email: '',
    event_type: 'wedding',
    venue: 'garden',
    date: addDays(isoDate(), 60),
    start_time: '15:00',
    end_time: '23:00',
    guests: 150,
    notes: '',
  };
  const [f, setF] = useState(blank);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ reference: string; date: string } | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setF({ ...f, [k]: e.target.type === 'number' ? Number(e.target.value) : e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      setDone(await api.post('/public/event-inquiry', f));
    } catch (x) {
      setErr((x as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="sec venue-garden">
      <div className="s-wrap">
        <div className="sec-head">
          <h2>
            Celebrate at <em>The Garden</em>
          </h2>
          <p>Tell us what you’re dreaming of. An events planner replies within one working day with dates, a quote and a site-visit slot.</p>
        </div>

        <div className="two-col">
          {done ? (
            <div className="success-note">
              <h4>Inquiry received — {done.reference}</h4>
              We’ve pencilled in {fmtDate(done.date, 'long')} and a planner will call you shortly. Quote your reference in any messages.
              <div style={{ marginTop: 12 }}>
                <button className="btn sm ghost" onClick={() => { setDone(null); setF(blank); }}>
                  Send another inquiry
                </button>
              </div>
            </div>
          ) : (
            <form className="form-panel stack" onSubmit={submit}>
              <h3>Event inquiry</h3>
              {err && <div className="form-error">{err}</div>}
              <span className="eyebrow">Where</span>
              <div className="grid-2">
                {SPACES.map((s) => (
                  <label
                    key={s.value}
                    className="row"
                    style={{
                      padding: 12,
                      border: `1px solid ${f.venue === s.value ? 'var(--garden)' : 'var(--rule-strong)'}`,
                      background: f.venue === s.value ? 'var(--garden-tint)' : 'transparent',
                      cursor: 'pointer',
                      alignItems: 'flex-start',
                    }}
                  >
                    <input type="radio" name="venue" checked={f.venue === s.value} onChange={() => setF({ ...f, venue: s.value })} style={{ marginTop: 3 }} />
                    <span>
                      <b>{s.label}</b>
                      <div className="small muted">{s.note}</div>
                    </span>
                  </label>
                ))}
              </div>
              <div className="grid-3">
                <Field label="Occasion">
                  <select value={f.event_type} onChange={set('event_type')}>
                    {TYPES.map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Date">
                  <input type="date" required value={f.date} min={addDays(isoDate(), 7)} onChange={set('date')} />
                </Field>
                <Field label="Guests">
                  <input type="number" min={10} max={2000} required value={f.guests} onChange={set('guests')} />
                </Field>
                <Field label="Starts">
                  <input type="time" value={f.start_time} onChange={set('start_time')} />
                </Field>
                <Field label="Ends">
                  <input type="time" value={f.end_time} onChange={set('end_time')} />
                </Field>
              </div>
              <span className="eyebrow">You</span>
              <div className="grid-3">
                <Field label="Full name">
                  <input required value={f.client_name} onChange={set('client_name')} autoComplete="name" />
                </Field>
                <Field label="Phone">
                  <input required type="tel" value={f.client_phone} onChange={set('client_phone')} autoComplete="tel" />
                </Field>
                <Field label="Email">
                  <input required type="email" value={f.client_email} onChange={set('client_email')} autoComplete="email" />
                </Field>
              </div>
              <Field label="Tell us more">
                <textarea value={f.notes} onChange={set('notes')} placeholder="Theme, catering style, live band, rooms for guests…" />
              </Field>
              <button className="btn venue lg" disabled={busy}>
                {busy ? 'Sending…' : 'Send inquiry'}
              </button>
            </form>
          )}

          <aside className="summary-card" style={{ borderColor: 'var(--garden)' }}>
            <div style={{ color: 'var(--garden)' }}>
              <VenueGlyph kind="garden" size={120} />
            </div>
            <h4>What’s included</h4>
            {['In-house catering from Ember & Salt', 'Dedicated event planner', 'Tables, chairs & linen', 'Power backup & security', 'Discounted rooms for your guests', 'Skydeck after-party options'].map((x) => (
              <div key={x} className="line">
                <span>{x}</span>
              </div>
            ))}
          </aside>
        </div>
      </div>
    </section>
  );
}
