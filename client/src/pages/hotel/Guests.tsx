import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Search } from 'lucide-react';
import { useAction, useApi } from '../../lib/hooks';
import { fmtDate, money } from '../../lib/format';
import { qs } from '../../lib/api';
import type { Guest, Reservation } from '../../lib/types';
import { Chips, Drawer, Empty, Field, Loading, PageHead, Stamp } from '../../components/ui';
import { NewReservation } from './NewReservation';

export function Guests() {
  const [q, setQ] = useState('');
  const [vip, setVip] = useState<'all' | 'vip'>('all');
  const [sel, setSel] = useState<number | 'new' | null>(null);
  const [bookFor, setBookFor] = useState<number | null>(null);
  const { data, isLoading } = useApi<Guest[]>(`/guests${qs({ q, vip: vip === 'vip' ? 1 : undefined })}`);

  return (
    <div className="venue-hotel">
      <PageHead
        eyebrow="Hotel · Guest relations"
        title="Guest"
        accent="book"
        actions={
          <button className="btn venue" onClick={() => setSel('new')}>
            <Plus size={15} /> Add guest
          </button>
        }
      />
      <div className="toolbar">
        <Chips
          value={vip}
          onChange={setVip}
          options={[
            { value: 'all', label: 'Everyone' },
            { value: 'vip', label: 'VIPs only' },
          ]}
        />
        <span className="grow" />
        <label className="search">
          <Search size={15} />
          <input placeholder="Name, phone or email…" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
      </div>

      <div className="panel">
        {isLoading ? (
          <Loading />
        ) : !data?.length ? (
          <Empty title="No guests found." />
        ) : (
          <div className="table-wrap">
            <table className="ledger-table">
              <thead>
                <tr>
                  <th>Guest</th>
                  <th>Contact</th>
                  <th>Nationality</th>
                  <th className="num">Stays</th>
                  <th>Last stay</th>
                  <th className="num">Lifetime spend</th>
                </tr>
              </thead>
              <tbody>
                {data.map((g) => (
                  <tr key={g.id} className="clickable" onClick={() => setSel(g.id)}>
                    <td>
                      <b>
                        {g.first_name} {g.last_name}
                      </b>{' '}
                      {g.vip ? <Stamp value="vip" /> : null}
                    </td>
                    <td className="small">
                      {g.phone}
                      <div className="muted">{g.email}</div>
                    </td>
                    <td>{g.nationality || '—'}</td>
                    <td className="num">{g.stays ?? 0}</td>
                    <td>{fmtDate(g.last_stay)}</td>
                    <td className="num">{money(g.spend)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <GuestDrawer id={sel} onClose={() => setSel(null)} onBook={(id) => { setSel(null); setBookFor(id); }} />
      <NewReservation open={bookFor !== null} onClose={() => setBookFor(null)} preset={bookFor ? { guest_id: bookFor } : undefined} />
    </div>
  );
}

const BLANK = { first_name: '', last_name: '', email: '', phone: '', nationality: '', id_type: '', id_number: '', vip: 0, notes: '' };

function GuestDrawer({ id, onClose, onBook }: { id: number | 'new' | null; onClose: () => void; onBook: (id: number) => void }) {
  const { data } = useApi<Guest & { reservations: Reservation[] }>(typeof id === 'number' ? `/guests/${id}` : null);
  const [form, setForm] = useState<typeof BLANK>(BLANK);

  useEffect(() => {
    if (id === 'new') setForm(BLANK);
    else if (data) {
      setForm({
        first_name: data.first_name,
        last_name: data.last_name,
        email: data.email ?? '',
        phone: data.phone ?? '',
        nationality: data.nationality ?? '',
        id_type: data.id_type ?? '',
        id_number: data.id_number ?? '',
        vip: data.vip,
        notes: data.notes ?? '',
      });
    }
  }, [id, data]);

  const inv = ['/guests', '/reservations'];
  const create = useAction('post', '/guests', { invalidate: inv, success: 'Guest added', onSuccess: onClose });
  const update = useAction('patch', `/guests/${id}`, { invalidate: inv, success: 'Guest profile saved' });
  const bind = (k: keyof typeof BLANK) => ({
    value: form[k] as string,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value }),
  });

  if (id === null) return null;
  const isNew = id === 'new';
  return (
    <Drawer
      open
      onClose={onClose}
      eyebrow={isNew ? 'New profile' : 'Guest profile'}
      title={isNew ? 'Add guest' : `${form.first_name} ${form.last_name}`}
      wide={!isNew}
      footer={
        <>
          {!isNew && (
            <button className="btn ghost" onClick={() => onBook(id as number)}>
              New booking
            </button>
          )}
          <span className="grow" />
          <button className="btn ghost" onClick={onClose}>
            Close
          </button>
          <button
            className="btn venue"
            disabled={!form.first_name || !form.last_name}
            onClick={() => (isNew ? create.mutate(form) : update.mutate(form))}
          >
            {isNew ? 'Add guest' : 'Save profile'}
          </button>
        </>
      }
    >
      <div className="stack loose venue-hotel">
        <div className="grid-2">
          <Field label="First name">
            <input {...bind('first_name')} />
          </Field>
          <Field label="Last name">
            <input {...bind('last_name')} />
          </Field>
          <Field label="Phone">
            <input {...bind('phone')} />
          </Field>
          <Field label="Email">
            <input {...bind('email')} />
          </Field>
          <Field label="Nationality">
            <input {...bind('nationality')} />
          </Field>
          <Field label="VIP">
            <select value={form.vip} onChange={(e) => setForm({ ...form, vip: Number(e.target.value) })}>
              <option value={0}>Standard</option>
              <option value={1}>VIP</option>
            </select>
          </Field>
          <Field label="ID type">
            <select {...bind('id_type')}>
              <option value="">—</option>
              <option>Passport</option>
              <option>National ID</option>
              <option>Driver's licence</option>
            </select>
          </Field>
          <Field label="ID number">
            <input {...bind('id_number')} />
          </Field>
          <Field label="Preferences & notes" className="span-2">
            <textarea {...bind('notes')} placeholder="Pillow type, dietary needs, favourite table…" />
          </Field>
        </div>

        {!isNew && data && (
          <div className="stack tight">
            <span className="eyebrow">Stay history</span>
            <div className="panel">
              <table className="ledger-table">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Dates</th>
                    <th>Room</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.reservations.map((r) => (
                    <tr key={r.id}>
                      <td className="mono">
                        <Link to={`/reservations/${r.id}`}>{r.code}</Link>
                      </td>
                      <td className="nowrap">
                        {fmtDate(r.check_in)} → {fmtDate(r.check_out)}
                      </td>
                      <td>{r.room_number ?? r.type_name}</td>
                      <td>
                        <Stamp value={r.status} />
                      </td>
                    </tr>
                  ))}
                  {data.reservations.length === 0 && (
                    <tr>
                      <td colSpan={4} className="muted center">
                        No stays yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </Drawer>
  );
}
