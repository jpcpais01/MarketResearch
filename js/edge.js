/* ============================================================
   Emerald · EDGE — eight original detection signals
   These are Emerald's own methods, designed for this app —
   not textbook formulas. Each answers a question the classic
   pillars don't ask, scores 0–100, and is null-safe.

   Two ideas power the suite that most retail tools ignore:
   · MARKET-RELATIVE behavior — a stock's returns mean little
     in isolation; what matters is how it behaves on the days
     the MARKET moves (AFS, TQS use the real index series).
   · CROSS-SECTIONAL rank — cheap/expensive and good/bad are
     relative statements; QAD and MDI rank every stock against
     the live 300-name universe, not fixed thresholds.

   1. MDI — Moat Durability Index
        "Is the excess return defensible?" Spread of returns
        over the cost of capital × the evidence it persists:
        sector-relative ROIC rank, pricing power, and how
        steady the real multi-year revenue path has been.

   2. XGS — Expectation Gap Score (reverse DCF)
        Solve the DCF backwards: what growth is the market
        ALREADY paying for at today's price? Compare with what
        the company can plausibly deliver. Buy mispriced
        expectations, not stories.

   3. QAD — Quality-at-a-Discount
        Rank every stock's business quality (ROIC, cash
        conversion, margins) and its price tag (EV/EBITDA,
        P/E, P/S) against the whole universe. Score the GAP:
        top-shelf goods on a mid-shelf price beat both cheap
        junk and perfect-but-priced-for-it compounders.

   4. TQS — Trend Quality Score
        Not whether it beat the market, but HOW: information
        ratio over the past 12 months (excluding the noisy
        last month), consistency across rolling quarters, and
        a penalty for lottery-style gain spikes — smooth
        excess return persists; spiky excess return reverts.

   5. AFS — Antifragility Score
        Convexity, measured: how much of the market's rallies
        does it capture vs how much of the sell-offs does it
        absorb? Includes behavior on the market's 15 worst
        days, drawdown depth/duration, and the balance-sheet
        buffers that let it play offense in a crisis.

   6. PAS — Price Action Score
        Market-day independence, counted not assumed: on the
        days the S&P 500 actually fell, how often did THIS
        stock close green? Plus rally participation, the daily
        beat rate, and whether buyers return the day after the
        market's worst sessions. Explored in depth on the
        dedicated Price Action page.

   7. CES — Compounding Engine Score
        Can the business fund its own growth? Internal compound
        rate (ROIC × retained earnings) × how much of reported
        profit is actually cash × operating leverage.

   8. CFG — Crowd Friction Gauge
        Who is on the other side of your trade? Analyst
        conviction and price targets vs short-seller pressure,
        insider skin in the game, crowd euphoria — and the rare
        setup where believers are loud but the price hasn't
        moved yet.
   ============================================================ */

function edgeWacc(s){ return clamp(6.2 + 2.7 * (s.beta ?? 1), 7.5, 13); }

/* like wavg, but abstains instead of defaulting to 50 when no component exists */
function wavgOrNull(pairs){
  let num = 0, den = 0;
  for (const [v, w] of pairs){ if (v != null){ num += v * w; den += w; } }
  return den ? num / den : null;
}

/* percentile rank (0–100) of v within the live universe for a stat key */
function edgePct(key, v){
  if (v == null || !isFinite(v)) return null;
  if (typeof EDGE_STATS === 'undefined' || !EDGE_STATS) return null;
  const arr = EDGE_STATS[key];
  if (!arr || arr.length < 20) return null;
  let lo = 0, hi = arr.length;
  while (lo < hi){ const m = (lo + hi) >> 1; if (arr[m] <= v) lo = m + 1; else hi = m; }
  return lo / arr.length * 100;
}
const edgeOrd = p => { const n = Math.round(p); const s = n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th'; return n + s; };

/* aligned daily returns of stock vs market index over the common tail */
function edgeAligned(series){
  const mkt = marketSeries();
  const k = Math.min(series.length, mkt.length) - 1;
  const sr = new Array(k), mr = new Array(k);
  const so = series.length - k - 1, mo = mkt.length - k - 1;
  for (let i = 1; i <= k; i++){
    sr[i - 1] = series[so + i] / series[so + i - 1] - 1;
    mr[i - 1] = mkt[mo + i] / mkt[mo + i - 1] - 1;
  }
  return [sr, mr];
}

/* OLS fit of log(annual revenue): how straight is the real growth path? */
function edgeRevPath(s){
  const rv = (s.revHist || []).filter(v => v > 0);
  if (rv.length < 4) return null;
  const ys = rv.map(Math.log), n = ys.length;
  const xm = (n - 1) / 2, ym = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++){ sxy += (i - xm) * (ys[i] - ym); sxx += (i - xm) ** 2; syy += (ys[i] - ym) ** 2; }
  const slope = sxy / sxx;
  const r2 = syy > 0 ? (sxy * sxy) / (sxx * syy) : 0;
  return { r2: slope > 0 ? r2 : 0, cagr: (Math.exp(slope) - 1) * 100 };
}

/* ---------- 1. Moat Durability Index ---------- */
function edgeMDI(s){
  const wacc = edgeWacc(s);
  const spread = s.roic != null ? s.roic - wacc : null;
  const cons = (s.rg1 != null && s.rg3 != null) ? Math.abs(s.rg1 - s.rg3) : null;
  const scale = s.mc ? Math.log(s.mc) : null;
  const secRank = edgePct('roic:' + s.sec, s.roic) ?? edgePct('roic', s.roic);
  const path = edgeRevPath(s);
  const v = wavg([
    [spread != null ? lin(spread, -6, 18) : null, 3],
    [secRank, 2],
    [s.gm != null ? lin(s.gm, 18, 68) : null, 2],
    [path ? lin(path.r2, 0.2, 1.0) : null, 2],
    [cons != null ? lin(cons, 15, 0) : null, 1],
    [scale != null ? lin(scale, Math.log(2), Math.log(2500)) : null, 1]
  ]);
  let read;
  if (spread == null) read = 'Capital-return data is insufficient to judge the moat.';
  else if (v >= 70) read = `Earns ${spread.toFixed(0)}pts above its ~${wacc.toFixed(1)}% cost of capital${secRank != null ? ` (${edgeOrd(secRank)} percentile of its sector)` : ''}${path && path.r2 > 0.9 ? ', on a near-ruler-straight revenue path' : ''} — excess returns look defensible.`;
  else if (v >= 45) read = `Some moat evidence (${spread >= 0 ? '+' : ''}${spread.toFixed(0)}pt return spread${path && path.r2 < 0.5 ? ', but an erratic revenue path' : ''}) — not fortress-grade; watch for competitive erosion.`;
  else read = `Returns ${spread < 0 ? 'sit below' : 'barely clear'} the cost of capital${secRank != null && secRank < 35 ? ` and rank in the bottom of its sector` : ''} — little sign of a durable advantage.`;
  return { v, read, spread, secRank, path };
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

/* ---------- 3. Quality-at-a-Discount ---------- */
function edgeQAD(s){
  const q = wavgOrNull([
    [edgePct('roic', s.roic), 4],
    [edgePct('fcf', s.fcf), 3],
    [edgePct('gm', s.gm), 2],
    [edgePct('nm', s.nm), 2]
  ]);
  const p = wavgOrNull([
    [edgePct('ev', s.ev), 4],
    [edgePct('fpe', s.fpe ?? s.pe), 4],
    [edgePct('ps', s.ps), 2]
  ]);
  if (q == null || p == null)
    return { v: null, read: 'Not enough cross-sectional data to rank quality against price.', q: null, p: null };
  const v = lin(q - p, -40, 45);
  let read;
  if (v >= 70) read = `Top-shelf goods on a mid-shelf tag: ${edgeOrd(q)}-percentile business quality priced at the ${edgeOrd(p)} percentile of the universe — the market is underrating the quality.`;
  else if (v >= 45) read = `Fairly ranked: ${edgeOrd(q)}-percentile quality at a ${edgeOrd(p)}-percentile price — you get roughly what you pay for.`;
  else read = `Paying up: priced at the ${edgeOrd(p)} percentile of the universe while quality ranks ${edgeOrd(q)} — the price assumes a better business than today's numbers show.`;
  return { v, read, q, p };
}

/* ---------- 4. Trend Quality Score ---------- */
function edgeTQS(s, series){
  const [sr, mr] = edgeAligned(series);
  const n1 = Math.min(sr.length, 252);
  if (n1 < 120) return { v: null, read: 'Not enough trading history to judge trend quality.', ir: null, consis: null };
  // 12-1 window: skip the most recent month (short-term reversal noise)
  const ex = [];
  for (let i = sr.length - n1; i < sr.length - 21; i++) ex.push(sr[i] - mr[i]);
  const mu = ex.reduce((a, b) => a + b, 0) / ex.length;
  const sd = Math.sqrt(ex.reduce((a, b) => a + (b - mu) * (b - mu), 0) / ex.length);
  const ir = sd ? mu / sd * Math.sqrt(252) : 0;
  let wins = 0, tot = 0;
  for (let e = sr.length - 21; e - 63 >= sr.length - n1; e -= 21){
    let acc = 0; for (let i = e - 63; i < e; i++) acc += sr[i] - mr[i];
    if (acc > 0) wins++; tot++;
  }
  const consis = tot ? wins / tot : null;
  const lastY = sr.slice(-252).slice().sort((a, b) => b - a);
  const max5 = lastY.slice(0, 5).reduce((a, b) => a + b, 0) / 5 * 100;   // lottery profile
  const vol = Math.sqrt(sr.slice(-252).reduce((a, b) => a + b * b, 0) / Math.min(252, sr.length)) * Math.sqrt(252) * 100;
  const v = wavg([
    [lin(ir, -2.2, 2.0), 4],
    [consis != null ? lin(consis, 0.10, 0.90) : null, 3],
    [lin(max5, 13, 3), 2],
    [lin(vol, 65, 18), 1]
  ]);
  const winPct = consis != null ? Math.round(consis * 100) : null;
  let read;
  if (v >= 70) read = `Beating the market the way that persists: ${ir.toFixed(1)} information ratio, ahead in ${winPct}% of rolling quarters — steady excess return, not lucky spikes.`;
  else if (v >= 45) read = `Mixed trend: ${ir >= 0 ? 'mild outperformance' : 'a slight lag'} vs the market (IR ${ir.toFixed(1)}), ahead in ${winPct}% of rolling quarters.`;
  else if (max5 > 9) read = `Lottery-ticket tape — gains arrive in rare ${max5.toFixed(0)}%-a-day spikes (IR ${ir.toFixed(1)}); spiky profiles like this historically revert.`;
  else read = `Persistently behind the market: IR ${ir.toFixed(1)}, ahead in ${winPct > 0 ? `only ${winPct}%` : 'none'} of its rolling quarters — owning it means fighting the tape.`;
  return { v, read, ir, consis, max5 };
}

/* ---------- 5. Antifragility Score (convexity, measured) ---------- */
function edgeAFS(s, series){
  const [sr, mr] = edgeAligned(series);
  let dS = 0, dM = 0, dN = 0, uS = 0, uM = 0, uN = 0;
  for (let i = 0; i < sr.length; i++){
    if (mr[i] < -0.005){ dS += sr[i]; dM += mr[i]; dN++; }
    else if (mr[i] > 0.005){ uS += sr[i]; uM += mr[i]; uN++; }
  }
  const downCap = dN >= 15 ? dS / dM : null;   // <1 resists sell-offs; <0 rises in them
  const upCap   = uN >= 15 ? uS / uM : null;
  const cvx = (downCap != null && upCap != null) ? upCap - downCap : null;
  let tailCap = null;                           // the market's 15 worst days
  if (mr.length >= 60){
    const worst = mr.map((v, i) => i).sort((a, b) => mr[a] - mr[b]).slice(0, 15);
    let tS = 0, tM = 0; for (const i of worst){ tS += sr[i]; tM += mr[i]; }
    tailCap = tS / tM;
  }
  const n = series.length, start = Math.max(1, n - 252);
  let peak = series[start - 1], maxDD = 0, under = 0;
  for (let i = start; i < n; i++){
    if (series[i] > peak) peak = series[i];
    const dd = (series[i] / peak - 1) * 100;
    if (dd < -5) under++;          // "underwater" = more than 5% below the running peak
    if (dd < maxDD) maxDD = dd;
  }
  const uwFrac = under / (n - start);
  const v = wavg([
    [cvx != null ? lin(cvx, -0.30, 0.35) : null, 4],
    [tailCap != null ? lin(tailCap, 1.9, 0.0) : null, 2],
    [lin(maxDD, -55, -10), 2],
    [lin(uwFrac, 0.90, 0.10), 1],
    [s.fcf != null ? lin(s.fcf, -5, 25) : null, 1],
    [s.de != null ? lin(s.de, 2.8, 0) : null, 1]
  ]);
  const up = upCap != null ? Math.round(upCap * 100) : null;
  const dn = downCap != null ? Math.round(downCap * 100) : null;
  let read;
  if (cvx == null) read = `Not enough market overlap to measure convexity; max 1Y drawdown ${maxDD.toFixed(0)}%.`;
  else if (v >= 70) read = dn < 0
    ? `Antifragile in the data: it RISES on the market’s down days on average, while still taking ${up}% of rallies — max 1Y drawdown ${maxDD.toFixed(0)}%.`
    : `Convex payoff: captures ${up}% of market rallies but absorbs only ${dn}% of sell-offs${tailCap != null && tailCap < 0.5 ? ', and held firm on the market’s worst days' : ''} — max 1Y drawdown ${maxDD.toFixed(0)}%.`;
  else if (v >= 45) read = `Symmetric ride: ${up}% of rallies, ${dn}% of sell-offs, ${maxDD.toFixed(0)}% max drawdown — moves with the market rather than above it.`;
  else read = up >= 120
    ? `High-octane both ways — amplifies rallies to ${up}% but sell-offs to ${dn}%; net concave, with ${maxDD.toFixed(0)}% drawdowns.`
    : `Concave profile — soaks up ${dn}% of market sell-offs while capturing just ${up}% of rallies, with ${maxDD.toFixed(0)}% drawdowns${s.fcf != null && s.fcf < 0 ? ' and no cash buffer to play offense' : ''}.`;
  return { v, read, upCap, downCap, cvx, tailCap, maxDD, uwFrac };
}

/* ---------- 6. Price Action Score (market-day independence) ---------- */
function edgePAS(s, series){
  const pa = priceActionStats(series, marketSeries(), 252);
  if (!pa || pa.mktDown.days < 25 || pa.mktDown.rate == null)
    return { v: null, read: 'Not enough market-day overlap to judge independent price action.', rate: null };
  const v = wavg([
    [lin(pa.mktDown.rate, 26, 58), 4],            // rises when the market falls — the core ask
    [lin(pa.mktUp.rateDn, 54, 26), 2],            // doesn't skip rallies
    [lin(pa.beat, 42, 56), 2],                    // daily edge over the tape
    [pa.worstDays && pa.worstDays.bounce != null ? lin(pa.worstDays.bounce, -0.5, 1.5) : null, 2]  // bid returns after the market's worst days
  ]);
  const rate = pa.mktDown.rate;
  let read;
  if (v >= 65) read = `Marches to its own drum: rose on ${pa.mktDown.stockUp} of the market’s ${pa.mktDown.days} down days (${rate.toFixed(0)}%) and beats the tape on ${pa.beat.toFixed(0)}% of all days — buyers show up even when the market sells.`;
  else if (rate >= 55) read = `Defensive bid: up on ${rate.toFixed(0)}% of market down days, but it gives ground elsewhere${pa.mktUp.rateDn > 40 ? ` — red on ${pa.mktUp.rateDn.toFixed(0)}% of the market’s up days` : ''}.`;
  else if (v >= 45) read = `Typical coupling: up on ${rate.toFixed(0)}% of market down days, beats the tape ${pa.beat.toFixed(0)}% of days — direction is mostly set by the market.`;
  else read = `No independent bid — rose on just ${rate.toFixed(0)}% of the market’s down days${pa.mktUp.rateDn > 42 ? ' and still missed ' + pa.mktUp.rateDn.toFixed(0) + '% of its up days' : ''}; it needs the tape to carry it.`;
  return { v, read, rate, beat: pa.beat };
}

/* ---------- 7. Compounding Engine Score ---------- */
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

/* ---------- 8. Crowd Friction Gauge ---------- */
function edgeCFG(s, mo){
  const tot = s.ar ? s.ar[0] + s.ar[1] + s.ar[2] : 0;
  const conv = tot >= 5 ? s.ar[0] / tot * 100 : null;
  const calm = clamp(100 - Math.abs(mo.rsi - 55) * 2.2, 0, 100);
  const unpriced = conv != null ? conv - mo.pos52 : null;  // believers vs how far price has already run
  const tu = (s.tp && s.px) ? (s.tp / s.px - 1) * 100 : null;  // analyst mean target upside
  const v = wavg([
    [conv != null ? lin(conv, 25, 88) : null, 3],
    [tu != null ? lin(tu, -8, 40) : null, 2],
    [lin(s.si ?? 0, 8, 0.4), 2],
    [unpriced != null ? lin(unpriced, -45, 45) : null, 2],
    [calm, 1],
    [lin(s.io ?? 0, 0, 12), 1]
  ]);
  let read;
  if (conv == null) read = `Thin analyst coverage — short interest ${(s.si ?? 0).toFixed(1)}%${tu != null ? ` and a target ${tu >= 0 ? tu.toFixed(0) + '% above' : Math.abs(tu).toFixed(0) + '% below'} the price` : ''} are the main crowd signals.`;
  else if (v >= 70) read = `${conv.toFixed(0)}% of analysts say buy${tu != null && tu > 5 ? ` with targets ~${tu.toFixed(0)}% above the price` : ''} and only ${(s.si ?? 0).toFixed(1)}% short interest${unpriced > 15 ? ' — and the price hasn’t caught up to the believers yet' : ' — conviction is aligned, not euphoric'}.`;
  else if (v >= 45) read = `Contested name: ${conv.toFixed(0)}% buy ratings against ${(s.si ?? 0).toFixed(1)}% short interest${tu != null ? `, targets ${tu >= 0 ? '+' : ''}${tu.toFixed(0)}% away` : ''} — expect volatility while the crowd argues.`;
  else read = `The crowd is against it${s.si > 5 ? ` (${s.si.toFixed(1)}% of the float sold short)` : ''}${tu != null && tu < 0 ? `, with analyst targets ${Math.abs(tu).toFixed(0)}% BELOW the price` : ''}${mo.rsi > 75 ? ' and momentum chasers are euphoric — a dangerous mix' : ''}.`;
  return { v, read, conv, unpriced, tu };
}

/* ---------- composite ---------- */
const EDGE_DEFS = [
  { k: 'mdi', name: 'Moat Durability',    ic: '⛨', q: 'Is the excess return defensible?' },
  { k: 'xgs', name: 'Expectation Gap',    ic: '⇋', q: 'What growth is the price already paying for?' },
  { k: 'qad', name: 'Quality vs Price',   ic: '◈', q: 'Do you get more than you pay for?' },
  { k: 'tqs', name: 'Trend Quality',      ic: '∿', q: 'Is it beating the market persistently — or luckily?' },
  { k: 'afs', name: 'Antifragility',      ic: '⌁', q: 'Does it gain more in rallies than it loses in stress?' },
  { k: 'pas', name: 'Price Action',       ic: '⇅', q: 'Can it rise when the market falls?' },
  { k: 'ces', name: 'Compounding Engine', ic: '↻', q: 'Can it fund its own growth?' },
  { k: 'cfg', name: 'Crowd Friction',     ic: '⚖', q: 'Who is on the other side of the trade?' }
];

function computeEdge(s, series, mo){
  const e = {
    mdi: edgeMDI(s),
    xgs: edgeXGS(s),
    qad: edgeQAD(s),
    tqs: edgeTQS(s, series),
    afs: edgeAFS(s, series),
    pas: edgePAS(s, series),
    ces: edgeCES(s),
    cfg: edgeCFG(s, mo)
  };
  e.score = wavg(EDGE_DEFS.map(d => [e[d.k].v, 1]));
  return e;
}
