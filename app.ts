// Beer Book's data: every beer in SQLite (app:/data/beerbook.db), each photo a
// JPEG under app:/data/stickers beside its cut-out sticker, a PNG the Swift module
// (modules/apple/Stickers.swift) made. Nothing leaves the device.
import type { Answer, Database, Result, Sources, Storage } from './app.contract.d.ts';

const DB = 'app:/data/beerbook.db';
const STICKERS = 'app:/data/stickers';
// Where a cut-out waits while the Add sheet is open.
const CUTS = 'app:/tmp/cut';

export const grants = [
  `sqlite.open ${DB}`,
  `fs.read ${STICKERS}`,
  `fs.write ${STICKERS}`,
  'fs.read app:/tmp/picked',
  `fs.read ${CUTS}`,
].join('\n');

type Beer = Result<'beers'>[number];
type Review = Result<'review'>;
type Tally = Review['styles'][number];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const pad = (n: number) => String(n).padStart(2, '0');
const COLUMNS = 'id, name, brewery, style, container, rating, location, photo, drunk_at, day, sticker';

// One opener at a time: the web's SQLite holds the file exclusively while open, and the
// album, the years and the review are often asked for together.
let queue: Promise<unknown> = Promise.resolve();
function use<T>(storage: Storage, work: (db: Database) => Promise<T>): Promise<T> {
  const turn = queue.then(() => open(storage, work));
  queue = turn.catch(() => undefined);
  return turn;
}

async function open<T>(storage: Storage, work: (db: Database) => Promise<T>): Promise<T> {
  const db = await storage.sqlite.open(DB);
  try {
    await db.execute(`CREATE TABLE IF NOT EXISTS beers (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      brewery TEXT NOT NULL,
      style TEXT NOT NULL,
      container TEXT NOT NULL,
      rating INTEGER NOT NULL,
      location TEXT NOT NULL,
      photo TEXT NOT NULL,
      drunk_at INTEGER NOT NULL,
      day TEXT NOT NULL,
      sticker TEXT NOT NULL DEFAULT '')`);
    // A library from before cut-outs gains the column; its beers keep their framed photos.
    const columns = (await db.query('PRAGMA table_info(beers)')).rows.map((r) => String(r[1]));
    if (!columns.includes('sticker')) await db.execute("ALTER TABLE beers ADD COLUMN sticker TEXT NOT NULL DEFAULT ''");
    return await work(db);
  } finally {
    await db.close();
  }
}

// SQLite's INTEGERs arrive as bigints.
const beerOf = ([id, name, brewery, style, container, rating, location, photo, drunkAt, day, sticker]: unknown[]): Beer => ({
  id: String(id),
  name: String(name),
  brewery: String(brewery),
  style: String(style),
  container: String(container),
  rating: Number(rating),
  location: String(location),
  photo: String(photo),
  drunkAt: Number(drunkAt),
  day: String(day),
  sticker: String(sticker),
});

const all = async (db: Database, where = '', args: string[] = []): Promise<Beer[]> =>
  (await db.query(`SELECT ${COLUMNS} FROM beers ${where} ORDER BY drunk_at DESC, id DESC`, args)).rows.map(beerOf);

// Each count's fraction of the largest, for the view's bars.
const scaled = <T extends { count: number }>(xs: T[]): (T & { fraction: number })[] => {
  const top = Math.max(1, ...xs.map((x) => x.count));
  return xs.map((x) => ({ ...x, fraction: x.count / top }));
};

// The most frequent values first, ties by name; blanks are left out.
function tally(values: string[], limit: number): Tally[] {
  const counts = new Map<string, number>();
  for (const v of values) if (v.trim() !== '') counts.set(v, (counts.get(v) ?? 0) + 1);
  return scaled([...counts].map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, limit));
}

const ok = { ok: true, error: '' };

// The demo beers: each the sticker of the same number under assets/demo.
const DEMO = 'assets/demo/';
type DemoBeer = { name: string; brewery: string; style: string; container: string; location: string };
const DEMO_BEERS: DemoBeer[] = [
  { name: 'Atak Chmielu', brewery: 'Pinta', style: 'IPA', container: 'Bottle', location: 'Zakopane' },
  { name: 'Namysłów Pils', brewery: 'Browar Namysłów', style: 'Pilsner', container: 'Glass', location: 'Wrocław' },
  { name: 'Forest Grinch', brewery: 'Nepomucen', style: 'IPA', container: 'Can', location: 'Kraków' },
  { name: 'FEZ Jubilee Amber', brewery: 'FEZ', style: 'Amber', container: 'Glass', location: 'Szczyrk' },
  { name: 'Goose IPA', brewery: 'Goose Island', style: 'IPA', container: 'Glass', location: 'Warsaw' },
  { name: "Murphy's Irish Stout", brewery: "Murphy's", style: 'Stout', container: 'Glass', location: 'Kraków' },
  { name: 'Hazy Pale', brewery: 'Pinta', style: 'Pale Ale', container: 'Glass', location: 'Wrocław' },
  { name: 'Mountain Lager', brewery: 'Browar Rychtar', style: 'Lager', container: 'Glass', location: 'Wisła' },
  { name: 'Guinness Draught', brewery: 'Guinness', style: 'Stout', container: 'Glass', location: 'Dublin' },
  { name: 'Tatra Amber', brewery: 'Browar Zakopane', style: 'Amber', container: 'Glass', location: 'Zakopane' },
  { name: 'Estrella Damm', brewery: 'Damm', style: 'Lager', container: 'Glass', location: 'Barcelona' },
  { name: 'Kofola (Designated Driver)', brewery: 'Kofola', style: 'Other', container: 'Glass', location: 'Ostrava' },
  { name: 'Leffe Blonde', brewery: 'Abbaye de Leffe', style: 'Other', container: 'Glass', location: 'Brussels' },
  { name: 'Barrel Wheat', brewery: 'Barrel Brewing', style: 'Wheat', container: 'Glass', location: 'Gdańsk' },
  { name: 'Brackie Pils', brewery: 'Browar Zamkowy Cieszyn', style: 'Pilsner', container: 'Glass', location: 'Cieszyn' },
];
// Each drink: [which beer, days before today, hour, rating]. Busiest lately, a few days with
// two or three, and some spread back through the year for the review.
const DEMO_LOG: [number, number, number, number][] = [
  [8, 0, 18, 5], [12, 1, 20, 4], [2, 1, 21, 5], [13, 3, 17, 4], [6, 4, 19, 4], [11, 4, 13, 3],
  [0, 6, 20, 5], [14, 7, 18, 4], [5, 8, 21, 4], [4, 10, 19, 4], [1, 10, 21, 3], [3, 10, 22, 4],
  [9, 12, 16, 4], [7, 14, 18, 3], [10, 15, 19, 5], [12, 17, 20, 5], [2, 19, 18, 4], [8, 21, 21, 5],
  [13, 24, 17, 3], [0, 27, 20, 4], [6, 31, 19, 4], [14, 33, 18, 3], [5, 36, 20, 4], [10, 40, 19, 4],
  [4, 45, 21, 4], [1, 52, 18, 3], [3, 58, 19, 5], [9, 66, 17, 4], [7, 73, 20, 3], [11, 80, 14, 2],
  [12, 92, 21, 5], [8, 105, 20, 5], [2, 118, 19, 4], [10, 131, 18, 5], [0, 150, 20, 4], [13, 170, 17, 4],
  [6, 190, 19, 3], [5, 215, 21, 4], [14, 240, 18, 4], [4, 270, 20, 3], [1, 290, 19, 3],
];

const sources: Sources = {
  beers: (_args, _store, storage) => use(storage, (db) => all(db)),

  years: (_args, _store, storage) => use(storage, async (db) =>
    (await db.query("SELECT substr(day, 1, 4) AS y, COUNT(*) FROM beers GROUP BY y ORDER BY y DESC")).rows
      .map(([year, count]) => ({ year: Number(year), count: Number(count) }))),

  review: ([year], _store, storage) => use(storage, async (db): Promise<Review> => {
    const beers = await all(db, 'WHERE substr(day, 1, 4) = ?', [String(year)]);
    const rated = beers.filter((b) => b.rating > 0);
    const months = scaled(MONTHS.map((label, i) => ({
      month: i + 1,
      label,
      count: beers.filter((b) => Number(b.day.slice(5, 7)) === i + 1).length,
    })));
    const busiest = months.reduce((best, m) => (m.count > best.count ? m : best), months[0]);
    return {
      year,
      total: beers.length,
      days: new Set(beers.map((b) => b.day)).size,
      rated: rated.length,
      average: rated.length ? Math.round((rated.reduce((s, b) => s + b.rating, 0) / rated.length) * 10) / 10 : 0,
      months,
      busiest: busiest.count > 0 ? busiest.label : '',
      styles: tally(beers.map((b) => b.style), 5),
      breweries: tally(beers.map((b) => b.brewery), 3),
      places: tally(beers.map((b) => b.location), 3),
      containers: scaled(['Glass', 'Can', 'Bottle'].map((name) => ({ name, count: beers.filter((b) => b.container === name).length }))),
      favourites: [...rated].sort((a, b) => b.rating - a.rating || b.drunkAt - a.drunkAt).slice(0, 3),
      first: beers.length ? beers[beers.length - 1].name : '',
    };
  }),

  // A month as weeks from Monday: `shift` months from the one `today` falls in. Each day
  // carries its count and the sticker of its best-rated beer (the first drunk on a tie);
  // the cells before the 1st and after the last day pad the grid with `date` 0.
  calendar: ([today, shift], _store, storage) => use(storage, async (db): Promise<Result<'calendar'>> => {
    const [ty, tm] = today.split('-').map(Number);
    const at = (ty || 2026) * 12 + ((tm || 1) - 1) + shift;
    const year = Math.floor(at / 12), month = at - year * 12;
    const prefix = `${year}-${pad(month + 1)}`;
    const beers = (await all(db, 'WHERE substr(day, 1, 7) = ?', [prefix])).reverse();
    const length = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const lead = (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7;
    const blank = (key: string) => ({ key, date: 0, count: 0, name: '', photo: '', sticker: '', today: false, future: false });
    const cells: Result<'calendar'>['cells'] = Array.from({ length: lead }, (_, i) => blank(`lead-${i}`));
    for (let d = 1; d <= length; d++) {
      const key = `${prefix}-${pad(d)}`;
      const those = beers.filter((b) => b.day === key);
      const best = those.reduce<Beer | undefined>((top, b) => (!top || b.rating > top.rating ? b : top), undefined);
      cells.push({ key, date: d, count: those.length, name: best?.name ?? '', photo: best?.photo ?? '', sticker: best?.sticker ?? '', today: key === today, future: key > today });
    }
    for (let i = 0; cells.length % 7 !== 0; i++) cells.push(blank(`tail-${i}`));
    return { label: `${MONTH_NAMES[month]} ${year}`, total: beers.length, days: new Set(beers.map((b) => b.day)).size, cells };
  }),

  // The photo's subject, cut out with a die-cut edge, for the Add sheet's preview. Where
  // there is no module (the web) or no subject, the reply says so and the beer keeps
  // its framed photo.
  cutSticker: async ([picked], _store, _storage, native): Promise<Result<'cutSticker'>> => {
    const none = (error: string) => ({ ok: false, path: '', error });
    if (!native?.available) return none('unavailable');
    const name = picked.split('/').pop() ?? 'photo';
    try {
      const reply = (await native.later({ op: 'cutout', from: picked, to: `${CUTS}/${name}.png` })) as Result<'cutSticker'>;
      return { ok: reply.ok, path: reply.path, error: reply.error };
    } catch (e) {
      return none(String(e));
    }
  },

  // The picked photo becomes the beer's own JPEG, at most 1600 px and 1 MB, and its
  // cut-out (if any) a PNG of at most 1200 px, so the album stays light; the copies in
  // app:/tmp are left for the host to clear.
  addBeer: async ([picked, cut, name, brewery, style, container, rating, location, drunkAt, day], _store, storage) => {
    if (name.trim() === '') return { ok: false, error: 'Give the beer a name.' };
    return use(storage, async (db) => {
      const next = Number((await db.query('SELECT COALESCE(MAX(id), 0) + 1 FROM beers')).rows[0][0]);
      await storage.fs.mkdir(STICKERS).catch((e) => { if (e.code !== 'EEXIST') throw e; });
      let photo: string;
      try {
        photo = (await storage.fs.compressImage(picked, `${STICKERS}/${next}.jpg`, { maxDimension: 1600, maxBytes: 1_000_000 })).path;
      } catch (e) {
        const code = (e as { code?: string }).code;
        if (code === 'undecodable' || code === 'unsupported') return { ok: false, error: 'That photo can’t be read. Try another.' };
        throw e;
      }
      // A cut-out that can't be kept is no loss: the framed photo stands in.
      const sticker = cut === '' ? '' : await storage.fs
        .compressImage(cut, `${STICKERS}/${next}-sticker.png`, { type: 'image/png', maxDimension: 1200, maxBytes: 3_000_000 })
        .then((c) => c.path, () => '');
      await db.execute(
        `INSERT INTO beers (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [next, name.trim(), brewery.trim(), style, container, rating, location.trim(), photo, drunkAt, day, sticker],
      );
      return ok;
    });
  },

  // The hidden demo mode: a year of beers for showing the app off, their stickers bundled
  // under assets/demo (tools/demo-stickers.swift made them). Loading again replaces them;
  // removing takes only them, never a beer you added.
  loadDemo: ([today, offset], _store, storage) => use(storage, async (db) => {
    await db.execute(`DELETE FROM beers WHERE photo LIKE '${DEMO}%'`);
    const [y, m, d] = today.split('-').map(Number);
    const midnight = Date.UTC(y || 2026, (m || 1) - 1, d || 1);
    let next = Number((await db.query('SELECT COALESCE(MAX(id), 0) + 1 FROM beers')).rows[0][0]);
    for (const [which, daysAgo, hour, rating] of DEMO_LOG) {
      const beer = DEMO_BEERS[which];
      // The wall time there, then back to UTC by the zone's offset (minutes east).
      const local = midnight - daysAgo * 86_400_000 + hour * 3_600_000 + ((which * 17) % 60) * 60_000;
      const day = new Date(local).toISOString().slice(0, 10);
      const at = local - offset * 60_000;
      const stem = `${DEMO}${String(which).padStart(2, '0')}`;
      await db.execute(
        `INSERT INTO beers (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        // The sticker stands for the photo too: the demo ships no photos, only cut-outs.
        [next++, beer.name, beer.brewery, beer.style, beer.container, rating, beer.location, `${stem}-sticker.png`, at, day, `${stem}-sticker.png`],
      );
    }
    return ok;
  }),

  clearDemo: (_args, _store, storage) => use(storage, async (db) => {
    await db.execute(`DELETE FROM beers WHERE photo LIKE '${DEMO}%'`);
    return ok;
  }),

  rateBeer: ([id, rating], _store, storage) => use(storage, async (db) => {
    await db.execute('UPDATE beers SET rating = ? WHERE id = ?', [rating, Number(id)]);
    return ok;
  }),

  removeBeer: ([id], _store, storage) => use(storage, async (db) => {
    const rows = (await db.query('SELECT photo, sticker FROM beers WHERE id = ?', [Number(id)])).rows;
    await db.execute('DELETE FROM beers WHERE id = ?', [Number(id)]);
    // A demo beer's files are the app's own assets: only a beer you added owns its files.
    for (const file of rows.flat().map(String).filter((f) => f.startsWith(STICKERS))) {
      await storage.fs.rm(file).catch((e) => { if (e.code !== 'ENOENT') throw e; });
    }
    return ok;
  }),
};

export const answer: Answer = (source, args, store, storage, native) => sources[source](args, store, storage, native);
