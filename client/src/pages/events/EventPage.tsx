import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, Plus, Printer, Trash2 } from 'lucide-react';
import { useAction, useApi } from '../../lib/hooks';
import { fmtDate, fmtDateTime, money } from '../../lib/format';
import type { EventDetail, EventStatus } from '../../lib/types';
import { Field, Loading, Modal, PageHead, Panel, Stamp, useConfirm } from '../../components/ui';
import { EVENT_TYPES, VENUES } from './NewEvent';

const NEXT: Partial<Record<EventStatus, { to: EventStatus; label: string }>> = {
  inquiry: { to: 'tentative', label: 'Place tentative hold' },
  tentative: { to: 'confirmed', label: 'Confirm event' },
  confirmed: { to: 'completed', label: 'Mark completed' },
};

const PACKAGES: { label: string; lines: { description: string; qty: 'guests' | number; unit_price: number }[] }[] = [
  {
    label: 'Garden wedding',
    lines: [
      { description: 'Venue hire — Garden lawn (day)', qty: 1, unit_price: 25000 },
      { description: 'Buffet menu, three courses (per head)', qty: 'guests', unit_price: 280 },
      { description: 'Décor & floral package', qty: 1, unit_price: 15000 },
      { description: 'Sound, stage & lighting', qty: 1, unit_price: 8000 },
      { description: 'Security & ushers', qty: 1, unit_price: 5000 },
    ],
  },
  {
    label: 'Corporate day',
    lines: [
      { description: 'Pavilion hire (full day)', qty: 1, unit_price: 9000 },
      { description: 'Day delegate rate — lunch & two breaks', qty: 'guests', unit_price: 220 },
      { description: 'Projector, screen & PA', qty: 1, unit_price: 3000 },
    ],
  },
  {
    label: 'Birthday soirée',
    lines: [
      { description: 'Venue hire (evening)', qty: 1, unit_price: 8000 },
      { description: 'Canapés & small chops (per head)', qty: 'guests', unit_price: 150 },
      { description: 'DJ set (4 hours)', qty: 1, unit_price: 4000 },
      { description: 'Cake table & balloon styling', qty: 1, unit_price: 2800 },
    ],
  },
];

export function EventPage() {
  const { id } = useParams();
  const { data: e, isLoading } = useApi<EventDetail>(`/events/${id}`);
  const inv = ['/events', '/dashboard', '/nav-counts', '/reports'];
  const [f, setF] = useState<Partial<EventDetail>>({});
  const [line, setLine] = useState({ description: '', qty: 1, unit_price: 0 });
  const [task, setTask] = useState('');
  const [paying, setPaying] = useState(false);
  const confirm = useConfirm();

  useEffect(() => {
    if (e) setF({ title: e.title, client_name: e.client_name, client_phone: e.client_phone, client_email: e.client_email, event_type: e.event_type, venue: e.venue, date: e.date, start_time: e.start_time, end_time: e.end_time, guests: e.guests, notes: e.notes });
  }, [e]);

  const save = useAction('patch', `/events/${id}`, { invalidate: inv, success: 'Event saved' });
  const addItem = useAction('post', `/events/${id}/items`, { invalidate: inv, onSuccess: () => setLine({ description: '', qty: 1, unit_price: 0 }) });
  const addItems = useAction('post', `/events/${id}/items`, { invalidate: inv, success: 'Package added to quote' });
  const delItem = useAction<{ itemId: number }>('del', (b) => `/events/${id}/items/${b.itemId}`, { invalidate: inv });
  const addTask = useAction('post', `/events/${id}/tasks`, { invalidate: inv, onSuccess: () => setTask('') });
  const toggleTask = useAction<{ tid: number; done: number }>('patch', (b) => `/event-tasks/${b.tid}`, { invalidate: inv });

  if (isLoading || !e) return <Loading />;
  const balance = e.quote_total - e.paid;
  const next = NEXT[e.status];
  const editable = e.status !== 'completed' && e.status !== 'cancelled';
  const done = e.tasks.filter((t) => t.done).length;

  const setField = (k: keyof EventDetail) => ({
    value: (f[k] as string | number | undefined) ?? '',
    disabled: !editable,
    onChange: (ev: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setF({ ...f, [k]: ev.target.type === 'number' ? Number(ev.target.value) : ev.target.value }),
  });

  return (
    <div className="venue-garden">
      <Link to="/events" className="btn quiet sm" style={{ marginBottom: 10 }}>
        <ArrowLeft size={14} /> Pipeline
      </Link>
      <PageHead
        eyebrow={`${e.code} · ${VENUES[e.venue]} · logged ${fmtDateTime(e.created_at)}`}
        title={e.title}
        actions={
          <>
            <Stamp value={e.status} />
            <button className="btn ghost" onClick={() => window.print()}>
              <Printer size={15} /> Print quote
            </button>
            {editable && (
              <button className="btn quiet" onClick={() => confirm.ask('Cancel this event?', 'The date will be released. Payments remain on record.', () => save.mutate({ status: 'cancelled' }), true)}>
                Cancel event
              </button>
            )}
            {next && (
              <button
                className="btn venue"
                disabled={save.isPending}
                onClick={() => save.mutate({ status: next.to })}
                title={next.to === 'confirmed' && e.paid <= 0 ? 'A deposit is required to confirm' : undefined}
              >
                {next.label}
              </button>
            )}
          </>
        }
      />

      {e.clashes.length > 0 && (
        <div className="form-error row" style={{ marginBottom: 18 }}>
          <AlertTriangle size={16} />
          <span>
            Clash: {VENUES[e.venue]} is also held on {fmtDate(e.date)} by{' '}
            {e.clashes.map((c, i) => (
              <span key={c.id}>
                {i > 0 && ', '}
                <Link to={`/events/${c.id}`}>
                  {c.title} ({c.status})
                </Link>
              </span>
            ))}
            .
          </span>
        </div>
      )}

      <div className="dash-grid">
        <div className="stack loose">
          <Panel
            title="Quote"
            flush
            actions={
              editable && (
                <select
                  className="input"
                  style={{ height: 30, width: 180 }}
                  value=""
                  onChange={(ev) => {
                    const p = PACKAGES.find((x) => x.label === ev.target.value);
                    if (p) addItems.mutate({ items: p.lines.map((l) => ({ ...l, qty: l.qty === 'guests' ? e.guests : l.qty })) });
                  }}
                >
                  <option value="">Apply a package…</option>
                  {PACKAGES.map((p) => (
                    <option key={p.label}>{p.label}</option>
                  ))}
                </select>
              )
            }
          >
            <div className="table-wrap">
              <table className="ledger-table">
                <thead>
                  <tr>
                    <th>Line</th>
                    <th className="num">Qty</th>
                    <th className="num">Unit</th>
                    <th className="num">Amount</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {e.items.map((i) => (
                    <tr key={i.id}>
                      <td>{i.description}</td>
                      <td className="num">{i.qty}</td>
                      <td className="num">{money(i.unit_price)}</td>
                      <td className="num">{money(i.qty * i.unit_price)}</td>
                      <td style={{ width: 40 }}>
                        {editable && (
                          <button className="icon-btn" onClick={() => delItem.mutate({ itemId: i.id })} aria-label="Remove line">
                            <Trash2 size={14} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {editable && (
                    <tr>
                      <td>
                        <input className="input" placeholder="Add a line — e.g. Champagne toast" value={line.description} onChange={(ev) => setLine({ ...line, description: ev.target.value })} />
                      </td>
                      <td style={{ width: 90 }}>
                        <input className="input" type="number" min={1} value={line.qty} onChange={(ev) => setLine({ ...line, qty: Number(ev.target.value) })} />
                      </td>
                      <td style={{ width: 140 }}>
                        <input className="input" type="number" min={0} value={line.unit_price} onChange={(ev) => setLine({ ...line, unit_price: Number(ev.target.value) })} />
                      </td>
                      <td className="num">{money(line.qty * line.unit_price)}</td>
                      <td>
                        <button className="icon-btn" disabled={!line.description} onClick={() => addItem.mutate(line)} aria-label="Add line">
                          <Plus size={16} />
                        </button>
                      </td>
                    </tr>
                  )}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={3}>Quote total</td>
                    <td className="num">{money(e.quote_total)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </Panel>

          <Panel
            title="Payments"
            flush
            actions={
              e.status !== 'cancelled' && (
                <button className="btn sm venue" onClick={() => setPaying(true)}>
                  Record payment
                </button>
              )
            }
          >
            <table className="ledger-table">
              <tbody>
                {e.payments.map((p) => (
                  <tr key={p.id}>
                    <td className="nowrap small">{fmtDateTime(p.created_at)}</td>
                    <td>
                      {p.method}
                      {p.reference && <span className="muted small"> · {p.reference}</span>}
                    </td>
                    <td className="num">{money(p.amount)}</td>
                  </tr>
                ))}
                {e.payments.length === 0 && (
                  <tr>
                    <td className="muted">No payments yet. A deposit is needed to confirm the date.</td>
                  </tr>
                )}
              </tbody>
            </table>
            <div className={`folio-balance ${balance <= 0.009 && e.quote_total > 0 ? 'settled' : ''}`} style={{ background: balance > 0 ? 'var(--garden)' : undefined }}>
              <span className="eyebrow" style={{ color: 'inherit', opacity: 0.85 }}>
                Paid {money(e.paid)} of {money(e.quote_total)}
              </span>
              <b>{balance > 0 ? `${money(balance)} due` : 'Paid in full'}</b>
            </div>
          </Panel>
        </div>

        <div className="stack loose">
          <Panel
            title="Event details"
            actions={
              editable && (
                <button className="btn sm" onClick={() => save.mutate(f)} disabled={save.isPending}>
                  Save
                </button>
              )
            }
          >
            <div className="grid-2">
              <Field label="Title" className="span-2">
                <input {...setField('title')} />
              </Field>
              <Field label="Type">
                <select {...setField('event_type')}>
                  {EVENT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t.replace('_', ' ')}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Venue">
                <select {...setField('venue')}>
                  {Object.entries(VENUES).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Date">
                <input type="date" {...setField('date')} />
              </Field>
              <Field label="Guests">
                <input type="number" {...setField('guests')} />
              </Field>
              <Field label="Starts">
                <input type="time" {...setField('start_time')} />
              </Field>
              <Field label="Ends">
                <input type="time" {...setField('end_time')} />
              </Field>
              <Field label="Client" className="span-2">
                <input {...setField('client_name')} />
              </Field>
              <Field label="Phone">
                <input {...setField('client_phone')} />
              </Field>
              <Field label="Email">
                <input {...setField('client_email')} />
              </Field>
              <Field label="Brief" className="span-2">
                <textarea {...setField('notes')} />
              </Field>
            </div>
          </Panel>

          <Panel title="Run of show" actions={<span className="mono small muted">{done}/{e.tasks.length}</span>}>
            {e.tasks.length > 0 && (
              <div className="progress" style={{ marginBottom: 10 }}>
                <i style={{ width: `${(done / e.tasks.length) * 100}%` }} />
              </div>
            )}
            <ul className="checklist">
              {e.tasks.map((t) => (
                <li key={t.id} className={t.done ? 'done' : ''}>
                  <input type="checkbox" className="check" checked={!!t.done} onChange={(ev) => toggleTask.mutate({ tid: t.id, done: ev.target.checked ? 1 : 0 })} />
                  <span className="grow">{t.title}</span>
                  {t.due_date && <span className="small muted">{fmtDate(t.due_date, 'day')}</span>}
                </li>
              ))}
            </ul>
            <div className="row" style={{ marginTop: 10 }}>
              <input className="input" placeholder="Add a task…" value={task} onChange={(ev) => setTask(ev.target.value)} onKeyDown={(ev) => ev.key === 'Enter' && task && addTask.mutate({ title: task })} />
              <button className="btn ghost" disabled={!task} onClick={() => addTask.mutate({ title: task })}>
                Add
              </button>
            </div>
          </Panel>
        </div>
      </div>

      <EventPayment open={paying} onClose={() => setPaying(false)} id={e.id} balance={balance} />
      {confirm.element}
    </div>
  );
}

function EventPayment({ open, onClose, id, balance }: { open: boolean; onClose: () => void; id: number; balance: number }) {
  const [amount, setAmount] = useState<number | ''>('');
  const [method, setMethod] = useState('transfer');
  const [reference, setReference] = useState('');
  const pay = useAction('post', `/events/${id}/payments`, {
    invalidate: ['/events', '/dashboard', '/reports'],
    success: 'Payment recorded',
    onSuccess: () => {
      onClose();
      setAmount('');
      setReference('');
    },
  });
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Record event payment"
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn" disabled={!amount || pay.isPending} onClick={() => pay.mutate({ amount, method, reference })}>
            Record
          </button>
        </>
      }
    >
      <div className="stack">
        <Field label="Amount" hint={`Balance: ${money(balance)} · typical deposit 50%: ${money(Math.max(0, balance) / 2)}`}>
          <input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value === '' ? '' : Number(e.target.value))} />
        </Field>
        <Field label="Method">
          <select value={method} onChange={(e) => setMethod(e.target.value)}>
            <option value="transfer">Bank transfer</option>
            <option value="momo">Mobile Money (MoMo)</option>
            <option value="card">Card</option>
            <option value="cash">Cash</option>
          </select>
        </Field>
        <Field label="Reference">
          <input value={reference} onChange={(e) => setReference(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
