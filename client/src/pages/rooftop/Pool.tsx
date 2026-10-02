import { useState } from 'react';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { useAction, useApi } from '../../lib/hooks';
import { addDays, fmtDate, isoDate, money } from '../../lib/format';
import { qs } from '../../lib/api';
import type { Reservation, Resource, ResourceBooking } from '../../lib/types';
import { Drawer, Field, Ledger, LedgerCell, Loading, PageHead, Stamp } from '../../components/ui';

const INV = ['/resource-bookings', '/dashboard', '/reservations', '/reports'];
const KIND_LABEL: Record<string, string> = { cabana: 'Cabana', daybed: 'Daybed', vip_table: 'VIP table' };

export function Pool() {
  const [date, setDate] = useState(isoDate());
  const res = useApi<Resource[]>('/resources?venue=rooftop');
  const { data: bookings, isLoading } = useApi<ResourceBooking[]>(`/resource-bookings${qs({ date })}`);
  const [draft, setDraft] = useState<{ resource?: Resource; booking?: ResourceBooking } | null>(null);

  if (isLoading || res.isLoading) return <Loading />;
  const live = (bookings ?? []).filter((b) => b.status !== 'cancelled');
  const kinds = [...new Set((res.data ?? []).map((r) => r.kind))];
  const revenue = live.reduce((s, b) => s + b.price, 0);
  const used = new Set(live.map((b) => b.resource_id)).size;

  return (
    <div className="venue-roof">
      <PageHead
        eyebrow="Skydeck · Pool deck"
        title="Pool &"
        accent="cabanas"
        actions={
          <button className="btn venue" onClick={() => setDraft({})}>
            <Plus size={15} /> New booking
          </button>
        }
      />
      <div className="toolbar">
        <div className="segmented">
          <button onClick={() => setDate(addDays(date, -1))} aria-label="Previous day">
            <ChevronLeft size={15} />
          </button>
          <button onClick={() => setDate(isoDate())}>Today</button>
          <button onClick={() => setDate(addDays(date, 1))} aria-label="Next day">
            <ChevronRight size={15} />
          </button>
        </div>
        <input type="date" className="input" style={{ width: 160 }} value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
        <span className="italic" style={{ fontSize: 18 }}>
          {fmtDate(date, 'long')}
        </span>
      </div>

      <Ledger cols={4}>
        <LedgerCell label="Spaces booked" value={`${used}/${res.data?.length ?? 0}`} bar={(used / Math.max(1, res.data?.length ?? 1)) * 100} />
        <LedgerCell label="Guests on deck" value={live.reduce((s, b) => s + b.pax, 0)} />
        <LedgerCell label="Bookings value" value={money(revenue, { compact: true })} />
        <LedgerCell label="Unsettled" value={live.filter((b) => b.settlement === 'unpaid').length} sub="to collect before close" />
      </Ledger>

      {kinds.map((k) => (
        <section className="floor" key={k}>
          <div className="floor-title">
            <h3>{KIND_LABEL[k] ?? k}s</h3>
          </div>
          <div className="resgrid">
            {(res.data ?? [])
              .filter((r) => r.kind === k)
              .map((r) => {
                const bs = live.filter((b) => b.resource_id === r.id).sort((a, b) => a.start_time.localeCompare(b.start_time));
                return (
                  <div key={r.id} className={`rescard ${bs.length ? '' : 'free'}`}>
                    <div className="rescard-head">
                      <b>{r.label}</b>
                      <span>
                        {r.capacity} pax · {money(r.price, { compact: true })}
                      </span>
                    </div>
                    <div className="rescard-body">
                      {bs.map((b) => (
                        <div key={b.id} className="rescard-slot" onClick={() => setDraft({ resource: r, booking: b })}>
                          <span>
                            <b>{b.guest_name}</b>
                            <div className="small muted mono">
                              {b.start_time}–{b.end_time} · {b.pax} pax{b.room_number ? ` · rm ${b.room_number}` : ''}
                            </div>
                          </span>
                          <span className="stack tight" style={{ alignItems: 'flex-end' }}>
                            <Stamp value={b.status} />
                            <Stamp value={b.settlement} />
                          </span>
                        </div>
                      ))}
                      <button className="btn quiet sm" style={{ marginTop: 6 }} onClick={() => setDraft({ resource: r })}>
                        <Plus size={12} /> Book {r.label}
                      </button>
                    </div>
                  </div>
                );
              })}
          </div>
        </section>
      ))}

      <BookingDrawer key={draft ? `${draft.resource?.id}-${draft.booking?.id}` : 'x'} draft={draft} date={date} resources={res.data ?? []} onClose={() => setDraft(null)} />
    </div>
  );
}

function BookingDrawer({
  draft,
  date,
  resources,
  onClose,
}: {
  draft: { resource?: Resource; booking?: ResourceBooking } | null;
  date: string;
  resources: Resource[];
  onClose: () => void;
}) {
  const b = draft?.booking;
  const r0 = draft?.resource ?? resources[0];
  const [f, setF] = useState({
    resource_id: b?.resource_id ?? r0?.id ?? 0,
    guest_name: b?.guest_name ?? '',
    reservation_id: b?.reservation_id ?? ('' as number | ''),
    date: b?.date ?? date,
    start_time: b?.start_time ?? '10:00',
    end_time: b?.end_time ?? '18:00',
    pax: b?.pax ?? 2,
    price: b?.price ?? r0?.price ?? 0,
    settlement: b?.settlement ?? 'unpaid',
    notes: b?.notes ?? '',
  });
  const inHouse = useApi<Reservation[]>(draft ? '/in-house' : null);
  const create = useAction('post', '/resource-bookings', { invalidate: INV, success: 'Booked', onSuccess: onClose });
  const update = useAction('patch', `/resource-bookings/${b?.id}`, { invalidate: INV, success: 'Booking updated', onSuccess: onClose });

  if (!draft) return null;
  const locked = !!b && (b.status === 'cancelled' || b.status === 'completed');
  const res = resources.find((r) => r.id === f.resource_id);

  return (
    <Drawer
      open
      onClose={onClose}
      eyebrow="Skydeck · Pool deck"
      title={b ? `${b.resource_label} · ${b.guest_name}` : 'New deck booking'}
      footer={
        b ? (
          <>
            {b.status === 'booked' && (
              <button className="btn ghost" onClick={() => update.mutate({ status: 'cancelled' })}>
                Cancel booking
              </button>
            )}
            <span className="grow" />
            {b.status === 'booked' && (
              <button className="btn ghost" onClick={() => update.mutate({ status: 'arrived' })}>
                Mark arrived
              </button>
            )}
            {b.status === 'arrived' && (
              <button className="btn ghost" onClick={() => update.mutate({ status: 'completed' })}>
                Complete
              </button>
            )}
            {!locked && (
              <button className="btn venue" onClick={() => update.mutate({ ...f, reservation_id: f.reservation_id || null })}>
                Save
              </button>
            )}
          </>
        ) : (
          <>
            <button className="btn ghost" onClick={onClose}>
              Cancel
            </button>
            <button
              className="btn venue"
              disabled={!f.guest_name || create.isPending || (f.settlement === 'room' && !f.reservation_id)}
              onClick={() => create.mutate({ ...f, reservation_id: f.reservation_id || null })}
            >
              Confirm booking
            </button>
          </>
        )
      }
    >
      <div className="grid-2 venue-roof">
        <Field label="Space" className="span-2">
          <select
            value={f.resource_id}
            disabled={locked}
            onChange={(e) => {
              const r = resources.find((x) => x.id === Number(e.target.value));
              setF({ ...f, resource_id: Number(e.target.value), price: r?.price ?? f.price });
            }}
          >
            {resources.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label} · {KIND_LABEL[r.kind]} · {r.capacity} pax
              </option>
            ))}
          </select>
        </Field>
        <Field label="In-house guest" hint="Optional — link a room to charge the folio." className="span-2">
          <select
            value={f.reservation_id}
            disabled={locked}
            onChange={(e) => {
              const id = e.target.value ? Number(e.target.value) : '';
              const r = inHouse.data?.find((x) => x.id === id);
              setF({ ...f, reservation_id: id, guest_name: r ? r.guest_name : f.guest_name, settlement: id ? 'room' : f.settlement === 'room' ? 'unpaid' : f.settlement });
            }}
          >
            <option value="">Walk-in / outside guest</option>
            {inHouse.data?.map((r) => (
              <option key={r.id} value={r.id}>
                Room {r.room_number} — {r.guest_name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Guest name" className="span-2">
          <input value={f.guest_name} disabled={locked} onChange={(e) => setF({ ...f, guest_name: e.target.value })} />
        </Field>
        <Field label="Date">
          <input type="date" value={f.date} disabled={locked} onChange={(e) => setF({ ...f, date: e.target.value })} />
        </Field>
        <Field label="Guests" hint={res ? `max ${res.capacity}` : undefined}>
          <input type="number" min={1} max={res?.capacity} value={f.pax} disabled={locked} onChange={(e) => setF({ ...f, pax: Number(e.target.value) })} />
        </Field>
        <Field label="From">
          <input type="time" value={f.start_time} disabled={locked} onChange={(e) => setF({ ...f, start_time: e.target.value })} />
        </Field>
        <Field label="Until">
          <input type="time" value={f.end_time} disabled={locked} onChange={(e) => setF({ ...f, end_time: e.target.value })} />
        </Field>
        <Field label="Price">
          <input type="number" min={0} value={f.price} disabled={locked || (b?.settlement === 'room')} onChange={(e) => setF({ ...f, price: Number(e.target.value) })} />
        </Field>
        <Field label="Settlement" hint={b?.settlement === 'room' ? 'Already posted to the folio.' : undefined}>
          <select value={f.settlement} disabled={locked || b?.settlement === 'room' || b?.settlement === 'paid'} onChange={(e) => setF({ ...f, settlement: e.target.value as ResourceBooking['settlement'] })}>
            <option value="unpaid">Unpaid — collect on deck</option>
            <option value="paid">Paid</option>
            <option value="room" disabled={!f.reservation_id}>
              Charge to room
            </option>
          </select>
        </Field>
        <Field label="Notes" className="span-2">
          <textarea value={f.notes} disabled={locked} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="Champagne on ice, birthday decor…" />
        </Field>
      </div>
    </Drawer>
  );
}
