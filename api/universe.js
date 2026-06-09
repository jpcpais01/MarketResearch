/* Vercel serverless: universe manifest.
   Serverless functions can't build all ~90 tickers in one invocation,
   so this returns a manifest telling the client to fetch in chunks
   via /api/batch. The local Node server (server.mjs) returns the full
   payload instead — js/live.js handles both shapes. */
import { TICKERS, INDEX_SYMS } from './_lib/yahoo.js';

export default function handler(req, res){
  res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate');
  res.status(200).json({
    mode: 'chunked',
    tickers: TICKERS,
    chunkSize: 8,
    indexes: INDEX_SYMS.map(ix => ({ t: ix.t, n: ix.n }))
  });
}
