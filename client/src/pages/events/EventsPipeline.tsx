import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CalendarRange, Plus } from 'lucide-react';
import { useApi } from '../../lib/hooks';
import { fmtDate, money } from '../../lib/format';
import type { EventRec, EventStatus } from '../../lib/types';
import { Ledger, LedgerCell, Loading, PageHead, Segmented } from '../../components/ui';
import { NewEvent, VENUES } from './NewEvent';

const LANES: { key: EventStatus; title: string }[] = [
  { key: 'inquiry', title: 'Inquiry' },
  { key: 'tentative', title: 'Tentative hold' },
  { key: 'confirmed', title: 'Confirmed' },
  { key: 'completed', title: 'Completed' },
];

export function EventsPipeline() {
  const nav = useNavigate();
  const [scope, setScope] = useState<'upcoming' | 'all'>('upcoming');
  const { data, isLoading } = useApi<EventRec[]>(`/events?scope=${scope}`);
  const [adding, setAdding] = useState(false);

  if (isLoading || !data) return <Loading />;
  const active = data.filter((e) => e.status !== 'cancelled');
  const pipeline = active.filter((e) => e.status === 'inquiry' || e.status === 'tentative').reduce((s, e) => s + e.quote_total, 0);
  const confirmed = active.filter((e) => e.status === 'confirmed');
  const outstanding = confirmed.reduce((s, e) => s + Math.max(0, e.quote_total - e.paid), 0);

  return (
    <div className="venue-garden">
      <PageHead
        eyebrow="The Garden · Functions & events"
        title="Events"
        accent="pipeline"
        actions={
          <>
            <Segmented
              value={scope}
              onChange={setScope}
              options={[
                { value: 'upcoming', label: 'Upcoming' },
                { value: 'all', label: 'All time' },
              ]}
            />
            <Link to="/events/calendar" className="btn ghost">
              <CalendarRange size={15} /> Calendar
            </Link>
            <button className="btn venue" onClick={() => setAdding(true)}>
              <Plus size={15} /> New inquiry
            </button>
          </>
        }
      />

      <Ledger cols={4}>
        <LedgerCell label="Open pipeline" value={money(pipeline, { compact: true })} sub="inquiries + holds, quoted" />
        <LedgerCell label="Confirmed" value={confirmed.length} sub={money(confirmed.reduce((s, e) => s + e.quote_total, 0), { compact: true }) + ' booked'} />
        <LedgerCell label="Balance to collect" value={money(outstanding, { compact: true })} sub="on confirmed events" />
        <LedgerCell label="Guests expected" value={confirmed.reduce((s, e) => s + e.guests, 0).toLocaleString()} />
      </Ledger>

      <div className="pipeline">
        {LANES.map((l) => {
          const evs = data.filter((e) => e.status === l.key);
          return (
            <div className="lane" key={l.key}>
              <div className="lane-head">
                <h4>{l.title}</h4>
                <span>
                  {evs.length} · {money(evs.reduce((s, e) => s + e.quote_total, 0), { compact: true })}
                </span>
              </div>
              {evs.map((e) => {
                const paidPct = e.quote_total ? Math.round((e.paid / e.quote_total) * 100) : 0;
                return (
                  <div key={e.id} className="evcard" onClick={() => nav(`/events/${e.id}`)}>
                    <h5>{e.title}</h5>
                    <div className="meta">
                      <span>{fmtDate(e.date, 'day')}</span>
                      <span>{e.guests} guests</span>
                      <span>{VENUES[e.venue]}</span>
                    </div>
                    <div className="foot">
                      <span className="small">{e.client_name}</span>
                      <span className="mono small">{money(e.quote_total, { compact: true })}</span>
                    </div>
                    {e.quote_total > 0 && (
                      <div className="progress" style={{ marginTop: 8 }} title={`${paidPct}% paid`}>
                        <i style={{ width: `${Math.min(100, paidPct)}%` }} />
                      </div>
                    )}
                  </div>
                );
              })}
              {evs.length === 0 && <div className="small muted" style={{ padding: 8 }}>—</div>}
            </div>
          );
        })}
      </div>

      {data.some((e) => e.status === 'cancelled') && (
        <p className="small muted">{data.filter((e) => e.status === 'cancelled').length} cancelled event(s) hidden from the board — see the calendar.</p>
      )}

      <NewEvent open={adding} onClose={() => setAdding(false)} />
    </div>
  );
}
