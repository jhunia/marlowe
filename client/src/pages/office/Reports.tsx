import { useState } from 'react';
import { Download } from 'lucide-react';
import { useApi } from '../../lib/hooks';
import { addDays, isoDate, money, pct } from '../../lib/format';
import { qs } from '../../lib/api';
import type { ReportSummary } from '../../lib/types';
import { Ledger, LedgerCell, Loading, PageHead, Panel, Segmented } from '../../components/ui';
import { AreaLine, Legend, StackedBars, VENUE_COLORS, VENUE_NAMES } from '../../components/charts';

type Range = '7' | '30' | '90' | 'custom';

export function Reports() {
  const today = isoDate();
  const [range, setRange] = useState<Range>('30');
  const [from, setFrom] = useState(addDays(today, -29));
  const [to, setTo] = useState(today);
  const f = range === 'custom' ? from : addDays(today, -(Number(range) - 1));
  const t = range === 'custom' ? to : today;
  const { data, isLoading } = useApi<ReportSummary>(`/reports/summary${qs({ from: f, to: t })}`);

  const exportCsv = () => {
    if (!data) return;
    const rows = [['date', 'rooms', 'restaurant', 'rooftop', 'events', 'total']];
    for (const d of data.daily) rows.push([d.date, ...[d.hotel, d.restaurant, d.rooftop, d.events].map(String), String(d.hotel + d.restaurant + d.rooftop + d.events)]);
    const blob = new Blob([rows.map((r) => r.join(',')).join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `keyhouse-revenue-${data.from}-to-${data.to}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="venue-office">
      <PageHead
        eyebrow="Back office · Performance"
        title="Reports"
        actions={
          <>
            <Segmented
              value={range}
              onChange={setRange}
              options={[
                { value: '7', label: '7 days' },
                { value: '30', label: '30 days' },
                { value: '90', label: '90 days' },
                { value: 'custom', label: 'Custom' },
              ]}
            />
            <button className="btn ghost" onClick={exportCsv} disabled={!data}>
              <Download size={15} /> CSV
            </button>
          </>
        }
      />
      {range === 'custom' && (
        <div className="toolbar">
          <input type="date" className="input" style={{ width: 160 }} value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
          <span className="muted">to</span>
          <input type="date" className="input" style={{ width: 160 }} value={to} min={from} onChange={(e) => setTo(e.target.value)} />
        </div>
      )}

      {isLoading || !data ? (
        <Loading />
      ) : (
        <>
          <Ledger cols={5}>
            <LedgerCell label="Total revenue" value={money(data.revenue.total, { compact: true })} />
            <LedgerCell label="Occupancy" value={pct(data.occupancy_pct)} bar={data.occupancy_pct} />
            <LedgerCell label="ADR" value={money(data.adr, { compact: true })} sub="average daily rate" />
            <LedgerCell label="RevPAR" value={money(data.revpar, { compact: true })} sub="revenue per available room" />
            <LedgerCell label="Room nights" value={data.room_nights} />
          </Ledger>

          <div className="dash-grid">
            <div className="stack loose">
              <Panel title="Daily revenue by venue" actions={<Legend />}>
                <StackedBars data={data.daily} height={240} />
              </Panel>
              <Panel title="Occupancy">
                <AreaLine data={data.occupancy.map((o) => ({ date: o.date, value: o.total ? (o.occupied / o.total) * 100 : 0 }))} />
              </Panel>
              <Panel title="Best sellers" flush>
                <table className="ledger-table">
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>Outlet</th>
                      <th className="num">Sold</th>
                      <th className="num">Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.top_items.map((i) => (
                      <tr key={i.name + i.outlet}>
                        <td>{i.name}</td>
                        <td className="small">{i.outlet === 'restaurant' ? 'Ember & Salt' : 'Skydeck'}</td>
                        <td className="num">{i.qty}</td>
                        <td className="num">{money(i.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Panel>
            </div>
            <div className="stack loose">
              <Panel title="Revenue mix">
                {(['hotel', 'restaurant', 'rooftop', 'events'] as const).map((k) => {
                  const v = data.revenue[k];
                  const share = data.revenue.total ? (v / data.revenue.total) * 100 : 0;
                  return (
                    <div className="hbar" key={k}>
                      <span>{VENUE_NAMES[k]}</span>
                      <div className="track">
                        <i style={{ width: `${share}%`, background: VENUE_COLORS[k] }} />
                      </div>
                      <span className="mono small right">{money(v, { compact: true })}</span>
                    </div>
                  );
                })}
              </Panel>
              <Panel title="Payments received">
                {data.payment_mix.map((p) => {
                  const total = data.payment_mix.reduce((s, x) => s + x.amount, 0);
                  return (
                    <div className="hbar" key={p.method}>
                      <span style={{ textTransform: p.method === 'momo' ? 'none' : 'capitalize' }}>{p.method === 'momo' ? 'MoMo' : p.method}</span>
                      <div className="track">
                        <i style={{ width: `${total ? (p.amount / total) * 100 : 0}%`, background: 'var(--brass)' }} />
                      </div>
                      <span className="mono small right">{money(p.amount, { compact: true })}</span>
                    </div>
                  );
                })}
                {data.payment_mix.length === 0 && <div className="small muted">No payments in range.</div>}
              </Panel>
              <Panel title="Booking sources">
                {data.sources.map((s) => {
                  const total = data.sources.reduce((a, x) => a + x.count, 0);
                  return (
                    <div className="hbar" key={s.source}>
                      <span style={{ textTransform: 'capitalize' }}>{s.source.replace('_', ' ')}</span>
                      <div className="track">
                        <i style={{ width: `${total ? (s.count / total) * 100 : 0}%`, background: VENUE_COLORS.hotel }} />
                      </div>
                      <span className="mono small right">{s.count}</span>
                    </div>
                  );
                })}
              </Panel>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
