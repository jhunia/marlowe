let currency = 'GH₵';

export function setCurrency(symbol: string) {
  currency = symbol || 'GH₵';
}

export function money(n: number | null | undefined, opts: { compact?: boolean; sign?: boolean } = {}) {
  const v = Number(n ?? 0);
  if (opts.compact && Math.abs(v) >= 1000) {
    const units: [number, string][] = [
      [1e9, 'B'],
      [1e6, 'M'],
      [1e3, 'k'],
    ];
    for (const [div, u] of units) {
      if (Math.abs(v) >= div) {
        const scaled = v / div;
        return `${currency}${scaled.toFixed(Math.abs(scaled) >= 100 ? 0 : 1)}${u}`;
      }
    }
  }
  const s = Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const sign = v < 0 ? '−' : opts.sign && v > 0 ? '+' : '';
  return `${sign}${currency}${s}`;
}

/** Guest-facing prices: whole cedis drop the ".00" (GH₵1,450), anything else keeps pesewas. */
export function price(n: number | null | undefined, opts: { compact?: boolean } = {}) {
  const v = Math.round(Number(n ?? 0) * 100) / 100;
  if (opts.compact || !Number.isInteger(v)) return money(v, opts);
  return `${v < 0 ? '−' : ''}${currency}${Math.abs(v).toLocaleString('en-US')}`;
}

/** Local-date ISO string (YYYY-MM-DD) — never UTC-shifted. */
export function isoDate(d: Date = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseDate(s: string) {
  const [y, m, d] = s.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(s: string, n: number) {
  const d = parseDate(s);
  d.setDate(d.getDate() + n);
  return isoDate(d);
}

export function nightsBetween(a: string, b: string) {
  return Math.round((parseDate(b).getTime() - parseDate(a).getTime()) / 86400000);
}

export function fmtDate(s: string | null | undefined, style: 'short' | 'long' | 'day' = 'short') {
  if (!s) return '—';
  const d = parseDate(s);
  if (style === 'long') return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  if (style === 'day') return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Server timestamps are UTC "YYYY-MM-DD HH:MM:SS". */
function parseStamp(s: string) {
  return new Date(s.includes('T') ? s : s.replace(' ', 'T') + 'Z');
}

export function fmtDateTime(s: string | null | undefined) {
  if (!s) return '—';
  return parseStamp(s).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function fmtTime(s: string | null | undefined) {
  if (!s) return '—';
  return parseStamp(s).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

export function timeAgo(s: string) {
  const mins = minutesSince(s);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export function minutesSince(s: string) {
  return Math.max(0, Math.floor((Date.now() - parseStamp(s).getTime()) / 60000));
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
}

export function label(s: string | null | undefined) {
  if (!s) return '—';
  return s.replace(/_/g, ' ');
}

export function pct(n: number) {
  return `${Math.round(n * 10) / 10}%`;
}
