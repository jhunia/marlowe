import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { MessageSquareHeart } from 'lucide-react';
import { api } from '../lib/api';
import { useApi } from '../lib/hooks';
import { Field, Modal } from './ui';
import { useToast } from './Toast';

export interface Meta {
  demo: boolean;
  reset_hours: number | null;
}

/** Whether the server is running as the public test version. */
export function useMeta() {
  return useApi<Meta>('/public/meta').data;
}

const RATINGS = [
  [1, 'Poor'],
  [2, 'Meh'],
  [3, 'Okay'],
  [4, 'Good'],
  [5, 'Love it'],
] as const;

/** Floating "Feedback" button + form. Shown only on the test version. */
export function FeedbackButton({ area, role }: { area: 'site' | 'console'; role?: string }) {
  const meta = useMeta();
  const loc = useLocation();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState<number | null>(null);
  const [message, setMessage] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  if (!meta?.demo) return null;

  const send = async () => {
    setBusy(true);
    setErr('');
    try {
      await api.post('/public/feedback', { rating, message, name, area, role, page: loc.pathname });
      toast('Thank you — your feedback was sent');
      setOpen(false);
      setMessage('');
      setRating(null);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button className="feedback-fab" onClick={() => setOpen(true)} aria-label="Send feedback">
        <MessageSquareHeart size={17} /> <span className="fab-label">Feedback</span>
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="What do you think?"
        footer={
          <>
            <button className="btn ghost" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button className="btn" disabled={busy || message.trim().length < 3} onClick={send}>
              {busy ? 'Sending…' : 'Send feedback'}
            </button>
          </>
        }
      >
        <div className="stack">
          <p className="muted small" style={{ margin: 0 }}>
            This is a test version of The Marlowe’s system. Tell us what works, what’s confusing, or what’s missing — about this page or anything else.
          </p>
          {err && <div className="form-error">{err}</div>}
          <div className="rating-row">
            {RATINGS.map(([n, label]) => (
              <button key={n} className={rating === n ? 'on' : ''} onClick={() => setRating(n)} type="button">
                <b>{n}</b>
                <span>{label}</span>
              </button>
            ))}
          </div>
          <Field label="Your feedback">
            <textarea rows={5} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="e.g. Booking a room was easy, but I couldn’t find where to…" autoFocus />
          </Field>
          <Field label="Your name (optional)">
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <span className="small muted">Sent from: {loc.pathname}</span>
        </div>
      </Modal>
    </>
  );
}
