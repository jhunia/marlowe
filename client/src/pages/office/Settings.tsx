import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { useAction, useApi } from '../../lib/hooks';
import { money } from '../../lib/format';
import type { Role, Room, RoomType, Settings, User } from '../../lib/types';
import { Field, Loading, Modal, PageHead, Panel, Stamp, Tabs } from '../../components/ui';
import { ROLE_LABELS } from '../../lib/permissions';
import { photo } from '../../lib/img';
import { useAuth } from '../../lib/auth';

export function SettingsPage() {
  const [tab, setTab] = useState<'property' | 'users' | 'rooms'>('property');
  return (
    <div className="venue-office">
      <PageHead eyebrow="Back office · Administration" title="Settings" />
      <Tabs
        value={tab}
        onChange={setTab}
        options={[
          { value: 'property', label: 'Property & tax' },
          { value: 'users', label: 'Users & roles' },
          { value: 'rooms', label: 'Rooms inventory' },
        ]}
      />
      {tab === 'property' && <PropertyTab />}
      {tab === 'users' && <UsersTab />}
      {tab === 'rooms' && <RoomsTab />}
    </div>
  );
}

function PropertyTab() {
  const { data } = useApi<Settings>('/settings');
  const { refreshSettings } = useAuth();
  const [f, setF] = useState<Settings | null>(null);
  useEffect(() => {
    if (data) setF(data);
  }, [data]);
  const save = useAction('put', '/settings', { invalidate: ['/'], success: 'Settings saved', onSuccess: () => refreshSettings() });
  if (!f) return <Loading />;
  const set = (k: keyof Settings) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <Panel title="Property" actions={<button className="btn sm" onClick={() => save.mutate(f)}>Save changes</button>}>
      <div className="grid-3">
        <Field label="Property name">
          <input value={f.property_name} onChange={set('property_name')} />
        </Field>
        <Field label="Phone">
          <input value={f.phone} onChange={set('phone')} />
        </Field>
        <Field label="Email">
          <input value={f.email} onChange={set('email')} />
        </Field>
        <Field label="Address" className="span-2">
          <input value={f.address} onChange={set('address')} />
        </Field>
        <Field label="Currency symbol">
          <input value={f.currency} onChange={set('currency')} maxLength={4} />
        </Field>
        <Field label="Taxes & levies %" hint="VAT 15 + NHIL 2.5 + GETFund 2.5 + Tourism 1 — confirm with your accountant">
          <input type="number" step="0.1" value={f.vat_rate} onChange={set('vat_rate')} />
        </Field>
        <Field label="Service charge %">
          <input type="number" step="0.1" value={f.service_rate} onChange={set('service_rate')} />
        </Field>
        <div />
        <Field label="Check-in from">
          <input type="time" value={f.check_in_time} onChange={set('check_in_time')} />
        </Field>
        <Field label="Check-out by">
          <input type="time" value={f.check_out_time} onChange={set('check_out_time')} />
        </Field>
      </div>
    </Panel>
  );
}

function UsersTab() {
  const { data, isLoading } = useApi<User[]>('/users');
  const { user: me } = useAuth();
  const [adding, setAdding] = useState(false);
  const [reset, setReset] = useState<User | null>(null);
  const update = useAction<{ id: number; role?: Role; active?: number }>('patch', (b) => `/users/${b.id}`, { invalidate: ['/users'], success: 'User updated' });
  if (isLoading) return <Loading />;
  return (
    <Panel
      title="Staff accounts"
      flush
      actions={
        <button className="btn sm" onClick={() => setAdding(true)}>
          <Plus size={13} /> New user
        </button>
      }
    >
      <div className="table-wrap">
        <table className="ledger-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {data?.map((u) => (
              <tr key={u.id}>
                <td>
                  <b>{u.name}</b>
                </td>
                <td className="mono small">{u.email}</td>
                <td>
                  <select
                    className="input"
                    style={{ height: 30, width: 170 }}
                    value={u.role}
                    disabled={u.id === me?.id}
                    onChange={(e) => update.mutate({ id: u.id, role: e.target.value as Role })}
                  >
                    {Object.entries(ROLE_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </td>
                <td>{u.active ? <Stamp value="active" /> : <Stamp value="inactive" />}</td>
                <td className="right nowrap">
                  <button className="btn sm ghost" onClick={() => setReset(u)}>
                    Reset password
                  </button>{' '}
                  {u.id !== me?.id && (
                    <button className="btn sm quiet" onClick={() => update.mutate({ id: u.id, active: u.active ? 0 : 1 })}>
                      {u.active ? 'Deactivate' : 'Reactivate'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <NewUser open={adding} onClose={() => setAdding(false)} />
      <ResetPassword user={reset} onClose={() => setReset(null)} />
    </Panel>
  );
}

function NewUser({ open, onClose }: { open: boolean; onClose: () => void }) {
  const blank = { name: '', email: '', role: 'front_desk' as Role, password: '' };
  const [f, setF] = useState(blank);
  const create = useAction('post', '/users', {
    invalidate: ['/users'],
    success: 'User created',
    onSuccess: () => {
      onClose();
      setF(blank);
    },
  });
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New staff account"
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn" disabled={!f.name || !f.email || f.password.length < 8} onClick={() => create.mutate(f)}>
            Create
          </button>
        </>
      }
    >
      <div className="stack">
        <Field label="Name">
          <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </Field>
        <Field label="Email">
          <input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        </Field>
        <Field label="Role">
          <select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as Role })}>
            {Object.entries(ROLE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Temporary password" hint="At least 8 characters">
          <input type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete="new-password" />
        </Field>
      </div>
    </Modal>
  );
}

function ResetPassword({ user, onClose }: { user: User | null; onClose: () => void }) {
  const [pw, setPw] = useState('');
  const save = useAction('patch', `/users/${user?.id}`, {
    invalidate: ['/users'],
    success: 'Password reset',
    onSuccess: () => {
      setPw('');
      onClose();
    },
  });
  return (
    <Modal
      open={!!user}
      onClose={onClose}
      title={`Reset password · ${user?.name ?? ''}`}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn" disabled={pw.length < 8} onClick={() => save.mutate({ password: pw })}>
            Reset
          </button>
        </>
      }
    >
      <Field label="New password" hint="At least 8 characters">
        <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" />
      </Field>
    </Modal>
  );
}

function RoomsTab() {
  const types = useApi<RoomType[]>('/room-types');
  const rooms = useApi<Room[]>('/rooms');
  const [t, setT] = useState({ name: '', code: '', base_rate: 0, capacity: 2, description: '' });
  const [r, setR] = useState({ number: '', floor: 1, room_type_id: '' as number | '' });
  const inv = ['/room-types', '/rooms', '/tape-chart', '/availability', '/dashboard'];
  const addType = useAction('post', '/room-types', { invalidate: inv, success: 'Room type added', onSuccess: () => setT({ name: '', code: '', base_rate: 0, capacity: 2, description: '' }) });
  const saveType = useAction<{ id: number; base_rate?: number; images?: string[] }>('patch', (b) => `/room-types/${b.id}`, { invalidate: inv, success: 'Room type updated' });
  const [photosFor, setPhotosFor] = useState<RoomType | null>(null);
  const [photoText, setPhotoText] = useState('');
  const addRoom = useAction('post', '/rooms', { invalidate: inv, success: 'Room added', onSuccess: () => setR({ ...r, number: '' }) });

  if (types.isLoading || rooms.isLoading) return <Loading />;
  const links = photoText.split('\n').map((l) => l.trim()).filter(Boolean);
  return (
    <div className="dash-grid">
      <Modal
        open={!!photosFor}
        onClose={() => setPhotosFor(null)}
        title={`Photos · ${photosFor?.name ?? ''}`}
        footer={
          <>
            <button className="btn ghost" onClick={() => setPhotosFor(null)}>
              Cancel
            </button>
            <button
              className="btn"
              onClick={() => {
                if (photosFor) saveType.mutate({ id: photosFor.id, images: links });
                setPhotosFor(null);
              }}
            >
              Save photos
            </button>
          </>
        }
      >
        <div className="stack">
          <div className="photo-strip">
            {links.map((l) => (
              <img key={l} src={photo(l, 160)} alt="" />
            ))}
          </div>
          <Field label="Photo links — one per line" hint="The first photo is the cover on the website. Up to 8.">
            <textarea rows={6} value={photoText} onChange={(e) => setPhotoText(e.target.value)} placeholder="https://…" />
          </Field>
        </div>
      </Modal>
      <Panel title="Room types & rack rates" flush>
        <table className="ledger-table">
          <thead>
            <tr>
              <th>Type</th>
              <th>Code</th>
              <th className="num">Sleeps</th>
              <th className="num">Rooms</th>
              <th className="num">Rack rate</th>
            </tr>
          </thead>
          <tbody>
            {types.data?.map((x) => (
              <tr key={x.id}>
                <td>
                  <div className="row">
                    {x.images?.[0] ? <img className="menu-thumb" src={photo(x.images[0], 120)} alt="" /> : <span className="menu-thumb" />}
                    <span>
                      <b>{x.name}</b>
                      <div className="small muted">{x.description}</div>
                      <button
                        className="btn quiet sm"
                        style={{ paddingLeft: 0 }}
                        onClick={() => {
                          setPhotosFor(x);
                          setPhotoText((x.images ?? []).join('\n'));
                        }}
                      >
                        Photos ({x.images?.length ?? 0})
                      </button>
                    </span>
                  </div>
                </td>
                <td className="mono">{x.code}</td>
                <td className="num">{x.capacity}</td>
                <td className="num">{x.room_count}</td>
                <td className="num" style={{ width: 150 }}>
                  <input
                    className="input"
                    type="number"
                    defaultValue={x.base_rate}
                    title={money(x.base_rate)}
                    onBlur={(e) => Number(e.target.value) !== x.base_rate && saveType.mutate({ id: x.id, base_rate: Number(e.target.value) })}
                  />
                </td>
              </tr>
            ))}
            <tr>
              <td>
                <input className="input" placeholder="New type name" value={t.name} onChange={(e) => setT({ ...t, name: e.target.value })} />
              </td>
              <td style={{ width: 90 }}>
                <input className="input" placeholder="CODE" value={t.code} onChange={(e) => setT({ ...t, code: e.target.value.toUpperCase() })} />
              </td>
              <td style={{ width: 80 }}>
                <input className="input" type="number" value={t.capacity} onChange={(e) => setT({ ...t, capacity: Number(e.target.value) })} />
              </td>
              <td />
              <td className="row">
                <input className="input" type="number" value={t.base_rate} onChange={(e) => setT({ ...t, base_rate: Number(e.target.value) })} />
                <button className="btn sm" disabled={!t.name || !t.code} onClick={() => addType.mutate(t)}>
                  Add
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </Panel>
      <Panel title="Add a room">
        <div className="stack">
          <div className="grid-2">
            <Field label="Room number">
              <input value={r.number} onChange={(e) => setR({ ...r, number: e.target.value })} />
            </Field>
            <Field label="Floor">
              <input type="number" value={r.floor} onChange={(e) => setR({ ...r, floor: Number(e.target.value) })} />
            </Field>
          </div>
          <Field label="Type">
            <select value={r.room_type_id} onChange={(e) => setR({ ...r, room_type_id: e.target.value ? Number(e.target.value) : '' })}>
              <option value="">Select…</option>
              {types.data?.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </Field>
          <button className="btn" disabled={!r.number || !r.room_type_id} onClick={() => addRoom.mutate(r)}>
            Add room
          </button>
          <p className="small muted">{rooms.data?.length} rooms in inventory.</p>
        </div>
      </Panel>
    </div>
  );
}
