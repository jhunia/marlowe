import { Link, useNavigate } from 'react-router-dom';
import { useApi } from '../lib/hooks';
import type { Dashboard } from '../lib/types';
import { fmtDate, money, pct, timeAgo } from '../lib/format';
import { Ledger, LedgerCell, Loading, PageHead, Panel, Stamp, Empty } from '../components/ui';
import { Legend, StackedBars, VENUE_COLORS } from '../components/charts';
import { useAuth } from '../lib/auth';
import { can } from '../lib/permissions';

export function Overview() {
  const { data, isLoading } = useApi<Dashboard>('/dashboard', { refetchInterval: 60000 });
  const { user } = useAuth();
  const nav = useNavigate();
  if (isLoading || !data) return <Loading />;

  const occ = data.rooms.total ? (data.rooms.occupied / data.rooms.total) * 100 : 0;
  const todayTotal = Object.values(data.revenue_today).reduce((a, b) => a + b, 0);
  const weekTotal = data.revenue_7d.reduce((s, d) => s + d.hotel + d.restaurant + d.rooftop + d.events, 0);
  const tonight = data.rooftop.tonight;

  return (
    <div className="venue-office">
      <PageHead
        eyebrow={`Daily ledger · ${fmtDate(data.date, 'long')}`}
        title="The house"
        accent="today"
        actions={
          can(user?.role, 'front_office') && (
            <>
              <Link className="btn ghost" to="/front-desk">
                Open front desk
              </Link>
              <Link className="btn" to="/reservations?new=1">
                New reservation
              </Link>
            </>
          )
        }
      />

      <Ledger cols={5}>
        <LedgerCell label="Occupancy" value={pct(occ)} sub={`${data.rooms.occupied} of ${data.rooms.total} rooms`} bar={occ} />
        <LedgerCell label="In house" value={data.in_house} suffix="guests" sub={`${data.arrivals.length} arriving · ${data.departures.length} leaving`} />
        <LedgerCell label="Revenue today" value={money(todayTotal, { compact: true })} sub="all outlets, posted" />
        <LedgerCell label="Last 7 days" value={money(weekTotal, { compact: true })} sub="gross revenue" />
        <LedgerCell
          label="Needs attention"
          value={data.housekeeping_open + data.low_stock}
          sub={`${data.housekeeping_open} HK tasks · ${data.low_stock} low stock`}
        />
      </Ledger>

      <div className="venue-cards">
        <Link to="/rooms" className="venue-card venue-hotel">
          <h3>
            Rooms <span>Hotel</span>
          </h3>
          <div className="big">{money(data.revenue_today.hotel, { compact: true })}</div>
          <div className="small muted">posted to folios today</div>
          <dl>
            <dt>Occupied</dt>
            <dd>{data.rooms.occupied}</dd>
            <dt>Clean & vacant</dt>
            <dd>{data.rooms.clean}</dd>
            <dt>Dirty</dt>
            <dd>{data.rooms.dirty}</dd>
            <dt>Out of order</dt>
            <dd>{data.rooms.out_of_order}</dd>
          </dl>
        </Link>
        <Link to="/restaurant" className="venue-card venue-dining">
          <h3>
            Ember & Salt <span>Restaurant</span>
          </h3>
          <div className="big">{money(data.revenue_today.restaurant, { compact: true })}</div>
          <div className="small muted">settled & charged today</div>
          <dl>
            <dt>Open checks</dt>
            <dd>{data.restaurant.open_checks}</dd>
            <dt>Covers today</dt>
            <dd>{data.restaurant.covers_today}</dd>
            <dt>Bookings today</dt>
            <dd>{data.restaurant.bookings_today}</dd>
            <dt>Tickets on the pass</dt>
            <dd>{data.restaurant.tickets}</dd>
          </dl>
        </Link>
        <Link to="/rooftop" className="venue-card venue-roof">
          <h3>
            Skydeck <span>Club & pool</span>
          </h3>
          <div className="big">{money(data.revenue_today.rooftop, { compact: true })}</div>
          <div className="small muted">bar, cabanas & covers</div>
          <dl>
            <dt>Cabanas booked</dt>
            <dd>
              {data.rooftop.cabanas_booked}/{data.rooftop.cabanas_total}
            </dd>
            <dt>Open bar tabs</dt>
            <dd>{data.rooftop.open_tabs}</dd>
            <dt>Tonight</dt>
            <dd>{tonight ? tonight.title : '—'}</dd>
            <dt>Door</dt>
            <dd>{tonight ? `${tonight.checked_in_pax ?? 0}/${tonight.capacity}` : '—'}</dd>
          </dl>
        </Link>
        <Link to="/events" className="venue-card venue-garden">
          <h3>
            The Garden <span>Events</span>
          </h3>
          <div className="big">{money(data.revenue_today.events, { compact: true })}</div>
          <div className="small muted">deposits & payments today</div>
          <dl>
            <dt>Events this month</dt>
            <dd>{data.events.this_month}</dd>
            <dt>Open pipeline</dt>
            <dd>{money(data.events.pipeline_value, { compact: true })}</dd>
            <dt>Next up</dt>
            <dd>{data.events.upcoming[0] ? fmtDate(data.events.upcoming[0].date, 'day') : '—'}</dd>
          </dl>
        </Link>
      </div>

      <div className="dash-grid">
        <div className="stack loose">
          <Panel title="Revenue, last 7 days" actions={<Legend />}>
            <StackedBars data={data.revenue_7d} />
          </Panel>

          <div className="grid-2" style={{ gap: 20 }}>
            <Panel title="Arrivals" actions={<span className="mono small muted">{data.arrivals.length}</span>} flush>
              {data.arrivals.length === 0 ? (
                <Empty title="No arrivals left today." />
              ) : (
                <ul className="movement-list">
                  {data.arrivals.map((r) => (
                    <li key={r.id} onClick={() => nav(`/reservations/${r.id}`)} style={{ cursor: 'pointer' }}>
                      <span className="room-no">{r.room_number ?? '—'}</span>
                      <span>
                        <b>{r.guest_name}</b> {r.vip ? <Stamp value="vip" /> : null}
                        <div className="small muted">
                          {r.type_name} · {r.adults + r.children} pax
                        </div>
                      </span>
                      <Stamp value={r.status} />
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
            <Panel title="Departures" actions={<span className="mono small muted">{data.departures.length}</span>} flush>
              {data.departures.length === 0 ? (
                <Empty title="Nobody left to check out." />
              ) : (
                <ul className="movement-list">
                  {data.departures.map((r) => (
                    <li key={r.id} onClick={() => nav(`/reservations/${r.id}`)} style={{ cursor: 'pointer' }}>
                      <span className="room-no">{r.room_number ?? '—'}</span>
                      <span>
                        <b>{r.guest_name}</b>
                        <div className="small muted">balance {money(r.balance)}</div>
                      </span>
                      <Stamp value={r.status} />
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
        </div>

        <div className="stack loose">
          <Panel title="Coming up at the Garden" flush>
            {data.events.upcoming.length === 0 ? (
              <Empty title="The lawn is quiet." />
            ) : (
              <ul className="movement-list">
                {data.events.upcoming.map((e) => (
                  <li key={e.id} onClick={() => nav(`/events/${e.id}`)} style={{ cursor: 'pointer', gridTemplateColumns: '52px 1fr auto' }}>
                    <span className="mono small" style={{ lineHeight: 1.1, textAlign: 'center' }}>
                      <b style={{ fontFamily: 'var(--f-display)', fontSize: 20, display: 'block', color: VENUE_COLORS.events }}>
                        {e.date.slice(8, 10)}
                      </b>
                      {new Date(e.date + 'T00:00').toLocaleDateString('en-GB', { month: 'short' })}
                    </span>
                    <span>
                      <b>{e.title}</b>
                      <div className="small muted">
                        {e.guests} guests · {e.venue.replace('_', ' ')}
                      </div>
                    </span>
                    <Stamp value={e.status} />
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Across the house" flush>
            <ul className="feed">
              {data.activity.map((a) => (
                <li key={a.id}>
                  <time>{timeAgo(a.created_at)}</time>
                  <span>
                    <i
                      style={{
                        display: 'inline-block',
                        width: 7,
                        height: 7,
                        borderRadius: '50%',
                        marginRight: 8,
                        background: VENUE_COLORS[a.venue as keyof typeof VENUE_COLORS] ?? 'var(--brass)',
                      }}
                    />
                    {a.action}
                    {a.user_name && <span className="muted"> — {a.user_name}</span>}
                  </span>
                </li>
              ))}
              {data.activity.length === 0 && <li className="muted">No activity yet today.</li>}
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  );
}
