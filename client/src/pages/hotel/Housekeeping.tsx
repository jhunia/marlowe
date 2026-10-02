import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useAction, useApi } from '../../lib/hooks';
import { timeAgo } from '../../lib/format';
import type { HousekeepingTask, Room, Staff } from '../../lib/types';
import { Field, Ledger, LedgerCell, Loading, Modal, PageHead, Stamp } from '../../components/ui';

const INV = ['/housekeeping', '/rooms', '/nav-counts', '/dashboard', '/tape-chart'];

export function Housekeeping() {
  const { data, isLoading } = useApi<HousekeepingTask[]>('/housekeeping', { refetchInterval: 20000 });
  const staff = useApi<Staff[]>('/staff?department=housekeeping');
  const rooms = useApi<Room[]>('/rooms');
  const [adding, setAdding] = useState(false);

  const update = useAction<{ id: number; status?: string; assigned_to?: number | null }>('patch', (b) => `/housekeeping/${b.id}`, { invalidate: INV });

  if (isLoading || !data) return <Loading />;
  const lanes: { key: HousekeepingTask['status']; title: string }[] = [
    { key: 'open', title: 'To do' },
    { key: 'in_progress', title: 'In progress' },
    { key: 'done', title: 'Done today' },
  ];
  const dirty = rooms.data?.filter((r) => r.status === 'vacant_dirty').length ?? 0;
  const ooo = rooms.data?.filter((r) => r.status === 'out_of_order').length ?? 0;

  return (
    <div className="venue-hotel">
      <PageHead
        eyebrow="Hotel · Rooms division"
        title="Housekeeping"
        actions={
          <button className="btn venue" onClick={() => setAdding(true)}>
            <Plus size={15} /> New task
          </button>
        }
      />
      <Ledger cols={4}>
        <LedgerCell label="Open tasks" value={data.filter((t) => t.status === 'open').length} />
        <LedgerCell label="In progress" value={data.filter((t) => t.status === 'in_progress').length} />
        <LedgerCell label="Dirty rooms" value={dirty} sub="vacant, awaiting clean" />
        <LedgerCell label="Out of order" value={ooo} />
      </Ledger>

      <div className="pipeline" style={{ gridTemplateColumns: 'repeat(3, minmax(260px, 1fr))' }}>
        {lanes.map((lane) => {
          const tasks = data.filter((t) => t.status === lane.key);
          return (
            <div className="lane" key={lane.key}>
              <div className="lane-head">
                <h4>{lane.title}</h4>
                <span>{tasks.length}</span>
              </div>
              {tasks.map((t) => (
                <div key={t.id} className="evcard" style={{ cursor: 'default', borderLeftColor: t.priority === 'high' ? 'var(--bad)' : 'var(--hotel)' }}>
                  <div className="row between">
                    <h5>
                      <span className="mono">{t.room_number}</span> · {t.type}
                    </h5>
                    {t.priority === 'high' && <Stamp value="high" />}
                  </div>
                  {t.notes && <div className="small italic" style={{ margin: '4px 0' }}>{t.notes}</div>}
                  <div className="meta">
                    <span>raised {timeAgo(t.created_at)} ago</span>
                    <span>room: {t.room_status.replace('_', ' ')}</span>
                  </div>
                  <div className="foot" style={{ gap: 6 }}>
                    <select
                      className="input"
                      style={{ height: 28, fontSize: 12, maxWidth: 150 }}
                      value={t.assigned_to ?? ''}
                      disabled={t.status === 'done'}
                      onChange={(e) => update.mutate({ id: t.id, assigned_to: e.target.value ? Number(e.target.value) : null })}
                    >
                      <option value="">Unassigned</option>
                      {staff.data?.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                    {t.status === 'open' && (
                      <button className="btn sm ghost" onClick={() => update.mutate({ id: t.id, status: 'in_progress' })}>
                        Start
                      </button>
                    )}
                    {t.status === 'in_progress' && (
                      <button className="btn sm venue" onClick={() => update.mutate({ id: t.id, status: 'done' })}>
                        Complete
                      </button>
                    )}
                    {t.status === 'done' && <span className="small muted">by {t.assignee ?? '—'}</span>}
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>

      <NewTask open={adding} onClose={() => setAdding(false)} rooms={rooms.data ?? []} staff={staff.data ?? []} />
    </div>
  );
}

function NewTask({ open, onClose, rooms, staff }: { open: boolean; onClose: () => void; rooms: Room[]; staff: Staff[] }) {
  const [f, setF] = useState({ room_id: '', type: 'clean', priority: 'normal', assigned_to: '', notes: '' });
  const create = useAction('post', '/housekeeping', {
    invalidate: INV,
    success: 'Task created',
    onSuccess: () => {
      onClose();
      setF({ room_id: '', type: 'clean', priority: 'normal', assigned_to: '', notes: '' });
    },
  });
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New housekeeping task"
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn"
            disabled={!f.room_id || create.isPending}
            onClick={() => create.mutate({ ...f, room_id: Number(f.room_id), assigned_to: f.assigned_to ? Number(f.assigned_to) : null })}
          >
            Create task
          </button>
        </>
      }
    >
      <div className="grid-2">
        <Field label="Room">
          <select value={f.room_id} onChange={(e) => setF({ ...f, room_id: e.target.value })}>
            <option value="">Select…</option>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.number} · {r.status.replace('_', ' ')}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Task">
          <select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
            <option value="clean">Clean</option>
            <option value="turndown">Turndown</option>
            <option value="inspect">Inspect</option>
            <option value="maintenance">Maintenance</option>
          </select>
        </Field>
        <Field label="Priority">
          <select value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })}>
            <option value="low">Low</option>
            <option value="normal">Normal</option>
            <option value="high">High</option>
          </select>
        </Field>
        <Field label="Assign to">
          <select value={f.assigned_to} onChange={(e) => setF({ ...f, assigned_to: e.target.value })}>
            <option value="">Unassigned</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Notes" className="span-2">
          <textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
        </Field>
      </div>
    </Modal>
  );
}
