# Keyhouse — Property Management System for The Marlowe

One console to run the whole property: the **hotel**, the **Ember & Salt restaurant**,
the **Skydeck rooftop club & pool**, and **The Garden** outdoor events lawn.

---

## 1. Goals

| Goal | What it means in practice |
|---|---|
| One ledger for the whole property | A room guest can eat at the restaurant, drink on the roof and book a cabana — every charge lands on one folio and is settled at checkout. |
| Real operational tools, not reports only | Front desk tape chart, room status board, POS, kitchen display, door guest-list check‑in, event pipeline, stock control, staff rota. |
| Role-based access | Each staff role sees and can change only what their job needs. |
| Runs anywhere | Node + SQLite; no external services needed. One command to start. |

## 2. Venues & modules

### 2.1 Hotel — Front Office
- **Tape chart** – 14‑day timeline of every room with reservation bars; click an empty cell to book.
- **Reservations** – search/filter; create with live availability check (no double booking);
  statuses `booked → checked_in → checked_out`, plus `cancelled`, `no_show`.
- **Check‑in / check‑out** – check‑in assigns room + marks it occupied; check‑out requires a zero folio
  balance and flips the room to *dirty* (auto-creates a housekeeping task).
- **Folio** – room nights posted automatically; outlet charges posted from POS ("charge to room");
  payments (cash / card / transfer); running balance.
- **Rooms board** – key‑tag grid by floor with housekeeping status (clean, dirty, inspected, out of order).
- **Guests** – profiles, VIP flag, stay history, lifetime spend.
- **Housekeeping** – task queue (clean / turndown / inspect / maintenance), assignment, priority.

### 2.2 Restaurant — Ember & Salt
- **Floor plan** – tables drawn by position and shape, coloured by status; tap to open/continue a check.
- **POS** – menu by category, modifiers via notes, send to kitchen ("fire"), service charge + VAT,
  settle by cash/card/transfer or **charge to an in-house room**.
- **Kitchen display** – live tickets grouped per order, age timer, bump items to *ready*.
- **Menu manager** – categories, items, prices, 86 (unavailable) toggle, station (kitchen/bar).
- **Table bookings** – reservation book by date & time slot.

### 2.3 Rooftop — Skydeck Club & Pool
- **Bar POS** – same POS engine, outlet = `rooftop`, bar station tickets.
- **Pool & cabanas** – day grid of cabanas, daybeds and VIP tables; book for in‑house or walk‑in guests,
  charge to room.
- **Club nights** – event nights with DJ, cover charge and capacity; **door mode** guest list with
  one‑tap check‑in and a live capacity gauge.

### 2.4 Outdoor — The Garden
- **Pipeline** – kanban by status `inquiry → tentative → confirmed → completed`.
- **Calendar** – month view of all functions across the Garden, rooftop buy‑outs and private dining.
- **Event file** – client, schedule, headcount, quote builder (line items), deposit/payments,
  run‑of‑show checklist; clash detection for the same venue & date.

### 2.5 Back office
- **Inventory** – stock by store (kitchen, bar, housekeeping, maintenance), par levels, low‑stock alerts,
  movement log (purchase / usage / wastage / adjustment).
- **Staff & rota** – staff directory by department; weekly shift grid.
- **Reports** – revenue by outlet over a period, daily revenue trend, occupancy %, ADR, RevPAR,
  top menu items, payment mix.
- **Settings** – property details, currency (GH₵), taxes & levies %, service charge %, user accounts & roles.

### 2.6 Guest website (`/visit`, no login)
- **Stay** – live availability by date, choose a room, reserve (source `website`), booking code on a "key card".
- **My booking** – look up by code + last name; checked-in guests jump straight to room service.
- **Dine** – full Ember & Salt menu with basket; order for **pickup**, **to my room** (verified by booking code
  + last name, charged to the folio when staff settle it) or **poolside**; live order tracker
  (received → on the fire → ready → enjoy) driven by the kitchen display. Table booking form.
- **Skydeck** – cabana / daybed / VIP-table availability by day and hours; club-night guest-list sign-up.
- **Celebrate** – event inquiry for the Garden lawn, pavilion, Skydeck buy-out or private dining room.

Every submission lands in the staff console: reservations, kitchen tickets, pool grid, door list, events pipeline.
Public endpoints live under `/api/public/*`, are validated with zod and rate-limited per IP.

## 3. Roles

| Role | Access |
|---|---|
| `admin` | Everything incl. users & settings |
| `manager` | Everything except user admin |
| `front_desk` | Front office, guests, folios, pool/cabana bookings |
| `housekeeping` | Rooms board, housekeeping tasks |
| `restaurant` | Restaurant POS, floor, kitchen, bookings, menu |
| `bar` | Rooftop bar POS, club nights & door, pool bookings |
| `events` | Events pipeline/calendar, garden |
| `accounts` | Reports, folios, payments, inventory |

Enforced on the server (route guards) and mirrored on the client (navigation + buttons).

## 4. Architecture

```
hotel/
├─ client/   React 18 + Vite + TypeScript, React Router, TanStack Query, hand‑written CSS design system
└─ server/   Node 24 (native TS) + Express + node:sqlite, JWT auth, zod validation
```

- Client dev server proxies `/api` → `http://localhost:4000`.
- In production the server also serves `client/dist`, so one process runs the whole system.
- SQLite file `server/data/keyhouse.db`, created and seeded on first boot.

### 4.1 Data model (main tables)

`users, settings, room_types, rooms, guests, reservations, folio_items, payments,
housekeeping_tasks, menu_categories, menu_items, dining_tables, orders, order_items,
table_bookings, resources, resource_bookings, club_nights, guest_list, events, event_items,
event_tasks, inventory_items, stock_movements, staff, shifts, activity_log`

Key rules enforced in the backend:
1. A room cannot hold two overlapping non‑cancelled reservations.
2. Check‑out is blocked while the folio balance is > 0.
3. "Charge to room" is only allowed for a reservation that is `checked_in`.
4. Orders compute subtotal / service / VAT server‑side — the client never sends totals.
5. Resource bookings (cabanas) cannot overlap on the same resource.
6. Stock quantities only change through recorded movements.

### 4.2 API (REST, JSON, `Authorization: Bearer <jwt>`)

| Area | Endpoints |
|---|---|
| Auth | `POST /auth/login`, `GET /auth/me` |
| Dashboard | `GET /dashboard` |
| Rooms | `GET/POST /room-types`, `GET/POST /rooms`, `PATCH /rooms/:id` |
| Availability | `GET /availability?from&to&room_type_id` |
| Guests | `GET/POST /guests`, `GET/PATCH /guests/:id` |
| Reservations | `GET/POST /reservations`, `GET/PATCH /reservations/:id`, `POST /reservations/:id/{check-in,check-out,cancel,no-show,charges,payments}` |
| Tape chart | `GET /tape-chart?from&days` |
| Housekeeping | `GET/POST /housekeeping`, `PATCH /housekeeping/:id` |
| Menu | `GET/POST /menu/categories`, `GET/POST /menu/items`, `PATCH/DELETE /menu/items/:id` |
| Tables | `GET/POST /tables`, `PATCH /tables/:id` |
| Orders | `GET/POST /orders`, `GET /orders/:id`, `POST /orders/:id/{items,fire,pay,void}`, `PATCH/DELETE /orders/:id/items/:itemId` |
| Kitchen | `GET /kitchen?station`, `POST /kitchen/items/:id/{ready,served}` |
| Table bookings | `GET/POST /table-bookings`, `PATCH /table-bookings/:id` |
| Rooftop | `GET /resources`, `GET/POST /resource-bookings`, `PATCH /resource-bookings/:id`, `GET/POST /club-nights`, `GET/PATCH /club-nights/:id`, `POST /club-nights/:id/guests`, `PATCH /guest-list/:id` |
| Events | `GET/POST /events`, `GET/PATCH /events/:id`, `POST /events/:id/{items,tasks,payments}`, `DELETE /events/:id/items/:itemId`, `PATCH /event-tasks/:id` |
| Inventory | `GET/POST /inventory`, `PATCH /inventory/:id`, `POST /inventory/:id/movements`, `GET /inventory/movements` |
| Staff | `GET/POST /staff`, `PATCH /staff/:id`, `GET/POST /shifts`, `DELETE /shifts/:id` |
| Reports | `GET /reports/summary?from&to` |
| Admin | `GET/POST /users`, `PATCH /users/:id`, `GET/PUT /settings` |

## 5. Design language

Clean, confident and colourful — the same family as the stress_d storefront (Outfit display + Satoshi body,
pill buttons, soft rounded cards, generous white space), but with its own hotel identity and lots of colour.

- **Palette:** sunset coral brand (#FF5A36) on warm off-white. Every venue has its own bright colour, used
  for buttons, active navigation, badges, charts and gradients: Hotel *lagoon teal*, Ember & Salt *ember orange*,
  Skydeck pool *pool blue*, club nights *violet*, The Garden *lawn green*, highlights *kente yellow*.
- **Type:** Outfit 800–900 uppercase for page and section titles; Satoshi for UI text; IBM Plex Mono for codes.
- **Components:** pastel pill badges, gradient KPI card, gradient venue tiles, rounded room cards,
  MoMo-first payment pickers.
- **Ghana:** cedi (GH₵) pricing, taxes & levies (VAT, NHIL, GETFund, tourism levy) configurable in Settings,
  Ghana Card IDs, +233 numbers, Accra address, Ghanaian menu, **Mobile Money** as a payment method everywhere.
- Responsive: sidebar collapses to a drawer below 900px; tables scroll inside their card.

## 6. Delivery phases

1. **Plan** (this document).
2. **Frontend** – design system → app shell & auth → module pages wired to the API contract above.
3. **Backend** – schema & seed → auth/RBAC → module routes with business rules → reports.
4. **Integration & verification** – run both, walk every flow in the browser:
   reservation → check‑in → restaurant order charged to room → cabana booking → folio payment → check‑out;
   event inquiry → quote → deposit → confirmed; stock movement → low stock alert.

## 7. Running

```bash
npm install          # installs client + server workspaces
npm run dev          # server :4000 + client :5173
```

Seeded logins (password `marlowe123`):
`admin@marlowe.test`, `frontdesk@marlowe.test`, `restaurant@marlowe.test`,
`bar@marlowe.test`, `events@marlowe.test`, `housekeeping@marlowe.test`, `accounts@marlowe.test`.

## 8. Next steps (beyond v1)
Online booking engine & channel manager, card‑terminal integration, email confirmations,
multi‑property, audit export to accounting, mobile housekeeping app with offline mode.
