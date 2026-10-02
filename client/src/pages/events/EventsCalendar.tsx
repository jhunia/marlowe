import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { useApi } from '../../lib/hooks';
import { isoDate } from '../../lib/format';
import { qs } from '../../lib/api';
import type { ClubNight, EventRec } from '../../lib/types';
import { PageHead } from '../../components/ui';
import { NewEvent } from './NewEvent';

const VENUE_COLOR: Record<string, string> = {
  garden: '#4caf2a',
  pavilion: '#e0a800',
  rooftop: '#0ea5e9',
  restaurant_private: '#f2662e',
  club: '#7c3aed',
};

export function EventsCalendar() {
  const nav = useNavigate();
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [addDate, setAddDate] = useState<string | null>(null);

  const first = new Date(cursor);
  const start = new Date(first);
  start.setDate(1 - ((first.getDay() + 6) % 7)); // Monday-first grid
  const days = useMemo(() => Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  }), [start.getTime()]); // eslint-disable-line react-hooks/exhaustive-deps

  const from = isoDate(days[0]);
  const to = isoDate(days[41]);
  const { data: events } = useApi<EventRec[]>(`/events${qs({ from, to })}`);
  const { data: nights } = useApi<ClubNight[]>(`/club-nights${qs({ from, to })}`);
  const today = isoDate();

  return (
    <div className="venue-garden">
      <PageHead
        eyebrow="The Garden · All venues"
        title={cursor.toLocaleDateString('en-GB', { month: 'long' })}
        accent={String(cursor.getFullYear())}
        actions={
          <>
            <div className="segmented">
              <button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))} aria-label="Previous month">
                <ChevronLeft size={15} />
              </button>
              <button onClick={() => setCursor(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}>This month</button>
              <button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))} aria-label="Next month">
                <ChevronRight size={15} />
              </button>
            </div>
            <button className="btn venue" onClick={() => setAddDate(today)}>
              <Plus size={15} /> New inquiry
            </button>
          </>
        }
      />
      <div className="legend" style={{ marginBottom: 12 }}>
        <span><i style={{ background: VENUE_COLOR.garden }} />Garden lawn</span>
        <span><i style={{ background: VENUE_COLOR.pavilion }} />Pavilion</span>
        <span><i style={{ background: VENUE_COLOR.rooftop }} />Skydeck buy-out</span>
        <span><i style={{ background: VENUE_COLOR.restaurant_private }} />Private dining</span>
        <span><i style={{ background: VENUE_COLOR.club }} />Club night</span>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <div className="cal" style={{ minWidth: 760 }}>
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
            <div key={d} className="dow">
              {d}
            </div>
          ))}
          {days.map((d) => {
            const iso = isoDate(d);
            const evs = (events ?? []).filter((e) => e.date === iso);
            const ns = (nights ?? []).filter((n) => n.date === iso);
            return (
              <div
                key={iso}
                className={`day ${d.getMonth() !== cursor.getMonth() ? 'out' : ''} ${iso === today ? 'today' : ''}`}
                onDoubleClick={() => setAddDate(iso)}
                title="Double-click to add an inquiry on this day"
              >
                <div className="d">{d.getDate()}</div>
                {evs.map((e) => (
                  <div
                    key={e.id}
                    className={`ev ${e.status}`}
                    style={{ ['--c' as string]: VENUE_COLOR[e.venue] }}
                    onClick={() => nav(`/events/${e.id}`)}
                    title={`${e.title} · ${e.status} · ${e.start_time}–${e.end_time}`}
                  >
                    {e.start_time} {e.title}
                  </div>
                ))}
                {ns.map((n) => (
                  <div
                    key={`n${n.id}`}
                    className={`ev ${n.status}`}
                    style={{ ['--c' as string]: VENUE_COLOR.club }}
                    onClick={() => nav(`/rooftop/club/${n.id}`)}
                    title={`${n.title} · club night`}
                  >
                    ♪ {n.title}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>

      <NewEvent key={addDate ?? 'x'} open={!!addDate} date={addDate ?? undefined} onClose={() => setAddDate(null)} />
    </div>
  );
}
