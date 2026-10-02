import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, BedDouble, Banknote, CreditCard, Landmark, Minus, Plus, Send, Smartphone, Trash2 } from 'lucide-react';
import { useAction, useApi } from '../../lib/hooks';
import { money, timeAgo } from '../../lib/format';
import { qs } from '../../lib/api';
import type { MenuCategory, MenuItem, Order, OrderItem, Outlet, Reservation } from '../../lib/types';
import { Field, Loading, Modal, Stamp, useConfirm } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { photo } from '../../lib/img';

const INV = ['/orders', '/tables', '/kitchen', '/dashboard', '/nav-counts', '/reservations', '/reports'];

export function Pos({ outlet }: { outlet: Outlet }) {
  const { id } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const back = outlet === 'restaurant' ? '/restaurant' : '/rooftop';
  const venue = outlet === 'restaurant' ? 'venue-dining' : 'venue-roof';

  const { data: order, isLoading } = useApi<Order>(`/orders/${id}`, { refetchInterval: 15000 });
  const { data: cats } = useApi<MenuCategory[]>(`/menu/categories${qs({ outlet })}`);
  const { data: items } = useApi<MenuItem[]>(`/menu/items${qs({ outlet })}`);
  const [cat, setCat] = useState<number | 'all'>('all');
  const [paying, setPaying] = useState(false);
  const [noteFor, setNoteFor] = useState<OrderItem | null>(null);
  const confirm = useConfirm();

  const add = useAction<{ menu_item_id: number }>('post', `/orders/${id}/items`, { invalidate: [`/orders/${id}`, '/tables'] });
  const patchItem = useAction<{ itemId: number; qty?: number; notes?: string; status?: string }>('patch', (b) => `/orders/${id}/items/${b.itemId}`, {
    invalidate: [`/orders/${id}`, '/tables', '/kitchen'],
  });
  const delItem = useAction<{ itemId: number }>('del', (b) => `/orders/${id}/items/${b.itemId}`, { invalidate: [`/orders/${id}`, '/tables'] });
  const fire = useAction('post', `/orders/${id}/fire`, { invalidate: INV, success: outlet === 'restaurant' ? 'Sent to the pass' : 'Sent to the bar' });
  const voidOrder = useAction('post', `/orders/${id}/void`, { invalidate: INV, success: 'Check voided', onSuccess: () => nav(back) });

  const shown = useMemo(() => (items ?? []).filter((i) => cat === 'all' || i.category_id === cat), [items, cat]);

  if (isLoading || !order) return <Loading />;
  const lines = order.items ?? [];
  const pending = lines.filter((l) => l.status === 'pending');
  const isOpen = order.status === 'open';
  const canVoidFired = user?.role === 'admin' || user?.role === 'manager';

  return (
    <div className={venue}>
      <div className="row between" style={{ marginBottom: 14 }}>
        <Link to={back} className="btn quiet sm">
          <ArrowLeft size={14} /> Back to floor
        </Link>
        <span className="small muted">
          Opened {timeAgo(order.created_at)} ago by {order.server_name ?? '—'}
        </span>
      </div>

      <div className="pos">
        <div className="pos-menu">
          <div className="pos-cats">
            <button className={`chip ${cat === 'all' ? 'on' : ''}`} onClick={() => setCat('all')}>
              Everything
            </button>
            {cats?.map((c) => (
              <button key={c.id} className={`chip ${cat === c.id ? 'on' : ''}`} onClick={() => setCat(c.id)}>
                {c.name}
              </button>
            ))}
          </div>
          <div className="pos-items">
            {shown.map((m) => (
              <button
                key={m.id}
                className={`pos-item ${m.image_url ? 'has-photo' : ''}`}
                disabled={!m.available || !isOpen || add.isPending}
                onClick={() => add.mutate({ menu_item_id: m.id })}
                title={m.description ?? ''}
              >
                {m.image_url ? (
                  <>
                    <img src={photo(m.image_url, 300)} alt="" loading="lazy" />
                    <span className="pi-body">
                      <b>{m.name}</b>
                      <span>{m.available ? money(m.price) : '86’d'}</span>
                    </span>
                  </>
                ) : (
                  <>
                    <b>{m.name}</b>
                    <span>{m.available ? money(m.price) : '86’d'}</span>
                  </>
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="check-pad">
          <div className="check-head">
            <div className="row between">
              <h3>{order.table_label ? `Table ${order.table_label}` : order.guest_name || 'Tab'}</h3>
              <Stamp value={order.status} />
            </div>
            <div className="small muted">
              <span className="mono">{order.code}</span> · {order.covers} cover{order.covers !== 1 ? 's' : ''}
              {order.guest_name && order.table_label ? ` · ${order.guest_name}` : ''}
              {order.room_number ? ` · Room ${order.room_number}` : ''}
            </div>
          </div>

          <div className="check-lines">
            {lines.length === 0 && <div className="empty small">Tap items on the left to start the check.</div>}
            {lines.map((l) => (
              <div key={l.id} className={`check-line ${l.status === 'void' ? 'void' : ''}`}>
                <span className="qty">{l.qty}×</span>
                <div>
                  <div>
                    {l.name}{' '}
                    {l.status !== 'pending' && (
                      <span style={{ marginLeft: 4 }}>
                        <Stamp value={l.status} />
                      </span>
                    )}
                  </div>
                  {l.notes && <div className="note">“{l.notes}”</div>}
                  {isOpen && l.status === 'pending' && (
                    <div className="ctl">
                      <button onClick={() => (l.qty > 1 ? patchItem.mutate({ itemId: l.id, qty: l.qty - 1 }) : delItem.mutate({ itemId: l.id }))} aria-label="Less">
                        <Minus size={11} />
                      </button>
                      <button onClick={() => patchItem.mutate({ itemId: l.id, qty: l.qty + 1 })} aria-label="More">
                        <Plus size={11} />
                      </button>
                      <button onClick={() => setNoteFor(l)}>note</button>
                      <button onClick={() => delItem.mutate({ itemId: l.id })} aria-label="Remove">
                        <Trash2 size={11} />
                      </button>
                    </div>
                  )}
                  {isOpen && l.status !== 'pending' && l.status !== 'void' && canVoidFired && (
                    <div className="ctl">
                      <button onClick={() => confirm.ask('Void this item?', `${l.qty}× ${l.name} will be removed from the check.`, () => patchItem.mutate({ itemId: l.id, status: 'void' }), true)}>
                        void
                      </button>
                    </div>
                  )}
                </div>
                <span className="amt">{money(l.qty * l.unit_price)}</span>
              </div>
            ))}
          </div>

          <div className="check-totals">
            <div>
              <span>Subtotal</span>
              <span className="mono">{money(order.subtotal)}</span>
            </div>
            <div>
              <span>Service charge</span>
              <span className="mono">{money(order.service_charge)}</span>
            </div>
            <div>
              <span>Taxes & levies</span>
              <span className="mono">{money(order.tax)}</span>
            </div>
            <div className="total">
              <span>Total</span>
              <span>{money(order.total)}</span>
            </div>
          </div>

          {isOpen ? (
            <div className="check-actions">
              <button className="btn ghost" disabled={!pending.length || fire.isPending} onClick={() => fire.mutate({})}>
                <Send size={14} /> Send {pending.length ? `(${pending.reduce((s, l) => s + l.qty, 0)})` : ''}
              </button>
              <button className="btn venue" disabled={order.total <= 0 || pending.length > 0} title={pending.length ? 'Send pending items first' : undefined} onClick={() => setPaying(true)}>
                Settle {money(order.total, { compact: true })}
              </button>
              <button
                className="btn quiet sm"
                style={{ gridColumn: 'span 2' }}
                onClick={() => confirm.ask('Void the whole check?', 'This cannot be undone. Fired items require a manager.', () => voidOrder.mutate({}), true)}
              >
                Void check
              </button>
            </div>
          ) : (
            <div className="check-actions">
              <div className="small muted" style={{ gridColumn: 'span 2' }}>
                Closed · {order.payment_method === 'room' ? `charged to room ${order.room_number}` : `paid by ${order.payment_method}`}
              </div>
            </div>
          )}
        </div>
      </div>

      <SettleModal open={paying} onClose={() => setPaying(false)} order={order} onDone={() => nav(back)} />
      <NoteModal item={noteFor} onClose={() => setNoteFor(null)} onSave={(notes) => noteFor && patchItem.mutate({ itemId: noteFor.id, notes })} />
      {confirm.element}
    </div>
  );
}

function NoteModal({ item, onClose, onSave }: { item: OrderItem | null; onClose: () => void; onSave: (n: string) => void }) {
  const [v, setV] = useState('');
  const quick = ['No onions', 'Extra spicy', 'Mild', 'Allergy: nuts', 'Well done', 'Medium rare', 'No ice', 'On the side'];
  return (
    <Modal
      open={!!item}
      onClose={onClose}
      title={`Note · ${item?.name ?? ''}`}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn"
            onClick={() => {
              onSave(v);
              setV('');
              onClose();
            }}
          >
            Save note
          </button>
        </>
      }
    >
      <div className="stack">
        <input className="input" value={v} onChange={(e) => setV(e.target.value)} placeholder={item?.notes ?? 'Modifier or allergy'} autoFocus />
        <div className="row wrap" style={{ gap: 6 }}>
          {quick.map((q) => (
            <button key={q} className="chip" onClick={() => setV(v ? `${v}, ${q}` : q)}>
              {q}
            </button>
          ))}
        </div>
      </div>
    </Modal>
  );
}

function SettleModal({ open, onClose, order, onDone }: { open: boolean; onClose: () => void; order: Order; onDone: () => void }) {
  const [method, setMethod] = useState<'momo' | 'card' | 'cash' | 'transfer' | 'room'>('momo');
  const [resId, setResId] = useState<number | ''>('');
  const [tendered, setTendered] = useState<number | ''>('');
  const [reference, setReference] = useState('');
  const inHouse = useApi<Reservation[]>(open && method === 'room' ? '/in-house' : null);
  const pay = useAction('post', `/orders/${order.id}/pay`, {
    invalidate: INV,
    success: method === 'room' ? 'Charged to room folio' : 'Check settled',
    onSuccess: () => {
      onClose();
      onDone();
    },
  });
  const change = method === 'cash' && tendered !== '' ? Number(tendered) - order.total : 0;
  const methods = [
    { k: 'momo', label: 'Mobile Money', icon: <Smartphone size={18} /> },
    { k: 'card', label: 'Card', icon: <CreditCard size={18} /> },
    { k: 'cash', label: 'Cash', icon: <Banknote size={18} /> },
    { k: 'transfer', label: 'Transfer', icon: <Landmark size={18} /> },
    { k: 'room', label: 'Charge to room', icon: <BedDouble size={18} /> },
  ] as const;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Settle ${money(order.total)}`}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            Back
          </button>
          <button
            className="btn"
            disabled={pay.isPending || (method === 'room' && !resId) || (method === 'cash' && tendered !== '' && change < 0)}
            onClick={() => pay.mutate({ method, reservation_id: method === 'room' ? resId : undefined, reference: reference || undefined })}
          >
            {method === 'room' ? 'Post to folio' : 'Confirm payment'}
          </button>
        </>
      }
    >
      <div className="stack">
        <div className="grid-2">
          {methods.map((m) => (
            <button
              key={m.k}
              className={`btn ${method === m.k ? '' : 'ghost'}`}
              style={{ height: 60, flexDirection: 'column', gap: 2, borderRadius: 14 }}
              onClick={() => setMethod(m.k)}
            >
              {m.icon}
              <span style={{ fontSize: 12 }}>{m.label}</span>
            </button>
          ))}
        </div>
        {method === 'momo' && (
          <Field label="MoMo transaction ID" hint="From the customer’s confirmation SMS (MTN, Telecel or AirtelTigo).">
            <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. 4419283746" />
          </Field>
        )}
        {method === 'cash' && (
          <Field label="Cash tendered" hint={tendered !== '' ? (change >= 0 ? `Change due: ${money(change)}` : 'Not enough tendered') : undefined}>
            <input type="number" value={tendered} onChange={(e) => setTendered(e.target.value === '' ? '' : Number(e.target.value))} />
          </Field>
        )}
        {method === 'room' && (
          <Field label="In-house guest" hint="Only checked-in reservations can sign to a room.">
            <select value={resId} onChange={(e) => setResId(e.target.value ? Number(e.target.value) : '')}>
              <option value="">Select room…</option>
              {inHouse.data?.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.room_number} — {r.guest_name}
                </option>
              ))}
            </select>
          </Field>
        )}
      </div>
    </Modal>
  );
}
