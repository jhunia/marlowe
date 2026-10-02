import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Search } from 'lucide-react';
import { useApi } from '../../lib/hooks';
import { fmtDate, money, nightsBetween } from '../../lib/format';
import { qs } from '../../lib/api';
import type { Reservation } from '../../lib/types';
import { Chips, Empty, Loading, PageHead, Stamp } from '../../components/ui';
import { NewReservation } from './NewReservation';

type Filter = 'upcoming' | 'arrivals' | 'in_house' | 'departures' | 'checked_out' | 'cancelled' | 'all';

export function Reservations() {
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const [filter, setFilter] = useState<Filter>('upcoming');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useApi<{ rows: Reservation[]; counts: Record<Filter, number> }>(`/reservations${qs({ view: filter, q })}`);

  useEffect(() => {
    if (params.get('new')) {
      setOpen(true);
      params.delete('new');
      setParams(params, { replace: true });
    }
  }, [params, setParams]);

  const c = data?.counts;
  return (
    <div className="venue-hotel">
      <PageHead
        eyebrow="Hotel · Front office"
        title="Reservations"
        actions={
          <button className="btn venue" onClick={() => setOpen(true)}>
            <Plus size={15} /> New reservation
          </button>
        }
      />

      <div className="toolbar">
        <Chips
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'upcoming', label: 'Upcoming', count: c?.upcoming },
            { value: 'arrivals', label: 'Arriving today', count: c?.arrivals },
            { value: 'in_house', label: 'In house', count: c?.in_house },
            { value: 'departures', label: 'Departing today', count: c?.departures },
            { value: 'checked_out', label: 'Checked out', count: c?.checked_out },
            { value: 'cancelled', label: 'Cancelled / no-show', count: c?.cancelled },
            { value: 'all', label: 'All', count: c?.all },
          ]}
        />
        <span className="grow" />
        <label className="search">
          <Search size={15} />
          <input placeholder="Guest, code or room…" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
      </div>

      <div className="panel">
        {isLoading ? (
          <Loading />
        ) : !data?.rows.length ? (
          <Empty title="Nothing on this page of the book.">Try another filter or search.</Empty>
        ) : (
          <div className="table-wrap">
            <table className="ledger-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Guest</th>
                  <th>Room</th>
                  <th>Stay</th>
                  <th className="num">Nights</th>
                  <th className="num">Rate</th>
                  <th>Source</th>
                  <th>Status</th>
                  <th className="num">Balance</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.id} className="clickable" onClick={() => nav(`/reservations/${r.id}`)}>
                    <td className="mono strong">{r.code}</td>
                    <td>
                      <b>{r.guest_name}</b> {r.vip ? <Stamp value="vip" /> : null}
                      <div className="small muted">
                        {r.adults} adult{r.adults !== 1 ? 's' : ''}
                        {r.children ? ` · ${r.children} child` : ''}
                      </div>
                    </td>
                    <td>
                      <span className="mono strong">{r.room_number ?? '—'}</span>
                      <div className="small muted">{r.type_name}</div>
                    </td>
                    <td className="nowrap">
                      {fmtDate(r.check_in, 'day')} <span className="faint">→</span> {fmtDate(r.check_out, 'day')}
                    </td>
                    <td className="num">{nightsBetween(r.check_in, r.check_out)}</td>
                    <td className="num">{money(r.rate)}</td>
                    <td className="small">{r.source.replace('_', ' ')}</td>
                    <td>
                      <Stamp value={r.status} />
                    </td>
                    <td className="num" style={{ color: (r.balance ?? 0) > 0.009 ? 'var(--bad)' : undefined }}>
                      {money(r.balance)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <NewReservation open={open} onClose={() => setOpen(false)} />
    </div>
  );
}
