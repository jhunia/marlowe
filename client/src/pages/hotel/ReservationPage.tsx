import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, BedDouble, CreditCard, LogIn, LogOut, Plus, Printer, XCircle } from 'lucide-react';
import { useAction, useApi } from '../../lib/hooks';
import { fmtDate, fmtDateTime, isoDate, money, nightsBetween } from '../../lib/format';
import type { ReservationDetail, Room } from '../../lib/types';
import { Drawer, Field, Loading, Modal, PageHead, Panel, Stamp, useConfirm } from '../../components/ui';
import { useAuth } from '../../lib/auth';

const INV = ['/reservations', '/tape-chart', '/dashboard', '/rooms', '/nav-counts', '/housekeeping', '/guests', '/reports'];

export function ReservationPage() {
  const { id } = useParams();
  const { settings } = useAuth();
  const { data: r, isLoading } = useApi<ReservationDetail>(`/reservations/${id}`);
  const rooms = useApi<Room[]>(r ? `/rooms?type=${r.room_type_id}` : null);
  const confirm = useConfirm();
  const [payOpen, setPayOpen] = useState(false);
  const [chargeOpen, setChargeOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [checkInRoom, setCheckInRoom] = useState<number | ''>('');

  const act = (path: string, success: string) => useAction('post', `/reservations/${id}/${path}`, { invalidate: INV, success });
  const checkIn = act('check-in', 'Guest checked in — welcome them warmly');
  const checkOut = act('check-out', 'Checked out. Room sent to housekeeping.');
  const cancel = act('cancel', 'Reservation cancelled');
  const noShow = act('no-show', 'Marked as no-show');

  if (isLoading || !r) return <Loading />;

  const nights = nightsBetween(r.check_in, r.check_out);
  const settled = r.balance <= 0.009;
  const today = isoDate();
  const freeRooms = (rooms.data ?? []).filter((x) => x.status !== 'occupied' && x.status !== 'out_of_order');

  return (
    <div className="venue-hotel">
      <Link to="/reservations" className="btn quiet sm" style={{ marginBottom: 10 }}>
        <ArrowLeft size={14} /> Reservations
      </Link>
      <PageHead
        eyebrow={`Reservation ${r.code} · booked ${fmtDateTime(r.created_at)}`}
        title={r.guest_name}
        accent={r.room_number ? `· Room ${r.room_number}` : undefined}
        actions={
          <>
            <button className="btn ghost" onClick={() => window.print()}>
              <Printer size={15} /> Print folio
            </button>
            {r.status === 'booked' && (
              <>
                <button className="btn ghost" onClick={() => setEditOpen(true)}>
                  Amend
                </button>
                <button className="btn ghost" onClick={() => confirm.ask('Cancel this reservation?', 'The room will be released back to inventory.', () => cancel.mutate({}), true)}>
                  <XCircle size={15} /> Cancel
                </button>
                {r.check_in <= today && (
                  <button className="btn ghost" onClick={() => confirm.ask('Mark as no-show?', 'The guest did not arrive. The room will be released.', () => noShow.mutate({}), true)}>
                    No-show
                  </button>
                )}
              </>
            )}
            {r.status === 'checked_in' && (
              <button className="btn quiet" onClick={() => setEditOpen(true)}>
                Extend / amend
              </button>
            )}
          </>
        }
      />

      <div className="dash-grid">
        <div className="stack loose">
          {/* status band */}
          <div className="panel" style={{ borderLeft: '4px solid var(--hotel)' }}>
            <div className="panel-body row wrap" style={{ gap: 24 }}>
              <div>
                <div className="eyebrow">Status</div>
                <div style={{ marginTop: 6 }}>
                  <Stamp value={r.status} />
                </div>
              </div>
              <div>
                <div className="eyebrow">Arrive</div>
                <div className="italic" style={{ fontSize: 20 }}>
                  {fmtDate(r.check_in, 'day')}
                </div>
              </div>
              <div>
                <div className="eyebrow">Depart</div>
                <div className="italic" style={{ fontSize: 20 }}>
                  {fmtDate(r.check_out, 'day')}
                </div>
              </div>
              <div>
                <div className="eyebrow">Nights</div>
                <div className="italic" style={{ fontSize: 20 }}>
                  {nights}
                </div>
              </div>
              <span className="grow" />

              {r.status === 'booked' && (
                <div className="row">
                  <select className="input" style={{ width: 170 }} value={checkInRoom || r.room_id || ''} onChange={(e) => setCheckInRoom(Number(e.target.value))}>
                    <option value="">Choose room…</option>
                    {r.room_id && !freeRooms.some((x) => x.id === r.room_id) && <option value={r.room_id}>{r.room_number} (assigned)</option>}
                    {freeRooms.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.number} · {x.status.replace('_', ' ')}
                      </option>
                    ))}
                  </select>
                  <button
                    className="btn venue"
                    disabled={checkIn.isPending || r.check_in > today}
                    title={r.check_in > today ? 'Arrival date is in the future' : undefined}
                    onClick={() => checkIn.mutate({ room_id: checkInRoom || r.room_id })}
                  >
                    <LogIn size={15} /> Check in
                  </button>
                </div>
              )}
              {r.status === 'checked_in' && (
                <button
                  className="btn venue"
                  disabled={!settled || checkOut.isPending}
                  title={settled ? undefined : 'Settle the folio before checking out'}
                  onClick={() => confirm.ask('Check out guest?', `${r.guest_name} will be checked out of room ${r.room_number}.`, () => checkOut.mutate({}))}
                >
                  <LogOut size={15} /> Check out
                </button>
              )}
            </div>
          </div>

          <Panel
            title="Folio"
            flush
            actions={
              (r.status === 'checked_in' || r.status === 'booked') && (
                <>
                  <button className="btn ghost sm" onClick={() => setChargeOpen(true)}>
                    <Plus size={13} /> Post charge
                  </button>
                  <button className="btn sm venue" onClick={() => setPayOpen(true)}>
                    <CreditCard size={13} /> Take payment
                  </button>
                </>
              )
            }
          >
            <div className="table-wrap">
              <table className="ledger-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Description</th>
                    <th>Dept.</th>
                    <th className="num">Charge</th>
                    <th className="num">Credit</th>
                  </tr>
                </thead>
                <tbody>
                  {r.folio.map((f) => (
                    <tr key={`c${f.id}`}>
                      <td className="nowrap small">{fmtDate(f.date)}</td>
                      <td>{f.description}</td>
                      <td>
                        <Stamp tone={deptTone(f.category)}>{f.category}</Stamp>
                      </td>
                      <td className="num">{money(f.amount)}</td>
                      <td />
                    </tr>
                  ))}
                  {r.payments.map((p) => (
                    <tr key={`p${p.id}`}>
                      <td className="nowrap small">{fmtDateTime(p.created_at)}</td>
                      <td>
                        Payment — {p.method}
                        {p.reference && <span className="muted small"> · ref {p.reference}</span>}
                      </td>
                      <td>
                        <Stamp value="paid" />
                      </td>
                      <td />
                      <td className="num">{money(p.amount)}</td>
                    </tr>
                  ))}
                  {r.folio.length === 0 && r.payments.length === 0 && (
                    <tr>
                      <td colSpan={5} className="muted center">
                        Room nights post automatically at check-in. Outlet charges land here when a guest signs to the room.
                      </td>
                    </tr>
                  )}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={3}>Totals</td>
                    <td className="num">{money(r.charges)}</td>
                    <td className="num">{money(r.paid)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <div className={`folio-balance ${settled ? 'settled' : ''}`}>
              <span className="eyebrow" style={{ color: 'inherit', opacity: 0.8 }}>
                {settled ? 'Folio settled' : 'Balance due'}
              </span>
              <b>{money(r.balance)}</b>
            </div>
          </Panel>
        </div>

        <div className="stack loose">
          <Panel title="Guest">
            <dl className="detail-list">
              <dt>Name</dt>
              <dd>
                <b>{r.guest_name}</b> {r.guest.vip ? <Stamp value="vip" /> : null}
              </dd>
              <dt>Phone</dt>
              <dd>{r.guest.phone || '—'}</dd>
              <dt>Email</dt>
              <dd>{r.guest.email || '—'}</dd>
              <dt>Nationality</dt>
              <dd>{r.guest.nationality || '—'}</dd>
              <dt>ID</dt>
              <dd>{r.guest.id_type ? `${r.guest.id_type} · ${r.guest.id_number}` : '—'}</dd>
              {r.guest.notes && (
                <>
                  <dt>Preferences</dt>
                  <dd className="italic">{r.guest.notes}</dd>
                </>
              )}
            </dl>
          </Panel>
          <Panel title="Stay">
            <dl className="detail-list">
              <dt>Room type</dt>
              <dd>{r.type_name}</dd>
              <dt>Room</dt>
              <dd className="row" style={{ gap: 6 }}>
                <BedDouble size={14} /> {r.room_number ?? 'Unassigned'}
              </dd>
              <dt>Party</dt>
              <dd>
                {r.adults} adults{r.children ? `, ${r.children} children` : ''}
              </dd>
              <dt>Nightly rate</dt>
              <dd className="mono">{money(r.rate)}</dd>
              <dt>Room total</dt>
              <dd className="mono">{money(r.rate * nights)}</dd>
              <dt>Source</dt>
              <dd>{r.source.replace('_', ' ')}</dd>
              <dt>Check-in / out</dt>
              <dd>
                from {settings?.check_in_time} · by {settings?.check_out_time}
              </dd>
              {r.notes && (
                <>
                  <dt>Notes</dt>
                  <dd className="italic">{r.notes}</dd>
                </>
              )}
            </dl>
          </Panel>
        </div>
      </div>

      <PaymentModal open={payOpen} onClose={() => setPayOpen(false)} resId={r.id} balance={r.balance} />
      <ChargeModal open={chargeOpen} onClose={() => setChargeOpen(false)} resId={r.id} />
      <AmendDrawer key={`${r.check_in}${r.check_out}${r.rate}${editOpen}`} open={editOpen} onClose={() => setEditOpen(false)} r={r} />
      {confirm.element}
    </div>
  );
}

function deptTone(c: string) {
  return ({ room: 'hotel', restaurant: 'dining', bar: 'roof', pool: 'roof', rooftop: 'roof', event: 'garden' } as Record<string, string>)[c] ?? 'neutral';
}

function PaymentModal({ open, onClose, resId, balance }: { open: boolean; onClose: () => void; resId: number; balance: number }) {
  const [amount, setAmount] = useState<number | ''>('');
  const [method, setMethod] = useState('momo');
  const [ref, setRef] = useState('');
  const pay = useAction('post', `/reservations/${resId}/payments`, {
    invalidate: INV,
    success: 'Payment recorded',
    onSuccess: () => {
      onClose();
      setAmount('');
      setRef('');
    },
  });
  const value = amount === '' ? Math.max(0, balance) : amount;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Take payment"
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn venue-hotel venue" disabled={!value || pay.isPending} onClick={() => pay.mutate({ amount: value, method, reference: ref })}>
            Record {money(value)}
          </button>
        </>
      }
    >
      <div className="stack">
        <Field label="Amount" hint={`Outstanding: ${money(balance)}`}>
          <input type="number" min={0} step="0.01" value={amount === '' ? (balance > 0 ? balance : '') : amount} onChange={(e) => setAmount(e.target.value === '' ? '' : Number(e.target.value))} />
        </Field>
        <Field label="Method">
          <select value={method} onChange={(e) => setMethod(e.target.value)}>
            <option value="momo">Mobile Money (MoMo)</option>
            <option value="card">Card</option>
            <option value="cash">Cash</option>
            <option value="transfer">Bank transfer</option>
          </select>
        </Field>
        <Field label="Reference">
          <input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="MoMo transaction ID / card slip / transfer ref" />
        </Field>
      </div>
    </Modal>
  );
}

function ChargeModal({ open, onClose, resId }: { open: boolean; onClose: () => void; resId: number }) {
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('minibar');
  const [amount, setAmount] = useState<number | ''>('');
  const post = useAction('post', `/reservations/${resId}/charges`, {
    invalidate: INV,
    success: 'Charge posted to folio',
    onSuccess: () => {
      onClose();
      setDescription('');
      setAmount('');
    },
  });
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Post a charge"
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn" disabled={!description || !amount || post.isPending} onClick={() => post.mutate({ description, category, amount })}>
            Post charge
          </button>
        </>
      }
    >
      <div className="stack">
        <Field label="Department">
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="minibar">Minibar</option>
            <option value="laundry">Laundry</option>
            <option value="transport">Transport</option>
            <option value="spa">Spa</option>
            <option value="damage">Damage</option>
            <option value="other">Other</option>
            <option value="adjustment">Adjustment (negative allowed)</option>
          </select>
        </Field>
        <Field label="Description">
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Airport pickup" />
        </Field>
        <Field label="Amount">
          <input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value === '' ? '' : Number(e.target.value))} />
        </Field>
      </div>
    </Modal>
  );
}

function AmendDrawer({ open, onClose, r }: { open: boolean; onClose: () => void; r: ReservationDetail }) {
  const [checkOut, setCheckOut] = useState(r.check_out);
  const [checkIn, setCheckIn] = useState(r.check_in);
  const [rate, setRate] = useState(r.rate);
  const [adults, setAdults] = useState(r.adults);
  const [children, setChildren] = useState(r.children);
  const [notes, setNotes] = useState(r.notes ?? '');
  const save = useAction('patch', `/reservations/${r.id}`, { invalidate: INV, success: 'Reservation updated', onSuccess: onClose });
  const inHouse = r.status === 'checked_in';
  return (
    <Drawer
      open={open}
      onClose={onClose}
      eyebrow={r.code}
      title={inHouse ? 'Extend or amend stay' : 'Amend reservation'}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn venue" disabled={save.isPending} onClick={() => save.mutate({ check_in: checkIn, check_out: checkOut, rate, adults, children, notes })}>
            Save changes
          </button>
        </>
      }
    >
      <div className="stack venue-hotel">
        <div className="grid-2">
          <Field label="Check-in">
            <input type="date" value={checkIn} disabled={inHouse} onChange={(e) => setCheckIn(e.target.value)} />
          </Field>
          <Field label="Check-out">
            <input type="date" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} />
          </Field>
          <Field label="Nightly rate">
            <input type="number" value={rate} disabled={inHouse} onChange={(e) => setRate(Number(e.target.value))} />
          </Field>
          <div />
          <Field label="Adults">
            <input type="number" min={1} value={adults} onChange={(e) => setAdults(Number(e.target.value))} />
          </Field>
          <Field label="Children">
            <input type="number" min={0} value={children} onChange={(e) => setChildren(Number(e.target.value))} />
          </Field>
        </div>
        <Field label="Notes">
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        {inHouse && <p className="small muted">Extending an in-house stay posts the extra nights to the folio automatically. Availability for the room is re-checked.</p>}
      </div>
    </Drawer>
  );
}
