/* Vercel serverless: news headlines + full company profile for one symbol.
   Powers the stock page's "Latest news" card and the description
   read-more. CDN-cached 30 min — headlines age fast. */
import { fetchNews } from './_lib/yahoo.js';

export default async function handler(req, res){
  const t = String(req.query.t || '').trim().toUpperCase().slice(0, 12);
  if (!t) return res.status(400).json({ error: 'pass ?t=AAPL' });
  try {
    const j = await fetchNews(t);
    res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=86400');
    res.status(200).json(j);
  } catch (e){
    res.status(502).json({ error: String(e.message || e).slice(0, 200) });
  }
}
