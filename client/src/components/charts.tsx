import { useState } from 'react';
import { money, parseDate } from '../lib/format';

export const VENUE_COLORS = {
  hotel: '#0f9d8a',
  restaurant: '#f2662e',
  rooftop: '#0ea5e9',
  events: '#4caf2a',
} as const;

export const VENUE_NAMES = {
  hotel: 'Rooms',
  restaurant: 'Ember & Salt',
  rooftop: 'Skydeck',
  events: 'The Garden',
} as const;

type Series = keyof typeof VENUE_COLORS;

/** Stacked daily revenue bars, one colour per venue. */
export function StackedBars({
  data,
  height = 220,
}: {
  data: ({ date: string } & Record<Series, number>)[];
  height?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const keys: Series[] = ['hotel', 'restaurant', 'rooftop', 'events'];
  const W = 720;
  const H = height;
  const pad = { l: 56, r: 8, t: 12, b: 26 };
  const totals = data.map((d) => keys.reduce((s, k) => s + (d[k] || 0), 0));
  const max = niceMax(Math.max(1, ...totals));
  const bw = (W - pad.l - pad.r) / Math.max(1, data.length);
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - v / max);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
  const labelEvery = Math.ceil(data.length / 10);

  return (
    <div style={{ position: 'relative' }}>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ height }}>
        <g className="grid">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} />
              <text x={pad.l - 8} y={y(t) + 3} textAnchor="end">
                {money(t, { compact: true })}
              </text>
            </g>
          ))}
        </g>
        {data.map((d, i) => {
          let acc = 0;
          const x = pad.l + i * bw + bw * 0.18;
          const w = bw * 0.64;
          return (
            <g key={d.date} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={pad.l + i * bw} y={pad.t} width={bw} height={H - pad.t - pad.b} fill={hover === i ? 'rgba(255,90,54,0.07)' : 'transparent'} />
              {keys.map((k) => {
                const v = d[k] || 0;
                const y1 = y(acc + v);
                const h = y(acc) - y1;
                acc += v;
                return v > 0 ? <rect key={k} x={x} y={y1} width={w} height={Math.max(0, h - 0.5)} fill={VENUE_COLORS[k]} /> : null;
              })}
              {i % labelEvery === 0 && (
                <text x={x + w / 2} y={H - 8} textAnchor="middle">
                  {parseDate(d.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                </text>
              )}
            </g>
          );
        })}
        <line x1={pad.l} x2={W - pad.r} y1={y(0)} y2={y(0)} stroke="#e5e7eb" strokeWidth={1} />
      </svg>
      {hover !== null && data[hover] && (
        <div
          style={{
            position: 'absolute',
            top: 4,
            left: `${Math.min(70, ((pad.l + hover * bw) / W) * 100)}%`,
            background: 'var(--ink)',
            color: '#fff',
            padding: '8px 10px',
            fontSize: 12,
            pointerEvents: 'none',
            minWidth: 170,
            borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,.2)',
          }}
        >
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>
            {parseDate(data[hover].date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
          </div>
          {keys.map((k) => (
            <div key={k} className="row between">
              <span>
                <i style={{ display: 'inline-block', width: 8, height: 8, background: VENUE_COLORS[k], marginRight: 6 }} />
                {VENUE_NAMES[k]}
              </span>
              <span className="mono">{money(data[hover][k], { compact: true })}</span>
            </div>
          ))}
          <div className="row between" style={{ borderTop: '1px solid rgba(255,255,255,.2)', marginTop: 4, paddingTop: 4 }}>
            <b>Total</b>
            <b className="mono">{money(totals[hover], { compact: true })}</b>
          </div>
        </div>
      )}
    </div>
  );
}

export function Legend() {
  return (
    <div className="legend">
      {(Object.keys(VENUE_COLORS) as Series[]).map((k) => (
        <span key={k}>
          <i style={{ background: VENUE_COLORS[k] }} />
          {VENUE_NAMES[k]}
        </span>
      ))}
    </div>
  );
}

/** Occupancy area line. Values 0..100. */
export function AreaLine({ data, height = 180, color = '#0f9d8a' }: { data: { date: string; value: number }[]; height?: number; color?: string }) {
  const W = 720;
  const H = height;
  const pad = { l: 40, r: 10, t: 12, b: 24 };
  if (data.length === 0) return null;
  const x = (i: number) => pad.l + (i * (W - pad.l - pad.r)) / Math.max(1, data.length - 1);
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - v / 100);
  const line = data.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(d.value).toFixed(1)}`).join(' ');
  const area = `${line} L${x(data.length - 1)},${y(0)} L${x(0)},${y(0)} Z`;
  const labelEvery = Math.ceil(data.length / 8);
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ height }}>
      <g className="grid">
        {[0, 25, 50, 75, 100].map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} />
            <text x={pad.l - 6} y={y(t) + 3} textAnchor="end">
              {t}%
            </text>
          </g>
        ))}
      </g>
      <path d={area} fill={color} opacity={0.16} />
      <path d={line} fill="none" stroke={color} strokeWidth={2.5} vectorEffect="non-scaling-stroke" />
      {data.map((d, i) =>
        i % labelEvery === 0 ? (
          <text key={d.date} x={x(i)} y={H - 6} textAnchor="middle">
            {parseDate(d.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
          </text>
        ) : null,
      )}
    </svg>
  );
}

/** Semi-circular capacity gauge. */
export function Gauge({ value, max, color = '#7c3aed' }: { value: number; max: number; color?: string }) {
  const f = Math.min(1, max ? value / max : 0);
  const r = 90;
  const cx = 110;
  const cy = 105;
  const angle = Math.PI * (1 - f);
  const ex = cx + r * Math.cos(angle);
  const ey = cy - r * Math.sin(angle);
  const tone = f > 0.95 ? '#dc2626' : f > 0.8 ? '#d97706' : color;
  return (
    <div className="gauge">
      <svg viewBox="0 0 220 120">
        <path d={`M${cx - r},${cy} A${r},${r} 0 0 1 ${cx + r},${cy}`} fill="none" stroke="#f0f0f0" strokeWidth={18} />
        {f > 0 && <path d={`M${cx - r},${cy} A${r},${r} 0 0 1 ${ex},${ey}`} fill="none" stroke={tone} strokeWidth={18} />}
        {Array.from({ length: 11 }).map((_, i) => {
          const a = Math.PI * (1 - i / 10);
          return (
            <line
              key={i}
              x1={cx + (r - 12) * Math.cos(a)}
              y1={cy - (r - 12) * Math.sin(a)}
              x2={cx + (r - 18) * Math.cos(a)}
              y2={cy - (r - 18) * Math.sin(a)}
              stroke="#a39a8b"
              strokeWidth={1}
            />
          );
        })}
      </svg>
      <div className="g-val">
        <b>{value}</b>
        <span className="muted small">of {max} capacity</span>
      </div>
    </div>
  );
}

function niceMax(v: number) {
  const exp = Math.pow(10, Math.floor(Math.log10(v)));
  const f = v / exp;
  const n = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return n * exp;
}
