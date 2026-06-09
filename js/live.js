/* ============================================================
   Emerald · live data loader
   Pulls the real universe from /api/universe (Yahoo Finance via
   server.mjs). Falls back to the last cached payload, then to
   the bundled demo dataset. Exposes:
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

const sleep = ms => new Promise(r => setTimeout(r, ms));
function setBoot(msg, frac){
  const el = document.getElementById('bootMsg');
  if (el) el.textContent = msg;
  const bar = document.getElementById('bootBar');
  if (bar && frac != null) bar.style.width = Math.round(frac * 100) + '%';
}

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
    return await r.json();
  }
  throw new Error('timed out waiting for universe');
}

function adoptUniverse(u, mode){
  const stocks = (u.stocks || []).filter(s => s.px != null && s.closes && s.closes.length >= 260);
  if (stocks.length < 10) throw new Error('payload too thin');
  SERIES_MAP = new Map();
  DATES_MAP = new Map();
  for (const s of stocks){
    SERIES_MAP.set(s.t, s.closes);
    DATES_MAP.set(s.t, s.dates.map(d => new Date(d)));
    delete s.closes; delete s.dates;
  }
  LIVE_INDEXES = (u.indexes || []).map(ix => ({
    t: ix.t, n: ix.n,
    series: ix.closes,
    dates: ix.dates.map(d => new Date(d))
  }));
  STOCKS = stocks;
  DATA_MODE = mode;
  DATA_ASOF = u.asof;
}

const DATA_READY = (async () => {
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
  // offline / no API server → last cached real payload
  try {
    const cached = JSON.parse(localStorage.getItem('em_universe'));
    if (cached){
      adoptUniverse(cached, 'cached');
      setBoot('Offline — using last saved market data…', 1);
      return;
    }
  } catch { /* fall through */ }
  // bundled demo dataset (STOCKS already = FALLBACK_STOCKS)
  DATA_MODE = 'demo';
  setBoot('Live data unavailable — running on the demo dataset…', 1);
})();
