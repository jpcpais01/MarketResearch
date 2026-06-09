/* Vercel serverless: price history for one symbol (stocks or the
   SPX/NDX/DJI index aliases). Used for index tapes and the lazy
   5-year chart range. CDN-cached for 1h. */
import { fetchChart, ySym, INDEX_SYMS } from './_lib/yahoo.js';

export default async function handler(req, res){
  const t = String(req.query.t || '').trim().toUpperCase();
  if (!t) return res.status(400).json({ error: 'pass ?t=MSFT' });
  const ix = INDEX_SYMS.find(i => i.t === t);
  const sym = ix ? ix.sym : ySym(t);
  const years = Math.min(10, parseFloat(req.query.years) || 5);
  try {
    const data = await fetchChart(sym, years);
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=21600');
    res.status(200).json(data);
  } catch (e){
    res.status(502).json({ error: String(e.message || e).slice(0, 200) });
  }
}
