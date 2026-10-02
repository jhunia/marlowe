import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
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
  const bump = useAction<{ id: number }>('post', (b) => `/kitchen/orders/${b.id}/bump${qs({ station: station === 'all' ? undefined : station })}`, {
    invalidate: ['/kitchen', '/nav-counts', '/orders'],
  });

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
        Tap a line when it’s up. Bump the ticket when everything has gone out. Tickets turn amber after 12 minutes and red after 20.
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
            return (
              <div key={o.id} className={`ticket ${cls}`}>
                <div className="ticket-head">
                  <b>{o.table_label ? `T·${o.table_label}` : o.guest_name || 'Tab'}</b>
                  <span className="age">{age}′</span>
                </div>
                <div className="ticket-sub">
                  <span className="mono">{o.code}</span> · {o.covers} cov · {o.server_name ?? ''}
                </div>
                {(o.items ?? []).map((i) => (
                  <div key={i.id} className={`ticket-item ${i.status}`} onClick={() => ready.mutate({ id: i.id })}>
                    <span className="q">{i.qty}</span>
                    <span className="n">
                      {i.name}
                      {i.notes && <em>{i.notes}</em>}
                    </span>
                    <span className="small muted">{i.station}</span>
                  </div>
                ))}
                <div style={{ padding: '10px 14px 4px' }}>
                  <button className={`btn block sm ${allReady ? 'venue' : 'ghost'}`} onClick={() => bump.mutate({ id: o.id })}>
                    Bump ticket
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
