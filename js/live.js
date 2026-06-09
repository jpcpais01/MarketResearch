/* ============================================================
   Emerald · live data loader
   Works against BOTH backends:
     · local Node server (server.mjs)  → /api/universe returns the
       full payload (or 202 + progress while building)
     · Vercel serverless                → /api/universe returns a
       chunk manifest; the client assembles the universe from
       /api/batch + /api/chart calls (CDN-cached server-side)
   Falls back to the last saved payload, then the bundled demo
   dataset. Exposes:
     DATA_READY   promise → resolves when STOCKS is final
     DATA_MODE    'live' | 'cached' | 'demo'
     DATA_ASOF    timestamp of the data
     SERIES_MAP   ticker → real closes (live/cached modes)
     DATES_MAP    ticker → Date[] aligned with closes
     LIVE_INDEXES real index series (live/cached modes)
   ============================================================ */

let DATA_MODE = 'demo';
let DATA_ASOF = null;
let SERIES_MAP = null;
let DATES_MAP = null;
let LIVE_INDEXES = null;

const FRESH_MS = 30 * 60 * 1000;   // boot instantly from local cache if newer than this

const sleep = ms => new Promise(r => setTimeout(r, ms));
function setBoot(msg, frac){
  const el = document.getElementById('bootMsg');
  if (el) el.textContent = msg;
  const bar = document.getElementById('bootBar');
  if (bar && frac != null) bar.style.width = Math.round(frac * 100) + '%';
}

/* ---- serverless (Vercel) path: assemble universe from chunks ---- */
async function fetchChunked(manifest){
  const ts = manifest.tickers || [];
  const cs = manifest.chunkSize || 8;
  const chunks = [];
  for (let i = 0; i < ts.length; i += cs) chunks.push(ts.slice(i, i + cs));

  const stocks = [];
  let done = 0;
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
    }
  }
  await Promise.all(Array.from({ length: 5 }, worker));

  setBoot('Loading index data…', 1);
  const indexes = [];
  await Promise.all((manifest.indexes || []).map(async ix => {
    try {
      const r = await fetch(`/api/chart?t=${encodeURIComponent(ix.t)}&years=2.1`);
      if (r.ok){ const j = await r.json(); indexes.push({ t: ix.t, n: ix.n, closes: j.closes, dates: j.dates }); }
    } catch { /* optional */ }
  }));
  return { asof: Date.now(), stocks, indexes };
}

/* ---- local server path: full payload, may need to poll while building ---- */
async function fetchUniverse(){
  for (let i = 0; i < 240; i++){
    const r = await fetch('/api/universe', { cache: 'no-store' });
    if (r.status === 202){
      const j = await r.json();
      setBoot(`Fetching live market data… ${j.done}/${j.total}`, j.total ? j.done / j.total : 0);
      await sleep(1800);
      continue;
    }
    if (!r.ok) throw new Error('universe ' + r.status);
    const j = await r.json();
    if (j.mode === 'chunked') return await fetchChunked(j);   // serverless backend
    return j;                                                 // local server backend
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
    DATES_MAP.set(s.t, s.dates.map(d => new Date(d)));
    const { closes, dates, ...rest } = s;   // keep the source payload intact for caching
    return rest;
  });
  LIVE_INDEXES = (u.indexes || []).map(ix => ({
    t: ix.t, n: ix.n,
    series: ix.closes,
    dates: ix.dates.map(d => new Date(d))
  }));
  STOCKS = adopted;
  DATA_MODE = mode;
  DATA_ASOF = u.asof;
}

function readLocalCache(){
  try { return JSON.parse(localStorage.getItem('em_universe')); } catch { return null; }
}

const DATA_READY = (async () => {
  // 0) very fresh local cache → instant boot, skip the network entirely
  const cached = readLocalCache();
  if (cached && cached.asof && Date.now() - cached.asof < FRESH_MS){
    try { adoptUniverse(cached, 'live'); setBoot('Loaded from local cache', 1); return; } catch { /* fall through */ }
  }
  // 1) network (local server OR serverless — auto-detected)
  setBoot('Connecting to data server…', 0);
  try {
    const u = await fetchUniverse();
    adoptUniverse(u, 'live');
    try { localStorage.setItem('em_universe', JSON.stringify(u)); } catch { /* quota — fine */ }
    setBoot('Computing scores…', 1);
    return;
  } catch (e) {
    console.warn('[live] universe fetch failed:', e.message);
  }
  // 2) offline → last saved real payload (any age)
  if (cached){
    try { adoptUniverse(cached, 'cached'); setBoot('Offline — using last saved market data…', 1); return; } catch { /* fall through */ }
  }
  // 3) bundled demo dataset (STOCKS already = FALLBACK_STOCKS)
  DATA_MODE = 'demo';
  setBoot('Live data unavailable — running on the demo dataset…', 1);
})();
