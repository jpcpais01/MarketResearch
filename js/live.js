/* ============================================================
   Emerald · live data loader
   Works against BOTH backends:
     · local Node server (server.mjs)  → /api/universe returns the
       full payload (or 202 + progress while building)
     · Vercel serverless                → /api/universe returns a
       chunk manifest; the client assembles the universe from
       /api/batch + /api/chart calls (CDN-cached server-side)

   Big-universe behavior (~1000 tickers):
     · PROGRESSIVE BOOT — on the chunked path the app renders as
       soon as the indexes + the first ~80 stocks are in; the rest
       streams in the background and an 'em:universe' event tells
       the app to recompute when complete.
     · IndexedDB cache — the payload outgrew localStorage quotas;
       repeat visits boot instantly from IDB.
     · dates arrive delta-encoded (s.dd = [day0, +d, …]) — about
       half the bytes of millisecond arrays. decodeDates() restores
       Date[]; plain `dates` payloads are still accepted.

   Exposes:
     DATA_READY   promise → resolves when STOCKS is usable
     DATA_MODE    'live' | 'cached' | 'demo'
     DATA_ASOF    timestamp of the data
     SERIES_MAP   ticker → real closes (live/cached modes)
     DATES_MAP    ticker → Date[] aligned with closes
     LIVE_INDEXES real index series (live/cached modes)
     decodeDates  shared decoder (app.js uses it for on-demand loads)
     emClearCache() → drop the IDB fast-boot cache
   ============================================================ */

let DATA_MODE = 'demo';
let DATA_ASOF = null;
let SERIES_MAP = null;
let DATES_MAP = null;
let LIVE_INDEXES = null;

const FRESH_MS = 30 * 60 * 1000;   // boot instantly from local cache if newer than this
const IDB_VER = 2;                  // bump whenever the universe shape changes (busts stale IDB caches)

const sleep = ms => new Promise(r => setTimeout(r, ms));
function setBoot(msg, frac){
  const el = document.getElementById('bootMsg');
  if (el) el.textContent = msg;
  const bar = document.getElementById('bootBar');
  if (bar && frac != null) bar.style.width = Math.round(frac * 100) + '%';
  // thin header progress bar — visible after boot screen fades, shows background-load progress
  const hb = document.getElementById('headerLoadBar');
  if (hb && frac != null){
    hb.style.transform = `scaleX(${frac})`;
    hb.classList.toggle('active', frac > 0 && frac < 1);
  }
}

/* ---- date decoding (delta day-numbers → Date[]; ms arrays pass through) ---- */
function decodeDates(s){
  if (s.dd && s.dd.length){
    const out = new Array(s.dd.length);
    let day = 0;
    // decode to NOON UTC so the calendar-day label survives any display timezone
    for (let i = 0; i < s.dd.length; i++){ day += s.dd[i]; out[i] = new Date(day * 86400000 + 43200000); }
    return out;
  }
  return (s.dates || []).map(d => new Date(d));
}

/* ---- IndexedDB key-value store (localStorage can't hold ~1000 tickers) ---- */
function idbOpen(){
  return new Promise((res, rej) => {
    const r = indexedDB.open('emerald', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function idbGet(k){
  try {
    const db = await idbOpen();
    return await new Promise((res, rej) => {
      const t = db.transaction('kv').objectStore('kv').get(k);
      t.onsuccess = () => res(t.result);
      t.onerror = () => rej(t.error);
    });
  } catch { return null; }
}
async function idbSet(k, v){
  try {
    const db = await idbOpen();
    await new Promise((res, rej) => {
      const t = db.transaction('kv', 'readwrite');
      t.objectStore('kv').put(v, k);
      t.oncomplete = () => res();
      t.onerror = () => rej(t.error);
    });
  } catch { /* private mode / quota — fine */ }
}
async function emClearCache(){
  try {
    const db = await idbOpen();
    await new Promise(res => { const t = db.transaction('kv', 'readwrite'); t.objectStore('kv').delete('universe'); t.oncomplete = res; t.onerror = res; });
  } catch { /* fine */ }
}

/* ---- serverless (Vercel) path: assemble universe from chunks ---- */
async function fetchChunked(manifest, onPartial){
  const ts = manifest.tickers || [];
  const cs = manifest.chunkSize || 16;
  const chunks = [];
  for (let i = 0; i < ts.length; i += cs) chunks.push(ts.slice(i, i + cs));

  // indexes FIRST — the analytics engine needs the real S&P series from the
  // very first partial render
  setBoot('Loading index data…', 0.02);
  const indexes = [];
  await Promise.all((manifest.indexes || []).map(async ix => {
    try {
      const r = await fetch(`/api/chart?t=${encodeURIComponent(ix.t)}&years=2.1`);
      if (r.ok){ const j = await r.json(); indexes.push({ t: ix.t, n: ix.n, closes: j.closes, dates: j.dates }); }
    } catch { /* optional */ }
  }));

  const stocks = [];
  let done = 0, partialSent = false;
  const queue = [...chunks];
  async function worker(){
    while (queue.length){
      const c = queue.shift();
      try {
        const r = await fetch('/api/batch?t=' + encodeURIComponent(c.join(',')));
        if (r.ok){ const j = await r.json(); stocks.push(...(j.stocks || [])); }
      } catch { /* chunk failed — continue with the rest */ }
      done += c.length;
      setBoot(`Fetching live market data… ${Math.min(done, ts.length)}/${ts.length}`, ts.length ? done / ts.length : 1);
      if (!partialSent && onPartial && stocks.length >= 80 && indexes.length){
        partialSent = true;
        onPartial({ asof: Date.now(), stocks: stocks.slice(), indexes });
      }
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker));
  return { asof: Date.now(), stocks, indexes };
}

/* ---- local server path: full payload, may need to poll while building ---- */
async function fetchUniverse(onPartial){
  for (let i = 0; i < 400; i++){
    const r = await fetch('/api/universe', { cache: 'no-store' });
    if (r.status === 202){
      const j = await r.json();
      setBoot(`Building live universe… ${j.done}/${j.total}`, j.total ? j.done / j.total : 0);
      await sleep(1800);
      continue;
    }
    if (!r.ok) throw new Error('universe ' + r.status);
    const j = await r.json();
    if (j.mode === 'chunked') return await fetchChunked(j, onPartial);   // serverless backend
    return j;                                                            // local server backend
  }
  throw new Error('timed out waiting for universe');
}

function adoptUniverse(u, mode){
  const stocks = (u.stocks || []).filter(s => s.px != null && s.closes && s.closes.length >= 260);
  if (stocks.length < 10) throw new Error('payload too thin');
  SERIES_MAP = new Map();
  DATES_MAP = new Map();
  const adopted = stocks.map(s => {
    SERIES_MAP.set(s.t, s.closes);
    DATES_MAP.set(s.t, decodeDates(s));
    const { closes, dates, dd, ...rest } = s;   // keep the source payload intact for caching
    return rest;
  });
  LIVE_INDEXES = (u.indexes || []).map(ix => ({
    t: ix.t, n: ix.n,
    series: ix.closes,
    dates: decodeDates(ix)
  }));
  STOCKS = adopted;
  DATA_MODE = mode;
  DATA_ASOF = u.asof;
}

const DATA_READY = (async () => {
  // 0) very fresh IDB cache → instant boot, skip the network entirely
  localStorage.removeItem('em_universe');   // migrate away from the old localStorage cache
  const cached = await idbGet('universe');
  if (cached && cached.asof && cached._v === IDB_VER && Date.now() - cached.asof < FRESH_MS){
    try { adoptUniverse(cached, 'live'); setBoot('Loaded from local cache', 1); return; } catch { /* fall through */ }
  }
  // 1) network (local server OR serverless — auto-detected).
  //    Resolves as soon as a usable PARTIAL universe is adopted; the full
  //    payload keeps streaming and fires 'em:universe' when complete.
  setBoot('Connecting to data server…', 0);
  const adopted = await new Promise(resolve => {
    (async () => {
      try {
        const u = await fetchUniverse(partial => {
          try { adoptUniverse(partial, 'live'); resolve(true); } catch { /* keep waiting for more */ }
        });
        adoptUniverse(u, 'live');
        idbSet('universe', { ...u, _v: IDB_VER });
        setBoot('Computing scores…', 1);
        resolve(true);
        document.dispatchEvent(new CustomEvent('em:universe', { detail: { complete: true, n: (u.stocks || []).length } }));
      } catch (e){
        console.warn('[live] universe fetch failed:', e.message);
        resolve(false);
      }
    })();
  });
  if (adopted) return;
  // 2) offline → last saved real payload (any age)
  if (cached){
    try { adoptUniverse(cached, 'cached'); setBoot('Offline — using last saved market data…', 1); return; } catch { /* fall through */ }
  }
  // 3) bundled demo dataset (STOCKS already = FALLBACK_STOCKS)
  DATA_MODE = 'demo';
  setBoot('Live data unavailable — running on the demo dataset…', 1);
})();
