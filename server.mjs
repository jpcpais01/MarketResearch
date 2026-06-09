/* ============================================================
   Emerald · live data server
   Serves the static PWA + /api endpoints backed by Yahoo
   Finance (via yahoo-finance2). Universe is fetched with
   bounded concurrency, cached to disk, refreshed on TTL.

   Run:  npm install && npm start   →  http://localhost:4173
   ============================================================ */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YahooFinance from 'yahoo-finance2';

const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey', 'ripHistorical'] });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 4173;
const CACHE_DIR = path.join(__dirname, 'cache');
const CACHE_FILE = path.join(CACHE_DIR, 'universe.json');
const TTL_MS = 6 * 3600 * 1000;          // universe refresh interval
const CONCURRENCY = 5;

const TICKERS = [
  'AAPL','MSFT','NVDA','GOOGL','AMZN','META','AVGO','ORCL','CRM','ADBE','AMD','INTC','QCOM','TXN','CSCO','NOW','INTU','AMAT','MU','PLTR','SNOW','CRWD','PANW','SHOP','UBER','ABNB','NFLX','PYPL',
  'BRK.B','JPM','V','MA','BAC','GS','MS','AXP','WFC',
  'UNH','LLY','JNJ','ABBV','MRK','PFE','TMO','ISRG','AMGN','GILD','CVS','MDT',
  'WMT','COST','PG','KO','PEP','MCD','NKE','SBUX','HD','LOW','TGT','CMG','DIS','F','GM',
  'XOM','CVX','COP','CAT','DE','BA','GE','LMT','UPS','UNP','LIN','SHW','FCX',
  'T','VZ','TMUS','NEE','DUK','SO','O','PLD','AMT',
  'RIVN','SNAP'
];
const INDEX_SYMS = [
  { t: 'SPX', sym: '^GSPC', n: 'S&P 500' },
  { t: 'NDX', sym: '^NDX',  n: 'Nasdaq 100' },
  { t: 'DJI', sym: '^DJI',  n: 'Dow Jones' }
];

const ySym = t => t.replace('.', '-');
const pct = v => (v == null || !isFinite(v)) ? null : v * 100;
const num = v => (v == null || !isFinite(v)) ? null : v;

// ---------------- universe state ----------------
let universe = null;                  // { asof, stocks, indexes, errors }
let progress = null;                  // { done, total } while building
let buildPromise = null;

try {
  universe = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
  console.log(`[cache] loaded universe from disk (asof ${new Date(universe.asof).toLocaleString()})`);
} catch { /* no cache yet */ }

// ---------------- yahoo fetchers ----------------
async function fetchChart(sym, years){
  const period1 = new Date(Date.now() - years * 365.25 * 86400e3);
  const ch = await yahooFinance.chart(sym, { period1, interval: '1d' });
  const quotes = (ch.quotes || []).filter(q => q.close != null);
  return {
    closes: quotes.map(q => +q.close.toFixed(4)),
    dates: quotes.map(q => +new Date(q.date))
  };
}

async function fetchStock(t){
  const sym = ySym(t);
  const q = await yahooFinance.quoteSummary(sym, {
    modules: ['price', 'summaryDetail', 'financialData', 'defaultKeyStatistics',
              'assetProfile', 'earningsTrend', 'recommendationTrend']
  });

  const p = q.price || {}, sd = q.summaryDetail || {}, fd = q.financialData || {};
  const ks = q.defaultKeyStatistics || {}, ap = q.assetProfile || {};
  const px = num(p.regularMarketPrice);
  if (!px) throw new Error('no price');

  // real annual income statements → multi-year growth, interest coverage, dilution
  let rg3 = null, eg = null, ic = null, revHist = null, dil = null;
  try {
    const fts = await yahooFinance.fundamentalsTimeSeries(sym, {
      period1: new Date(Date.now() - 5.2 * 365.25 * 86400e3), type: 'annual', module: 'financials'
    });
    const rows = (fts || []).filter(r => r.periodType !== 'TTM').sort((a, b) => new Date(a.date) - new Date(b.date));
    const revs = rows.map(r => num(r.totalRevenue)).filter(v => v > 0);
    if (revs.length >= 3){
      rg3 = (Math.pow(revs[revs.length - 1] / revs[0], 1 / (revs.length - 1)) - 1) * 100;
      revHist = revs.map(v => +(v / 1e9).toFixed(2));
    }
    const nis = rows.map(r => num(r.netIncome)).filter(v => v != null);
    if (nis.length >= 3 && nis[0] > 0 && nis[nis.length - 1] > 0)
      eg = (Math.pow(nis[nis.length - 1] / nis[0], 1 / (nis.length - 1)) - 1) * 100;
    const lastY = rows[rows.length - 1];
    if (num(lastY?.EBIT) && num(lastY?.interestExpense) && lastY.interestExpense !== 0)
      ic = Math.abs(lastY.EBIT / lastY.interestExpense);
    const shs = rows.map(r => num(r.dilutedAverageShares) ?? num(r.basicAverageShares)).filter(v => v > 0);
    if (shs.length >= 3)
      dil = (Math.pow(shs[shs.length - 1] / shs[0], 1 / (shs.length - 1)) - 1) * 100; // +ve = dilution, −ve = buybacks
  } catch { /* fundamentals optional */ }

  const { closes, dates } = await fetchChart(sym, 2.1);

  const mcap = num(p.marketCap) ?? num(sd.marketCap);
  const totalRev = num(fd.totalRevenue);
  const rec = q.recommendationTrend?.trend?.[0];
  const trend = q.earningsTrend?.trend || [];
  const gFwd = num(trend.find(x => x.period === '+1y')?.growth)
            ?? num(trend.find(x => x.period === '+5y')?.growth);
  // ROIC approximation: NI / (book equity + total debt)
  let roic = null;
  if (totalRev && fd.profitMargins != null && mcap && ks.priceToBook){
    const ni = totalRev * fd.profitMargins;
    const equity = mcap / ks.priceToBook;
    roic = ni / (equity + (num(fd.totalDebt) ?? 0)) * 100;
  }
  let dy = num(sd.dividendYield);
  if (dy != null) dy = dy < 1 ? dy * 100 : dy;   // yahoo sometimes pre-multiplies

  return {
    t,
    n: p.shortName || p.longName || t,
    sec: ap.sector || 'Other',
    ind: ap.industry || '—',
    px,
    mc: mcap ? mcap / 1e9 : null,
    pe: num(sd.trailingPE),
    fpe: num(ks.forwardPE) ?? num(sd.forwardPE),
    pb: num(ks.priceToBook),
    ps: num(sd.priceToSalesTrailing12Months) ?? (mcap && totalRev ? mcap / totalRev : null),
    ev: num(ks.enterpriseToEbitda),
    dy: dy ?? 0,
    po: pct(sd.payoutRatio) ?? 0,
    rg3,
    rg1: pct(fd.revenueGrowth),
    eg,
    egf: pct(gFwd),
    gm: pct(fd.grossMargins),
    om: pct(fd.operatingMargins),
    nm: pct(fd.profitMargins),
    roe: pct(fd.returnOnEquity),
    roa: pct(fd.returnOnAssets),
    roic,
    de: fd.debtToEquity != null ? fd.debtToEquity / 100 : null,
    cr: num(fd.currentRatio),
    ic,
    fcf: (num(fd.freeCashflow) && totalRev) ? fd.freeCashflow / totalRev * 100 : null,
    beta: num(sd.beta) ?? 1.0,
    si: pct(ks.shortPercentOfFloat) ?? 0,
    io: pct(ks.heldPercentInsiders) ?? 0,
    ar: rec ? [(rec.strongBuy || 0) + (rec.buy || 0), rec.hold || 0, (rec.sell || 0) + (rec.strongSell || 0)] : [0, 0, 0],
    tp: num(fd.targetMeanPrice),
    d: (ap.longBusinessSummary || '').split('. ').slice(0, 2).join('. ').slice(0, 300),
    dil, revHist, closes, dates
  };
}

async function buildUniverse(){
  progress = { done: 0, total: TICKERS.length + INDEX_SYMS.length };
  const stocks = [], errors = [];
  const queue = [...TICKERS];
  async function worker(){
    while (queue.length){
      const t = queue.shift();
      try {
        const s = await fetchStock(t);
        if (s.closes.length >= 260) stocks.push(s);
        else errors.push({ t, e: 'insufficient history' });
      } catch (e){
        errors.push({ t, e: String(e.message || e).slice(0, 120) });
      }
      progress.done++;
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const indexes = [];
  for (const ix of INDEX_SYMS){
    try {
      const { closes, dates } = await fetchChart(ix.sym, 2.1);
      indexes.push({ t: ix.t, n: ix.n, closes, dates });
    } catch (e){ errors.push({ t: ix.t, e: String(e.message || e).slice(0, 120) }); }
    progress.done++;
  }

  progress = null;
  if (stocks.length < 10) throw new Error(`only ${stocks.length} tickers succeeded — upstream likely unreachable`);
  universe = { asof: Date.now(), stocks, indexes, errors };
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(CACHE_FILE, JSON.stringify(universe));
  console.log(`[universe] built: ${stocks.length} stocks, ${indexes.length} indexes, ${errors.length} errors`);
  return universe;
}

let lastFailAt = 0;
function ensureUniverse(force){
  const stale = !universe || (Date.now() - universe.asof) > TTL_MS;
  const cooledDown = Date.now() - lastFailAt > 90 * 1000;   // don't hammer upstream after a failure
  if ((force || stale) && !buildPromise && (force || cooledDown)){
    buildPromise = buildUniverse()
      .catch(e => { console.error('[universe] build failed:', e.message); progress = null; lastFailAt = Date.now(); })
      .finally(() => { buildPromise = null; });
  }
}

// ---------------- http server ----------------
const MIME = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.md': 'text/markdown'
};
const json = (res, code, obj) => {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(body);
};

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname === '/api/universe'){
    ensureUniverse(url.searchParams.get('refresh') === '1');
    if (universe) return json(res, 200, universe);                       // serve (possibly stale) immediately
    if (progress) return json(res, 202, { building: true, ...progress });
    return json(res, 503, { error: 'universe unavailable' });
  }

  if (url.pathname.startsWith('/api/chart/')){
    const t = decodeURIComponent(url.pathname.slice('/api/chart/'.length));
    const years = Math.min(10, +url.searchParams.get('years') || 5);
    try {
      const data = await fetchChart(ySym(t), years);
      return json(res, 200, data);
    } catch (e){ return json(res, 502, { error: String(e.message || e) }); }
  }

  if (url.pathname === '/api/status'){
    return json(res, 200, { live: !!universe, asof: universe?.asof ?? null, building: !!progress, progress });
  }

  // ---- static files ----
  let fp = path.normalize(path.join(__dirname, url.pathname === '/' ? 'index.html' : url.pathname));
  if (!fp.startsWith(__dirname)){ res.writeHead(403); return res.end(); }
  fs.readFile(fp, (err, buf) => {
    if (err){ res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(buf);
  });
}).listen(PORT, () => {
  console.log(`Emerald serving at http://localhost:${PORT}`);
  ensureUniverse(false); // warm the cache at startup
});
