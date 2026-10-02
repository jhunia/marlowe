import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { useAction, useApi } from '../../lib/hooks';
import { addDays, fmtDate, isoDate, nightsBetween, parseDate } from '../../lib/format';
import { qs } from '../../lib/api';
import type { Reservation, Room } from '../../lib/types';
import { Loading, PageHead, Panel, Segmented, Stamp } from '../../components/ui';
import { NewReservation } from './NewReservation';

interface TapeData {
  rooms: Room[];
  reservations: Pick<Reservation, 'id' | 'code' | 'room_id' | 'guest_name' | 'check_in' | 'check_out' | 'status' | 'room_type_id' | 'type_name' | 'vip'>[];
  unassigned: Reservation[];
}

const COL = 64;
const LEFT = 168;

export function FrontDesk() {
  const nav = useNavigate();
  const [from, setFrom] = useState(() => addDays(isoDate(), -2));
  const [days, setDays] = useState<'14' | '21' | '30'>('14');
  const [preset, setPreset] = useState<{ check_in?: string; room_id?: number } | null>(null);
  const { data, isLoading } = useApi<TapeData>(`/tape-chart${qs({ from, days })}`);
  const today = isoDate();
  const n = Number(days);

  const dates = useMemo(() => Array.from({ length: n }, (_, i) => addDays(from, i)), [from, n]);
  const byRoom = useMemo(() => {
    const m = new Map<number, TapeData['reservations']>();
    for (const r of data?.reservations ?? []) {
      if (!r.room_id) continue;
      const list = m.get(r.room_id) ?? [];
      list.push(r);
      m.set(r.room_id, list);
    }
    return m;
  }, [data]);

  const assign = useAction<{ id: number; room_id: number }>('patch', (b) => `/reservations/${b.id}`, {
    invalidate: ['/tape-chart', '/reservations', '/rooms'],
    success: 'Room assigned',
  });

  if (isLoading || !data) return <Loading />;

  const floors = [...new Set(data.rooms.map((r) => r.floor))];
  const cols = `${LEFT}px repeat(${n}, ${COL}px)`;

  return (
    <div className="venue-hotel">
      <PageHead
        eyebrow="Hotel · Front office"
        title="Front desk"
        accent="tape chart"
        actions={
          <>
            <button className="btn venue" onClick={() => setPreset({})}>
              <Plus size={15} /> New reservation
            </button>
          </>
        }
      />

      <div className="toolbar">
        <div className="segmented">
          <button onClick={() => setFrom(addDays(from, -7))} aria-label="Previous week">
            <ChevronLeft size={15} />
          </button>
          <button onClick={() => setFrom(addDays(today, -2))}>Today</button>
          <button onClick={() => setFrom(addDays(from, 7))} aria-label="Next week">
            <ChevronRight size={15} />
          </button>
        </div>
        <input type="date" className="input" style={{ width: 160 }} value={from} onChange={(e) => e.target.value && setFrom(e.target.value)} />
        <Segmented
          value={days}
          onChange={setDays}
          options={[
            { value: '14', label: '2 weeks' },
            { value: '21', label: '3 weeks' },
            { value: '30', label: '30 days' },
          ]}
        />
        <span className="grow" />
        <div className="legend">
          <span>
            <i style={{ background: 'var(--info)' }} />
            Booked
          </span>
          <span>
            <i style={{ background: 'var(--hotel)' }} />
            In house
          </span>
          <span>
            <i style={{ background: '#9a927f' }} />
            Departed
          </span>
        </div>
      </div>

      {data.unassigned.length > 0 && (
        <Panel title={`Awaiting a room · ${data.unassigned.length}`} className="" flush>
          <div className="table-wrap">
            <table className="ledger-table">
              <tbody>
                {data.unassigned.map((r) => {
                  const options = data.rooms.filter((room) => room.room_type_id === r.room_type_id && room.status !== 'out_of_order');
                  return (
                    <tr key={r.id}>
                      <td className="mono strong">{r.code}</td>
                      <td>
                        <b>{r.guest_name}</b>
                      </td>
                      <td>{r.type_name}</td>
                      <td className="nowrap">
                        {fmtDate(r.check_in, 'day')} → {fmtDate(r.check_out, 'day')}
                      </td>
                      <td>
                        <select
                          className="input"
                          style={{ width: 170, height: 30 }}
                          defaultValue=""
                          onChange={(e) => e.target.value && assign.mutate({ id: r.id, room_id: Number(e.target.value) })}
                        >
                          <option value="">Assign room…</option>
                          {options.map((o) => (
                            <option key={o.id} value={o.id}>
                              {o.number} · {o.status.replace('_', ' ')}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
      {data.unassigned.length > 0 && <div style={{ height: 16 }} />}

      <div className="tape">
        <div style={{ width: LEFT + n * COL, minWidth: '100%' }}>
          <div style={{ display: 'grid', gridTemplateColumns: cols, position: 'sticky', top: 0, zIndex: 5 }}>
            <div className="tape-corner eyebrow">Room</div>
            {dates.map((d) => {
              const dt = parseDate(d);
              const we = dt.getDay() === 0 || dt.getDay() === 6;
              return (
                <div key={d} className={`tape-day ${we ? 'weekend' : ''} ${d === today ? 'today' : ''}`}>
                  {dt.toLocaleDateString('en-GB', { weekday: 'short' })}
                  <b>{dt.getDate()}</b>
                </div>
              );
            })}
          </div>

          {floors.map((f) => (
            <div key={f}>
              <div
                style={{ padding: '6px 12px', background: 'var(--paper-2)', borderBottom: '1px solid var(--rule)', position: 'sticky', left: 0, width: LEFT }}
                className="eyebrow"
              >
                Floor {f}
              </div>
              {data.rooms
                .filter((r) => r.floor === f)
                .map((room) => (
                  <div key={room.id} style={{ display: 'grid', gridTemplateColumns: cols, position: 'relative' }}>
                    <div className="tape-room">
                      <b>{room.number}</b>
                      <span>{room.type_code}</span>
                      <span className="grow" />
                      <RoomDot status={room.status} />
                    </div>
                    {dates.map((d) => {
                      const dt = parseDate(d);
                      const we = dt.getDay() === 0 || dt.getDay() === 6;
                      return (
                        <div
                          key={d}
                          className={`tape-cell ${we ? 'weekend' : ''}`}
                          title={`Book ${room.number} from ${fmtDate(d)}`}
                          onClick={() => d >= today && setPreset({ check_in: d, room_id: room.id })}
                          style={d < today ? { cursor: 'default', background: 'repeating-linear-gradient(-45deg, transparent, transparent 4px, rgba(0,0,0,.025) 4px, rgba(0,0,0,.025) 8px)' } : undefined}
                        />
                      );
                    })}
                    {(byRoom.get(room.id) ?? []).map((r) => {
                      const start = nightsBetween(from, r.check_in);
                      const end = nightsBetween(from, r.check_out);
                      const s = Math.max(start + 0.5, 0);
                      const e = Math.min(end + 0.5, n);
                      if (e <= 0 || s >= n) return null;
                      return (
                        <div
                          key={r.id}
                          className={`tape-bar ${r.status} ${start + 0.5 < 0 ? 'clip-left' : ''}`}
                          style={{ left: LEFT + s * COL + 2, width: (e - s) * COL - 4 }}
                          onClick={() => nav(`/reservations/${r.id}`)}
                          title={`${r.guest_name} · ${r.code} · ${fmtDate(r.check_in)} → ${fmtDate(r.check_out)}`}
                        >
                          {r.vip ? '★ ' : ''}
                          {r.guest_name}
                        </div>
                      );
                    })}
                  </div>
                ))}
            </div>
          ))}
        </div>
      </div>

      <p className="small muted" style={{ marginTop: 10 }}>
        Click an empty cell to book that room from that night. Click a bar to open the reservation. Room dot:{' '}
        <Stamp value="vacant_clean" /> <Stamp value="vacant_dirty" /> <Stamp value="occupied" /> <Stamp value="out_of_order" />
      </p>

      <NewReservation open={!!preset} onClose={() => setPreset(null)} preset={preset ?? undefined} />
    </div>
  );
}

export function RoomDot({ status }: { status: string }) {
  const c: Record<string, string> = {
    vacant_clean: 'var(--ok)',
    inspected: '#2f7a74',
    vacant_dirty: 'var(--warn)',
    occupied: 'var(--hotel)',
    out_of_order: 'var(--bad)',
  };
  return <i title={status.replace('_', ' ')} style={{ width: 8, height: 8, borderRadius: '50%', background: c[status] ?? 'var(--faint)', display: 'inline-block' }} />;
}
