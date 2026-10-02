import express, { type NextFunction, type Request, type Response } from 'express';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ZodError } from 'zod';
import { migrate, scalar } from './db.ts';
import { requireAuth } from './auth.ts';
import { HttpError } from './util.ts';
import { authRoutes } from './routes/auth.ts';
import { publicApi } from './routes/public.ts';
import { hotel } from './routes/hotel.ts';
import { dining } from './routes/dining.ts';
import { rooftop } from './routes/rooftop.ts';
import { events } from './routes/events.ts';
import { office } from './routes/office.ts';
import { insights } from './routes/insights.ts';
import { seed } from './seed.ts';

migrate();
if (!scalar<number>('SELECT COUNT(*) FROM users')) {
  seed();
  console.log('Seeded demo data — sign in as admin@marlowe.test / marlowe123');
}

const app = express();
app.set('trust proxy', 'loopback');
app.disable('x-powered-by');
app.use(express.json({ limit: '200kb' }));

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api/public', publicApi);
app.use('/api', authRoutes);
app.use('/api', requireAuth, hotel, dining, rooftop, events, office, insights);
app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Not found')));

// Serve the built client in production.
const dist = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'client', 'dist');
if (existsSync(dist)) {
  app.use(express.static(dist, { index: false, maxAge: '1h' }));
  app.get('*', (_req, res) => res.sendFile(join(dist, 'index.html')));
}

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  if (err instanceof ZodError) return res.status(400).json({ error: err.issues[0]?.message ?? 'Invalid request' });
  if (err instanceof SyntaxError && 'body' in err) return res.status(400).json({ error: 'Malformed JSON' });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on our side' });
});

const port = Number(process.env.API_PORT ?? 4000);
app.listen(port, () => console.log(`Keyhouse API listening on http://localhost:${port}`));
