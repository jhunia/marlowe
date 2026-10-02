import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAction, useApi } from '../../lib/hooks';
import { addDays, isoDate, money, nightsBetween } from '../../lib/format';
import { qs } from '../../lib/api';
import type { Guest, Reservation } from '../../lib/types';
import { Drawer, Field, Segmented } from '../../components/ui';

interface Availability {
  types: {
    id: number;
    name: string;
    code: string;
    base_rate: number;
    capacity: number;
    available: number;
    rooms: { id: number; number: string; floor: number; status: string }[];
  }[];
}

export function NewReservation({
  open,
  onClose,
  preset,
}: {
  open: boolean;
  onClose: () => void;
  preset?: { check_in?: string; room_id?: number; room_type_id?: number; guest_id?: number };
}) {
  const nav = useNavigate();
  const today = isoDate();
  const [mode, setMode] = useState<'existing' | 'new'>('new');
  const [guestQuery, setGuestQuery] = useState('');
  const [guestId, setGuestId] = useState<number | null>(null);
  const [guest, setGuest] = useState({ first_name: '', last_name: '', phone: '', email: '', nationality: '' });
  const [checkIn, setCheckIn] = useState(today);
  const [checkOut, setCheckOut] = useState(addDays(today, 1));
  const [typeId, setTypeId] = useState<number | ''>('');
  const [roomId, setRoomId] = useState<number | ''>('');
  const [rate, setRate] = useState<number | ''>('');
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);
  const [source, setSource] = useState('direct');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    const ci = preset?.check_in ?? today;
    setCheckIn(ci);
    setCheckOut(addDays(ci, 1));
    setTypeId(preset?.room_type_id ?? '');
    setRoomId(preset?.room_id ?? '');
    setRate('');
    setError('');
    setNotes('');
    if (preset?.guest_id) {
      setMode('existing');
      setGuestId(preset.guest_id);
    } else {
      setGuestId(null);
      setMode('new');
      setGuest({ first_name: '', last_name: '', phone: '', email: '', nationality: '' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const nights = nightsBetween(checkIn, checkOut);
  const avail = useApi<Availability>(open && nights > 0 ? `/availability${qs({ from: checkIn, to: checkOut })}` : null);
  const guests = useApi<Guest[]>(open && mode === 'existing' ? `/guests${qs({ q: guestQuery, limit: 8 })}` : null);

  const selectedType = avail.data?.types.find((t) => t.id === typeId);

  // when a preset room is given, derive its type once availability loads
  useEffect(() => {
    if (!avail.data || !roomId || typeId) return;
    const t = avail.data.types.find((t) => t.rooms.some((r) => r.id === roomId));
    if (t) setTypeId(t.id);
  }, [avail.data, roomId, typeId]);

  const effectiveRate = rate === '' ? selectedType?.base_rate ?? 0 : rate;
  const total = useMemo(() => Math.max(0, nights) * Number(effectiveRate || 0), [nights, effectiveRate]);

  const create = useAction<unknown, Reservation>('post', '/reservations', {
    invalidate: ['/reservations', '/tape-chart', '/dashboard', '/rooms', '/nav-counts', '/guests', '/availability'],
    success: (r) => `Reservation ${r.code} created`,
    onSuccess: (r) => {
      onClose();
      nav(`/reservations/${r.id}`);
    },
  });

  const submit = () => {
    setError('');
    if (nights <= 0) return setError('Check-out must be after check-in.');
    if (!typeId) return setError('Choose a room type.');
    if (mode === 'existing' && !guestId) return setError('Pick a guest from the list.');
    if (mode === 'new' && (!guest.first_name.trim() || !guest.last_name.trim())) return setError('Guest first and last name are required.');
    create.mutate({
      guest_id: mode === 'existing' ? guestId : undefined,
      guest: mode === 'new' ? guest : undefined,
      room_type_id: typeId,
      room_id: roomId || null,
      check_in: checkIn,
      check_out: checkOut,
      adults,
      children,
      rate: effectiveRate,
      source,
      notes,
    });
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      eyebrow="Front office"
      title="New reservation"
      footer={
        <>
          <span className="grow small muted">
            {nights > 0 ? `${nights} night${nights > 1 ? 's' : ''} · ` : ''}
            <b className="mono" style={{ color: 'var(--ink)' }}>
              {money(total)}
            </b>
          </span>
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn venue" onClick={submit} disabled={create.isPending}>
            Confirm booking
          </button>
        </>
      }
    >
      <div className="stack venue-hotel">
        {error && <div className="form-error">{error}</div>}

        <div className="row between">
          <span className="eyebrow">Guest</span>
          <Segmented
            value={mode}
            onChange={setMode}
            options={[
              { value: 'new', label: 'New guest' },
              { value: 'existing', label: 'Returning' },
            ]}
          />
        </div>

        {mode === 'new' ? (
          <div className="grid-2">
            <Field label="First name">
              <input value={guest.first_name} onChange={(e) => setGuest({ ...guest, first_name: e.target.value })} />
            </Field>
            <Field label="Last name">
              <input value={guest.last_name} onChange={(e) => setGuest({ ...guest, last_name: e.target.value })} />
            </Field>
            <Field label="Phone">
              <input value={guest.phone} onChange={(e) => setGuest({ ...guest, phone: e.target.value })} />
            </Field>
            <Field label="Email">
              <input type="email" value={guest.email} onChange={(e) => setGuest({ ...guest, email: e.target.value })} />
            </Field>
            <Field label="Nationality" className="span-2">
              <input value={guest.nationality} onChange={(e) => setGuest({ ...guest, nationality: e.target.value })} />
            </Field>
          </div>
        ) : (
          <div className="stack tight">
            <input className="input" placeholder="Search by name, phone or email…" value={guestQuery} onChange={(e) => setGuestQuery(e.target.value)} />
            <div className="panel" style={{ maxHeight: 190, overflowY: 'auto' }}>
              {(guests.data ?? []).map((g) => (
                <label key={g.id} className="row" style={{ padding: '8px 12px', borderBottom: '1px solid var(--rule)', cursor: 'pointer' }}>
                  <input type="radio" name="guest" checked={guestId === g.id} onChange={() => setGuestId(g.id)} />
                  <span className="grow">
                    <b>
                      {g.first_name} {g.last_name}
                    </b>{' '}
                    {g.vip ? <span className="stamp brass">vip</span> : null}
                    <div className="small muted">{[g.phone, g.email].filter(Boolean).join(' · ')}</div>
                  </span>
                  <span className="small muted">{g.stays ?? 0} stays</span>
                </label>
              ))}
              {guests.data?.length === 0 && <div className="empty small">No guests match.</div>}
            </div>
          </div>
        )}

        <hr style={{ border: 0, borderTop: '1px dashed var(--rule-strong)', width: '100%', margin: '6px 0' }} />
        <span className="eyebrow">Stay</span>
        <div className="grid-2">
          <Field label="Check-in">
            <input type="date" value={checkIn} onChange={(e) => {
              setCheckIn(e.target.value);
              if (e.target.value >= checkOut) setCheckOut(addDays(e.target.value, 1));
            }} />
          </Field>
          <Field label="Check-out">
            <input type="date" value={checkOut} min={addDays(checkIn, 1)} onChange={(e) => setCheckOut(e.target.value)} />
          </Field>
          <Field label="Adults">
            <input type="number" min={1} value={adults} onChange={(e) => setAdults(Number(e.target.value))} />
          </Field>
          <Field label="Children">
            <input type="number" min={0} value={children} onChange={(e) => setChildren(Number(e.target.value))} />
          </Field>
        </div>

        <span className="eyebrow">Room type {avail.isFetching && <span className="faint">· checking availability…</span>}</span>
        <div className="stack tight">
          {(avail.data?.types ?? []).map((t) => (
            <label
              key={t.id}
              className="row"
              style={{
                padding: '10px 12px',
                border: `1px solid ${typeId === t.id ? 'var(--hotel)' : 'var(--rule-strong)'}`,
                background: typeId === t.id ? 'var(--hotel-tint)' : 'var(--sheet)',
                cursor: t.available ? 'pointer' : 'not-allowed',
                opacity: t.available ? 1 : 0.5,
                borderRadius: 3,
              }}
            >
              <input
                type="radio"
                name="rtype"
                disabled={!t.available}
                checked={typeId === t.id}
                onChange={() => {
                  setTypeId(t.id);
                  setRoomId('');
                  setRate('');
                }}
              />
              <span className="grow">
                <b>{t.name}</b>
                <div className="small muted">sleeps {t.capacity}</div>
              </span>
              <span className="right">
                <span className="mono">{money(t.base_rate)}</span>
                <div className={`small ${t.available ? 'muted' : ''}`} style={{ color: t.available ? undefined : 'var(--bad)' }}>
                  {t.available ? `${t.available} free` : 'sold out'}
                </div>
              </span>
            </label>
          ))}
        </div>

        {selectedType && (
          <div className="grid-2">
            <Field label="Assign room" hint="Optional — can be assigned at check-in.">
              <select value={roomId} onChange={(e) => setRoomId(e.target.value ? Number(e.target.value) : '')}>
                <option value="">Unassigned</option>
                {selectedType.rooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.number} · floor {r.floor} · {r.status.replace('_', ' ')}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Nightly rate">
              <input type="number" min={0} value={rate === '' ? selectedType.base_rate : rate} onChange={(e) => setRate(e.target.value === '' ? '' : Number(e.target.value))} />
            </Field>
          </div>
        )}

        <div className="grid-2">
          <Field label="Source">
            <select value={source} onChange={(e) => setSource(e.target.value)}>
              <option value="direct">Direct / phone</option>
              <option value="walk_in">Walk-in</option>
              <option value="website">Website</option>
              <option value="ota">Online travel agent</option>
              <option value="corporate">Corporate</option>
              <option value="event_block">Event block</option>
            </select>
          </Field>
          <div />
          <Field label="Notes" className="span-2">
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Late arrival, allergies, anniversary…" />
          </Field>
        </div>
      </div>
    </Drawer>
  );
}
