import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { useAction, useApi } from '../../lib/hooks';
import { addDays, fmtDate, isoDate } from '../../lib/format';
import { qs } from '../../lib/api';
import type { DiningTable, Order, TableBooking } from '../../lib/types';
import { Drawer, Empty, Field, Ledger, LedgerCell, Loading, PageHead, Stamp } from '../../components/ui';

const INV = ['/table-bookings', '/tables', '/dashboard', '/orders'];

export function TableBookings() {
  const nav = useNavigate();
  const [date, setDate] = useState(isoDate());
  const [adding, setAdding] = useState(false);
  const { data, isLoading } = useApi<TableBooking[]>(`/table-bookings${qs({ outlet: 'restaurant', date })}`);
  const tables = useApi<DiningTable[]>('/tables?outlet=restaurant');
  const update = useAction<{ id: number; status?: string; table_id?: number | null }>('patch', (b) => `/table-bookings/${b.id}`, { invalidate: INV });
  const seat = useAction<{ id: number }, Order>('post', (b) => `/table-bookings/${b.id}/seat`, {
    invalidate: INV,
    success: 'Party seated — check opened',
    onSuccess: (o) => nav(`/restaurant/pos/${o.id}`),
  });

  const list = data ?? [];
  const live = list.filter((b) => b.status !== 'cancelled' && b.status !== 'no_show');
  const covers = live.reduce((s, b) => s + b.party_size, 0);
  const slots = [...new Set(list.map((b) => b.time.slice(0, 2)))].sort();

  return (
    <div className="venue-dining">
      <PageHead
        eyebrow="Ember & Salt · Reservations"
        title="Table"
        accent="book"
        actions={
          <button className="btn venue" onClick={() => setAdding(true)}>
            <Plus size={15} /> New booking
          </button>
        }
      />
      <div className="toolbar">
        <div className="segmented">
          <button onClick={() => setDate(addDays(date, -1))} aria-label="Previous day">
            <ChevronLeft size={15} />
          </button>
          <button onClick={() => setDate(isoDate())}>Today</button>
          <button onClick={() => setDate(addDays(date, 1))} aria-label="Next day">
            <ChevronRight size={15} />
          </button>
        </div>
        <input type="date" className="input" style={{ width: 160 }} value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
        <span className="italic" style={{ fontSize: 18 }}>
          {fmtDate(date, 'long')}
        </span>
      </div>

      <Ledger cols={4}>
        <LedgerCell label="Bookings" value={live.length} />
        <LedgerCell label="Expected covers" value={covers} />
        <LedgerCell label="Seated" value={list.filter((b) => b.status === 'seated' || b.status === 'completed').length} />
        <LedgerCell label="No-shows" value={list.filter((b) => b.status === 'no_show').length} />
      </Ledger>

      {isLoading ? (
        <Loading />
      ) : list.length === 0 ? (
        <div className="panel">
          <Empty title="The book is open.">No reservations for this day yet.</Empty>
        </div>
      ) : (
        <div className="stack loose">
          {slots.map((h) => (
            <div key={h}>
              <div className="floor-title">
                <h3>{h}:00</h3>
              </div>
              <div className="panel">
                <div className="table-wrap">
                  <table className="ledger-table">
                    <tbody>
                      {list
                        .filter((b) => b.time.startsWith(h))
                        .map((b) => (
                          <tr key={b.id}>
                            <td className="mono strong" style={{ width: 70 }}>
                              {b.time}
                            </td>
                            <td>
                              <b>{b.guest_name}</b>
                              <div className="small muted">
                                {b.phone} {b.notes && <span className="italic">· {b.notes}</span>}
                              </div>
                            </td>
                            <td className="nowrap">party of {b.party_size}</td>
                            <td style={{ width: 150 }}>
                              <select
                                className="input"
                                style={{ height: 30 }}
                                value={b.table_id ?? ''}
                                disabled={b.status !== 'booked'}
                                onChange={(e) => update.mutate({ id: b.id, table_id: e.target.value ? Number(e.target.value) : null })}
                              >
                                <option value="">No table</option>
                                {tables.data
                                  ?.filter((t) => t.seats >= b.party_size)
                                  .map((t) => (
                                    <option key={t.id} value={t.id}>
                                      {t.label} · {t.seats} seats
                                    </option>
                                  ))}
                              </select>
                            </td>
                            <td>
                              <Stamp value={b.status} />
                            </td>
                            <td className="right nowrap">
                              {b.status === 'booked' && (
                                <>
                                  <button className="btn sm venue" disabled={!b.table_id || date !== isoDate()} onClick={() => seat.mutate({ id: b.id })}>
                                    Seat
                                  </button>{' '}
                                  <button className="btn sm ghost" onClick={() => update.mutate({ id: b.id, status: 'no_show' })}>
                                    No-show
                                  </button>{' '}
                                  <button className="btn sm quiet" onClick={() => update.mutate({ id: b.id, status: 'cancelled' })}>
                                    Cancel
                                  </button>
                                </>
                              )}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <NewBooking open={adding} onClose={() => setAdding(false)} date={date} tables={tables.data ?? []} />
    </div>
  );
}

function NewBooking({ open, onClose, date, tables }: { open: boolean; onClose: () => void; date: string; tables: DiningTable[] }) {
  const blank = { guest_name: '', phone: '', party_size: 2, date, time: '19:30', table_id: '', notes: '' };
  const [f, setF] = useState(blank);
  const create = useAction('post', '/table-bookings', {
    invalidate: INV,
    success: 'Booking added',
    onSuccess: () => {
      onClose();
      setF({ ...blank });
    },
  });
  const times = [];
  for (let h = 12; h <= 22; h++) for (const m of ['00', '30']) times.push(`${String(h).padStart(2, '0')}:${m}`);
  return (
    <Drawer
      open={open}
      onClose={onClose}
      eyebrow="Ember & Salt"
      title="New table booking"
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn venue"
            disabled={!f.guest_name || create.isPending}
            onClick={() => create.mutate({ ...f, outlet: 'restaurant', date: f.date || date, table_id: f.table_id ? Number(f.table_id) : null })}
          >
            Book table
          </button>
        </>
      }
    >
      <div className="grid-2 venue-dining">
        <Field label="Guest name" className="span-2">
          <input value={f.guest_name} onChange={(e) => setF({ ...f, guest_name: e.target.value })} />
        </Field>
        <Field label="Phone">
          <input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
        </Field>
        <Field label="Party size">
          <input type="number" min={1} value={f.party_size} onChange={(e) => setF({ ...f, party_size: Number(e.target.value) })} />
        </Field>
        <Field label="Date">
          <input type="date" value={f.date || date} onChange={(e) => setF({ ...f, date: e.target.value })} />
        </Field>
        <Field label="Time">
          <select value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })}>
            {times.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </Field>
        <Field label="Table" className="span-2">
          <select value={f.table_id} onChange={(e) => setF({ ...f, table_id: e.target.value })}>
            <option value="">Assign later</option>
            {tables
              .filter((t) => t.seats >= f.party_size)
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label} · {t.zone} · {t.seats} seats
                </option>
              ))}
          </select>
        </Field>
        <Field label="Notes" className="span-2">
          <textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="Birthday, high chair, allergy…" />
        </Field>
      </div>
    </Drawer>
  );
}
