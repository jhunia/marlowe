import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAction } from '../../lib/hooks';
import { addDays, isoDate } from '../../lib/format';
import type { EventRec } from '../../lib/types';
import { Drawer, Field } from '../../components/ui';

export const VENUES: Record<EventRec['venue'], string> = {
  garden: 'The Garden lawn',
  pavilion: 'Garden pavilion',
  rooftop: 'Skydeck buy-out',
  restaurant_private: 'Ember & Salt private room',
};

export const EVENT_TYPES = ['wedding', 'corporate', 'birthday', 'concert', 'conference', 'naming', 'funeral_reception', 'engagement', 'other'];

export function NewEvent({ open, onClose, date }: { open: boolean; onClose: () => void; date?: string }) {
  const nav = useNavigate();
  const blank = {
    title: '',
    client_name: '',
    client_phone: '',
    client_email: '',
    event_type: 'wedding',
    venue: 'garden' as EventRec['venue'],
    date: date ?? addDays(isoDate(), 30),
    start_time: '14:00',
    end_time: '22:00',
    guests: 150,
    notes: '',
  };
  const [f, setF] = useState(blank);
  const create = useAction<unknown, EventRec>('post', '/events', {
    invalidate: ['/events', '/dashboard', '/nav-counts'],
    success: (e) => `Inquiry ${e.code} logged`,
    onSuccess: (e) => {
      onClose();
      setF(blank);
      nav(`/events/${e.id}`);
    },
  });
  const bind = (k: keyof typeof blank) => ({
    value: f[k] as string | number,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setF({ ...f, [k]: e.target.type === 'number' ? Number(e.target.value) : e.target.value }),
  });

  return (
    <Drawer
      open={open}
      onClose={onClose}
      eyebrow="The Garden · Events"
      title="New event inquiry"
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn venue" disabled={!f.title || !f.client_name || create.isPending} onClick={() => create.mutate(f)}>
            Log inquiry
          </button>
        </>
      }
    >
      <div className="grid-2 venue-garden">
        <Field label="Event title" className="span-2">
          <input {...bind('title')} placeholder="e.g. Mensah–Owusu wedding reception" />
        </Field>
        <Field label="Type">
          <select {...bind('event_type')}>
            {EVENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t.replace('_', ' ')}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Venue">
          <select {...bind('venue')}>
            {Object.entries(VENUES).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Date">
          <input type="date" {...bind('date')} />
        </Field>
        <Field label="Guests">
          <input type="number" min={1} {...bind('guests')} />
        </Field>
        <Field label="Starts">
          <input type="time" {...bind('start_time')} />
        </Field>
        <Field label="Ends">
          <input type="time" {...bind('end_time')} />
        </Field>
        <div className="span-2 eyebrow" style={{ marginTop: 8 }}>
          Client
        </div>
        <Field label="Client name" className="span-2">
          <input {...bind('client_name')} />
        </Field>
        <Field label="Phone">
          <input {...bind('client_phone')} />
        </Field>
        <Field label="Email">
          <input type="email" {...bind('client_email')} />
        </Field>
        <Field label="Brief" className="span-2">
          <textarea {...bind('notes')} placeholder="Theme, catering style, special requests…" />
        </Field>
      </div>
    </Drawer>
  );
}
