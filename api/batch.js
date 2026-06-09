/* Vercel serverless: fetch a chunk of tickers (max 12 per call).
   Responses are CDN-cached for 6h (s-maxage) so Yahoo is hit at most
   once per chunk per cache window, regardless of visitor count. */
import { fetchStock } from './_lib/yahoo.js';

export default async function handler(req, res){
  const ts = String(req.query.t || '')
    .split(',').map(s => s.trim().toUpperCase()).filter(Boolean).slice(0, 12);
  if (!ts.length) return res.status(400).json({ error: 'pass ?t=AAPL,MSFT,…' });

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

  res.setHeader('Cache-Control', 's-maxage=21600, stale-while-revalidate=86400');
  res.status(200).json({ asof: Date.now(), stocks, errors });
}
