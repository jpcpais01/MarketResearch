/* Vercel serverless: symbol search across all of Yahoo Finance.
   Lets the app find (and then load on demand) any listed equity/ETF,
   not just the built-in universe. CDN-cached per query for 24h. */
import { searchSymbols } from './_lib/yahoo.js';

export default async function handler(req, res){
  const q = String(req.query.q || '').trim().slice(0, 40);
  if (q.length < 1) return res.status(400).json({ error: 'pass ?q=apple' });
  try {
    const results = await searchSymbols(q);
    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate');
    res.status(200).json({ q, results });
  } catch (e){
    res.status(502).json({ error: String(e.message || e).slice(0, 200) });
  }
}
