import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { useAction, useApi } from '../../lib/hooks';
import { fmtDate, isoDate, money } from '../../lib/format';
import type { ClubNight } from '../../lib/types';
import { Drawer, Empty, Field, Loading, PageHead, Stamp } from '../../components/ui';

export function ClubNights() {
  const nav = useNavigate();
  const { data, isLoading } = useApi<ClubNight[]>('/club-nights');
  const [adding, setAdding] = useState(false);
  const today = isoDate();

  if (isLoading || !data) return <Loading />;
  const upcoming = data.filter((n) => n.date >= today && n.status !== 'cancelled').sort((a, b) => a.date.localeCompare(b.date));
  const past = data.filter((n) => n.date < today || n.status === 'cancelled');

  return (
    <div className="venue-club">
      <PageHead
        eyebrow="Skydeck · Nightlife"
        title="Club"
        accent="nights"
        actions={
          <button className="btn venue" onClick={() => setAdding(true)}>
            <Plus size={15} /> Schedule a night
          </button>
        }
      />

      <div className="floor-title">
        <h3>Upcoming</h3>
      </div>
      {upcoming.length === 0 ? (
        <div className="panel">
          <Empty title="Nothing on the decks yet." />
        </div>
      ) : (
        <div className="resgrid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', marginBottom: 28 }}>
          {upcoming.map((n) => {
            const fill = n.capacity ? Math.round(((n.list_pax ?? 0) / n.capacity) * 100) : 0;
            return (
              <div key={n.id} className="rescard" style={{ cursor: 'pointer' }} onClick={() => nav(`/rooftop/club/${n.id}`)}>
                <div className="rescard-head" style={{ padding: '16px 16px 14px', display: 'block' }}>
                  <div className="row between">
                    <span>{n.date === today ? 'Tonight' : fmtDate(n.date, 'day')}</span>
                    <Stamp tone="neutral">{n.status}</Stamp>
                  </div>
                  <b style={{ display: 'block', fontSize: 24, marginTop: 6 }}>{n.title}</b>
                  <div style={{ opacity: 0.8, fontSize: 13 }}>{n.dj ? `with ${n.dj}` : 'Line-up TBC'}</div>
                </div>
                <div className="rescard-body stack tight">
                  <div className="row between small">
                    <span className="muted">Guest list</span>
                    <span className="mono">
                      {n.list_pax ?? 0} / {n.capacity}
                    </span>
                  </div>
                  <div className="progress">
                    <i style={{ width: `${Math.min(100, fill)}%` }} />
                  </div>
                  <div className="row between small">
                    <span className="muted">Cover</span>
                    <span className="mono">{money(n.cover_charge)}</span>
                  </div>
                  <button className="btn venue sm block" style={{ marginTop: 6 }}>
                    Open door list
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="floor-title">
        <h3>Past nights</h3>
      </div>
      <div className="panel">
        <div className="table-wrap">
          <table className="ledger-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Night</th>
                <th>DJ</th>
                <th className="num">Through the door</th>
                <th className="num">Cover revenue</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {past.map((n) => (
                <tr key={n.id} className="clickable" onClick={() => nav(`/rooftop/club/${n.id}`)}>
                  <td className="nowrap">{fmtDate(n.date)}</td>
                  <td>
                    <b>{n.title}</b>
                  </td>
                  <td>{n.dj}</td>
                  <td className="num">
                    {n.checked_in_pax ?? 0} / {n.capacity}
                  </td>
                  <td className="num">{money(n.cover_revenue ?? 0)}</td>
                  <td>
                    <Stamp value={n.status} />
                  </td>
                </tr>
              ))}
              {past.length === 0 && (
                <tr>
                  <td colSpan={6} className="muted center">
                    No past nights yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <NewNight open={adding} onClose={() => setAdding(false)} />
    </div>
  );
}

function NewNight({ open, onClose }: { open: boolean; onClose: () => void }) {
  const blank = { title: '', date: isoDate(), dj: '', cover_charge: 150, capacity: 180, notes: '' };
  const [f, setF] = useState(blank);
  const create = useAction('post', '/club-nights', {
    invalidate: ['/club-nights', '/dashboard'],
    success: 'Night scheduled',
    onSuccess: () => {
      onClose();
      setF(blank);
    },
  });
  return (
    <Drawer
      open={open}
      onClose={onClose}
      eyebrow="Skydeck"
      title="Schedule a club night"
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn venue" disabled={!f.title || create.isPending} onClick={() => create.mutate(f)}>
            Schedule
          </button>
        </>
      }
    >
      <div className="grid-2 venue-club">
        <Field label="Night title" className="span-2">
          <input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="e.g. Highlife Under the Stars" />
        </Field>
        <Field label="Date">
          <input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
        </Field>
        <Field label="DJ / act">
          <input value={f.dj} onChange={(e) => setF({ ...f, dj: e.target.value })} />
        </Field>
        <Field label="Cover charge">
          <input type="number" min={0} value={f.cover_charge} onChange={(e) => setF({ ...f, cover_charge: Number(e.target.value) })} />
        </Field>
        <Field label="Capacity" hint="Rooftop fire limit">
          <input type="number" min={1} value={f.capacity} onChange={(e) => setF({ ...f, capacity: Number(e.target.value) })} />
        </Field>
        <Field label="Notes" className="span-2">
          <textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
        </Field>
      </div>
    </Drawer>
  );
}
