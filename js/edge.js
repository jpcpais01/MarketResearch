/* ============================================================
   Emerald · EDGE — five original detection signals
   These are Emerald's own methods, designed for this app —
   not textbook formulas. Each answers a question the classic
   pillars don't ask, scores 0–100, and is null-safe.

   1. MDI — Moat Durability Index
        "Is the excess return defensible, or will competition
         eat it?" Measures the SPREAD of returns over the cost
         of capital, then multiplies belief in its persistence
         (pricing power, consistency, scale).

   2. XGS — Expectation Gap Score (reverse DCF)
        Instead of guessing fair value, solve the DCF backwards:
        what growth rate is the market ALREADY paying for at
        today's price? Compare that to what the company can
        plausibly deliver. Buy mispriced expectations, not
        stories.

   3. AFS — Antifragility Score
        How a stock behaves under stress: do up-days outweigh
        down-days, how deep are its drawdowns, how long does it
        stay underwater, and does the balance sheet let it play
        offense in a crisis?

   4. CES — Compounding Engine Score
        Can the business fund its own growth? Internal compound
        rate (ROIC × retained earnings) × how much of reported
        profit is actually cash × whether profits grow faster
        than revenue (operating leverage).

   5. CFG — Crowd Friction Gauge
        Who is on the other side of your trade? Cross-references
        analyst conviction, short-seller pressure, insider skin
        in the game and crowd euphoria — and rewards the rare
        setup where believers are loud but the price hasn't
        moved yet.
   ============================================================ */

function edgeWacc(s){ return clamp(6.2 + 2.7 * (s.beta ?? 1), 7.5, 13); }

/* ---------- 1. Moat Durability Index ---------- */
function edgeMDI(s){
  const wacc = edgeWacc(s);
  const spread = s.roic != null ? s.roic - wacc : null;
  const cons = (s.rg1 != null && s.rg3 != null) ? Math.abs(s.rg1 - s.rg3) : null;
  const scale = s.mc ? Math.log(s.mc) : null;
  const v = wavg([
    [spread != null ? lin(spread, -6, 18) : null, 3],
    [s.gm != null ? lin(s.gm, 18, 68) : null, 2],
    [cons != null ? lin(cons, 15, 0) : null, 2],
    [scale != null ? lin(scale, Math.log(2), Math.log(2500)) : null, 1],
    [s.om != null ? lin(s.om, 2, 32) : null, 1]
  ]);
  let read;
  if (spread == null) read = 'Capital-return data is insufficient to judge the moat.';
  else if (v >= 70) read = `Earns ${spread.toFixed(0)}pts above its ~${wacc.toFixed(1)}% cost of capital${s.gm != null ? ` on ${s.gm.toFixed(0)}% gross margins` : ''} — excess returns look defensible.`;
  else if (v >= 45) read = `Some moat evidence (${spread >= 0 ? '+' : ''}${spread.toFixed(0)}pt return spread), but not fortress-grade — watch for competitive erosion.`;
  else read = `Returns ${spread < 0 ? 'sit below' : 'barely clear'} the cost of capital — little sign of a durable competitive advantage.`;
  return { v, read };
}

/* ---------- 2. Expectation Gap Score (reverse DCF) ---------- */
function edgeImpliedGrowth(s){
  if (!(s.fcf > 0 && s.ps && s.px)) return null;
  const d = dcfDefaults(s);
  let lo = -5, hi = 30;
  const ivAt = g => runDCF(s, g, d.discount, d.terminal).iv;
  if (ivAt(lo) >= s.px) return lo;       // priced for collapse
  if (ivAt(hi) <= s.px) return hi;       // priced beyond max model growth
  for (let i = 0; i < 36; i++){
    const mid = (lo + hi) / 2;
    if (ivAt(mid) > s.px) hi = mid; else lo = mid;
  }
  return (lo + hi) / 2;
}
function edgeXGS(s){
  const implied = edgeImpliedGrowth(s);
  if (implied == null) return { v: null, read: 'Needs positive free cash flow — a reverse DCF has nothing to invert here.', implied: null, ach: null };
  if (s.egf == null && s.rg3 == null && s.eg == null)
    return { v: null, read: `Price implies ~${implied.toFixed(0)}%/yr FCF growth, but no growth estimates exist to compare it against.`, implied, ach: null };
  const ach = wavg([
    [s.egf != null ? clamp(s.egf, -5, 30) : null, 5],
    [s.rg3 != null ? clamp(s.rg3, -5, 30) : null, 3],
    [s.eg != null ? clamp(s.eg, -5, 30) : null, 2]
  ]);
  const gap = ach - implied;
  const v = lin(gap, -14, 14);
  let read;
  if (gap > 5) read = `Price only assumes ~${implied.toFixed(0)}%/yr FCF growth, while fundamentals support ~${ach.toFixed(0)}% — expectations look beatable.`;
  else if (gap > -4) read = `Price already assumes ~${implied.toFixed(0)}%/yr growth vs ~${ach.toFixed(0)}% achievable — expectations are roughly fair.`;
  else read = `Price demands ~${implied.toFixed(0)}%/yr growth but ~${ach.toFixed(0)}% looks achievable — the market is paying for a story.`;
  return { v, read, implied, ach };
}

/* ---------- 3. Antifragility Score ---------- */
function edgeAFS(s, series){
  const n = series.length, start = Math.max(1, n - 252);
  let upSum = 0, upN = 0, dnSum = 0, dnN = 0;
  let peak = series[start - 1], maxDD = 0, under = 0;
  for (let i = start; i < n; i++){
    const r = series[i] / series[i - 1] - 1;
    if (r > 0){ upSum += r; upN++; } else if (r < 0){ dnSum -= r; dnN++; }
    if (series[i] > peak) peak = series[i];
    const dd = (series[i] / peak - 1) * 100;
    if (dd < -5) under++;          // "underwater" = more than 5% below the running peak
    if (dd < maxDD) maxDD = dd;
  }
  const asym = (upN && dnN) ? (upSum / upN) / (dnSum / dnN) : null;
  const uwFrac = under / (n - start);
  const v = wavg([
    [asym != null ? lin(asym, 0.82, 1.18) : null, 3],
    [lin(maxDD, -55, -10), 2],
    [lin(uwFrac, 0.90, 0.10), 2],
    [s.fcf != null ? lin(s.fcf, -5, 25) : null, 2],
    [s.de != null ? lin(s.de, 2.8, 0) : null, 1],
    [lin(s.beta ?? 1, 2.2, 0.6), 1]
  ]);
  const uwPct = Math.round(uwFrac * 100);
  let read;
  if (v >= 70) read = `Up-days outweigh down-days (${asym ? asym.toFixed(2) + '×' : '—'}), max 1Y drawdown ${maxDD.toFixed(0)}%, >5% off its high only ${uwPct}% of the year — absorbs shocks and recovers fast.`;
  else if (v >= 45) read = `Ordinary resilience: ${maxDD.toFixed(0)}% max drawdown, spent ${uwPct}% of the past year more than 5% below its high.`;
  else read = `Fragile profile — ${maxDD.toFixed(0)}% drawdowns, stuck >5% below its high ${uwPct}% of the year${s.fcf != null && s.fcf < 0 ? ', with no cash buffer to play offense' : ''}.`;
  return { v, read, asym, maxDD, uwFrac };
}

/* ---------- 4. Compounding Engine Score ---------- */
function edgeCES(s){
  const retention = s.po != null ? clamp(1 - s.po / 100, 0, 1) : 1;
  const icr = s.roic != null ? Math.max(0, s.roic) * retention : null;       // internal compounding rate
  const conv = (s.fcf != null && s.nm != null && s.nm > 2) ? s.fcf / s.nm : null; // cash conversion
  const opLev = (s.eg != null && s.rg3 != null) ? s.eg - s.rg3 : null;       // profits growing faster than sales?
  const v = wavg([
    [icr != null ? lin(icr, 0, 20) : null, 3],
    [conv != null ? lin(conv, 0.35, 1.25) : null, 3],
    [opLev != null ? lin(opLev, -8, 14) : null, 2],
    [s.dil != null ? lin(s.dil, 4, -3) : null, 2],   // real share-count trend: buybacks reward, dilution punishes
    [s.egf != null ? lin(s.egf, 0, 25) : null, 1]
  ]);
  const dilTxt = s.dil != null ? (s.dil < -0.5 ? ` Share count shrinking ${Math.abs(s.dil).toFixed(1)}%/yr — buybacks compound your stake.` : s.dil > 1.5 ? ` Dilution of ${s.dil.toFixed(1)}%/yr quietly taxes shareholders.` : '') : '';
  let read;
  if (icr == null) read = 'Cannot estimate the self-funding rate — capital-return data missing.' + dilTxt;
  else if (v >= 70) read = `Can internally compound ~${icr.toFixed(0)}%/yr from retained earnings${conv != null ? `, with ${Math.round(conv * 100)}% of profits arriving as actual cash` : ''}.` + dilTxt;
  else if (v >= 45) read = `Moderate engine: ~${icr.toFixed(0)}%/yr self-funded compounding${conv != null && conv < 0.7 ? ', but earnings convert poorly to cash' : ''}.` + dilTxt;
  else read = `Weak engine — ${icr.toFixed(0)}%/yr internal compounding${opLev != null && opLev < 0 ? ' and profits growing slower than revenue' : ''}; growth must be bought, not earned.` + dilTxt;
  return { v, read, icr, conv };
}

/* ---------- 5. Crowd Friction Gauge ---------- */
function edgeCFG(s, mo){
  const tot = s.ar ? s.ar[0] + s.ar[1] + s.ar[2] : 0;
  const conv = tot >= 5 ? s.ar[0] / tot * 100 : null;
  const calm = clamp(100 - Math.abs(mo.rsi - 55) * 2.2, 0, 100);
  const unpriced = conv != null ? conv - mo.pos52 : null;  // believers vs how far price has already run
  const v = wavg([
    [conv != null ? lin(conv, 25, 88) : null, 3],
    [lin(s.si ?? 0, 8, 0.4), 3],
    [lin(s.io ?? 0, 0, 12), 1],
    [calm, 2],
    [unpriced != null ? lin(unpriced, -45, 45) : null, 2]
  ]);
  let read;
  if (conv == null) read = `Thin analyst coverage — short interest ${(s.si ?? 0).toFixed(1)}% is the main crowd signal.`;
  else if (v >= 70) read = `${conv.toFixed(0)}% of analysts say buy with only ${(s.si ?? 0).toFixed(1)}% short interest${unpriced > 15 ? ' — and the price hasn’t caught up to the believers yet' : ' — conviction is aligned, not euphoric'}.`;
  else if (v >= 45) read = `Contested name: ${conv.toFixed(0)}% buy ratings against ${(s.si ?? 0).toFixed(1)}% short interest — expect volatility while the crowd argues.`;
  else read = `The crowd is against it${s.si > 5 ? ` (${s.si.toFixed(1)}% of the float sold short)` : ''}${mo.rsi > 75 ? ' and momentum chasers are euphoric — a dangerous mix' : ''}.`;
  return { v, read, conv, unpriced };
}

/* ---------- composite ---------- */
const EDGE_DEFS = [
  { k: 'mdi', name: 'Moat Durability', ic: '⛨', q: 'Is the excess return defensible?' },
  { k: 'xgs', name: 'Expectation Gap', ic: '⇋', q: 'What growth is the price already paying for?' },
  { k: 'afs', name: 'Antifragility', ic: '⌁', q: 'How does it behave under stress?' },
  { k: 'ces', name: 'Compounding Engine', ic: '↻', q: 'Can it fund its own growth?' },
  { k: 'cfg', name: 'Crowd Friction', ic: '⚖', q: 'Who is on the other side of the trade?' }
];

function computeEdge(s, series, mo){
  const e = {
    mdi: edgeMDI(s),
    xgs: edgeXGS(s),
    afs: edgeAFS(s, series),
    ces: edgeCES(s),
    cfg: edgeCFG(s, mo)
  };
  e.score = wavg(EDGE_DEFS.map(d => [e[d.k].v, 1]));
  return e;
}
