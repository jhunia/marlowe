import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAction, useApi } from '../../lib/hooks';
import { fmtDate } from '../../lib/format';
import type { Room, RoomStatus } from '../../lib/types';
import { Chips, Drawer, Field, Loading, PageHead, Stamp } from '../../components/ui';

const STATUSES: { value: RoomStatus; label: string }[] = [
  { value: 'vacant_clean', label: 'Clean' },
  { value: 'inspected', label: 'Inspected' },
  { value: 'vacant_dirty', label: 'Dirty' },
  { value: 'occupied', label: 'Occupied' },
  { value: 'out_of_order', label: 'Out of order' },
];

export function RoomsBoard() {
  const { data, isLoading } = useApi<Room[]>('/rooms', { refetchInterval: 30000 });
  const [filter, setFilter] = useState<'all' | RoomStatus>('all');
  const [sel, setSel] = useState<Room | null>(null);

  if (isLoading || !data) return <Loading />;
  const count = (s: RoomStatus) => data.filter((r) => r.status === s).length;
  const rooms = filter === 'all' ? data : data.filter((r) => r.status === filter);
  const floors = [...new Set(rooms.map((r) => r.floor))].sort();

  return (
    <div className="venue-hotel">
      <PageHead eyebrow="Hotel · Rooms division" title="Rooms" accent="board" />
      <div className="toolbar">
        <Chips
          value={filter}
          onChange={setFilter}
          options={[{ value: 'all' as const, label: 'All rooms', count: data.length }, ...STATUSES.map((s) => ({ ...s, count: count(s.value) }))]}
        />
      </div>

      {floors.map((f) => (
        <section className="floor" key={f}>
          <div className="floor-title">
            <h3>Floor {f}</h3>
            <span className="small muted">{rooms.filter((r) => r.floor === f).length} rooms</span>
          </div>
          <div className="keytags">
            {rooms
              .filter((r) => r.floor === f)
              .map((r) => (
                <button key={r.id} className={`keytag ${r.status}`} onClick={() => setSel(r)} style={{ font: 'inherit' }}>
                  <div className="no">{r.number}</div>
                  <div className="type">{r.type_name}</div>
                  <div className="who">{r.guest_name ?? (r.arriving ? `→ ${r.arriving}` : '')}</div>
                  <div style={{ marginTop: 6 }}>
                    <Stamp value={r.status} />
                  </div>
                </button>
              ))}
          </div>
        </section>
      ))}

      <RoomDrawer room={sel} onClose={() => setSel(null)} />
    </div>
  );
}

function RoomDrawer({ room, onClose }: { room: Room | null; onClose: () => void }) {
  const [notes, setNotes] = useState('');
  const [taskType, setTaskType] = useState('clean');
  const inv = ['/rooms', '/tape-chart', '/dashboard', '/housekeeping', '/nav-counts'];
  const update = useAction<{ status?: RoomStatus; notes?: string }>('patch', `/rooms/${room?.id}`, { invalidate: inv, success: 'Room updated', onSuccess: onClose });
  const task = useAction('post', '/housekeeping', { invalidate: inv, success: 'Task sent to housekeeping', onSuccess: onClose });

  if (!room) return null;
  return (
    <Drawer open={!!room} onClose={onClose} eyebrow={`${room.type_name} · floor ${room.floor}`} title={`Room ${room.number}`}>
      <div className="stack loose venue-hotel">
        <dl className="detail-list">
          <dt>Status</dt>
          <dd>
            <Stamp value={room.status} />
          </dd>
          <dt>In room</dt>
          <dd>
            {room.guest_name ? (
              <Link to={`/reservations/${room.reservation_id}`}>
                {room.guest_name} — departs {fmtDate(room.check_out)}
              </Link>
            ) : (
              '—'
            )}
          </dd>
          <dt>Arriving today</dt>
          <dd>{room.arriving ?? '—'}</dd>
          <dt>Notes</dt>
          <dd className="italic">{room.notes || '—'}</dd>
        </dl>

        {room.status !== 'occupied' && (
          <div className="stack tight">
            <span className="eyebrow">Set housekeeping status</span>
            <div className="row wrap" style={{ gap: 6 }}>
              {STATUSES.filter((s) => s.value !== 'occupied').map((s) => (
                <button
                  key={s.value}
                  className={`btn sm ${room.status === s.value ? '' : 'ghost'}`}
                  disabled={update.isPending || room.status === s.value}
                  onClick={() => update.mutate({ status: s.value, notes: s.value === 'out_of_order' ? notes || room.notes || 'Out of order' : undefined })}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="stack tight">
          <span className="eyebrow">Send a task</span>
          <div className="grid-2">
            <Field label="Task">
              <select value={taskType} onChange={(e) => setTaskType(e.target.value)}>
                <option value="clean">Clean</option>
                <option value="turndown">Turndown</option>
                <option value="inspect">Inspect</option>
                <option value="maintenance">Maintenance</option>
              </select>
            </Field>
            <div />
            <Field label="Note" className="span-2">
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. AC dripping, extra pillows" />
            </Field>
          </div>
          <div>
            <button className="btn venue" disabled={task.isPending} onClick={() => task.mutate({ room_id: room.id, type: taskType, notes, priority: taskType === 'maintenance' ? 'high' : 'normal' })}>
              Send to housekeeping
            </button>
          </div>
        </div>
      </div>
    </Drawer>
  );
}
