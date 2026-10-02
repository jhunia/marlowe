import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { addDays, isoDate, money, parseDate } from '../lib/format';
import { photo, VENUE_PHOTOS } from '../lib/img';
import { usePublicInfo } from './SiteLayout';

const VENUES = [
  { to: '/visit/stay', cls: 'venue-hotel', img: VENUE_PHOTOS.hotel, n: '01 · Floors 1–4', title: 'The Hotel', text: 'Classic kings to a top-floor penthouse, with rain showers and deep sleep.', cta: 'Rooms & rates' },
  { to: '/visit/dine', cls: 'venue-dining', img: VENUE_PHOTOS.food, n: '02 · Ground floor', title: 'Ember & Salt', text: 'Ghanaian flavour over live fire. Dine in, pick up, or have it sent to your room.', cta: 'Menu & ordering' },
  { to: '/visit/rooftop', cls: 'venue-roof', img: VENUE_PHOTOS.pool, n: '03 · The roof', title: 'Skydeck', text: 'Pool and cabanas by day; DJs, cocktails and the city lights by night.', cta: 'Cabanas & club nights' },
  { to: '/visit/events', cls: 'venue-garden', img: VENUE_PHOTOS.garden, n: '04 · The grounds', title: 'The Garden', text: 'A lawn for 800 and a pavilion for 150 — weddings, launches, outdoorings.', cta: 'Plan an event' },
];

export function Home() {
  const nav = useNavigate();
  const { data } = usePublicInfo();
  const [ci, setCi] = useState(addDays(isoDate(), 1));
  const [co, setCo] = useState(addDays(isoDate(), 3));
  const [guests, setGuests] = useState(2);

  return (
    <>
      <section className="hero">
        <div className="s-wrap">
          <div className="copy">
            <div className="kicker">Hotel · Restaurant · Rooftop pool & club · Garden</div>
            <h1>
              Stay the night. <em>Stay</em> for the rest of it.
            </h1>
            <p className="lead">
              Twenty-eight rooms in Airport Residential, a wood-fired kitchen downstairs, a pool and club on the roof, and a lawn made for the parties you’ll talk about for years.
            </p>
            <div className="row wrap">
              <Link to="/visit/stay" className="btn lg brand">
                Book a room
              </Link>
              <Link to="/visit/dine" className="btn lg ghost">
                Order food
              </Link>
            </div>
            <div className="hero-stats">
              <div>
                <b>28</b>
                <span>rooms & suites</span>
              </div>
              <div>
                <b>4</b>
                <span>venues, one address</span>
              </div>
              <div>
                <b>800</b>
                <span>guests on the lawn</span>
              </div>
            </div>
          </div>
          <div className="hero-photos" aria-hidden>
            <img className="p-main" src={photo(VENUE_PHOTOS.pool, 900)} alt="" />
            <img className="p-a" src={photo(VENUE_PHOTOS.hotel, 500)} alt="" />
            <img className="p-b" src={photo(VENUE_PHOTOS.food, 500)} alt="" />
            <span className="p-tag">
              <i style={{ background: 'var(--roof)' }} />
              Skydeck pool · open 08:00–20:00
            </span>
          </div>
        </div>
      </section>

      <div className="s-wrap">
        <form
          className="bookbar"
          onSubmit={(e) => {
            e.preventDefault();
            nav(`/visit/stay?from=${ci}&to=${co}&guests=${guests}`);
          }}
        >
          <div className="f">
            <label htmlFor="bb-in">Arrive</label>
            <input
              id="bb-in"
              type="date"
              value={ci}
              min={isoDate()}
              onChange={(e) => {
                setCi(e.target.value);
                if (e.target.value >= co) setCo(addDays(e.target.value, 1));
              }}
            />
          </div>
          <div className="f">
            <label htmlFor="bb-out">Depart</label>
            <input id="bb-out" type="date" value={co} min={addDays(ci, 1)} onChange={(e) => setCo(e.target.value)} />
          </div>
          <div className="f">
            <label htmlFor="bb-g">Guests</label>
            <select id="bb-g" value={guests} onChange={(e) => setGuests(Number(e.target.value))}>
              {[1, 2, 3, 4].map((n) => (
                <option key={n} value={n}>
                  {n} {n === 1 ? 'guest' : 'guests'}
                </option>
              ))}
            </select>
          </div>
          <button className="btn brand" type="submit">
            Check availability <ArrowRight size={16} />
          </button>
        </form>
      </div>

      <section className="sec">
        <div className="s-wrap">
          <div className="sec-head">
            <h2>
              One address, <em>four</em> ways to spend the day.
            </h2>
            <p>Everything is a short walk — or a lift ride — from your room. Sign dinner, cocktails and cabanas to your room and settle once at checkout.</p>
          </div>
          <div className="venues">
            {VENUES.map((v) => (
              <Link key={v.to} to={v.to} className={`venue-tile ${v.cls}`}>
                <img src={photo(v.img, 700)} alt="" loading="lazy" />
                <div className="venue-body">
                  <span className="venue-chip">{v.n}</span>
                  <h3>{v.title}</h3>
                  <p>{v.text}</p>
                  <span className="go">
                    {v.cta} <ArrowRight size={14} />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="sec alt venue-hotel">
        <div className="s-wrap">
          <div className="sec-head">
            <h2>
              Rooms that <em>earn</em> the lie-in.
            </h2>
            <Link to="/visit/stay" className="btn ghost">
              See availability <ArrowRight size={15} />
            </Link>
          </div>
          <div className="rooms-list">
            {data?.room_types.map((t) => (
              <Link key={t.id} to="/visit/stay" className="room-row" style={{ textDecoration: 'none' }}>
                <div className="room-plate">
                  {t.images[0] && <img src={photo(t.images[0], 700)} alt={t.name} loading="lazy" />}
                  <span className="code">Sleeps {t.capacity}</span>
                </div>
                <div>
                  <h3>{t.name}</h3>
                  <div className="muted">{t.description}</div>
                </div>
                <div className="price">
                  <span className="small muted">from</span>
                  <b>{money(t.base_rate)}</b>
                  <span className="small muted">/ night</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="sec photo-band venue-club" style={{ backgroundImage: `url(${photo(VENUE_PHOTOS.club, 1600)})` }}>
        <div className="s-wrap">
          <div className="sec-head">
            <h2>
              Up on the <em>Skydeck</em>
            </h2>
            <p>Doors at 21:00. Guest-list sign-ups close at 18:00 on the night.</p>
          </div>
          {data?.club_nights.slice(0, 3).map((n) => {
            const d = parseDate(n.date);
            return (
              <div key={n.id} className="night-row">
                <div className="date">
                  {d.getDate()}
                  <small>{d.toLocaleDateString('en-GB', { weekday: 'short', month: 'short' })}</small>
                </div>
                <div>
                  <h4>{n.title}</h4>
                  <div style={{ opacity: 0.8 }}>
                    {n.dj ?? 'Line-up TBC'} · cover {money(n.cover_charge, { compact: true })}
                  </div>
                </div>
                <Link to={`/visit/rooftop?night=${n.id}#club`} className="btn light">
                  Join the list
                </Link>
              </div>
            );
          })}
          {data && data.club_nights.length === 0 && <p style={{ opacity: 0.8 }}>New dates announced soon.</p>}
        </div>
      </section>

      <section className="sec venue-garden">
        <div className="s-wrap split">
          <img className="split-photo" src={photo(VENUE_PHOTOS.gardenTable, 900)} alt="A table set for a garden celebration" loading="lazy" />
          <div>
            <div className="num-kicker">The Garden</div>
            <h2 className="split-title">
              Your guests arrive. <em>We’ve</em> already thought of everything.
            </h2>
            <p className="muted" style={{ maxWidth: 480 }}>
              Catering from our own kitchen, rooms for out-of-town family, the Skydeck for the after-party. One planner, one invoice.
            </p>
            <div className="spaces">
              {[
                ['Garden lawn', 'Up to 800 standing · 450 seated'],
                ['Garden pavilion', 'Up to 150 · covered'],
                ['Skydeck buy-out', 'Up to 220 · pool & DJ booth'],
                ['Private dining room', 'Up to 18 · set menus'],
              ].map(([a, b]) => (
                <div key={a}>
                  <b>{a}</b>
                  <span>{b}</span>
                </div>
              ))}
            </div>
            <Link to="/visit/events" className="btn venue lg" style={{ marginTop: 20 }}>
              Start an inquiry
            </Link>
          </div>
        </div>
      </section>

      <section className="sec tight alt">
        <div className="s-wrap row between wrap">
          <div>
            <div className="eyebrow">Already booked?</div>
            <div style={{ fontFamily: 'var(--f-display)', fontWeight: 800, fontSize: 24, marginTop: 6 }}>Find your reservation, or order room service to your door.</div>
          </div>
          <div className="row">
            <Link to="/visit/booking" className="btn ghost">
              My booking
            </Link>
            <Link to="/visit/dine?to=room" className="btn">
              Room service
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
