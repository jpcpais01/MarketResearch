/* ============================================================
   Emerald · analysis engine
   Multi-factor scoring (Value / Growth / Quality / Health /
   Momentum → Emerald Score), DCF intrinsic value, Graham
   number, Piotroski F-Score, Altman Z-Score, flag detection,
   deterministic price-history synthesis.
   ============================================================ */

// ---------- deterministic RNG (per ticker) ----------
function hashStr(s){ let h = 2166136261; for (let i = 0; i < s.length; i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function mulberry32(a){ return function(){ a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// Linear score 0–100 between "worst" and "best" (direction-agnostic). Null-safe.
function lin(v, worst, best){
  if (v == null || !isFinite(v)) return null;
  return clamp(((v - worst) / (best - worst)) * 100, 0, 100);
}
// Weighted average that skips null components.
function wavg(pairs){
  let num = 0, den = 0;
  for (const [s, w] of pairs){ if (s != null){ num += s * w; den += w; } }
  return den ? num / den : 50;
}

// ---------- price history synthesis (5y daily, ends at current px) ----------
const TRADING_DAYS = 1260;
function genSeries(t, px, beta, trendHint, volHint){
  const r = mulberry32(hashStr(t));
  const vol = volHint != null ? volHint : 0.0085 * Math.max(beta, 0.45) + 0.0048;
  const trend = trendHint != null ? trendHint
    : clamp((trendHint ?? 0) , -1, 1) || clamp(0.06 + (r() - 0.45) * 0.55 + 0.0, -0.38, 0.52);
  const drift = trend / 252;
  // long-wave regimes for realism
  const ph1 = r() * Math.PI * 2, ph2 = r() * Math.PI * 2, ph3 = r() * Math.PI * 2;
  const a1 = 0.25 + r() * 0.5, a2 = 0.2 + r() * 0.4;
  let logp = 0; const cum = new Array(TRADING_DAYS);
  for (let i = 0; i < TRADING_DAYS; i++){
    const g = (r() * 2 - 1) + (r() * 2 - 1) + (r() * 2 - 1); // ~triangular noise
    const wave = a1 * Math.sin(i / 210 + ph1) + a2 * Math.sin(i / 88 + ph2) + 0.15 * Math.sin(i / 23 + ph3);
    logp += drift + vol * (g * 0.6 + wave * 0.35);
    cum[i] = logp;
  }
  const scale = px / Math.exp(cum[TRADING_DAYS - 1]);
  const out = new Float64Array(TRADING_DAYS);
  for (let i = 0; i < TRADING_DAYS; i++) out[i] = scale * Math.exp(cum[i]);
  return out;
}
// trading-day dates ending today
const SERIES_DATES = (() => {
  const d = [], cur = new Date();
  while (d.length < TRADING_DAYS){
    const wd = cur.getDay();
    if (wd !== 0 && wd !== 6) d.push(new Date(cur));
    cur.setDate(cur.getDate() - 1);
  }
  return d.reverse();
})();

// ---------- technicals ----------
function smaAt(arr, n, idx){ let s = 0; for (let i = idx - n + 1; i <= idx; i++) s += arr[i]; return s / n; }
function rsi14(arr){
  let g = 0, l = 0;
  for (let i = arr.length - 14; i < arr.length; i++){
    const d = arr[i] - arr[i - 1];
    if (d > 0) g += d; else l -= d;
  }
  if (l === 0) return 100;
  return 100 - 100 / (1 + (g / 14) / (l / 14));
}
const pctRet = (arr, n) => (arr[arr.length - 1] / arr[arr.length - 1 - n] - 1) * 100;

// ---------- fundamentals synthesis ----------
function finHistory(s, r){
  // fiscal years of revenue / EPS (current year last). Uses REAL annual
  // revenues from income statements when the live API provides them.
  const real = s.revHist && s.revHist.length >= 3 ? s.revHist : null;
  const years = real ? real.length : 6;
  const rev0 = real ? real[real.length - 1] : (s.ps ? s.mc / s.ps : 1);
  const eps0 = s.pe ? s.px / s.pe : (s.px * (s.nm ?? -10) / 100) / (s.ps || 1);
  const rg = (s.rg3 ?? 4) / 100, eg = (s.eg ?? s.rg3 ?? 4) / 100;
  const rev = [], eps = [];
  for (let k = years - 1; k >= 0; k--){
    rev.push(real ? real[years - 1 - k] : rev0 / Math.pow(1 + rg, k) * (1 + (r() - 0.5) * 0.10));
    eps.push(eps0 / Math.pow(1 + Math.max(eg, -0.45), k) * (real ? 1 : 1 + (r() - 0.5) * 0.16));
  }
  return { rev, eps, real: !!real };
}

// ---------- DCF ----------
function runDCF(s, growthPct, discountPct, terminalPct){
  const fcfps = (s.fcf != null && s.fcf > 0 && s.ps) ? (s.px / s.ps) * s.fcf / 100 : null;
  if (fcfps == null) return null;
  const g0 = clamp(growthPct, -5, 30) / 100;
  const rD = clamp(discountPct, 5, 16) / 100;
  const gT = clamp(terminalPct, 0, Math.min(4, discountPct - 1)) / 100;
  let pv = 0, f = fcfps;
  for (let y = 1; y <= 10; y++){
    const g = g0 + (gT - g0) * ((y - 1) / 9); // fade to terminal
    f *= 1 + g;
    pv += f / Math.pow(1 + rD, y);
  }
  const tv = (f * (1 + gT)) / (rD - gT);
  const iv = pv + tv / Math.pow(1 + rD, 10);
  return { iv, upside: (iv / s.px - 1) * 100, fcfps };
}
function dcfDefaults(s){
  return {
    growth: clamp(s.egf ?? s.rg3 ?? 5, 2, 24),
    discount: Math.round(clamp(6.2 + 2.7 * (s.beta ?? 1), 7.5, 13) * 10) / 10,
    terminal: 2.5
  };
}

// ---------- Altman Z (approximated from ratio set) ----------
function altmanZ(s){
  if (!s.ps || !s.mc) return null;
  if (s.roa == null || s.roa === 0 || s.de == null || s.ic === null && s.cr === null) return null;
  const rev = s.mc / s.ps;
  const ni = rev * (s.nm ?? 0) / 100;
  const assets = Math.abs(s.roa) > 0.2 ? ni / (s.roa / 100) : null;
  if (!assets || assets <= 0) return null;
  const liab = clamp(assets * (s.de / (1 + s.de)) * 1.3, assets * 0.12, assets * 0.95);
  const equity = assets - liab;
  const cl = liab * 0.45;
  const wc = (s.cr != null ? s.cr * cl : cl) - cl;
  const re = equity * 0.55;
  const ebit = rev * (s.om ?? 0) / 100;
  const z = 1.2 * wc / assets + 1.4 * re / assets + 3.3 * ebit / assets + 0.6 * s.mc / liab + rev / assets;
  return clamp(z, -2, 12);
}

// ---------- Piotroski F-Score (synthesized, deterministic) ----------
function piotroski(s, r){
  const roll = p => r() < clamp(p, 0.05, 0.95);
  let f = 0;
  const profitable = (s.nm ?? -1) > 0;
  if (profitable) f++;                                                   // 1 positive net income
  if (s.fcf != null ? s.fcf > 0 : profitable) f++;                       // 2 positive operating cash flow
  if (roll(0.5 + ((s.rg1 ?? 0) - (s.rg3 ?? 0)) / 40 + (s.eg ?? 0) / 220)) f++;  // 3 improving ROA
  if (s.fcf != null ? s.fcf > (s.nm ?? 0) : roll(0.5)) f++;              // 4 accruals: CFO > NI
  if (roll(0.66 - (s.de ?? 1) * 0.11)) f++;                              // 5 falling leverage
  if (roll(0.5 + ((s.cr ?? 1.2) - 1.2) * 0.12)) f++;                     // 6 rising current ratio
  if (roll(0.78 - s.si / 18 - (profitable ? 0 : 0.30))) f++;             // 7 no dilution
  if (roll(0.5 + ((s.om ?? 0) - 14) / 110)) f++;                         // 8 rising gross margin
  if (roll(0.5 + (s.rg1 ?? 0) / 55)) f++;                                // 9 rising asset turnover
  return f;
}

// ---------- pillar scores ----------
function scoreValue(s, dcf, sectorPE){
  const ey  = s.pe  ? 100 / s.pe  : ((s.nm ?? 0) < 0 ? 0 : null);
  const fey = s.fpe ? 100 / s.fpe : ((s.nm ?? 0) < 0 ? 5 : null);
  const fcfY = (s.fcf != null && s.ps) ? s.fcf / s.ps : null;
  const peg = (s.pe && s.egf > 0) ? s.pe / s.egf : null;
  const relPE = (s.pe && sectorPE) ? s.pe / sectorPE : null;
  return wavg([
    [dynLin('ey', ey, 1, 9), 3],
    [dynLin('fey', fey, 1, 9), 2],
    [dynLin('fcfY', fcfY, 0, 8), 3],
    [peg != null ? lin(peg, 4, 0.7) : null, 2],
    [s.ev != null ? dynLin('ev', s.ev, 30, 6) : null, 2],
    [s.pb != null ? dynLin('pb', s.pb, 16, 1) : null, 1],
    [relPE != null ? lin(relPE, 2.2, 0.55) : null, 2],
    [dcf ? lin(dcf.upside, -40, 60) : null, 3]
  ]);
}
function scoreGrowth(s){
  const cons = (s.rg1 != null && s.rg3 != null) ? Math.abs(s.rg1 - s.rg3) : null;
  return wavg([
    [dynLin('rg3', s.rg3, -5, 25), 3],
    [dynLin('rg1', s.rg1, -5, 25), 2],
    [s.eg != null ? dynLin('eg', s.eg, -10, 32) : ((s.nm ?? 0) < 0 ? 25 : null), 3],
    [dynLin('egf', s.egf, 0, 26), 3],
    [cons != null ? lin(cons, 16, 0) : null, 1]
  ]);
}
function scoreQuality(s){
  const roeC = s.roe != null ? Math.min(s.roe, 42) : null;
  return wavg([
    [s.gm != null ? dynLin('gm', s.gm, 15, 70) : null, 1],
    [dynLin('om', s.om, 0, 36), 2],
    [dynLin('nm', s.nm, 0, 30), 2],
    [dynLin('roe', roeC, 0, 32), 2],
    [s.roic != null ? dynLin('roic', s.roic, 0, 26) : null, 3],
    [dynLin('roa', s.roa, 0, 20), 2],
    [s.fcf != null ? dynLin('fcf', s.fcf, 0, 32) : null, 2]
  ]);
}
function scoreHealth(s, z, f){
  return wavg([
    [s.de != null ? dynLin('de', s.de, 3.2, 0) : null, 2],
    [s.cr != null ? lin(s.cr, 0.65, 2.5) : null, 1],
    [s.ic != null ? lin(s.ic, 1.5, 22) : null, 2],
    [z != null ? lin(z, 1.4, 4.2) : null, 2],
    [lin(f, 2, 9), 3]
  ]);
}
function scoreMomentum(mo){
  const rsiScore = clamp(100 - Math.abs(mo.rsi - 58) * 2.7, 0, 100);
  return wavg([
    [lin(mo.vs200, -18, 18), 3],
    [lin(mo.vs50, -10, 10), 2],
    [lin(mo.ret6m, -25, 38), 2],
    [lin(mo.pos52, 8, 95), 2],
    [rsiScore, 2]
  ]);
}

function ratingOf(score){
  if (score >= 78) return { label: 'Strong Buy', cls: 'r-sb' };
  if (score >= 64) return { label: 'Buy', cls: 'r-b' };
  if (score >= 50) return { label: 'Hold', cls: 'r-h' };
  if (score >= 36) return { label: 'Underperform', cls: 'r-u' };
  return { label: 'Avoid', cls: 'r-a' };
}
function scoreColor(v){
  if (v >= 78) return '#34d399';
  if (v >= 64) return '#a3e635';
  if (v >= 50) return '#fbbf24';
  if (v >= 36) return '#fb923c';
  return '#f87171';
}

// ---------- flags ----------
function buildFlags(s, m){
  const g = [], r = [];
  const isBank = s.cr == null && s.ic == null;
  if (m.dcf && m.dcf.upside > 25) g.push(`Trades ~${Math.round(m.dcf.upside)}% below estimated intrinsic value (DCF margin of safety)`);
  if (m.fcfYield != null && m.fcfYield > 5) g.push(`Strong ${m.fcfYield.toFixed(1)}% free-cash-flow yield — cash-rich valuation`);
  if ((s.roic ?? 0) > 15 && (s.rg3 ?? 0) > 5) g.push(`Compounder profile: ${s.roic.toFixed(0)}% ROIC with ${s.rg3.toFixed(0)}% revenue CAGR`);
  if (s.dy >= 2.2 && s.po > 0 && s.po < 68) g.push(`${s.dy.toFixed(1)}% dividend yield with a comfortable ${s.po.toFixed(0)}% payout ratio`);
  if (!isBank && s.de != null && s.de < 0.35 && (s.cr ?? 0) > 1.3) g.push('Fortress balance sheet: minimal leverage and ample liquidity');
  if (m.fscore >= 7) g.push(`High Piotroski F-Score (${m.fscore}/9) — improving fundamentals across the board`);
  if (m.z != null && m.z > 3) g.push(`Altman Z-Score of ${m.z.toFixed(1)} — bankruptcy risk effectively nil`);
  if ((s.egf ?? 0) >= 15 && s.pe && s.pe / s.egf < 1.6) g.push(`GARP setup: ${s.egf.toFixed(0)}% forecast EPS growth at PEG ${(s.pe / s.egf).toFixed(2)}`);
  if (m.mo.goldenCross) g.push('Golden cross: 50-day average just crossed above the 200-day');
  else if (m.mo.vs200 > 5 && m.mo.ret6m > 8) g.push('Established uptrend — price holding well above its 200-day average');
  if ((s.gm ?? 0) > 65) g.push(`Elite ${s.gm.toFixed(0)}% gross margin signals real pricing power`);

  if ((s.nm ?? 0) < 0) r.push('Currently unprofitable on a GAAP net-income basis');
  if (s.fcf != null && s.fcf < 0) r.push('Burning cash: negative free cash flow');
  if (!isBank && s.de != null && s.de > 2) r.push(`Heavy leverage: debt is ${s.de.toFixed(1)}× equity`);
  if (s.ic != null && s.ic > 0 && s.ic < 3.5) r.push(`Thin interest coverage (${s.ic.toFixed(1)}×) leaves little room for error`);
  if (s.po > 90) r.push(`Payout ratio of ${s.po.toFixed(0)}% — dividend is consuming nearly all earnings`);
  if ((s.rg1 ?? 0) < -2) r.push(`Revenue is shrinking (${s.rg1.toFixed(1)}% TTM)`);
  if ((s.pe ?? 0) > 55 || (s.fpe ?? 0) > 55) r.push('Very rich earnings multiple — execution must be flawless');
  if (m.z != null && m.z < 1.8) r.push(`Altman Z-Score of ${m.z.toFixed(1)} sits in the distress zone`);
  if (s.si > 5) r.push(`Elevated short interest (${s.si.toFixed(1)}% of float) — the market is betting against it`);
  if (m.mo.rsi > 78) r.push(`Overbought: RSI at ${m.mo.rsi.toFixed(0)} — chasing here risks a pullback`);
  if (m.dcf && m.dcf.upside < -25) r.push(`Price runs ~${Math.abs(Math.round(m.dcf.upside))}% above estimated intrinsic value`);
  if (m.mo.vs200 < -10) r.push('Persistent downtrend — trading well below its 200-day average');
  if (m.fscore <= 3) r.push(`Weak Piotroski F-Score (${m.fscore}/9) — fundamentals are deteriorating`);
  return { green: g, red: r };
}

// ---------- verdict prose ----------
function buildVerdict(s, m){
  const pill = [['valuation', m.sv], ['growth', m.sg], ['profitability', m.sq], ['financial health', m.sh], ['momentum', m.sm], ['Edge signals', m.edge.score]];
  pill.sort((a, b) => b[1] - a[1]);
  const best = pill[0], worst = pill[pill.length - 1];
  let txt = `${s.t} scores ${Math.round(m.score)}/100, judged as ${/^[AEIOU]/.test(m.arch.name) ? 'an' : 'a'} ${m.arch.name} under ${m.regime.name.toLowerCase()} market weighting — strongest on ${best[0]} (${Math.round(best[1])}), weakest on ${worst[0]} (${Math.round(worst[1])}).`;
  if (m.dcf) txt += m.dcf.upside >= 0
    ? ` Our base-case DCF pegs fair value near $${m.dcf.iv.toFixed(0)}, ~${Math.round(m.dcf.upside)}% above today's price.`
    : ` Our base-case DCF pegs fair value near $${m.dcf.iv.toFixed(0)}, ~${Math.abs(Math.round(m.dcf.upside))}% below today's price.`;
  txt += ` ${m.flags.green.length} green flag${m.flags.green.length === 1 ? '' : 's'} vs ${m.flags.red.length} red.`;
  txt += m.convLabel === 'High'
    ? ` Conviction is high — the pillars broadly agree.`
    : m.convLabel === 'Moderate'
      ? ` Conviction is moderate — some pillars disagree; read the flags.`
      : ` Conviction is LOW — the pillars conflict or data is thin; treat the headline number with care.`;
  return txt;
}

// ---------- shared context for the Edge signals ----------
let MKT = null;          // market (S&P 500) close series — real in live mode
function marketSeries(){
  if (MKT) return MKT;
  if (typeof LIVE_INDEXES !== 'undefined' && LIVE_INDEXES && LIVE_INDEXES.length){
    const spx = LIVE_INDEXES.find(ix => ix.t === 'SPX') || LIVE_INDEXES[0];
    MKT = spx.series;
  } else {
    const ix = INDEXES.find(i => i.t === 'SPX') || INDEXES[0];
    MKT = genSeries(ix.t, ix.px, ix.beta, ix.trend, ix.vol);
  }
  return MKT;
}

function indexSeries(t){  // any tracked index ('SPX' | 'NDX' | 'DJI'), live or synthetic
  if (typeof LIVE_INDEXES !== 'undefined' && LIVE_INDEXES && LIVE_INDEXES.length){
    const ix = LIVE_INDEXES.find(i => i.t === t) || LIVE_INDEXES[0];
    return { series: ix.series, dates: ix.dates, name: ix.n };
  }
  const def = INDEXES.find(i => i.t === t) || INDEXES[0];
  return { series: genSeries(def.t, def.px, def.beta, def.trend, def.vol), dates: SERIES_DATES, name: def.n };
}

/* ---------- price-action analytics ----------
   Day-by-day behavior of a stock vs a market index over the last `days`
   trading days. Powers both the PAS Edge signal and the Price Action page. */
function priceActionStats(series, mkt, days, dates){
  const k = Math.min(series.length, mkt.length) - 1;
  const n = Math.min(days, k);
  if (n < 15) return null;
  const so = series.length - n - 1, mo = mkt.length - n - 1;
  const sr = new Array(n), mr = new Array(n);
  for (let i = 1; i <= n; i++){
    sr[i - 1] = series[so + i] / series[so + i - 1] - 1;
    mr[i - 1] = mkt[mo + i] / mkt[mo + i - 1] - 1;
  }
  const dateAt = i => dates ? dates[series.length - n + i] : null;

  // ---- the four market-day quadrants ----
  let mDn = 0, upOnDn = 0, sumS_dn = 0, sumM_dn = 0;
  let mUp = 0, dnOnUp = 0, sumS_up = 0, sumM_up = 0;
  let beat = 0;
  let sDU = 0, sDD = 0, sUU = 0, sUD = 0;   // stock's avg move per quadrant
  for (let i = 0; i < n; i++){
    if (mr[i] < 0){ mDn++; sumS_dn += sr[i]; sumM_dn += mr[i]; if (sr[i] > 0){ upOnDn++; sDU += sr[i]; } else sDD += sr[i]; }
    else if (mr[i] > 0){ mUp++; sumS_up += sr[i]; sumM_up += mr[i]; if (sr[i] < 0){ dnOnUp++; sUD += sr[i]; } else sUU += sr[i]; }
    if (sr[i] > mr[i]) beat++;
  }

  // ---- own-move profile ----
  let up = 0, dn = 0, sumUp = 0, sumDn = 0, bi = 0, wi = 0;
  let stk = 0, maxUpStk = 0, maxDnStk = 0;
  for (let i = 0; i < n; i++){
    if (sr[i] > 0){ up++; sumUp += sr[i]; stk = stk > 0 ? stk + 1 : 1; if (stk > maxUpStk) maxUpStk = stk; }
    else if (sr[i] < 0){ dn++; sumDn += sr[i]; stk = stk < 0 ? stk - 1 : -1; if (-stk > maxDnStk) maxDnStk = -stk; }
    if (sr[i] > sr[bi]) bi = i;
    if (sr[i] < sr[wi]) wi = i;
  }
  const vol = Math.sqrt(sr.reduce((a, b) => a + b * b, 0) / n) * Math.sqrt(252) * 100;

  // ---- co-movement ----
  const ms = sr.reduce((a, b) => a + b, 0) / n, mm = mr.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++){ sxy += (sr[i] - ms) * (mr[i] - mm); sxx += (mr[i] - mm) ** 2; syy += (sr[i] - ms) ** 2; }
  const beta = sxx ? sxy / sxx : null;
  const corr = (sxx && syy) ? sxy / Math.sqrt(sxx * syy) : null;

  // ---- the market's extreme days within the window ----
  const order = mr.map((v, i) => i).sort((a, b) => mr[a] - mr[b]);
  const ext = Math.min(10, Math.floor(n / 8));
  const tail = idxs => {
    let s = 0, m = 0, w = 0, bn = 0, bs = 0;
    for (const i of idxs){ s += sr[i]; m += mr[i]; if (sr[i] > mr[i]) w++; if (i + 1 < n){ bs += sr[i + 1]; bn++; } }
    return { n: idxs.length, avgStock: s / idxs.length * 100, avgMkt: m / idxs.length * 100, wins: w, bounce: bn ? bs / bn * 100 : null };
  };
  const worstDays = ext ? tail(order.slice(0, ext)) : null;
  const bestDays  = ext ? tail(order.slice(-ext).reverse()) : null;

  // ---- strength histogram of daily moves ----
  const bucket = r => r < -3 ? 0 : r < -2 ? 1 : r < -1 ? 2 : r < 0 ? 3 : r === 0 ? 3 : r <= 1 ? 4 : r <= 2 ? 5 : r <= 3 ? 6 : 7;
  const hist = { labels: ['≤-3%', '-3…-2', '-2…-1', '-1…0', '0…1', '1…2', '2…3', '≥3%'], counts: new Array(8).fill(0) };
  for (const r of sr) hist.counts[bucket(r * 100)]++;

  // ---- monthly battle blocks (21-day rounds, most recent last) ----
  const blocks = [];
  for (let e = n; e - 21 >= 0 && blocks.length < 12; e -= 21){
    let sAcc = 1, mAcc = 1;
    for (let i = e - 21; i < e; i++){ sAcc *= 1 + sr[i]; mAcc *= 1 + mr[i]; }
    blocks.unshift({ label: dateAt(e - 1) ? dateAt(e - 1).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : `−${Math.round((n - e) / 21)}m`,
                     sRet: (sAcc - 1) * 100, mRet: (mAcc - 1) * 100 });
  }

  return {
    n,
    ret: (series[series.length - 1] / series[series.length - 1 - n] - 1) * 100,
    mret: (mkt[mkt.length - 1] / mkt[mkt.length - 1 - n] - 1) * 100,
    beat: beat / n * 100, beta, corr, vol,
    mktDown: { days: mDn, stockUp: upOnDn, rate: mDn ? upOnDn / mDn * 100 : null,
               avgStock: mDn ? sumS_dn / mDn * 100 : null, avgMkt: mDn ? sumM_dn / mDn * 100 : null },
    mktUp:   { days: mUp, stockDn: dnOnUp, rateDn: mUp ? dnOnUp / mUp * 100 : null,
               avgStock: mUp ? sumS_up / mUp * 100 : null, avgMkt: mUp ? sumM_up / mUp * 100 : null },
    quad: {   // stock's average move WITHIN each quadrant
      dnUp: { n: upOnDn,         avg: upOnDn         ? sDU / upOnDn * 100         : null },
      dnDn: { n: mDn - upOnDn,   avg: (mDn - upOnDn) ? sDD / (mDn - upOnDn) * 100 : null },
      upUp: { n: mUp - dnOnUp,   avg: (mUp - dnOnUp) ? sUU / (mUp - dnOnUp) * 100 : null },
      upDn: { n: dnOnUp,         avg: dnOnUp         ? sUD / dnOnUp * 100         : null }
    },
    upCap: sumM_up ? sumS_up / sumM_up : null,
    dnCap: sumM_dn ? sumS_dn / sumM_dn : null,
    upDays: up, dnDays: dn,
    avgUp: up ? sumUp / up * 100 : null, avgDn: dn ? sumDn / dn * 100 : null,
    best: { r: sr[bi] * 100, date: dateAt(bi) }, worst: { r: sr[wi] * 100, date: dateAt(wi) },
    maxUpStk, maxDnStk, curStreak: stk,
    worstDays, bestDays, hist, blocks
  };
}

/* Composite price-action score ("PA Score") for one priceActionStats result.
   Built to find ACCUMULATION — stocks that keep getting bought on both good
   and bad index days — not stocks that merely spiked.

   PRIMARY · winEdge (frequencies, all four quadrants):
     gor = P(stock up | index down), pUp = P(stock up | index up).
     0.6 × (their average − 50)  +  0.4 × (the WEAKER of the two − 50).
     The min-term demands strength on BOTH kinds of day: a momentum name
     that only rises when the tape rises — or a bunker that only holds in
     sell-offs — can't score high. (avg − 50 is algebraically the user's
     core ask: up-days-on-index-down minus down-days-on-index-up, halved.)

   SECONDARY · magEdge (bounded, at most ±8 points):
     Day-matched outperformance: (stock avg − index avg) on index-up days,
     plus the same on index-down days, averaged, clamped to ±1pp/day, ×8.
     Differences instead of ratios — the old ratio form divided by the
     index's tiny average day and exploded in short/calm windows, letting
     one speculative spike dominate the whole score.

   0 ≈ indistinguishable from the tape. Cross-sectional z-scores on the
   page flag the outliers. */
function paxScore(p){
  if (!p || p.mktDown.rate == null || p.mktUp.rateDn == null) return null;
  const gor = p.mktDown.rate, pUp = 100 - p.mktUp.rateDn;
  const winEdge = 0.6 * ((gor + pUp) / 2 - 50) + 0.4 * (Math.min(gor, pUp) - 50);
  const aUp = (p.mktUp.avgStock != null && p.mktUp.avgMkt != null) ? p.mktUp.avgStock - p.mktUp.avgMkt : 0;
  const aDn = (p.mktDown.avgStock != null && p.mktDown.avgMkt != null) ? p.mktDown.avgStock - p.mktDown.avgMkt : 0;
  const magEdge = clamp((aUp + aDn) / 2, -1, 1) * 8;
  return winEdge + magEdge;
}

let EDGE_STATS = null;   // sorted per-metric arrays → cross-sectional percentile ranks
function buildEdgeStats(){
  const grab = f => STOCKS.map(f).filter(v => v != null && isFinite(v)).sort((a, b) => a - b);
  EDGE_STATS = {
    roic: grab(s => s.roic), gm: grab(s => s.gm), fcf: grab(s => s.fcf), nm: grab(s => s.nm),
    ev: grab(s => s.ev), fpe: grab(s => s.fpe ?? s.pe), ps: grab(s => s.ps),
    ey: grab(s => s.pe ? 100 / s.pe : null), fey: grab(s => s.fpe ? 100 / s.fpe : null),
    fcfY: grab(s => (s.fcf != null && s.ps) ? s.fcf / s.ps : null),
    pb: grab(s => s.pb), de: grab(s => s.de),
    rg3: grab(s => s.rg3), rg1: grab(s => s.rg1), eg: grab(s => s.eg), egf: grab(s => s.egf),
    om: grab(s => s.om), roe: grab(s => s.roe), roa: grab(s => s.roa)
  };
  const bySec = {};
  for (const s of STOCKS){ if (s.roic != null && isFinite(s.roic)) (bySec[s.sec] = bySec[s.sec] || []).push(s.roic); }
  for (const k in bySec){ if (bySec[k].length >= 6) EDGE_STATS['roic:' + k] = bySec[k].sort((a, b) => a - b); }
}

/* Adaptive score: blend a fixed absolute anchor with the stock's percentile
   rank in the LIVE universe. "Good" then means good in today's actual market —
   the scale recalibrates itself to whatever the data reflects — while the
   absolute half keeps scores meaningful when the whole market is frothy.
   Direction is inferred from the anchors (worst > best ⇒ lower is better). */
function dynLin(key, v, worst, best){
  const a = lin(v, worst, best);
  if (a == null) return null;
  let p = typeof edgePct === 'function' ? edgePct(key, v) : null;
  if (p == null) return a;
  if (worst > best) p = 100 - p;
  return 0.5 * a + 0.5 * p;
}

// ---------- market regime (dynamic weighting) ----------
let REGIME = null;
function marketRegime(){
  if (REGIME) return REGIME;
  const mkt = marketSeries();
  const last = mkt.length - 1;
  const sma200 = smaAt(mkt, Math.min(200, last), last);
  const vs200 = (mkt[last] / sma200 - 1) * 100;
  const ret3m = pctRet(mkt, Math.min(63, last));
  let k, name, desc;
  if (vs200 < -2 || ret3m < -7){ k = 'off'; name = 'Risk-off'; desc = 'The market is under stress — balance-sheet health, quality and resilience are weighted up; momentum and growth down.'; }
  else if (vs200 > 2 && ret3m > 1){ k = 'on'; name = 'Risk-on'; desc = 'The market is in an uptrend — momentum and growth carry extra weight.'; }
  else { k = 'neutral'; name = 'Neutral'; desc = 'Trendless market — balanced weighting across pillars.'; }
  REGIME = { k, name, desc, vs200, ret3m };
  return REGIME;
}

// ---------- stock archetypes (adaptive weighting) ----------
// A bank, a hypergrowth SaaS, a dividend utility and a turnaround should not
// be graded on the same rubric. Each archetype reweights the pillars to match
// what actually decides that kind of investment.
const ARCHETYPES = {
  financial:   { name: 'Financial',       w: { sv: .26, sg: .12, sq: .22, sh: .14, sm: .10, edge: .16 },
                 why: 'Banks and insurers are judged on earnings power, book value and capital returns — EV/EBITDA and current-ratio metrics do not apply.' },
  turnaround:  { name: 'Turnaround',      w: { sv: .18, sg: .20, sq: .10, sh: .22, sm: .14, edge: .16 },
                 why: 'Currently unprofitable or shrinking — survival (balance sheet) and the slope of recovery matter more than today’s margins.' },
  hypergrowth: { name: 'Hypergrowth',     w: { sv: .10, sg: .28, sq: .14, sh: .08, sm: .18, edge: .22 },
                 why: 'The thesis is the growth curve — earnings multiples mean little yet; expansion, expectations and trend quality carry the weight.' },
  compounder:  { name: 'Compounder',      w: { sv: .16, sg: .12, sq: .28, sh: .10, sm: .12, edge: .22 },
                 why: 'A proven high-return business — quality, moat durability and self-funded compounding dominate the thesis.' },
  dividend:    { name: 'Dividend Anchor', w: { sv: .20, sg: .08, sq: .16, sh: .26, sm: .08, edge: .22 },
                 why: 'Owned for the income stream — payout safety and balance-sheet strength outweigh growth and momentum.' },
  deepvalue:   { name: 'Deep Value',      w: { sv: .30, sg: .10, sq: .14, sh: .20, sm: .10, edge: .16 },
                 why: 'Priced for pessimism — the margin of safety and the strength to survive until the rerating are what count.' },
  balanced:    { name: 'All-rounder',     w: { sv: .22, sg: .17, sq: .20, sh: .12, sm: .13, edge: .16 },
                 why: 'No single trait dominates — judged with the standard balanced weighting.' }
};
function classifyArchetype(s){
  if (/financ/i.test(s.sec || '') && s.cr == null) return 'financial';
  // fast growers first: a loss-making company GROWING 20%+ is a hypergrowth
  // story, not a turnaround — losses are the model, not the problem
  if ((s.rg3 ?? 0) >= 18 || ((s.egf ?? 0) >= 25 && (s.rg1 ?? 0) >= 12)) return 'hypergrowth';
  if ((s.nm ?? 0) < 0 || (s.rg1 ?? 0) < -3) return 'turnaround';
  if ((s.roic ?? 0) >= 15 && (s.nm ?? 0) >= 8) return 'compounder';
  if ((s.dy ?? 0) >= 3 || ((s.dy ?? 0) >= 2.2 && (s.beta ?? 1) <= 0.85)) return 'dividend';
  if ((s.pe != null && s.pe < 13) || (s.pb != null && s.pb < 1.5 && (s.pe ?? 99) < 20)) return 'deepvalue';
  return 'balanced';
}

// ---------- master computation ----------
let SECTOR_PE = {};   // sector → median P/E, for relative valuation

/* Score ONE stock (also used to load tickers outside the universe on demand). */
function computeOne(s, sectorPEHint){
  const haveLive = typeof SERIES_MAP !== 'undefined' && SERIES_MAP;
  {
    const r = mulberry32(hashStr(s.t + ':fund'));
    let series = haveLive ? SERIES_MAP.get(s.t) : null;
    if (!series){
      const trend = clamp((s.egf ?? s.rg3 ?? 0) / 100 * 0.55 + (r() - 0.42) * 0.34, -0.40, 0.55);
      series = genSeries(s.t, s.px, s.beta ?? 1, trend);
    }
    const dates = (haveLive && DATES_MAP && DATES_MAP.get(s.t)) || SERIES_DATES;
    const n = series.length, last = n - 1;
    const pr = k => pctRet(series, Math.min(k, last));     // guard short histories
    const sma50 = smaAt(series, 50, last), sma200 = smaAt(series, 200, last);
    const sma50p = smaAt(series, 50, last - 22), sma200p = smaAt(series, 200, last - 22);
    let hi52 = 0, lo52 = Infinity;
    for (let i = Math.max(0, n - 252); i < n; i++){ if (series[i] > hi52) hi52 = series[i]; if (series[i] < lo52) lo52 = series[i]; }
    const px = series[last];                                // live px = last real close
    const mo = {
      sma50, sma200,
      vs50: (px / sma50 - 1) * 100,
      vs200: (px / sma200 - 1) * 100,
      ret1d: pr(1), ret1m: pr(21), ret3m: pr(63),
      ret6m: pr(126), ret1y: pr(252),
      hi52, lo52,
      pos52: hi52 > lo52 ? ((px - lo52) / (hi52 - lo52)) * 100 : 50,
      rsi: rsi14(series),
      goldenCross: sma50 > sma200 && sma50p <= sma200p
    };
    const dcfP = dcfDefaults(s);
    const dcf = runDCF(s, dcfP.growth, dcfP.discount, dcfP.terminal);
    const z = altmanZ(s);
    const fscore = piotroski(s, mulberry32(hashStr(s.t + ':pio')));
    const eps = s.pe ? s.px / s.pe : null;
    const bvps = s.pb ? s.px / s.pb : null;
    const graham = (eps > 0 && bvps > 0) ? Math.sqrt(22.5 * eps * bvps) : null;
    const fcfYield = (s.fcf != null && s.ps) ? s.fcf / s.ps : null;

    const sv = scoreValue(s, dcf, sectorPEHint);
    const sg = scoreGrowth(s);
    const sq = scoreQuality(s);
    const sh = scoreHealth(s, z, fscore);
    const sm = scoreMomentum(mo);
    const edge = computeEdge(s, series, mo);   // the seven Emerald Edge signals

    // adaptive weighting: archetype rubric × market-regime tilt
    const regime = marketRegime();
    const archK = classifyArchetype(s);
    const arch = ARCHETYPES[archK];
    const w = { ...arch.w };
    if (regime.k === 'off'){ w.sm *= 0.70; w.sg *= 0.85; w.sh *= 1.35; w.sq *= 1.10; }
    else if (regime.k === 'on'){ w.sm *= 1.25; w.sg *= 1.12; w.sh *= 0.85; }
    const wsum = w.sv + w.sg + w.sq + w.sh + w.sm + w.edge;
    for (const k in w) w[k] /= wsum;
    const score = sv * w.sv + sg * w.sg + sq * w.sq + sh * w.sh + sm * w.sm + edge.score * w.edge;

    // conviction: do the pillars agree, and how complete is the data behind them?
    const parts = [[sv, w.sv], [sg, w.sg], [sq, w.sq], [sh, w.sh], [sm, w.sm], [edge.score, w.edge]];
    const disp = Math.sqrt(parts.reduce((a, [p, wt]) => a + wt * (p - score) ** 2, 0));
    const fields = [s.pe, s.ps, s.pb, s.ev, s.roic, s.roe, s.gm, s.om, s.nm, s.de, s.cr, s.ic, s.fcf, s.rg3, s.rg1, s.eg, s.egf, s.dil, s.tp];
    const coverage = fields.filter(v => v != null).length / fields.length;
    const conviction = clamp(0.65 * lin(disp, 30, 8) + 0.35 * lin(coverage, 0.45, 0.95), 0, 100);
    const convLabel = conviction >= 65 ? 'High' : conviction >= 40 ? 'Moderate' : 'Low';

    const m = {
      s, series, dates, mo, dcf, dcfP, z, fscore, eps, bvps, graham, fcfYield, edge,
      sv, sg, sq, sh, sm, score,
      arch: { k: archK, name: arch.name, why: arch.why },
      weights: w, regime, disp, coverage, conviction, convLabel,
      rating: ratingOf(score),
      hist: finHistory(s, mulberry32(hashStr(s.t + ':hist')))
    };
    m.flags = buildFlags(s, m);
    // Edge-driven flags
    if (edge.xgs.v != null && edge.xgs.v >= 75)
      m.flags.green.push(`Expectation gap: price only assumes ~${edge.xgs.implied.toFixed(0)}%/yr growth vs ~${edge.xgs.ach.toFixed(0)}% achievable (reverse DCF)`);
    if (edge.xgs.v != null && edge.xgs.v <= 16)
      m.flags.red.push(`Expectation trap: price already demands ~${edge.xgs.implied.toFixed(0)}%/yr growth — beyond what fundamentals support`);
    if (edge.mdi.v >= 78) m.flags.green.push('Wide-moat profile: returns far above the cost of capital with strong pricing power');
    if (edge.qad.v != null && edge.qad.v >= 80)
      m.flags.green.push(`Quality at a discount: business quality ranks far above its price tag in the universe`);
    if (edge.tqs.v != null && edge.tqs.v >= 80)
      m.flags.green.push('High-grade trend: consistent market outperformance, not lottery-style spikes');
    if (edge.pas.v != null && edge.pas.v >= 68 && edge.pas.rate >= 52)
      m.flags.green.push(`Independent price action: closed green on ${Math.round(edge.pas.rate)}% of the market's down days this year`);
    if (edge.afs.v <= 30) m.flags.red.push('Concave under stress: soaks up market sell-offs but lags the rallies');
    if (edge.qad.v != null && edge.qad.v <= 15)
      m.flags.red.push('Premium price for non-premium quality — the valuation assumes a better business than the numbers show');
    m.verdict = buildVerdict(s, m);
    return m;
  }
}

function computeAll(){
  MKT = null; REGIME = null;   // re-resolve (live vs demo) on every full recompute
  buildEdgeStats();
  const peBySec = {};
  for (const s of STOCKS){ if (s.pe){ (peBySec[s.sec] = peBySec[s.sec] || []).push(s.pe); } }
  SECTOR_PE = {};
  for (const k in peBySec){ const a = peBySec[k].sort((x, y) => x - y); SECTOR_PE[k] = a[Math.floor(a.length / 2)]; }
  const out = new Map();
  for (const s of STOCKS) out.set(s.t, computeOne(s, SECTOR_PE[s.sec]));
  return out;
}

// ---------- market-level aggregates ----------
function computeMarket(metrics){
  const haveLiveIdx = typeof LIVE_INDEXES !== 'undefined' && LIVE_INDEXES && LIVE_INDEXES.length;
  const idx = haveLiveIdx
    ? LIVE_INDEXES.map(ix => ({
        ...ix, px: ix.series[ix.series.length - 1],
        chg: pctRet(ix.series, 1),
        chg1m: pctRet(ix.series, Math.min(21, ix.series.length - 1))
      }))
    : INDEXES.map(ix => {
        const series = genSeries(ix.t, ix.px, ix.beta, ix.trend, ix.vol);
        return { ...ix, series, chg: pctRet(series, 1), chg1m: pctRet(series, 21) };
      });
  const bySec = {};
  for (const [, m] of metrics){
    (bySec[m.s.sec] = bySec[m.s.sec] || { chg: 0, score: 0, n: 0 });
    bySec[m.s.sec].chg += m.mo.ret1d; bySec[m.s.sec].score += m.score; bySec[m.s.sec].n++;
  }
  const sectors = Object.entries(bySec)
    .map(([sec, v]) => ({ sec, chg: v.chg / v.n, score: v.score / v.n, n: v.n }))
    .sort((a, b) => b.chg - a.chg);
  const all = [...metrics.values()];
  const movers = [...all].sort((a, b) => b.mo.ret1d - a.mo.ret1d);
  return { idx, sectors, gainers: movers.slice(0, 6), losers: movers.slice(-6).reverse() };
}

// ---------- insight feed ----------
function buildInsights(metrics){
  const all = [...metrics.values()];
  const items = [];
  const top = [...all].sort((a, b) => b.score - a.score)[0];
  items.push({ ic: '◆', cls: 'up', t: top.s.t, title: `${top.s.t} holds the highest Emerald Score (${Math.round(top.score)}/100)`, m: `${top.rating.label} · strongest across quality and value pillars` });
  const topEdge = [...all].sort((a, b) => b.edge.score - a.edge.score)[0];
  if (topEdge && topEdge.s.t !== top.s.t)
    items.push({ ic: '✦', cls: 'up', t: topEdge.s.t, title: `${topEdge.s.t} leads the Emerald Edge signals (${Math.round(topEdge.edge.score)}/100)`, m: topEdge.edge.mdi.v >= 65 ? 'Durable moat + favorable expectation setup' : 'Strong proprietary-signal profile' });
  const gap = [...all].filter(m => m.edge.xgs.v != null && m.score >= 55).sort((a, b) => b.edge.xgs.v - a.edge.xgs.v)[0];
  if (gap && gap.edge.xgs.v >= 70)
    items.push({ ic: '⇋', cls: 'up', t: gap.s.t, title: `${gap.s.t}: market prices ~${gap.edge.xgs.implied.toFixed(0)}% growth, ~${gap.edge.xgs.ach.toFixed(0)}% looks achievable`, m: 'Reverse-DCF expectation gap — beatable bar' });
  for (const m of all){
    if (m.dcf && m.dcf.upside > 30 && m.score >= 60)
      items.push({ ic: '▲', cls: 'up', t: m.s.t, title: `${m.s.t} trades ~${Math.round(m.dcf.upside)}% below DCF fair value`, m: `Emerald Score ${Math.round(m.score)} · ${m.rating.label}` });
    if (m.mo.goldenCross && m.score >= 55)
      items.push({ ic: '✚', cls: 'up', t: m.s.t, title: `Golden cross forming on ${m.s.t}`, m: '50-day average crossing above the 200-day with solid fundamentals' });
    if (m.mo.rsi < 35 && m.score >= 64)
      items.push({ ic: '◎', cls: 'up', t: m.s.t, title: `${m.s.t} looks oversold (RSI ${Math.round(m.mo.rsi)}) despite strong fundamentals`, m: `Quality score ${Math.round(m.sq)} · potential dip-buy candidate` });
    if (m.s.dy > 3 && m.s.po > 0 && m.s.po < 70 && m.sh >= 60)
      items.push({ ic: '◈', cls: 'up', t: m.s.t, title: `${m.s.t} pays a well-covered ${m.s.dy.toFixed(1)}% yield`, m: `Payout ${m.s.po.toFixed(0)}% · health score ${Math.round(m.sh)}` });
    if (m.score < 34)
      items.push({ ic: '⚠', cls: 'down', t: m.s.t, title: `${m.s.t} screens as Avoid (${Math.round(m.score)}/100)`, m: m.flags.red[0] || 'Multiple deteriorating factors' });
    if (m.mo.rsi > 80)
      items.push({ ic: '↯', cls: 'down', t: m.s.t, title: `${m.s.t} is heavily overbought (RSI ${Math.round(m.mo.rsi)})`, m: 'Stretched momentum often mean-reverts' });
  }
  // dedupe by ticker+type, cap
  const seen = new Set(); const ded = [];
  for (const it of items){ const k = it.t + it.ic; if (!seen.has(k)){ seen.add(k); ded.push(it); } }
  return ded.slice(0, 14);
}

// ---------- screener presets ----------
const PRESETS = {
  all:        { name: 'All stocks',       desc: 'The full coverage universe.', fn: () => true },
  picks:      { name: 'Emerald Picks',    desc: 'Composite score 70+ — the best overall setups.', fn: m => m.score >= 70 },
  edge:       { name: 'Edge Leaders',     desc: 'Top scores on Emerald’s five proprietary signals (Edge ≥ 68).', fn: m => m.edge.score >= 68 },
  gap:        { name: 'Mispriced Growth', desc: 'Reverse-DCF says the market is underpricing achievable growth (XGS ≥ 70).', fn: m => m.edge.xgs.v != null && m.edge.xgs.v >= 70 },
  value:      { name: 'Value Gems',       desc: 'Cheap cash flows: high FCF yield or deep DCF discount, decent health.', fn: m => ((m.fcfYield ?? 0) > 4.5 || (m.dcf && m.dcf.upside > 20)) && m.sh >= 45 && m.sv >= 60 },
  compound:   { name: 'Compounders',      desc: 'ROIC > 15%, growing revenue, strong balance sheet.', fn: m => (m.s.roic ?? 0) > 15 && (m.s.rg3 ?? 0) > 5 && m.sh >= 50 },
  dividend:   { name: 'Dividend Income',  desc: 'Yield ≥ 2.5% with payout under 75% and health ≥ 50.', fn: m => m.s.dy >= 2.5 && m.s.po > 0 && m.s.po <= 75 && m.sh >= 50 },
  garp:       { name: 'GARP',             desc: 'Growth at a reasonable price: 12%+ forecast growth, PEG < 1.8.', fn: m => (m.s.egf ?? 0) >= 12 && m.s.pe && m.s.pe / m.s.egf < 1.8 },
  momentum:   { name: 'Momentum',         desc: 'Above the 200-day, positive 6-month return, RSI not overheated.', fn: m => m.mo.vs200 > 3 && m.mo.ret6m > 5 && m.mo.rsi < 75 && m.score >= 55 },
  turnaround: { name: 'Turnaround Watch', desc: 'Beaten down (>25% off highs) but improving F-Score ≥ 6.', fn: m => m.mo.pos52 < 45 && m.fscore >= 6 },
  avoid:      { name: 'Caution List',     desc: 'Composite under 40 or 3+ red flags — danger zone.', fn: m => m.score < 40 || m.flags.red.length >= 3 }
};
