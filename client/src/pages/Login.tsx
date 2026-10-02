import { useState, type FormEvent } from 'react';
import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';

const DEMO = [
  ['admin@marlowe.test', 'Administrator'],
  ['frontdesk@marlowe.test', 'Front desk'],
  ['restaurant@marlowe.test', 'Restaurant'],
  ['bar@marlowe.test', 'Rooftop bar'],
  ['events@marlowe.test', 'Events'],
  ['housekeeping@marlowe.test', 'Housekeeping'],
  ['accounts@marlowe.test', 'Accounts'],
];

export function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState('admin@marlowe.test');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(email, password);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <div className="login-art">
        <div className="row" style={{ gap: 12 }}>
          <div className="brand-mark">K</div>
          <div>
            <div className="brand-name">Keyhouse</div>
            <div className="brand-sub">Property console</div>
          </div>
        </div>
        <div style={{ position: 'relative', zIndex: 1 }}>
          <h1>
            Every room, table, cabana and garden party. <em>One ledger.</em>
          </h1>
          <p>The Marlowe · Hotel · Ember &amp; Salt · Skydeck Club &amp; Pool · The Garden</p>
          <Link to="/visit" className="btn ghost" style={{ alignSelf: 'flex-start', marginTop: 8 }}>
            Guest? Book a room, order food or reserve a cabana <ArrowRight size={15} />
          </Link>
        </div>
        <Facade />
      </div>

      <div className="login-form">
        <form onSubmit={submit} className="stack">
          <div>
            <div className="eyebrow">Staff sign-in</div>
            <h2>Good to see you.</h2>
            <p className="muted" style={{ margin: '4px 0 8px' }}>
              Use your work email to open today’s ledger.
            </p>
          </div>
          {error && <div className="form-error">{error}</div>}
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>
          <button className="btn lg block" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'} <ArrowRight size={16} />
          </button>

          <div className="demo-accounts">
            <div className="eyebrow" style={{ marginBottom: 6 }}>
              Demo accounts · password <span className="mono">marlowe123</span>
            </div>
            {DEMO.map(([e, r]) => (
              <button
                type="button"
                key={e}
                onClick={() => {
                  setEmail(e);
                  setPassword('marlowe123');
                }}
              >
                <span className="mono">{e}</span>
                <span className="muted">{r}</span>
              </button>
            ))}
          </div>
        </form>
      </div>
    </div>
  );
}

/** A tropical-modernist tower: breeze-block screen, louvred floors, rooftop pool deck, garden pavilion. */
export function Facade({ className = 'facade' }: { className?: string }) {
  const gold = 'currentColor';
  const line = 'rgba(17,17,17,.28)';
  const blocks = [];
  // breeze-block screen on the stair core
  for (let r = 0; r < 11; r++)
    for (let c = 0; c < 4; c++) {
      const x = 40 + c * 26;
      const y = 150 + r * 26;
      blocks.push(
        <g key={`b${r}-${c}`} stroke={r % 4 === 1 && c === 2 ? gold : line} strokeWidth={1.2}>
          <rect x={x} y={y} width={26} height={26} />
          <circle cx={x + 13} cy={y + 13} r={7} />
        </g>,
      );
    }
  const floors = [];
  for (let f = 0; f < 8; f++) {
    const y = 150 + f * 36;
    floors.push(
      <g key={f}>
        <path d={`M144 ${y}h212`} stroke={line} strokeWidth={2.5} />
        {Array.from({ length: 13 }).map((_, i) => {
          const lit = (f * 13 + i) % 9 === 0;
          return <path key={i} d={`M${152 + i * 16} ${y + 6}v24`} stroke={lit ? gold : line} strokeWidth={lit ? 4 : 1.2} />;
        })}
      </g>,
    );
  }
  return (
    <svg className={className} viewBox="0 0 400 560" preserveAspectRatio="xMaxYMax meet" fill="none" aria-hidden>
      <path d="M20 120h370" stroke={gold} strokeWidth={5} />
      <path d="M60 120v-26h120v26" stroke={line} strokeWidth={1.2} />
      <path d="M196 112h120" stroke={gold} strokeWidth={1.5} />
      <path d="M200 106c10-5 20-5 30 0s20 5 30 0 20-5 30 0" stroke={gold} strokeWidth={1.5} />
      {[90, 140, 330].map((x) => (
        <g key={x} stroke={gold} strokeWidth={1.5}>
          <path d={`M${x - 16} 88l16-12 16 12z`} />
          <path d={`M${x} 88v24`} />
        </g>
      ))}
      <path d="M40 60q80 16 160 0t180 0" stroke={line} strokeDasharray="2 7" />
      <path d="M40 120v440M144 120v440M356 120v440" stroke={line} strokeWidth={1.2} />
      {blocks}
      {floors}
      <path d="M150 452h200" stroke={gold} strokeWidth={4} />
      <path d="M170 452v60M330 452v60" stroke={line} />
      <path d="M10 540h390" stroke={gold} strokeWidth={2} />
    </svg>
  );
}
