import { pathToFileURL } from 'node:url';
import { all, db, get, migrate, run, tx } from './db.ts';
import { hashPassword } from './auth.ts';
import { addDays, makeCode, round2, today } from './util.ts';
import { recalc } from './services/orders.ts';

/* deterministic PRNG so the demo looks the same on every machine */
let s = 20260930;
const rnd = () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pick = <T>(a: readonly T[]) => a[Math.floor(rnd() * a.length)];
const int = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));

/** UTC sqlite timestamp for a local date + hh:mm. */
function stamp(date: string, hhmm: string) {
  const [y, m, d] = date.split('-').map(Number);
  const [h, mi] = hhmm.split(':').map(Number);
  return new Date(y, m - 1, d, h, mi).toISOString().slice(0, 19).replace('T', ' ');
}

const TABLES = [
  'activity_log', 'shifts', 'staff', 'stock_movements', 'inventory_items', 'event_tasks', 'event_items', 'guest_list', 'club_nights',
  'payments', 'resource_bookings', 'resources', 'table_bookings', 'order_items', 'orders', 'dining_tables', 'menu_items',
  'menu_categories', 'housekeeping_tasks', 'folio_items', 'events', 'reservations', 'guests', 'rooms', 'room_types', 'users', 'settings',
];

export function seed() {
  const T = today();
  tx(() => {
    /* ------------------------------------------------------------ settings */
    const settings: Record<string, string> = {
      property_name: 'The Marlowe',
      currency: 'GH₵',
      vat_rate: '21',
      service_rate: '10',
      address: '12 Kofi Annan Street, Airport Residential Area, Accra',
      phone: '+233 30 290 1140',
      email: 'stay@themarlowe.com.gh',
      check_in_time: '14:00',
      check_out_time: '12:00',
    };
    for (const [k, v] of Object.entries(settings)) run('INSERT INTO settings (key, value) VALUES (?, ?)', k, v);

    /* --------------------------------------------------------------- users */
    const pw = hashPassword('marlowe123');
    const users: [string, string, string][] = [
      ['Adwoa Mensah', 'admin@marlowe.test', 'admin'],
      ['Kwaku Boateng', 'manager@marlowe.test', 'manager'],
      ['Efua Asante', 'frontdesk@marlowe.test', 'front_desk'],
      ['Kojo Owusu', 'restaurant@marlowe.test', 'restaurant'],
      ['Akua Darko', 'bar@marlowe.test', 'bar'],
      ['Nana Ama Ofori', 'events@marlowe.test', 'events'],
      ['Mercy Tetteh', 'housekeeping@marlowe.test', 'housekeeping'],
      ['Yaw Amponsah', 'accounts@marlowe.test', 'accounts'],
    ];
    const uid: Record<string, number> = {};
    for (const [n, e, r] of users) uid[r] = run('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)', n, e, pw, r).id;

    /* --------------------------------------------------------------- rooms */
    const types = [
      ['Classic King', 'CK', 1450, 2, 'Garden-facing king room, rain shower, work desk.'],
      ['Deluxe Twin', 'DT', 1750, 3, 'Two queen beds, sofa, city view.'],
      ['Terrace Suite', 'TS', 2900, 3, 'Private terrace, lounge, deep soaking tub, Skydeck access.'],
      ['Marlowe Penthouse', 'PH', 5800, 4, 'Top-floor two-bedroom with wraparound balcony and butler service.'],
    ] as const;
    // sample photography (Unsplash licence) — replace with your own in Settings → Rooms inventory
    const roomPhotos: Record<string, string[]> = {
      CK: ['https://images.unsplash.com/photo-1611892440504-42a792e24d32', 'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b', 'https://images.unsplash.com/photo-1631049307264-da0ec9d70304'],
      DT: ['https://images.unsplash.com/photo-1631049552057-403cdb8f0658', 'https://images.unsplash.com/photo-1568495248636-6432b97bd949', 'https://images.unsplash.com/photo-1629140727571-9b5c6f6267b4'],
      TS: ['https://images.unsplash.com/photo-1559414059-34fe0a59e57a', 'https://images.unsplash.com/photo-1590490360182-c33d57733427', 'https://images.unsplash.com/photo-1576354302919-96748cb8299e'],
      PH: ['https://images.unsplash.com/photo-1618773928121-c32242e63f39', 'https://images.unsplash.com/photo-1549638441-b787d2e11f14', 'https://images.unsplash.com/photo-1725962479542-1be0a6b0d444', 'https://images.unsplash.com/photo-1667125095636-dce94dcbdd96'],
    };
    const typeId: Record<string, number> = {};
    for (const [n, c, r, cap, d] of types) typeId[c] = run('INSERT INTO room_types (name, code, base_rate, capacity, description, images) VALUES (?, ?, ?, ?, ?, ?)', n, c, r, cap, d, JSON.stringify(roomPhotos[c] ?? [])).id;
    const layout: [number, string[]][] = [
      [1, ['CK', 'CK', 'CK', 'DT', 'DT', 'CK', 'CK', 'DT']],
      [2, ['CK', 'CK', 'DT', 'DT', 'CK', 'CK', 'DT', 'TS']],
      [3, ['CK', 'DT', 'DT', 'CK', 'TS', 'TS', 'CK', 'DT']],
      [4, ['TS', 'TS', 'TS', 'PH']],
    ];
    const rooms: { id: number; number: string; type: string }[] = [];
    for (const [floor, list] of layout) {
      list.forEach((code, i) => {
        const number = `${floor}${String(i + 1).padStart(2, '0')}`;
        rooms.push({ id: run('INSERT INTO rooms (number, floor, room_type_id) VALUES (?, ?, ?)', number, floor, typeId[code]).id, number, type: code });
      });
    }
    const rateOf = (code: string) => types.find((t) => t[1] === code)![2];

    /* -------------------------------------------------------------- guests */
    const first = ['Kwame', 'Ama', 'Kofi', 'Akosua', 'Yaw', 'Abena', 'Kwabena', 'Efua', 'Kojo', 'Adwoa', 'Nana', 'Esi', 'Kwesi', 'Afua', 'Fiifi', 'Selasi', 'Edem', 'Naa', 'Nii', 'Zainab', 'Abdul', 'Sarah', 'James', 'Priya', 'Lucas', 'Nadia', 'Chinedu', 'Pierre', 'Daniel', 'Aku'];
    const last = ['Mensah', 'Owusu', 'Boateng', 'Asante', 'Darko', 'Ofori', 'Adjei', 'Quaye', 'Annan', 'Appiah', 'Agyeman', 'Tetteh', 'Amoah', 'Oppong', 'Sarpong', 'Agbeko', 'Kumah', 'Lamptey', 'Armah', 'Iddrisu', 'Fuseini', 'Whitfield', 'Carter', 'Sharma', 'Moreau', 'Haddad', 'Okafor', 'Laurent', 'Kim', 'Dogbe'];
    const nat = ['Ghanaian', 'Ghanaian', 'Ghanaian', 'Ghanaian', 'Ghanaian', 'Nigerian', 'British', 'American', 'French', 'Togolese', 'Lebanese'];
    const guests: number[] = [];
    first.forEach((f, i) => {
      const l = last[i];
      guests.push(
        run(
          'INSERT INTO guests (first_name, last_name, email, phone, nationality, id_type, id_number, vip, notes) VALUES (?,?,?,?,?,?,?,?,?)',
          f,
          l,
          `${f.toLowerCase()}.${l.toLowerCase()}@mail.test`,
          `+233 ${pick(['24', '20', '54', '55', '27'])} ${int(100, 999)} ${int(1000, 9999)}`,
          pick(nat),
          pick(['Passport', 'Ghana Card']),
          `GHA-${int(100000000, 999999999)}-${int(1, 9)}`,
          i % 9 === 0 ? 1 : 0,
          i % 9 === 0 ? 'Prefers high floor, still water, late checkout when possible.' : i % 7 === 0 ? 'Allergic to shellfish.' : null,
        ).id,
      );
    });

    /* -------------------------------------------------------- reservations */
    const busy = new Map<number, [string, string][]>();
    const free = (roomId: number, a: string, b: string) => !(busy.get(roomId) ?? []).some(([x, y]) => x < b && y > a);
    const hold = (roomId: number, a: string, b: string) => busy.set(roomId, [...(busy.get(roomId) ?? []), [a, b]]);
    const sources = ['direct', 'website', 'ota', 'ota', 'corporate', 'walk_in'];

    function makeRes(guestId: number, room: (typeof rooms)[number] | null, typeCode: string, ci: string, co: string, status: string) {
      const rate = rateOf(typeCode) * (rnd() < 0.3 ? 0.9 : 1);
      const { id } = run(
        `INSERT INTO reservations (code, guest_id, room_id, room_type_id, check_in, check_out, adults, children, rate, status, source, created_at, checked_in_at, checked_out_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        makeCode('MR', 'reservations'),
        guestId,
        room?.id ?? null,
        typeId[typeCode],
        ci,
        co,
        int(1, 2),
        rnd() < 0.2 ? 1 : 0,
        round2(rate),
        status,
        pick(sources),
        stamp(addDays(ci, -int(3, 30)), '10:00'),
        status === 'checked_in' || status === 'checked_out' ? stamp(ci, '15:10') : null,
        status === 'checked_out' ? stamp(co, '11:20') : null,
      );
      if (room) hold(room.id, ci, co);
      return { id, rate: round2(rate) };
    }
    function postNights(resId: number, room: string, ci: string, co: string, rate: number) {
      for (let d = ci; d < co; d = addDays(d, 1)) run(`INSERT INTO folio_items (reservation_id, date, description, category, amount) VALUES (?, ?, ?, 'room', ?)`, resId, d, `Room ${room} — night of ${d}`, rate);
    }

    // past stays over the last 45 days
    for (let i = 0; i < 70; i++) {
      const room = pick(rooms);
      const ci = addDays(T, -int(3, 45));
      const co = addDays(ci, int(1, 4));
      if (co > T || !free(room.id, ci, co)) continue;
      const r = makeRes(pick(guests), room, room.type, ci, co, 'checked_out');
      postNights(r.id, room.number, ci, co, r.rate);
      if (rnd() < 0.5) run(`INSERT INTO folio_items (reservation_id, date, description, category, amount) VALUES (?, ?, 'Minibar', 'minibar', ?)`, r.id, ci, int(4, 18) * 10);
      const total = get<any>('SELECT SUM(amount) AS t FROM folio_items WHERE reservation_id = ?', r.id).t;
      run(`INSERT INTO payments (reservation_id, amount, method, created_at) VALUES (?, ?, ?, ?)`, r.id, total, pick(['momo', 'momo', 'card', 'card', 'transfer', 'cash']), stamp(co, '11:15'));
    }

    // in-house now: 13 rooms, a few departing today
    const inHouse: { resId: number; room: (typeof rooms)[number] }[] = [];
    const candidates = rooms.filter((r) => free(r.id, addDays(T, -3), addDays(T, 4)));
    for (let i = 0; i < 13 && i < candidates.length; i++) {
      const room = candidates[i * 2 % candidates.length];
      if (inHouse.some((x) => x.room.id === room.id)) continue;
      const ci = addDays(T, -int(1, 3));
      const co = i < 3 ? T : addDays(T, int(1, 4));
      if (!free(room.id, ci, co)) continue;
      const r = makeRes(guests[i], room, room.type, ci, co, 'checked_in');
      postNights(r.id, room.number, ci, co, r.rate);
      run(`UPDATE rooms SET status = 'occupied' WHERE id = ?`, room.id);
      if (i % 2 === 0) run(`INSERT INTO payments (reservation_id, amount, method, reference, created_at) VALUES (?, ?, 'card', 'Deposit', ?)`, r.id, r.rate, stamp(ci, '15:20'));
      inHouse.push({ resId: r.id, room });
    }

    // arrivals today + future bookings
    const vacant = rooms.filter((r) => !inHouse.some((x) => x.room.id === r.id));
    for (let i = 0; i < 5; i++) {
      const room = vacant[i * 3];
      if (room && free(room.id, T, addDays(T, 3))) makeRes(guests[15 + i], room, room.type, T, addDays(T, int(1, 3)), 'booked');
    }
    for (let i = 0; i < 26; i++) {
      const room = pick(rooms);
      const ci = addDays(T, int(1, 24));
      const co = addDays(ci, int(1, 5));
      if (free(room.id, ci, co)) makeRes(pick(guests), rnd() < 0.85 ? room : null, room.type, ci, co, 'booked');
    }
    makeRes(guests[22], null, 'TS', addDays(T, 2), addDays(T, 5), 'booked');
    makeRes(guests[23], null, 'CK', addDays(T, 1), addDays(T, 2), 'booked');
    for (let i = 0; i < 3; i++) {
      const ci = addDays(T, -int(2, 20));
      makeRes(pick(guests), null, pick(['CK', 'DT']), ci, addDays(ci, 2), pick(['cancelled', 'no_show']));
    }

    // room statuses for the vacant ones
    const vac = all<{ id: number }>(`SELECT id FROM rooms WHERE status != 'occupied'`);
    vac.forEach((r, i) => {
      const st = i % 6 === 0 ? 'vacant_dirty' : i % 11 === 5 ? 'out_of_order' : i % 4 === 0 ? 'inspected' : 'vacant_clean';
      run('UPDATE rooms SET status = ?, notes = ? WHERE id = ?', st, st === 'out_of_order' ? 'AC compressor replacement — engineer booked' : null, r.id);
    });

    /* --------------------------------------------------------------- staff */
    const staffList: [string, string, string][] = [
      ['Efua Asante', 'front_office', 'Front desk supervisor'],
      ['Kwabena Frimpong', 'front_office', 'Receptionist'],
      ['Esther Adomako', 'front_office', 'Night auditor'],
      ['Mercy Tetteh', 'housekeeping', 'Executive housekeeper'],
      ['Gifty Ansah', 'housekeeping', 'Room attendant'],
      ['Comfort Nyarko', 'housekeeping', 'Room attendant'],
      ['Ebo Taylor', 'housekeeping', 'Houseman'],
      ['Kojo Owusu', 'restaurant', 'Restaurant manager'],
      ['Ama Serwaa', 'restaurant', 'Senior server'],
      ['Josephine Addo', 'restaurant', 'Server'],
      ['Emmanuel Tagoe', 'restaurant', 'Server'],
      ['Chef Kwesi Ampofo', 'kitchen', 'Head chef'],
      ['Rashid Alhassan', 'kitchen', 'Sous chef'],
      ['Patience Acheampong', 'kitchen', 'Line cook'],
      ['Akua Darko', 'rooftop', 'Bar manager'],
      ['DJ Kobby Ntim', 'rooftop', 'Resident DJ'],
      ['Nii Okai', 'rooftop', 'Mixologist'],
      ['Precious Amankwah', 'rooftop', 'Pool attendant'],
      ['Nana Ama Ofori', 'events', 'Events manager'],
      ['Samuel Quartey', 'events', 'Events coordinator'],
      ['Ibrahim Mahama', 'maintenance', 'Chief engineer'],
      ['Joseph Asamoah', 'security', 'Head of security'],
      ['Kwaku Boateng', 'management', 'General manager'],
      ['Lydia Ocran', 'restaurant', 'Hostess'],
    ];
    const staffIds: { id: number; dept: string }[] = [];
    staffList.forEach(([n, d, p], i) => {
      staffIds.push({
        id: run(
          'INSERT INTO staff (name, department, position, phone, email, status, hired_on) VALUES (?, ?, ?, ?, ?, ?, ?)',
          n,
          d,
          p,
          `+233 ${pick(['24', '20', '54'])} ${int(100, 999)} ${int(1000, 9999)}`,
          `${n.split(' ')[0].toLowerCase()}@themarlowe.com.gh`,
          i === 10 ? 'leave' : 'active',
          addDays(T, -int(60, 1400)),
        ).id,
        dept: d,
      });
    });
    const monday = (() => {
      const [y, m, d] = T.split('-').map(Number);
      const dt = new Date(y, m - 1, d);
      return addDays(T, -((dt.getDay() + 6) % 7));
    })();
    const patterns: Record<string, [string, string][]> = {
      front_office: [['07:00', '15:00'], ['15:00', '23:00'], ['23:00', '07:00']],
      housekeeping: [['08:00', '16:00']],
      restaurant: [['11:00', '19:00'], ['16:00', '23:30']],
      kitchen: [['07:00', '15:00'], ['14:00', '23:00']],
      rooftop: [['12:00', '20:00'], ['20:00', '03:00']],
      events: [['09:00', '17:00']],
      maintenance: [['08:00', '17:00']],
      security: [['18:00', '06:00']],
      management: [['09:00', '18:00']],
    };
    staffIds.forEach(({ id, dept }, idx) => {
      if (idx === 10) return;
      for (let d = 0; d < 7; d++) {
        if ((d + idx) % 7 === 5 || (d + idx) % 7 === 6) continue; // two days off
        const [a, b] = patterns[dept][(idx + d) % patterns[dept].length];
        run('INSERT INTO shifts (staff_id, date, start_time, end_time, department) VALUES (?, ?, ?, ?, ?)', id, addDays(monday, d), a, b, dept);
      }
    });

    /* ----------------------------------------------------------- housekeeping */
    const hk = staffIds.filter((x) => x.dept === 'housekeeping').map((x) => x.id);
    for (const r of all<any>(`SELECT id, number FROM rooms WHERE status = 'vacant_dirty'`)) run(`INSERT INTO housekeeping_tasks (room_id, type, priority, assigned_to, notes) VALUES (?, 'clean', 'high', ?, 'Departure clean')`, r.id, pick(hk));
    for (const r of all<any>(`SELECT id FROM rooms WHERE status = 'out_of_order'`)) run(`INSERT INTO housekeeping_tasks (room_id, type, priority, status, notes) VALUES (?, 'maintenance', 'high', 'in_progress', 'AC not cooling — compressor')`, r.id);
    inHouse.slice(0, 4).forEach((x, i) => run(`INSERT INTO housekeeping_tasks (room_id, type, priority, assigned_to, status) VALUES (?, ?, 'normal', ?, ?)`, x.room.id, i % 2 ? 'turndown' : 'clean', pick(hk), i === 0 ? 'in_progress' : 'open'));

    /* ------------------------------------------------------------------ menus */
    const menu: Record<string, [string, [string, string, number, string][]][]> = {
      restaurant: [
        ['Small plates', [
          ['Kelewele', 'Spiced ripe plantain, roasted groundnuts', 65, 'kitchen'],
          ['Chichinga beef skewers', 'Suya pepper, charred onion', 85, 'kitchen'],
          ['Spiced gizzard', 'Sweet peppers, shito glaze', 70, 'kitchen'],
          ['Tatale', 'Ripe plantain pancakes, garden egg relish', 60, 'kitchen'],
          ['Crab & coconut fritters', 'Lime & scotch bonnet mayo', 90, 'kitchen'],
        ]],
        ['From the fire', [
          ['Grilled tilapia & banku', 'Whole Volta tilapia, shito, pepper & onion', 180, 'kitchen'],
          ['Ribeye 300g', 'Dawadawa butter, grilled plantain', 420, 'kitchen'],
          ['Chicken khebab platter', 'Half chicken, suya spice, jollof', 150, 'kitchen'],
          ['Grilled lobster tail', 'Garlic, chilli, lime butter', 380, 'kitchen'],
          ['Lamb chops', 'Mint yoghurt, charred aubergine', 320, 'kitchen'],
        ]],
        ['Mains', [
          ['Smoky jollof & grilled chicken', 'With shito and fried plantain', 140, 'kitchen'],
          ['Waakye, full plate', 'Gari, spaghetti, egg, fish, wele, shito', 120, 'kitchen'],
          ['Fufu & light soup', 'Goat meat, garden eggs', 160, 'kitchen'],
          ['Red red', 'Black-eyed bean stew, fried plantain, gari', 95, 'kitchen'],
          ['Omo tuo & groundnut soup', 'Rice balls, chicken', 150, 'kitchen'],
        ]],
        ['Desserts', [
          ['Bofrot & salted caramel', 'Vanilla ice cream', 55, 'kitchen'],
          ['Ghana cocoa fondant', 'Sobolo sorbet', 75, 'kitchen'],
          ['Coconut panna cotta', 'Pineapple, lime', 60, 'kitchen'],
        ]],
        ['Drinks', [
          ['Sobolo', 'Hibiscus, ginger, pineapple', 35, 'bar'],
          ['Asaana', 'Caramelised corn drink', 35, 'bar'],
          ['Fresh coconut', '', 30, 'bar'],
          ['Voltic still water 75cl', '', 20, 'bar'],
          ['Glass of house red', 'Malbec, Mendoza', 90, 'bar'],
          ['Espresso', 'Single-origin, roasted in Accra', 35, 'bar'],
        ]],
      ],
      rooftop: [
        ['Signature cocktails', [
          ['Skydeck Spritz', 'Aperol, sobolo, prosecco', 120, 'bar'],
          ['Accra Mule', 'Vodka, fresh ginger, lime', 110, 'bar'],
          ['Smoked Old Fashioned', 'Bourbon, palm sugar, bitters', 140, 'bar'],
          ['Passion Mojito', 'Rum, passion fruit, mint', 110, 'bar'],
          ['Negroni Bianco', 'Gin, bianco vermouth, suze', 130, 'bar'],
        ]],
        ['Bottles', [
          ['Moët & Chandon Brut', '75cl', 2400, 'bar'],
          ['Hennessy VSOP', '70cl', 2900, 'bar'],
          ['Don Julio Blanco', '70cl', 2600, 'bar'],
          ['Belvedere', '70cl', 1800, 'bar'],
        ]],
        ['Beer & soft', [
          ['Club lager', '', 40, 'bar'],
          ['Guinness', '', 45, 'bar'],
          ['Mocktail of the day', 'Ask your server', 70, 'bar'],
          ['Malta Guinness', '', 30, 'bar'],
          ['Sparkling water', '', 35, 'bar'],
        ]],
        ['Pool bites', [
          ['Khebab platter', 'Beef, chicken, onions, suya pepper', 160, 'kitchen'],
          ['Loaded fries', 'Cheese, jalapeño, shito mayo', 85, 'kitchen'],
          ['Chicken wings', 'Honey-pepper glaze', 110, 'kitchen'],
          ['Fruit platter', 'Pineapple, pawpaw, watermelon', 90, 'kitchen'],
        ]],
      ],
    };
    // sample food & drink photography (Unsplash licence) — replace per dish in the Menu screen
    const dishPhotos: Record<string, string> = {
      'Kelewele': 'https://images.unsplash.com/photo-1563336522-c3bd728d3b45',
      'Chichinga beef skewers': 'https://images.unsplash.com/photo-1534939561126-855b8675edd7',
      'Spiced gizzard': 'https://images.unsplash.com/photo-1600555379765-f82335a7b1b0',
      'Tatale': 'https://images.unsplash.com/photo-1577835371994-379cc06f1fe5',
      'Crab & coconut fritters': 'https://images.unsplash.com/photo-1593252719532-53f183016149',
      'Grilled tilapia & banku': 'https://images.unsplash.com/photo-1600175074394-f2f4c500f7ea',
      'Ribeye 300g': 'https://images.unsplash.com/photo-1600891964092-4316c288032e',
      'Chicken khebab platter': 'https://images.unsplash.com/photo-1603496987674-79600a000f55',
      'Grilled lobster tail': 'https://images.unsplash.com/photo-1775204109618-3fd68eb8f2a6',
      'Lamb chops': 'https://images.unsplash.com/photo-1766589152455-22eb3ab8849e',
      'Smoky jollof & grilled chicken': 'https://images.unsplash.com/photo-1665332195309-9d75071138f0',
      'Waakye, full plate': 'https://images.unsplash.com/photo-1604329756574-bda1f2cada6f',
      'Fufu & light soup': 'https://images.unsplash.com/photo-1608500218861-01091cdc501e',
      'Red red': 'https://images.unsplash.com/photo-1665334217407-6688e6941a47',
      'Omo tuo & groundnut soup': 'https://images.unsplash.com/photo-1664993101841-036f189719b6',
      'Bofrot & salted caramel': 'https://images.unsplash.com/photo-1665833613236-7c1d087463b1',
      'Ghana cocoa fondant': 'https://images.unsplash.com/photo-1638518963806-4d27451f3fa2',
      'Coconut panna cotta': 'https://images.unsplash.com/photo-1511911063855-2bf39afa5b2e',
      'Sobolo': 'https://images.unsplash.com/photo-1593624191635-f1a49f5eca76',
      'Asaana': 'https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b',
      'Glass of house red': 'https://images.unsplash.com/photo-1635045180768-332216aac26c',
      'Skydeck Spritz': 'https://images.unsplash.com/photo-1570598912132-0ba1dc952b7d',
      'Accra Mule': 'https://images.unsplash.com/photo-1609951651556-5334e2706168',
      'Smoked Old Fashioned': 'https://images.unsplash.com/photo-1470337458703-46ad1756a187',
      'Passion Mojito': 'https://images.unsplash.com/photo-1587223962930-cb7f31384c19',
      'Negroni Bianco': 'https://images.unsplash.com/photo-1500217052183-bc01eee1a74e',
      'Moët & Chandon Brut': 'https://images.unsplash.com/photo-1643618829236-a23857519fb6',
      'Hennessy VSOP': 'https://images.unsplash.com/photo-1613477581402-306fa9dc6b95',
      'Don Julio Blanco': 'https://images.unsplash.com/photo-1556855810-ac404aa91e85',
      'Mocktail of the day': 'https://images.unsplash.com/photo-1563223771-5fe4038fbfc9',
      'Khebab platter': 'https://images.unsplash.com/photo-1664992960082-0ea299a9c53e',
      'Loaded fries': 'https://images.unsplash.com/photo-1639744210631-209fce3e256c',
      'Chicken wings': 'https://images.unsplash.com/photo-1567620832903-9fc6debc209f',
      'Fruit platter': 'https://images.unsplash.com/photo-1523033904333-243d0283acae',
    };
    const menuIds: Record<string, { id: number; price: number; name: string; station: string }[]> = { restaurant: [], rooftop: [] };
    for (const [outlet, cats] of Object.entries(menu)) {
      cats.forEach(([cat, items], ci) => {
        const catId = run('INSERT INTO menu_categories (outlet, name, sort) VALUES (?, ?, ?)', outlet, cat, ci).id;
        for (const [n, d, p, st] of items) {
          const id = run('INSERT INTO menu_items (category_id, outlet, name, description, price, station, available, image_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', catId, outlet, n, d || null, p, st, n === 'Lamb chops' ? 0 : 1, dishPhotos[n] ?? null).id;
          menuIds[outlet].push({ id, price: p, name: n, station: st });
        }
      });
    }

    /* ----------------------------------------------------------------- tables */
    const rTables: [string, number, string, number, number, string][] = [
      ['1', 2, 'Window', 40, 50, 'round'], ['2', 2, 'Window', 140, 50, 'round'], ['3', 4, 'Window', 240, 42, 'square'], ['4', 4, 'Window', 360, 42, 'square'],
      ['5', 6, 'Main room', 40, 200, 'long'], ['6', 4, 'Main room', 200, 196, 'square'], ['7', 4, 'Main room', 320, 196, 'square'], ['8', 2, 'Main room', 440, 204, 'round'],
      ['9', 8, 'Main room', 40, 330, 'long'], ['10', 4, 'Main room', 240, 330, 'round'],
      ['P1', 10, 'Private room', 620, 60, 'long'], ['B1', 2, 'Bar counter', 620, 250, 'round'], ['B2', 2, 'Bar counter', 710, 250, 'round'],
      ['T1', 4, 'Terrace', 600, 400, 'square'], ['T2', 4, 'Terrace', 720, 400, 'square'],
    ];
    const kTables: [string, number, string, number, number, string][] = [
      ['V1', 8, 'VIP booths', 40, 60, 'long'], ['V2', 8, 'VIP booths', 240, 60, 'long'], ['V3', 6, 'VIP booths', 440, 60, 'long'],
      ['H1', 4, 'High tops', 60, 230, 'round'], ['H2', 4, 'High tops', 180, 230, 'round'], ['H3', 4, 'High tops', 300, 230, 'round'], ['H4', 4, 'High tops', 420, 230, 'round'],
      ['L1', 4, 'Pool lounge', 600, 220, 'square'], ['L2', 4, 'Pool lounge', 720, 220, 'square'], ['L3', 6, 'Pool lounge', 620, 380, 'long'],
    ];
    const tableIds: Record<string, number[]> = { restaurant: [], rooftop: [] };
    for (const [outlet, list] of [['restaurant', rTables], ['rooftop', kTables]] as const) {
      for (const [l, seats, zone, x, y, shape] of list) tableIds[outlet].push(run('INSERT INTO dining_tables (outlet, label, seats, zone, x, y, shape) VALUES (?, ?, ?, ?, ?, ?, ?)', outlet, l, seats, zone, x, y, shape).id);
    }

    /* ------------------------------------------------------ historic orders */
    function order(outlet: string, date: string, time: string, opts: { table?: number | null; status: string; method?: string; resId?: number | null; items: number; name?: string; fired?: boolean }) {
      const opened = stamp(date, time);
      const { id } = run(
        `INSERT INTO orders (code, outlet, table_id, guest_name, reservation_id, covers, status, payment_method, opened_by, created_at, closed_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        makeCode(outlet === 'rooftop' ? 'SK' : 'ES', 'orders'),
        outlet,
        opts.table ?? null,
        opts.name ?? null,
        opts.resId ?? null,
        int(1, 5),
        opts.status,
        opts.method ?? null,
        uid[outlet === 'rooftop' ? 'bar' : 'restaurant'],
        opened,
        opts.status === 'open' ? null : stamp(date, addMinutes(time, int(45, 110))),
      );
      for (let i = 0; i < opts.items; i++) {
        const m = pick(menuIds[outlet]);
        const st = opts.status === 'open' ? (opts.fired ? (i === 0 ? 'ready' : 'fired') : 'pending') : 'served';
        run(
          `INSERT INTO order_items (order_id, menu_item_id, name, qty, unit_price, station, status, fired_at, notes) VALUES (?,?,?,?,?,?,?,?,?)`,
          id,
          m.id,
          m.name,
          int(1, 3),
          m.price,
          m.station,
          st,
          st === 'pending' ? null : opened,
          i === 1 && rnd() < 0.3 ? pick(['No onions', 'Extra spicy', 'Allergy: nuts', 'Medium rare']) : null,
        );
      }
      recalc(id);
      const o = get<any>('SELECT * FROM orders WHERE id = ?', id);
      if (opts.status === 'paid') run('INSERT INTO payments (order_id, amount, method, created_at) VALUES (?, ?, ?, ?)', id, o.total, opts.method, o.closed_at);
      if (opts.status === 'charged' && opts.resId) {
        run(`INSERT INTO folio_items (reservation_id, date, description, category, amount, source_ref) VALUES (?, ?, ?, ?, ?, ?)`, opts.resId, date, `${outlet === 'rooftop' ? 'Skydeck bar' : 'Ember & Salt'} · check ${o.code}`, outlet === 'rooftop' ? 'bar' : 'restaurant', o.total, o.code);
      }
      return id;
    }
    for (let d = 45; d >= 1; d--) {
      const date = addDays(T, -d);
      for (let i = 0; i < int(6, 13); i++) order('restaurant', date, pick(['12:30', '13:15', '19:00', '19:45', '20:30']), { table: pick(tableIds.restaurant), status: 'paid', method: pick(['momo', 'momo', 'card', 'cash', 'transfer']), items: int(2, 6) });
      for (let i = 0; i < int(5, 14); i++) order('rooftop', date, pick(['16:00', '18:30', '21:00', '22:30', '23:15']), { table: pick(tableIds.rooftop), status: 'paid', method: pick(['momo', 'card', 'card', 'transfer']), items: int(1, 5) });
    }
    // today: some settled, some charged to rooms, a few live checks on the floor and on the pass
    for (let i = 0; i < 4; i++) order('restaurant', T, '08:30', { table: pick(tableIds.restaurant), status: 'paid', method: 'card', items: int(2, 4) });
    inHouse.slice(3, 7).forEach((x) => order('restaurant', T, '09:00', { status: 'charged', method: 'room', resId: x.resId, items: 2, name: `Room ${x.room.number}` }));
    inHouse.slice(7, 9).forEach((x) => order('rooftop', addDays(T, -1), '21:00', { status: 'charged', method: 'room', resId: x.resId, items: 3, name: `Room ${x.room.number}` }));
    [0, 2, 5, 9].forEach((ti, k) => {
      order('restaurant', T, k < 2 ? '12:05' : '12:40', { table: tableIds.restaurant[ti], status: 'open', items: int(2, 4), fired: k !== 3 });
      run(`UPDATE dining_tables SET status = 'seated' WHERE id = ?`, tableIds.restaurant[ti]);
    });
    run(`UPDATE dining_tables SET status = 'dirty' WHERE id = ?`, tableIds.restaurant[7]);
    [3, 7].forEach((ti) => {
      order('rooftop', T, '13:30', { table: tableIds.rooftop[ti], status: 'open', items: int(2, 3), fired: true });
      run(`UPDATE dining_tables SET status = 'seated' WHERE id = ?`, tableIds.rooftop[ti]);
    });
    order('rooftop', T, '14:00', { status: 'open', items: 2, name: 'Ama — pink swimsuit', fired: true });

    /* -------------------------------------------------------- table bookings */
    const bookNames = ['Adjei party', 'Mrs. Quaye', 'Kofi Boateng', 'The Harrisons', 'Dr. Agyeman', 'Selasi & Edem', 'Mr. Chen', 'Akosua birthday'];
    bookNames.forEach((n, i) => {
      run(
        `INSERT INTO table_bookings (outlet, guest_name, phone, party_size, date, time, table_id, status, source, notes) VALUES ('restaurant', ?, ?, ?, ?, ?, ?, 'booked', ?, ?)`,
        n,
        `+233 ${pick(['24', '20', '54', '55', '27'])} ${int(100, 999)} ${int(1000, 9999)}`,
        [2, 4, 2, 6, 2, 2, 4, 8][i],
        i < 5 ? T : addDays(T, 1),
        ['18:30', '19:00', '19:30', '20:00', '20:30', '19:00', '20:00', '19:30'][i],
        i === 3 ? tableIds.restaurant[4] : i === 7 ? tableIds.restaurant[8] : i % 2 ? tableIds.restaurant[i] : null,
        i % 3 ? 'staff' : 'web',
        i === 7 ? 'Birthday — cake from pastry at 21:00' : null,
      );
    });

    /* ------------------------------------------------------------- rooftop */
    const res: { id: number; label: string; price: number; cap: number }[] = [];
    for (const [kind, label, cap, price] of [
      ['cabana', 'Cabana 1', 6, 1500], ['cabana', 'Cabana 2', 6, 1500], ['cabana', 'Cabana 3', 8, 1800], ['cabana', 'Sky Cabana', 10, 3000],
      ['daybed', 'Daybed A', 2, 500], ['daybed', 'Daybed B', 2, 500], ['daybed', 'Daybed C', 2, 500], ['daybed', 'Daybed D', 2, 500], ['daybed', 'Daybed E', 3, 600],
      ['vip_table', 'VIP Table 1', 8, 3500], ['vip_table', 'VIP Table 2', 8, 3500], ['vip_table', 'DJ-side Table', 10, 5000],
    ] as const) res.push({ id: run(`INSERT INTO resources (venue, kind, label, capacity, price) VALUES ('rooftop', ?, ?, ?, ?)`, kind, label, cap, price).id, label, price, cap });
    for (let d = 30; d >= 0; d--) {
      const date = addDays(T, -d);
      for (const r of res.slice(0, 9)) {
        if (rnd() < 0.45) {
          run(
            `INSERT INTO resource_bookings (resource_id, guest_name, date, start_time, end_time, pax, price, status, settlement) VALUES (?, ?, ?, '10:00', '18:00', ?, ?, ?, ?)`,
            r.id,
            `${pick(first)} ${pick(last)}`,
            date,
            Math.min(r.cap, int(2, 6)),
            r.price,
            d === 0 ? pick(['booked', 'arrived']) : 'completed',
            d === 0 ? pick(['unpaid', 'paid']) : 'paid',
          );
        }
      }
    }
    const firstInHouse = inHouse[0];
    if (firstInHouse && !get(`SELECT 1 FROM resource_bookings WHERE resource_id = ? AND date = ?`, res[3].id, T)) {
      const rbId = run(
        `INSERT INTO resource_bookings (resource_id, guest_name, reservation_id, date, start_time, end_time, pax, price, status, settlement) VALUES (?, ?, ?, ?, '11:00', '19:00', 6, ?, 'arrived', 'room')`,
        res[3].id,
        get<any>(`SELECT g.first_name || ' ' || g.last_name AS n FROM reservations x JOIN guests g ON g.id = x.guest_id WHERE x.id = ?`, firstInHouse.resId).n,
        firstInHouse.resId,
        T,
        res[3].price,
      ).id;
      run(`INSERT INTO folio_items (reservation_id, date, description, category, amount, source_ref) VALUES (?, ?, 'Skydeck Sky Cabana', 'pool', ?, ?)`, firstInHouse.resId, T, res[3].price, `RB-${rbId}`);
    }

    const nightsList: [number, string, string, number, number][] = [
      [-28, 'Afrobeats Sundowner', 'DJ Kobby Ntim', 150, 180], [-21, 'Highlife Revival', 'The Skydeck Band', 120, 160], [-14, 'Azonto & Amapiano', 'DJ Kobby Ntim', 150, 180],
      [-7, 'Asakaa Night', 'DJ Nii Okai', 150, 180], [0, 'Skydeck Fridays: Afro House', 'DJ Kobby Ntim', 200, 200],
      [7, 'Neo-Soul Sessions', 'Efya & Friends Tribute', 150, 150], [14, 'Highlife Revival', 'The Skydeck Band', 120, 160], [21, 'White Party', 'Guest DJ (TBA)', 300, 220],
    ];
    for (const [off, title, dj, cover, cap] of nightsList) {
      const date = addDays(T, off);
      const nid = run('INSERT INTO club_nights (title, date, dj, cover_charge, capacity, status) VALUES (?, ?, ?, ?, ?, ?)', title, date, dj, cover, cap, off < 0 ? 'closed' : 'scheduled').id;
      const count = off < 0 ? int(35, 60) : off === 0 ? 24 : int(5, 14);
      for (let i = 0; i < count; i++) {
        const type = i % 9 === 0 ? 'vip' : i % 7 === 0 ? 'table' : 'guestlist';
        const inside = off < 0 && rnd() < 0.85 ? 1 : 0;
        run(
          'INSERT INTO guest_list (night_id, name, pax, type, checked_in, checked_in_at, cover_paid) VALUES (?, ?, ?, ?, ?, ?, ?)',
          nid,
          `${pick(first)} ${pick(last)}`,
          int(1, 4),
          type,
          inside,
          inside ? stamp(date, '22:30') : null,
          inside && type === 'guestlist' ? 1 : 0,
        );
      }
    }

    /* ------------------------------------------------------------------ events */
    const evs: [number, string, string, string, string, number, string, [string, number, number][], number][] = [
      [-12, 'Mensah–Owusu wedding reception', 'Mrs. Abena Mensah', 'wedding', 'garden', 320, 'completed', [['Venue hire — Garden lawn', 1, 25000], ['Buffet, three courses', 320, 280], ['Décor & floral', 1, 15000], ['Sound, stage & lighting', 1, 8000]], 1],
      [-5, 'Q3 leadership offsite', 'Volta Capital — HR', 'corporate', 'pavilion', 60, 'completed', [['Pavilion hire (full day)', 1, 9000], ['Day delegate rate', 60, 220], ['AV package', 1, 3000]], 1],
      [3, 'Kojo at 30', 'Kojo Annan', 'birthday', 'rooftop', 90, 'confirmed', [['Skydeck buy-out (evening)', 1, 30000], ['Canapés & small chops', 90, 150], ['DJ set', 1, 4000]], 0.5],
      [9, 'Asante–Boateng traditional marriage', 'Opanyin Kwasi Asante', 'wedding', 'garden', 450, 'confirmed', [['Venue hire — Garden lawn', 1, 25000], ['Buffet, three courses', 450, 280], ['Décor & kente styling', 1, 20000], ['Security & ushers', 1, 5000], ['Sound, stage & lighting', 1, 8000]], 0.5],
      [9, 'Product launch — Lumen', 'Lumen Ghana', 'corporate', 'garden', 200, 'tentative', [['Venue hire — Garden lawn', 1, 25000], ['Cocktail reception', 200, 180]], 0],
      [16, 'Adjei outdooring', 'Mr. Kwabena Adjei', 'naming', 'pavilion', 120, 'tentative', [['Pavilion hire', 1, 9000], ['Buffet lunch', 120, 220]], 0.3],
      [24, 'Charity gala dinner', 'Hope Foundation Ghana', 'corporate', 'garden', 280, 'inquiry', [['Venue hire — Garden lawn', 1, 25000], ['Plated dinner, four courses', 280, 420]], 0],
      [31, 'Book club brunch', 'Ms. Esi Tetteh', 'birthday', 'restaurant_private', 18, 'inquiry', [], 0],
      [45, 'Lamptey–Laurent wedding', 'Pierre Laurent', 'wedding', 'garden', 250, 'inquiry', [['Venue hire — Garden lawn', 1, 25000], ['Buffet, three courses', 250, 280]], 0],
      [60, 'Highlife live — summer concert', 'Osu Sound Promotions', 'concert', 'garden', 800, 'inquiry', [], 0],
    ];
    for (const [off, title, client, type, venue, guestsN, status, lines, paidShare] of evs) {
      const date = addDays(T, off);
      const eid = run(
        `INSERT INTO events (code, title, client_name, client_phone, client_email, event_type, venue, date, start_time, end_time, guests, status, created_at, notes)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        makeCode('EV', 'events'),
        title,
        client,
        `+233 ${pick(['24', '20', '54', '55', '27'])} ${int(100, 999)} ${int(1000, 9999)}`,
        `${client.split(' ').slice(-1)[0].toLowerCase().replace(/[^a-z]/g, '')}@mail.test`,
        type,
        venue,
        date,
        type === 'corporate' ? '09:00' : '15:00',
        type === 'corporate' ? '17:00' : '23:00',
        guestsN,
        status,
        stamp(addDays(date, -int(40, 90)), '11:00'),
        type === 'wedding' ? 'Colours: kente gold & ivory. Highlife band during dinner.' : null,
      ).id;
      let total = 0;
      for (const [d, q, u] of lines) {
        run('INSERT INTO event_items (event_id, description, qty, unit_price) VALUES (?, ?, ?, ?)', eid, d, q, u);
        total += q * u;
      }
      if (paidShare > 0 && total > 0) {
        const payDate = addDays(date, off < 0 ? -30 : -Math.min(20, off + 10));
        run(`INSERT INTO payments (event_id, amount, method, reference, created_at) VALUES (?, ?, 'transfer', 'Deposit', ?)`, eid, round2(total * Math.min(paidShare, 0.5)), stamp(payDate < addDays(T, -44) ? addDays(T, -20) : payDate > T ? T : payDate, '10:00'));
        if (paidShare === 1) run(`INSERT INTO payments (event_id, amount, method, reference, created_at) VALUES (?, ?, 'transfer', 'Balance', ?)`, eid, round2(total * 0.5), stamp(addDays(date, -2), '10:00'));
      }
      const tasks: [string, number][] = [['Site visit with client', -45], ['Send quote & terms', -40], ['Collect 50% deposit', -30], ['Menu tasting', -21], ['Confirm final headcount', -7], ['Brief vendors & security', -3], ['Set-up, sound & light check', 0]];
      for (const [t, o] of tasks) run('INSERT INTO event_tasks (event_id, title, due_date, done) VALUES (?, ?, ?, ?)', eid, t, addDays(date, o), addDays(date, o) < T || status === 'completed' ? 1 : 0);
    }

    /* --------------------------------------------------------------- inventory */
    const inv: [string, string, string, number, number, number, string][] = [
      ['Jasmine rice (Gino)', 'kitchen', 'kg', 42, 25, 28, 'Makola Wholesale'],
      ['Local rice (Aveyime)', 'kitchen', 'kg', 18, 30, 22, 'Makola Wholesale'],
      ['Beef (ribeye)', 'kitchen', 'kg', 9, 12, 190, 'Accra Prime Meats'],
      ['Chicken (whole)', 'kitchen', 'pcs', 36, 20, 85, 'Darko Farms'],
      ['Tilapia (Volta)', 'kitchen', 'pcs', 6, 10, 55, 'Tema Fishing Harbour'],
      ['Lobster tails', 'kitchen', 'kg', 4, 6, 420, 'Tema Fishing Harbour'],
      ['Plantain', 'kitchen', 'bunch', 14, 8, 45, 'Kaneshie Market'],
      ['Kpakpo shito (peppers)', 'kitchen', 'kg', 5, 3, 30, 'Kaneshie Market'],
      ['Frytol vegetable oil', 'kitchen', 'L', 24, 20, 32, 'Makola Wholesale'],
      ['Tomatoes', 'kitchen', 'crate', 3, 4, 350, 'Kaneshie Market'],
      ['Moët & Chandon Brut', 'bar', 'btl', 14, 12, 1300, 'Kasapreko Distribution'],
      ['Hennessy VSOP', 'bar', 'btl', 5, 6, 1650, 'Kasapreko Distribution'],
      ['Don Julio Blanco', 'bar', 'btl', 7, 4, 1450, 'Kasapreko Distribution'],
      ['Belvedere vodka', 'bar', 'btl', 9, 6, 980, 'Kasapreko Distribution'],
      ['Aperol', 'bar', 'btl', 3, 5, 320, 'Kasapreko Distribution'],
      ['Club lager (crate)', 'bar', 'crate', 11, 8, 280, 'Accra Brewery'],
      ['Guinness (crate)', 'bar', 'crate', 6, 6, 310, 'Guinness Ghana'],
      ['Ginger beer', 'bar', 'can', 80, 48, 12, 'Kasapreko Distribution'],
      ['Limes', 'bar', 'kg', 2, 5, 25, 'Kaneshie Market'],
      ['Ice (bags)', 'bar', 'bag', 30, 40, 15, 'Polar Ice Accra'],
      ['Bath towels', 'housekeeping', 'pcs', 180, 120, 110, 'Linen House GH'],
      ['Pool towels', 'housekeeping', 'pcs', 60, 80, 95, 'Linen House GH'],
      ['King bedsheet sets', 'housekeeping', 'set', 70, 60, 320, 'Linen House GH'],
      ['Shea shampoo 30ml', 'housekeeping', 'pcs', 340, 200, 6, 'Amenity Supplies GH'],
      ['Toilet rolls', 'housekeeping', 'pcs', 150, 200, 4, 'Makola Wholesale'],
      ['Voltic water 50cl', 'housekeeping', 'pcs', 400, 300, 3, 'Voltic Ghana'],
      ['LED bulbs', 'maintenance', 'pcs', 45, 30, 25, 'Electroland Ghana'],
      ['AC filters', 'maintenance', 'pcs', 6, 10, 65, 'CoolAir Services'],
      ['Chlorine (pool)', 'maintenance', 'kg', 25, 20, 55, 'PoolCare GH'],
      ['Diesel (generator)', 'maintenance', 'L', 900, 1500, 16, 'GOIL'],
    ];
    inv.forEach(([n, store, unit, qty, par, cost, sup], i) => {
      const id = run('INSERT INTO inventory_items (name, sku, store, unit, qty, par_level, cost, supplier) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', n, `${store.slice(0, 3).toUpperCase()}-${String(i + 101)}`, store, unit, qty, par, cost, sup).id;
      run(`INSERT INTO stock_movements (item_id, change, reason, note, user_id, created_at) VALUES (?, ?, 'purchase', 'Weekly delivery', ?, ?)`, id, Math.ceil(par * 1.2), uid.accounts, stamp(addDays(T, -6), '09:00'));
      run(`INSERT INTO stock_movements (item_id, change, reason, note, user_id, created_at) VALUES (?, ?, 'usage', 'Issued to outlet', ?, ?)`, id, -Math.ceil(par * 0.6), uid.manager, stamp(addDays(T, -2), '17:00'));
    });

    /* ---------------------------------------------------------------- activity */
    const acts: [string, string, string, string][] = [
      ['frontdesk', 'hotel', 'Early check-in approved for room 204', '07:40'],
      ['housekeeping', 'hotel', 'Room 105 clean completed', '08:10'],
      ['restaurant', 'restaurant', "Lamb chops 86'd — supplier delay", '10:05'],
      ['events', 'events', 'Deposit received for Asante–Boateng marriage', '10:30'],
      ['bar', 'rooftop', 'Sky Cabana booked for in-house guest', '11:00'],
      ['accounts', 'office', 'Aperol fell below par', '11:20'],
    ];
    for (const [u, v, a, t] of acts) run('INSERT INTO activity_log (user_id, action, venue, created_at) VALUES (?, ?, ?, ?)', uid[u === 'frontdesk' ? 'front_desk' : u] ?? null, a, v, stamp(T, t));
  });
}

function addMinutes(hhmm: string, m: number) {
  const [h, mi] = hhmm.split(':').map(Number);
  const t = Math.min(23 * 60 + 59, h * 60 + mi + m);
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

// `node src/seed.ts --reset` wipes and re-seeds.
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  migrate();
  if (process.argv.includes('--reset')) {
    db.exec('PRAGMA foreign_keys = OFF');
    for (const t of TABLES) db.exec(`DELETE FROM ${t}`);
    db.exec('PRAGMA foreign_keys = ON');
  }
  seed();
  console.log(`Seeded The Marlowe demo data. Sign in as admin@marlowe.test / marlowe123`);
}
