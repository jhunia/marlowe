import { useEffect, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';

/* ------------------------------------------------------------ page head */

export function PageHead({
  eyebrow,
  title,
  accent,
  actions,
}: {
  eyebrow: string;
  title: string;
  accent?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="page-head">
      <div>
        <div className="eyebrow">
          <span className="dot" />
          {eyebrow}
        </div>
        <h1>
          {title} {accent && <em>{accent}</em>}
        </h1>
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}

/* ----------------------------------------------------------------- stamps */

const TONES: Record<string, string> = {
  // reservations
  booked: 'info',
  checked_in: 'hotel',
  checked_out: 'neutral',
  cancelled: 'bad',
  no_show: 'bad',
  // rooms
  vacant_clean: 'ok',
  inspected: 'ok',
  vacant_dirty: 'warn',
  occupied: 'hotel',
  out_of_order: 'bad',
  // tasks
  open: 'warn',
  in_progress: 'info',
  done: 'ok',
  high: 'bad',
  normal: 'neutral',
  low: 'neutral',
  // orders
  paid: 'ok',
  charged: 'hotel',
  void: 'bad',
  pending: 'neutral',
  fired: 'warn',
  ready: 'ok',
  served: 'neutral',
  unpaid: 'warn',
  room: 'hotel',
  // bookings
  seated: 'dining',
  completed: 'neutral',
  arrived: 'roof',
  // club
  scheduled: 'info',
  live: 'roof',
  closed: 'neutral',
  // events
  inquiry: 'neutral',
  tentative: 'warn',
  confirmed: 'garden',
  // staff
  active: 'ok',
  leave: 'warn',
  inactive: 'neutral',
  vip: 'brass',
};

export function Stamp({ value, tone, children }: { value?: string; tone?: string; children?: ReactNode }) {
  const t = tone ?? (value ? TONES[value] : undefined) ?? 'neutral';
  return <span className={`stamp ${t}`}>{children ?? (value ? value.replace(/_/g, ' ') : '')}</span>;
}

/* -------------------------------------------------------------- ledger */

export function Ledger({ children, cols }: { children: ReactNode; cols?: number }) {
  return (
    <div className="ledger" style={{ ['--cols' as string]: cols ?? 4 }}>
      {children}
    </div>
  );
}

export function LedgerCell({
  label,
  value,
  sub,
  suffix,
  bar,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  suffix?: string;
  bar?: number;
}) {
  return (
    <div className="cell">
      <div className="eyebrow">{label}</div>
      <div className="value">
        {value}
        {suffix && <small>{suffix}</small>}
      </div>
      {sub && <div className="sub">{sub}</div>}
      {bar !== undefined && (
        <div className="bar">
          <i style={{ width: `${Math.min(100, Math.max(0, bar))}%` }} />
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------- panels */

export function Panel({
  title,
  actions,
  children,
  flush,
  className,
}: {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  flush?: boolean;
  className?: string;
}) {
  return (
    <section className={`panel ${className ?? ''}`}>
      {(title || actions) && (
        <div className="panel-head">
          {typeof title === 'string' ? <h3>{title}</h3> : title}
          {actions && <div className="row">{actions}</div>}
        </div>
      )}
      <div className={`panel-body ${flush ? 'flush' : ''}`}>{children}</div>
    </section>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <h4>{title}</h4>
      {children && <div>{children}</div>}
    </div>
  );
}

export function Loading({ label = 'Fetching the ledger…' }: { label?: string }) {
  return <div className="loading">{label}</div>;
}

/* ------------------------------------------------------------- drawer */

export function Drawer({
  open,
  onClose,
  title,
  eyebrow,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  eyebrow?: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className={`drawer ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true">
        <div className="drawer-head">
          <div>
            {eyebrow && <div className="eyebrow" style={{ marginBottom: 6 }}>{eyebrow}</div>}
            <h2>{title}</h2>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="drawer-body">{children}</div>
        {footer && <div className="drawer-foot">{footer}</div>}
      </aside>
    </>
  );
}

/* -------------------------------------------------------------- modal */

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  if (!open) return null;
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="modal" role="dialog" aria-modal="true">
        <div className="modal-body">
          <h3>{title}</h3>
          {children}
        </div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </>
  );
}

export function useConfirm() {
  const [state, setState] = useState<{ title: string; body: string; action: () => void; danger?: boolean } | null>(null);
  const ask = (title: string, body: string, action: () => void, danger = false) => setState({ title, body, action, danger });
  const element = (
    <Modal
      open={!!state}
      onClose={() => setState(null)}
      title={state?.title ?? ''}
      footer={
        <>
          <button className="btn ghost" onClick={() => setState(null)}>
            Back
          </button>
          <button
            className={`btn ${state?.danger ? 'danger' : ''}`}
            onClick={() => {
              state?.action();
              setState(null);
            }}
          >
            Confirm
          </button>
        </>
      }
    >
      <p className="muted" style={{ margin: 0 }}>
        {state?.body}
      </p>
    </Modal>
  );
  return { ask, element };
}

/* -------------------------------------------------------------- fields */

export function Field({ label, children, hint, className }: { label: string; children: ReactNode; hint?: string; className?: string }) {
  return (
    <div className={`field ${className ?? ''}`}>
      <label>{label}</label>
      {children}
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
}

export function Tabs<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode }[];
}) {
  return (
    <div className="tabs" role="tablist">
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={value === o.value} className={value === o.value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode }[];
}) {
  return (
    <div className="segmented">
      {options.map((o) => (
        <button key={o.value} className={value === o.value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Chips<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; count?: number }[];
}) {
  return (
    <div className="row wrap" style={{ gap: 6 }}>
      {options.map((o) => (
        <button key={o.value} className={`chip ${value === o.value ? 'on' : ''}`} onClick={() => onChange(o.value)}>
          {o.label}
          {o.count !== undefined && <span className="n">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}
