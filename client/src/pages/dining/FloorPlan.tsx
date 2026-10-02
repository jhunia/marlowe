import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Receipt } from 'lucide-react';
import { useAction, useApi } from '../../lib/hooks';
import { isoDate, money, timeAgo } from '../../lib/format';
import { qs } from '../../lib/api';
import type { DiningTable, Order, Outlet, TableBooking } from '../../lib/types';
import { Field, Ledger, LedgerCell, Loading, Modal, PageHead, Panel, Stamp } from '../../components/ui';

const COPY: Record<Outlet, { venue: string; eyebrow: string; title: string; accent: string; tab: string }> = {
  restaurant: { venue: 'venue-dining', eyebrow: 'Ember & Salt · Service', title: 'Dining room', accent: 'floor', tab: 'Takeaway / counter' },
  rooftop: { venue: 'venue-roof', eyebrow: 'Skydeck · Bar service', title: 'Rooftop', accent: 'bar & deck', tab: 'Open a bar tab' },
};

export function tableSize(t: DiningTable) {
  if (t.shape === 'long') return { w: 40 + t.seats * 14, h: 64 };
  const s = t.seats <= 2 ? 64 : t.seats <= 4 ? 80 : 96;
  return { w: s, h: s };
}

export function FloorPlan({ outlet }: { outlet: Outlet }) {
  const nav = useNavigate();
  const copy = COPY[outlet];
  const { data: tables, isLoading } = useApi<DiningTable[]>(`/tables${qs({ outlet })}`, { refetchInterval: 15000 });
  const { data: openOrders } = useApi<Order[]>(`/orders${qs({ outlet, status: 'open' })}`, { refetchInterval: 15000 });
  const { data: bookings } = useApi<TableBooking[]>(`/table-bookings${qs({ outlet, date: isoDate() })}`);
  const { data: today } = useApi<{ revenue: number; covers: number; checks: number; avg: number }>(`/orders/summary${qs({ outlet })}`);
  const [opening, setOpening] = useState<DiningTable | 'tab' | null>(null);

  const setStatus = useAction<{ id: number; status: string }>('patch', (b) => `/tables/${b.id}`, { invalidate: ['/tables'] });

  if (isLoading || !tables) return <Loading />;

  const zones = [...new Set(tables.map((t) => t.zone))];
  const tabs = (openOrders ?? []).filter((o) => !o.table_id);
  const seated = tables.filter((t) => t.status === 'seated').length;
  const pos = (id: number) => (outlet === 'restaurant' ? `/restaurant/pos/${id}` : `/rooftop/pos/${id}`);

  const click = (t: DiningTable) => {
    if (t.status === 'seated' && t.order_id) return nav(pos(t.order_id));
    if (t.status === 'dirty') return setStatus.mutate({ id: t.id, status: 'free' });
    setOpening(t);
  };

  const upcoming = (bookings ?? []).filter((b) => b.status === 'booked');

  return (
    <div className={copy.venue}>
      <PageHead
        eyebrow={copy.eyebrow}
        title={copy.title}
        accent={copy.accent}
        actions={
          <button className="btn venue" onClick={() => setOpening('tab')}>
            <Plus size={15} /> {copy.tab}
          </button>
        }
      />

      <Ledger cols={4}>
        <LedgerCell label="Tables in use" value={`${seated}/${tables.length}`} bar={(seated / Math.max(1, tables.length)) * 100} />
        <LedgerCell label="Covers today" value={today?.covers ?? 0} />
        <LedgerCell label="Sales today" value={money(today?.revenue ?? 0, { compact: true })} sub={`${today?.checks ?? 0} closed checks`} />
        <LedgerCell label="Average check" value={money(today?.avg ?? 0, { compact: true })} />
      </Ledger>

      <div className="dash-grid" style={{ gridTemplateColumns: '1fr 300px' }}>
        <div>
          <div className="row" style={{ marginBottom: 10, gap: 14 }}>
            <div className="legend">
              <span>
                <i style={{ border: '1px dashed var(--rule-strong)' }} />
                Free
              </span>
              <span>
                <i style={{ background: 'var(--venue)' }} />
                Seated
              </span>
              <span>
                <i style={{ background: 'var(--info-tint)', border: '1px solid var(--info)' }} />
                Reserved
              </span>
              <span>
                <i style={{ background: 'var(--warn-tint)', border: '1px solid var(--warn)' }} />
                Needs reset — tap to clear
              </span>
            </div>
          </div>
          <div className="floorplan">
            <div style={{ position: 'relative', width: 880, height: 540 }}>
              {zones.map((z) => {
                const zt = tables.filter((t) => t.zone === z);
                const minX = Math.min(...zt.map((t) => t.x));
                const minY = Math.min(...zt.map((t) => t.y));
                return (
                  <div key={z} className="zone-label" style={{ left: minX, top: minY - 30 }}>
                    {z}
                  </div>
                );
              })}
              {tables.map((t) => {
                const { w, h } = tableSize(t);
                return (
                  <button
                    key={t.id}
                    className={`ftable ${t.shape} ${t.status}`}
                    style={{ left: t.x, top: t.y, width: w, height: h, font: 'inherit' }}
                    onClick={() => click(t)}
                    title={`${t.label} · ${t.seats} seats · ${t.status}`}
                  >
                    <b>{t.label}</b>
                    <small>
                      {t.status === 'seated' ? `${t.covers ?? 0} cov · ${t.opened_at ? timeAgo(t.opened_at) : ''}` : `${t.seats} seats`}
                    </small>
                    {t.status === 'seated' && <span className="amt">{money(t.order_total ?? 0, { compact: true })}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="stack loose">
          <Panel title={outlet === 'rooftop' ? 'Open tabs' : 'Counter checks'} flush>
            {tabs.length === 0 ? (
              <div className="empty small">None open.</div>
            ) : (
              <ul className="movement-list">
                {tabs.map((o) => (
                  <li key={o.id} style={{ gridTemplateColumns: '28px 1fr auto', cursor: 'pointer' }} onClick={() => nav(pos(o.id))}>
                    <Receipt size={16} />
                    <span>
                      <b>{o.guest_name || o.code}</b>
                      <div className="small muted">
                        {o.code} · {timeAgo(o.created_at)}
                      </div>
                    </span>
                    <span className="mono small">{money(o.total)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          {outlet === 'restaurant' && (
            <Panel title="Still to arrive today" flush>
              {upcoming.length === 0 ? (
                <div className="empty small">No more bookings today.</div>
              ) : (
                <ul className="movement-list">
                  {upcoming.map((b) => (
                    <li key={b.id} style={{ gridTemplateColumns: '52px 1fr auto' }}>
                      <span className="mono strong">{b.time}</span>
                      <span>
                        <b>{b.guest_name}</b>
                        <div className="small muted">
                          party of {b.party_size}
                          {b.table_label ? ` · ${b.table_label}` : ''}
                        </div>
                      </span>
                      <Stamp value={b.status} />
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          )}
        </div>
      </div>

      <OpenCheck outlet={outlet} target={opening} onClose={() => setOpening(null)} onOpened={(o) => nav(pos(o.id))} />
    </div>
  );
}

function OpenCheck({
  outlet,
  target,
  onClose,
  onOpened,
}: {
  outlet: Outlet;
  target: DiningTable | 'tab' | null;
  onClose: () => void;
  onOpened: (o: Order) => void;
}) {
  const [covers, setCovers] = useState(2);
  const [name, setName] = useState('');
  const open = useAction<unknown, Order>('post', '/orders', {
    invalidate: ['/tables', '/orders', '/dashboard'],
    onSuccess: (o) => {
      onClose();
      setName('');
      onOpened(o);
    },
  });
  const isTab = target === 'tab';
  return (
    <Modal
      open={!!target}
      onClose={onClose}
      title={isTab ? (outlet === 'rooftop' ? 'Open bar tab' : 'Counter check') : `Seat ${target && typeof target === 'object' ? target.label : ''}`}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn"
            disabled={open.isPending || (isTab && !name.trim())}
            onClick={() => open.mutate({ outlet, table_id: isTab ? null : (target as DiningTable).id, covers, guest_name: name })}
          >
            Open check
          </button>
        </>
      }
    >
      <div className="grid-2">
        <Field label="Covers">
          <input type="number" min={1} value={covers} onChange={(e) => setCovers(Number(e.target.value))} />
        </Field>
        <Field label={isTab ? 'Tab name' : 'Guest name (optional)'}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={isTab ? 'e.g. Ama — blue dress' : ''} autoFocus />
        </Field>
      </div>
    </Modal>
  );
}
