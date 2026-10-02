import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, X } from 'lucide-react';
import { useAction, useApi } from '../../lib/hooks';
import { addDays, isoDate, parseDate } from '../../lib/format';
import { qs } from '../../lib/api';
import type { Shift, Staff } from '../../lib/types';
import { Chips, Drawer, Field, Loading, Modal, PageHead, Stamp, Tabs } from '../../components/ui';

export const DEPTS = ['front_office', 'housekeeping', 'restaurant', 'kitchen', 'rooftop', 'events', 'maintenance', 'security', 'management'];
const DEPT_COLOR: Record<string, string> = {
  front_office: '#0f9d8a',
  housekeeping: '#14b8a6',
  restaurant: '#f2662e',
  kitchen: '#e5383b',
  rooftop: '#0ea5e9',
  events: '#4caf2a',
  maintenance: '#64748b',
  security: '#334155',
  management: '#7c3aed',
};

const PRESETS = [
  { label: 'Morning', start: '06:00', end: '14:00' },
  { label: 'Day', start: '09:00', end: '17:00' },
  { label: 'Evening', start: '14:00', end: '22:00' },
  { label: 'Night', start: '22:00', end: '06:00' },
  { label: 'Club', start: '20:00', end: '03:00' },
];

function monday(d: string) {
  const dt = parseDate(d);
  dt.setDate(dt.getDate() - ((dt.getDay() + 6) % 7));
  return isoDate(dt);
}

export function StaffRota() {
  const [tab, setTab] = useState<'rota' | 'people'>('rota');
  const [dept, setDept] = useState('all');
  const [week, setWeek] = useState(() => monday(isoDate()));
  const staff = useApi<Staff[]>(`/staff${qs({ department: dept === 'all' ? undefined : dept })}`);
  const shifts = useApi<Shift[]>(`/shifts${qs({ from: week, to: addDays(week, 6) })}`);
  const [slot, setSlot] = useState<{ staff: Staff; date: string } | null>(null);
  const [edit, setEdit] = useState<Staff | 'new' | null>(null);
  const del = useAction<{ id: number }>('del', (b) => `/shifts/${b.id}`, { invalidate: ['/shifts'] });
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(week, i)), [week]);
  const today = isoDate();

  const active = (staff.data ?? []).filter((s) => s.status !== 'inactive');
  const hours = (s: Shift) => {
    const [a, b] = [s.start_time, s.end_time].map((t) => Number(t.slice(0, 2)) + Number(t.slice(3)) / 60);
    return b > a ? b - a : 24 - a + b;
  };

  return (
    <div className="venue-office">
      <PageHead
        eyebrow="Back office · People"
        title="Staff &"
        accent="rota"
        actions={
          <button className="btn" onClick={() => setEdit('new')}>
            <Plus size={15} /> Add staff
          </button>
        }
      />
      <Tabs
        value={tab}
        onChange={setTab}
        options={[
          { value: 'rota', label: 'Weekly rota' },
          { value: 'people', label: 'Directory' },
        ]}
      />
      <div className="toolbar">
        <Chips value={dept} onChange={setDept} options={[{ value: 'all', label: 'All' }, ...DEPTS.map((d) => ({ value: d, label: d.replace('_', ' ') }))]} />
      </div>

      {staff.isLoading ? (
        <Loading />
      ) : tab === 'rota' ? (
        <>
          <div className="toolbar">
            <div className="segmented">
              <button onClick={() => setWeek(addDays(week, -7))} aria-label="Previous week">
                <ChevronLeft size={15} />
              </button>
              <button onClick={() => setWeek(monday(today))}>This week</button>
              <button onClick={() => setWeek(addDays(week, 7))} aria-label="Next week">
                <ChevronRight size={15} />
              </button>
            </div>
            <span className="italic" style={{ fontSize: 17 }}>
              Week of {parseDate(week).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}
            </span>
            <span className="grow" />
            <span className="small muted">Click an empty cell to add a shift.</span>
          </div>
          <div className="rota">
            <table>
              <thead>
                <tr>
                  <th>Team member</th>
                  {days.map((d) => (
                    <th key={d} className={d === today ? 'today' : ''}>
                      {parseDate(d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' })}
                    </th>
                  ))}
                  <th>Hours</th>
                </tr>
              </thead>
              <tbody>
                {active.map((s) => {
                  const mine = (shifts.data ?? []).filter((x) => x.staff_id === s.id);
                  return (
                    <tr key={s.id}>
                      <td className="who">
                        <b>{s.name}</b>
                        <div className="muted">{s.position}</div>
                      </td>
                      {days.map((d) => {
                        const list = mine.filter((x) => x.date === d);
                        return (
                          <td key={d} className="slot" onClick={() => s.status === 'active' && setSlot({ staff: s, date: d })}>
                            {list.map((x) => (
                              <div key={x.id} className="shift" style={{ ['--c' as string]: DEPT_COLOR[x.department] }} onClick={(e) => e.stopPropagation()}>
                                {x.start_time}–{x.end_time}
                                <button onClick={() => del.mutate({ id: x.id })} aria-label="Remove shift">
                                  <X size={11} />
                                </button>
                              </div>
                            ))}
                            {s.status === 'leave' && list.length === 0 && <span className="small muted italic">leave</span>}
                          </td>
                        );
                      })}
                      <td className="mono">{mine.reduce((h, x) => h + hours(x), 0).toFixed(1)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="panel">
          <div className="table-wrap">
            <table className="ledger-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Department</th>
                  <th>Position</th>
                  <th>Phone</th>
                  <th>Email</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {staff.data?.map((s) => (
                  <tr key={s.id} className="clickable" onClick={() => setEdit(s)}>
                    <td>
                      <b>{s.name}</b>
                    </td>
                    <td>
                      <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 4, background: DEPT_COLOR[s.department], marginRight: 8 }} />
                      {s.department.replace('_', ' ')}
                    </td>
                    <td>{s.position}</td>
                    <td className="small">{s.phone}</td>
                    <td className="small">{s.email}</td>
                    <td>
                      <Stamp value={s.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <ShiftModal slot={slot} onClose={() => setSlot(null)} />
      <StaffDrawer key={edit === 'new' ? 'new' : edit?.id ?? 'x'} item={edit} onClose={() => setEdit(null)} />
    </div>
  );
}

function ShiftModal({ slot, onClose }: { slot: { staff: Staff; date: string } | null; onClose: () => void }) {
  const [start, setStart] = useState('09:00');
  const [end, setEnd] = useState('17:00');
  const [repeat, setRepeat] = useState(1);
  const add = useAction('post', '/shifts', { invalidate: ['/shifts'], success: 'Shift added', onSuccess: onClose });
  return (
    <Modal
      open={!!slot}
      onClose={onClose}
      title={slot ? `${slot.staff.name} · ${parseDate(slot.date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })}` : ''}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn"
            disabled={add.isPending}
            onClick={() =>
              slot &&
              add.mutate({ staff_id: slot.staff.id, date: slot.date, start_time: start, end_time: end, department: slot.staff.department, repeat_days: repeat })
            }
          >
            Add shift
          </button>
        </>
      }
    >
      <div className="stack">
        <div className="row wrap" style={{ gap: 6 }}>
          {PRESETS.map((p) => (
            <button
              key={p.label}
              className={`chip ${start === p.start && end === p.end ? 'on' : ''}`}
              onClick={() => {
                setStart(p.start);
                setEnd(p.end);
              }}
            >
              {p.label} <span className="n">{p.start}</span>
            </button>
          ))}
        </div>
        <div className="grid-3">
          <Field label="Start">
            <input type="time" value={start} onChange={(e) => setStart(e.target.value)} />
          </Field>
          <Field label="End">
            <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
          </Field>
          <Field label="Repeat for">
            <select value={repeat} onChange={(e) => setRepeat(Number(e.target.value))}>
              {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                <option key={n} value={n}>
                  {n} day{n > 1 ? 's' : ''}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </div>
    </Modal>
  );
}

function StaffDrawer({ item, onClose }: { item: Staff | 'new' | null; onClose: () => void }) {
  const src = item && item !== 'new' ? item : null;
  const [f, setF] = useState({
    name: src?.name ?? '',
    department: src?.department ?? 'front_office',
    position: src?.position ?? '',
    phone: src?.phone ?? '',
    email: src?.email ?? '',
    status: src?.status ?? 'active',
    hired_on: src?.hired_on ?? isoDate(),
  });
  const inv = ['/staff', '/shifts'];
  const create = useAction('post', '/staff', { invalidate: inv, success: 'Staff member added', onSuccess: onClose });
  const save = useAction('patch', `/staff/${src?.id}`, { invalidate: inv, success: 'Saved', onSuccess: onClose });
  if (!item) return null;
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <Drawer
      open
      onClose={onClose}
      eyebrow="People"
      title={src ? src.name : 'Add staff member'}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn" disabled={!f.name || !f.position} onClick={() => (src ? save.mutate(f) : create.mutate(f))}>
            Save
          </button>
        </>
      }
    >
      <div className="grid-2">
        <Field label="Full name" className="span-2">
          <input value={f.name} onChange={set('name')} />
        </Field>
        <Field label="Department">
          <select value={f.department} onChange={set('department')}>
            {DEPTS.map((d) => (
              <option key={d} value={d}>
                {d.replace('_', ' ')}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Position">
          <input value={f.position} onChange={set('position')} />
        </Field>
        <Field label="Phone">
          <input value={f.phone} onChange={set('phone')} />
        </Field>
        <Field label="Email">
          <input value={f.email} onChange={set('email')} />
        </Field>
        <Field label="Status">
          <select value={f.status} onChange={set('status')}>
            <option value="active">Active</option>
            <option value="leave">On leave</option>
            <option value="inactive">Left / inactive</option>
          </select>
        </Field>
        <Field label="Hired on">
          <input type="date" value={f.hired_on ?? ''} onChange={set('hired_on')} />
        </Field>
      </div>
    </Drawer>
  );
}
