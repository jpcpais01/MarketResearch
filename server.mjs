/* ============================================================
   Emerald · local data server
   Serves the static PWA + /api endpoints backed by Yahoo
   Finance. Fetch logic is shared with the Vercel serverless
   functions via api/_lib/yahoo.js — one source of truth.

   Run:  npm install && npm start   →  http://localhost:4173
   (On Vercel this file is unused; api/*.js functions take over.)
   ============================================================ */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TICKERS, INDEX_SYMS, ySym, fetchChart, fetchStock } from './api/_lib/yahoo.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 4173;
const CACHE_DIR = path.join(__dirname, 'cache');
const CACHE_FILE = path.join(CACHE_DIR, 'universe.json');
const TTL_MS = 6 * 3600 * 1000;          // universe refresh interval
const CONCURRENCY = 5;

// ---------------- universe state ----------------
let universe = null;                  // { asof, stocks, indexes, errors }
let progress = null;                  // { done, total } while building
let buildPromise = null;

try {
  universe = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
  console.log(`[cache] loaded universe from disk (asof ${new Date(universe.asof).toLocaleString()})`);
} catch { /* no cache yet */ }

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

  if (url.pathname === '/api/chart' || url.pathname.startsWith('/api/chart/')){
    const t = (url.searchParams.get('t') || decodeURIComponent(url.pathname.slice('/api/chart/'.length))).toUpperCase();
    const ix = INDEX_SYMS.find(i => i.t === t);
    const years = Math.min(10, parseFloat(url.searchParams.get('years')) || 5);
    try {
      const data = await fetchChart(ix ? ix.sym : ySym(t), years);
      return json(res, 200, data);
    } catch (e){ return json(res, 502, { error: String(e.message || e) }); }
  }

  // parity with the Vercel serverless API (also handy for testing the chunked client path)
  if (url.pathname === '/api/batch'){
    const ts = String(url.searchParams.get('t') || '').split(',').map(s => s.trim().toUpperCase()).filter(Boolean).slice(0, 12);
    if (!ts.length) return json(res, 400, { error: 'pass ?t=AAPL,MSFT,…' });
    const stocks = [], errors = [];
    const queue = [...ts];
    async function worker(){
      while (queue.length){
        const t = queue.shift();
        try { stocks.push(await fetchStock(t)); }
        catch (e){ errors.push({ t, e: String(e.message || e).slice(0, 120) }); }
      }
    }
    await Promise.all(Array.from({ length: 4 }, worker));
    return json(res, 200, { asof: Date.now(), stocks, errors });
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
