import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Search, UserPlus } from 'lucide-react';
import { useAction, useApi } from '../../lib/hooks';
import { fmtDate, fmtTime, money } from '../../lib/format';
import type { ClubNightDetail, GuestListEntry } from '../../lib/types';
import { Chips, Field, Ledger, LedgerCell, Loading, PageHead, Panel, Stamp } from '../../components/ui';
import { Gauge } from '../../components/charts';

export function ClubDoor() {
  const { id } = useParams();
  const { data: n, isLoading } = useApi<ClubNightDetail>(`/club-nights/${id}`, { refetchInterval: 10000 });
  const [q, setQ] = useState('');
  const [view, setView] = useState<'all' | 'waiting' | 'in'>('waiting');
  const [f, setF] = useState({ name: '', pax: 1, type: 'guestlist' as GuestListEntry['type'], notes: '' });

  const inv = [`/club-nights`, '/dashboard', '/reports'];
  const setStatus = useAction<{ status: string }>('patch', `/club-nights/${id}`, { invalidate: inv, success: 'Night updated' });
  const add = useAction('post', `/club-nights/${id}/guests`, {
    invalidate: inv,
    success: (r: any) => (r?.checked_in ? 'Walk-in admitted' : 'Added to the list'),
    onSuccess: () => setF({ name: '', pax: 1, type: 'guestlist', notes: '' }),
  });
  const mark = useAction<{ gid: number; checked_in?: number; cover_paid?: number }>('patch', (b) => `/guest-list/${b.gid}`, { invalidate: inv });

  if (isLoading || !n) return <Loading />;
  const inside = n.guests.filter((g) => g.checked_in).reduce((s, g) => s + g.pax, 0);
  const expected = n.guests.reduce((s, g) => s + g.pax, 0);
  const covers = n.guests.filter((g) => g.checked_in && g.cover_paid).reduce((s, g) => s + g.pax, 0) * n.cover_charge;
  const list = n.guests
    .filter((g) => (view === 'all' ? true : view === 'in' ? g.checked_in : !g.checked_in))
    .filter((g) => !q || g.name.toLowerCase().includes(q.toLowerCase()));
  const locked = n.status === 'closed' || n.status === 'cancelled';

  return (
    <div className="venue-club">
      <Link to="/rooftop/club" className="btn quiet sm" style={{ marginBottom: 10 }}>
        <ArrowLeft size={14} /> Club nights
      </Link>
      <PageHead
        eyebrow={`Skydeck door · ${fmtDate(n.date, 'long')}`}
        title={n.title}
        accent={n.dj ? `· ${n.dj}` : undefined}
        actions={
          <>
            <Stamp value={n.status} />
            {n.status === 'scheduled' && (
              <button className="btn venue" onClick={() => setStatus.mutate({ status: 'live' })}>
                Open the doors
              </button>
            )}
            {n.status === 'live' && (
              <button className="btn ghost" onClick={() => setStatus.mutate({ status: 'closed' })}>
                Close night
              </button>
            )}
            {n.status === 'scheduled' && (
              <button className="btn quiet" onClick={() => setStatus.mutate({ status: 'cancelled' })}>
                Cancel night
              </button>
            )}
          </>
        }
      />

      <div className="dash-grid" style={{ gridTemplateColumns: '1fr 340px' }}>
        <div className="stack loose">
          <Ledger cols={3}>
            <LedgerCell label="On the list" value={expected} sub={`${n.guests.length} entries`} />
            <LedgerCell label="Cover" value={money(n.cover_charge, { compact: true })} sub="per head" />
            <LedgerCell label="Cover revenue" value={money(covers, { compact: true })} />
          </Ledger>

          <div className="toolbar" style={{ marginBottom: 0 }}>
            <Chips
              value={view}
              onChange={setView}
              options={[
                { value: 'waiting', label: 'Not arrived', count: n.guests.filter((g) => !g.checked_in).length },
                { value: 'in', label: 'Inside', count: n.guests.filter((g) => g.checked_in).length },
                { value: 'all', label: 'Everyone', count: n.guests.length },
              ]}
            />
            <span className="grow" />
            <label className="search">
              <Search size={15} />
              <input placeholder="Find a name…" value={q} onChange={(e) => setQ(e.target.value)} />
            </label>
          </div>

          <div className="panel">
            {list.map((g) => (
              <div key={g.id} className={`door-row ${g.checked_in ? 'in' : ''}`}>
                <div>
                  <b>{g.name}</b> {g.pax > 1 && <span className="mono small">+{g.pax - 1}</span>}{' '}
                  <Stamp tone={g.type === 'vip' ? 'brass' : g.type === 'table' ? 'roof' : 'neutral'}>{g.type.replace('_', ' ')}</Stamp>
                  <div className="small muted">
                    {g.checked_in ? `in at ${fmtTime(g.checked_in_at)}` : g.notes || 'awaiting arrival'}
                  </div>
                </div>
                {g.checked_in ? (
                  <label className="check small">
                    <input type="checkbox" checked={!!g.cover_paid} disabled={locked} onChange={(e) => mark.mutate({ gid: g.id, cover_paid: e.target.checked ? 1 : 0 })} />
                    cover paid
                  </label>
                ) : (
                  <span />
                )}
                {g.checked_in ? (
                  <button className="btn sm ghost" disabled={locked} onClick={() => mark.mutate({ gid: g.id, checked_in: 0 })}>
                    Undo
                  </button>
                ) : (
                  <button className="btn sm venue" disabled={n.status !== 'live'} title={n.status !== 'live' ? 'Open the doors first' : undefined} onClick={() => mark.mutate({ gid: g.id, checked_in: 1, cover_paid: g.type === 'vip' || g.type === 'table' ? 0 : 1 })}>
                    Admit {g.pax > 1 ? g.pax : ''}
                  </button>
                )}
              </div>
            ))}
            {list.length === 0 && <div className="empty small">Nobody here.</div>}
          </div>
        </div>

        <div className="stack loose">
          <Panel title="Capacity">
            <Gauge value={inside} max={n.capacity} />
            <p className="small muted center" style={{ margin: '10px 0 0' }}>
              {Math.max(0, n.capacity - inside)} spaces left before the fire limit.
            </p>
          </Panel>
          <Panel title="Add to the night">
            <div className="stack">
              <Field label="Name">
                <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} disabled={locked} />
              </Field>
              <div className="grid-2">
                <Field label="Party">
                  <input type="number" min={1} value={f.pax} onChange={(e) => setF({ ...f, pax: Number(e.target.value) })} disabled={locked} />
                </Field>
                <Field label="Type">
                  <select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as GuestListEntry['type'] })} disabled={locked}>
                    <option value="guestlist">Guest list</option>
                    <option value="vip">VIP (comp)</option>
                    <option value="table">Table booking</option>
                  </select>
                </Field>
              </div>
              <div className="grid-2">
                <button className="btn ghost" disabled={!f.name || locked || add.isPending} onClick={() => add.mutate(f)}>
                  <UserPlus size={14} /> Add to list
                </button>
                <button
                  className="btn venue"
                  disabled={!f.name || n.status !== 'live' || add.isPending}
                  onClick={() => add.mutate({ ...f, type: 'walk_in', walk_in: true })}
                >
                  Walk-in + cover
                </button>
              </div>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
