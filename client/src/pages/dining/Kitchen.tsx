import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Check, ChefHat, Flame, Globe } from 'lucide-react';
import { useAction, useApi, useNow } from '../../lib/hooks';
import { minutesSince } from '../../lib/format';
import { qs } from '../../lib/api';
import type { Order, Outlet } from '../../lib/types';
import { Empty, Loading, PageHead, Segmented } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { can } from '../../lib/permissions';

type Station = 'all' | 'kitchen' | 'bar';

export function Kitchen() {
  const [params] = useSearchParams();
  const outlet = (params.get('outlet') === 'rooftop' ? 'rooftop' : 'restaurant') as Outlet;
  const { user } = useAuth();
  const [station, setStation] = useState<Station>('all');
  useNow(15000); // re-render so ticket ages tick
  const allowed = can(user?.role, outlet === 'restaurant' ? 'restaurant' : 'rooftop_bar');
  const { data, isLoading } = useApi<Order[]>(allowed ? `/kitchen${qs({ outlet, station: station === 'all' ? undefined : station })}` : null, {
    refetchInterval: 8000,
  });
  const ready = useAction<{ id: number }>('post', (b) => `/kitchen/items/${b.id}/toggle`, { invalidate: ['/kitchen'] });
  const stationQs = qs({ station: station === 'all' ? undefined : station });
  const bump = useAction<{ id: number }>('post', (b) => `/kitchen/orders/${b.id}/bump${stationQs}`, {
    invalidate: ['/kitchen', '/nav-counts', '/orders'],
  });
  const start = useAction<{ id: number }>('post', (b) => `/kitchen/orders/${b.id}/start`, { invalidate: ['/kitchen'] });
  const allUp = useAction<{ id: number }>('post', (b) => `/kitchen/orders/${b.id}/ready${stationQs}`, { invalidate: ['/kitchen'] });

  if (!allowed) return <Empty title="This door is locked." />;
  const venue = outlet === 'restaurant' ? 'venue-dining' : 'venue-roof';

  return (
    <div className={venue}>
      <PageHead
        eyebrow={outlet === 'restaurant' ? 'Ember & Salt · Back of house' : 'Skydeck · Bar well'}
        title={outlet === 'restaurant' ? 'The pass' : 'Bar tickets'}
        accent="live"
        actions={
          <Segmented
            value={station}
            onChange={setStation}
            options={[
              { value: 'all', label: 'All stations' },
              { value: 'kitchen', label: 'Kitchen' },
              { value: 'bar', label: 'Bar' },
            ]}
          />
        }
      />
      <p className="small muted" style={{ marginTop: -8 }}>
        <b>Start cooking</b> when you pick a ticket up → tick each dish as it’s plated (or <b>Mark all ready</b>) → <b>Handed over</b> when it leaves the pass. Online guests see each step live. Tickets turn amber after 12 minutes and red after 20.
      </p>

      {isLoading || !data ? (
        <Loading />
      ) : data.length === 0 ? (
        <Empty title="All quiet on the pass.">New tickets appear here the moment a server sends them.</Empty>
      ) : (
        <div className="kds">
          {data.map((o) => {
            const firstFired = (o.items ?? []).map((i) => i.fired_at).filter(Boolean).sort()[0] ?? o.created_at;
            const age = minutesSince(firstFired!);
            const cls = age >= 20 ? 'late' : age >= 12 ? 'warm' : '';
            const allReady = (o.items ?? []).every((i) => i.status === 'ready');
            const started = !!o.kitchen_started_at || (o.items ?? []).some((i) => i.status === 'ready');
            const online = o.channel === 'online';
            const stage = allReady ? 2 : started ? 1 : 0;
            return (
              <div key={o.id} className={`ticket ${cls}`}>
                <div className="ticket-head">
                  <b>{o.table_label ? `T·${o.table_label}` : o.guest_name || 'Tab'}</b>
                  <span className="age">{age}′</span>
                </div>
                <div className="ticket-sub">
                  <span className="mono">{o.code}</span> ·{' '}
                  {online ? (
                    <span className="ticket-online">
                      <Globe size={11} /> Online · {o.fulfilment === 'room' ? 'room service' : o.fulfilment ?? 'pickup'}
                    </span>
                  ) : (
                    <>
                      {o.covers} cov · {o.server_name ?? ''}
                    </>
                  )}
                </div>
                {online && (
                  <div className="ticket-stage" title="What the guest sees on their phone">
                    <span>Guest sees</span>
                    {['Received', 'On the fire', 'Ready'].map((l, k) => (
                      <i key={l} className={k === stage ? 'on' : k < stage ? 'done' : ''}>
                        {l}
                      </i>
                    ))}
                  </div>
                )}
                {(o.items ?? []).map((i) => (
                  <div key={i.id} className={`ticket-item ${i.status}`} onClick={() => ready.mutate({ id: i.id })} role="button" aria-pressed={i.status === 'ready'} title={i.status === 'ready' ? 'Tap to un-mark' : 'Tap when this dish is plated'}>
                    <span className="tick">{i.status === 'ready' && <Check size={13} strokeWidth={3} />}</span>
                    <span className="q">{i.qty}</span>
                    <span className="n">
                      {i.name}
                      {i.notes && <em>{i.notes}</em>}
                    </span>
                    <span className="small muted">{i.station}</span>
                  </div>
                ))}
                <div className="ticket-actions">
                  {!started ? (
                    <button className="btn block venue" onClick={() => start.mutate({ id: o.id })}>
                      <Flame size={15} /> Start cooking
                    </button>
                  ) : !allReady ? (
                    <button className="btn block venue" onClick={() => allUp.mutate({ id: o.id })}>
                      <ChefHat size={15} /> Mark all ready
                    </button>
                  ) : (
                    <button className="btn block venue" onClick={() => bump.mutate({ id: o.id })}>
                      <Check size={15} /> Handed over
                    </button>
                  )}
                  {!allReady && (
                    <button className="btn block sm quiet" onClick={() => bump.mutate({ id: o.id })}>
                      Clear ticket without marking ready
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
