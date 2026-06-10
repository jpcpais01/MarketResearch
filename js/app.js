/* ============================================================
   Emerald · application layer (router, views, state)
   ============================================================ */

// ---------- computed universe (filled in bootApp once data is ready) ----------
let METRICS, MARKET, INSIGHTS, RANKED;

// ---------- persisted state ----------
const store = {
  get(k, dflt){ try { return JSON.parse(localStorage.getItem(k)) ?? dflt; } catch { return dflt; } },
  set(k, v){ localStorage.setItem(k, JSON.stringify(v)); }
};
let WATCH = store.get('em_watch', ['AAPL', 'GOOGL', 'V', 'XOM']);
let PORT = store.get('em_port', []);
let CMP = store.get('em_cmp', ['MSFT', 'GOOGL']);

// ---------- formatting ----------
const F = {
  money: v => v == null ? '—' : '$' + (v >= 1000 ? v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : v.toFixed(2)),
  big: b => b == null ? '—' : b >= 1000 ? '$' + (b / 1000).toFixed(2) + 'T' : '$' + (b >= 100 ? b.toFixed(0) : b.toFixed(1)) + 'B',
  pct: (v, signed = false) => v == null ? '—' : (signed && v > 0 ? '+' : '') + v.toFixed(v >= 100 || v <= -100 ? 0 : 1) + '%',
  x: v => v == null ? '—' : v.toFixed(1) + '×',
  n: (v, d = 1) => v == null ? '—' : v.toFixed(d),
  chg(v, d = 2){
    if (v == null) return '<span class="muted">—</span>';
    const cls = v >= 0 ? 'up' : 'down';
    return `<span class="${cls}">${v >= 0 ? '▲' : '▼'} ${Math.abs(v).toFixed(d)}%</span>`;
  }
};
const ratingTag = m => `<span class="tag ${m.rating.cls}">${m.rating.label}</span>`;
const scoreCell = v => `<span class="scorecell"><span class="scorebar"><i style="width:${Math.round(v)}%;background:${scoreColor(v)}"></i></span><b style="color:${scoreColor(v)}">${Math.round(v)}</b></span>`;

// ---------- app helpers ----------
const $ = s => document.querySelector(s);
const view = () => $('#view');
function toast(msg){
  const t = document.createElement('div');
  t.className = 'toast'; t.textContent = msg;
  $('#toastZone').appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .4s'; setTimeout(() => t.remove(), 420); }, 2200);
}

const App = {
  go(route){ location.hash = '#/' + route; },
  toggleWatch(t){
    if (WATCH.includes(t)){ WATCH = WATCH.filter(x => x !== t); toast(`${t} removed from watchlist`); }
    else { WATCH.push(t); toast(`${t} added to watchlist`); }
    store.set('em_watch', WATCH); render();
  },
  addCompare(t){
    if (CMP.includes(t)) { toast(`${t} is already in compare`); return; }
    if (CMP.length >= 4) { toast('Compare holds up to 4 stocks'); return; }
    CMP.push(t); store.set('em_cmp', CMP); toast(`${t} added to compare`);
    if (location.hash.includes('compare')) render();
  },
  rmCompare(t){ CMP = CMP.filter(x => x !== t); store.set('em_cmp', CMP); render(); },
  rmHolding(i){ const h = PORT[i]; PORT.splice(i, 1); store.set('em_port', PORT); toast(`${h.t} position removed`); render(); },

  /* Load any Yahoo-listed ticker outside the built-in universe and score it
     with the full engine. Returns true when the stock is ready in METRICS. */
  async loadTicker(t){
    t = t.toUpperCase();
    if (METRICS.has(t)) return true;
    if (DATA_MODE === 'demo') return false;
    try {
      const r = await fetch('/api/batch?t=' + encodeURIComponent(t));
      if (!r.ok) return false;
      const j = await r.json();
      const s = (j.stocks || [])[0];
      if (!s || s.px == null || !s.closes || s.closes.length < 240) return false;   // engine needs ~1y of history
      SERIES_MAP && SERIES_MAP.set(s.t, s.closes);
      DATES_MAP && DATES_MAP.set(s.t, s.dates.map(d => new Date(d)));
      const { closes, dates, ...rest } = s;
      METRICS.set(rest.t, computeOne(rest, SECTOR_PE[rest.sec]));
      return true;
    } catch { return false; }
  }
};
window.App = App;

// ============================================================
// DASHBOARD
// ============================================================
function renderDashboard(){
  const picks = RANKED.slice(0, 6);
  const watchRows = WATCH.map(t => METRICS.get(t)).filter(Boolean).slice(0, 5);
  view().innerHTML = `
  <h1 class="page">Market Overview</h1>
  <div class="page-sub">${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })} · ${STOCKS.length} companies under coverage · <span class="${marketRegime().k === 'on' ? 'up' : marketRegime().k === 'off' ? 'down' : ''}" title="${escHTML(marketRegime().desc)}" style="cursor:help">◉ ${marketRegime().name} regime</span></div>

  <div class="grid g3 mb">
    ${MARKET.idx.map((ix, i) => `
      <div class="card tight">
        <div class="card-title">${ix.n}</div>
        <div style="display:flex;justify-content:space-between;align-items:flex-end;gap:12px">
          <div>
            <div style="font-size:23px;font-weight:800" class="num">${ix.px.toLocaleString('en-US', { maximumFractionDigits: 1 })}</div>
            <div class="small" style="margin-top:3px">${F.chg(ix.chg)} <span class="faint">today</span> · ${F.chg(ix.chg1m, 1)} <span class="faint">1M</span></div>
          </div>
          <div style="width:128px"><canvas id="idxSpark${i}"></canvas></div>
        </div>
      </div>`).join('')}
  </div>

  <div class="card mb">
    <div class="card-title">Emerald Top Picks — highest composite scores <span class="more" onclick="App.go('screener')">Open screener →</span></div>
    <div class="picks">
      ${picks.map((m, i) => `
        <div class="pick glass" onclick="App.go('stock/${m.s.t}')">
          <div class="ph"><b>${m.s.t}</b>${ratingTag(m)}</div>
          <div class="pn">${m.s.n}</div>
          <canvas id="pickSpark${i}"></canvas>
          <div class="pf">
            <span><b class="num">${F.money(m.s.px)}</b> ${F.chg(m.mo.ret1d)}</span>
            <b style="color:${scoreColor(m.score)};font-size:17px">${Math.round(m.score)}</b>
          </div>
        </div>`).join('')}
    </div>
  </div>

  <div class="grid g23">
    <div style="display:flex;flex-direction:column;gap:16px">
      <div class="card">
        <div class="card-title">Sector performance — today</div>
        <div class="heat">
          ${MARKET.sectors.map(sc => {
            const a = clamp(Math.abs(sc.chg) / 1.6, 0.10, 0.85);
            const bg = sc.chg >= 0 ? `rgba(52,211,153,${a * 0.32})` : `rgba(248,113,113,${a * 0.30})`;
            return `<div class="heat-cell" style="background:${bg}" onclick="App.go('screener?sec=${encodeURIComponent(sc.sec)}')">
              <b>${sc.sec}</b><span class="${sc.chg >= 0 ? 'up' : 'down'}">${sc.chg >= 0 ? '+' : ''}${sc.chg.toFixed(2)}%</span>
              <div class="faint" style="margin-top:3px">avg score ${Math.round(sc.score)}</div>
            </div>`;
          }).join('')}
        </div>
      </div>
      <div class="grid g2">
        <div class="card tight">
          <div class="card-title">Top gainers</div>
          ${MARKET.gainers.map(m => moverRow(m)).join('')}
        </div>
        <div class="card tight">
          <div class="card-title">Top losers</div>
          ${MARKET.losers.map(m => moverRow(m)).join('')}
        </div>
      </div>
    </div>
    <div style="display:flex;flex-direction:column;gap:16px">
      <div class="card">
        <div class="card-title">Research signals</div>
        ${INSIGHTS.slice(0, 8).map(it => `
          <div class="insight" onclick="App.go('stock/${it.t}')">
            <span class="ii ${it.cls}">${it.ic}</span>
            <span><span class="it">${it.title}</span><div class="im">${it.m}</div></span>
          </div>`).join('')}
      </div>
      <div class="card">
        <div class="card-title">Watchlist <span class="more" onclick="App.go('watchlist')">View all →</span></div>
        ${watchRows.length ? watchRows.map(m => moverRow(m, true)).join('') : `<div class="muted small">Your watchlist is empty — star stocks to track them here.</div>`}
      </div>
    </div>
  </div>`;

  MARKET.idx.forEach((ix, i) => sparkline($('#idxSpark' + i), Array.from(ix.series.slice(-126)), 40));
  picks.forEach((m, i) => sparkline($('#pickSpark' + i), Array.from(m.series.slice(-126)), 42));
}
function moverRow(m, withScore = false){
  return `<div class="mv-row" onclick="App.go('stock/${m.s.t}')">
    <span class="tk">${m.s.t}</span><span class="nm">${m.s.n}</span>
    ${withScore ? `<b style="color:${scoreColor(m.score)};font-size:12.5px">${Math.round(m.score)}</b>` : ''}
    <span class="pc ${m.mo.ret1d >= 0 ? 'up' : 'down'}">${m.mo.ret1d >= 0 ? '+' : ''}${m.mo.ret1d.toFixed(2)}%</span>
  </div>`;
}

// ============================================================
// PRICE ACTION LAB
// ============================================================
const PA = { t: null, idx: 'SPX', win: 252, sort: 'gor', dir: -1, cap: 'All' };
const PA_WINS = [['1M', 21], ['2M', 42], ['3M', 63], ['6M', 126], ['1Y', 252], ['2Y', 504]];
const PA_IDX = [['SPX', 'S&P 500'], ['NDX', 'Nasdaq'], ['DJI', 'Dow']];
const PA_CAPS = [['All', null], ['<5B', [0, 5]], ['5–20B', [5, 20]], ['20–50B', [20, 50]], ['50–200B', [50, 200]], ['>200B', [200, Infinity]]];
const PA_COLS = [
  { k: 't',     l: 'Company', dir: 1, get: r => r.t },
  { k: 'mc',    l: 'Mkt cap', get: r => r.mc ?? -1 },
  { k: 'gor',   l: 'Up on index-down days', get: r => r.gor },
  { k: 'rog',   l: 'Down on index-up days', get: r => r.rog },
  { k: 'avgUp', l: 'Avg up day', get: r => r.avgUp ?? -999 },
  { k: 'avgDn', l: 'Avg down day', get: r => r.avgDn ?? -999 },
  { k: 'beat',  l: 'Beat rate', get: r => r.beat },
  { k: 'ret',   l: 'Window return', get: r => r.ret }
];

function renderAction(t){
  if (t) PA.t = decodeURIComponent(t).toUpperCase();
  if (PA.t && !METRICS.has(PA.t) && DATA_MODE !== 'demo'){
    const want = PA.t;
    view().innerHTML = `<div class="empty-state card"><div class="ei">◌</div><b>Loading ${escHTML(want)}…</b><p>Fetching price history for the Price Action Lab.</p></div>`;
    App.loadTicker(want).then(ok => {
      if (!location.hash.includes('/action')) return;
      if (!ok){ PA.t = RANKED[0].s.t; toast(`Couldn't load ${want} — showing ${PA.t}`); }
      renderAction();
    });
    return;
  }
  if (!PA.t || !METRICS.has(PA.t)) PA.t = RANKED[0].s.t;
  const m = METRICS.get(PA.t);
  const idx = indexSeries(PA.idx);
  const pa = priceActionStats(m.series, idx.series, PA.win, m.dates);
  const winLabel = (PA_WINS.find(w => w[1] === PA.win) || ['1Y'])[0];
  if (!pa){
    view().innerHTML = `<div class="empty-state card"><div class="ei">∅</div><b>Not enough overlapping history for ${escHTML(PA.t)}</b></div>`;
    return;
  }
  const alpha = pa.ret - pa.mret;
  const pasSig = m.edge.pas;
  const qcell = (title, days, total, avg, good) => `
    <div class="glass" style="padding:14px;border-radius:14px;background:${good ? 'rgba(52,211,153,.10)' : 'rgba(248,113,113,.09)'}">
      <div class="small muted" style="margin-bottom:6px">${title}</div>
      <div style="font-size:21px;font-weight:800" class="num">${days} <span class="small muted" style="font-weight:600">of ${total} days (${total ? Math.round(days / total * 100) : 0}%)</span></div>
      <div class="small" style="margin-top:4px">${avg == null ? '<span class="muted">no such days</span>' : `avg ${PA.t} move ${F.chg(avg, 2)}`}</div>
    </div>`;
  const streakTxt = pa.curStreak > 0 ? `${pa.curStreak} day${pa.curStreak > 1 ? 's' : ''} up` : pa.curStreak < 0 ? `${-pa.curStreak} day${pa.curStreak < -1 ? 's' : ''} down` : 'flat';

  // universe board for this window + benchmark (cached — re-sorting reuses it)
  const boardKey = PA.idx + '|' + PA.win + '|' + RANKED.length;
  if (PA._boardKey !== boardKey){
    PA._board = RANKED.map(x => {
      const p = priceActionStats(x.series, idx.series, PA.win);
      return (p && p.mktDown.days >= 5 && p.mktDown.rate != null)
        ? { t: x.s.t, n: x.s.n, mc: x.s.mc, gor: p.mktDown.rate, rog: p.mktUp.rateDn ?? 0, avgUp: p.avgUp, avgDn: p.avgDn, beat: p.beat, ret: p.ret }
        : null;
    }).filter(Boolean);
    PA._boardKey = boardKey;
  }
  const board = PA._board;
  const gorRank = board.slice().sort((a, b) => b.gor - a.gor).findIndex(r => r.t === PA.t) + 1;
  const capRange = (PA_CAPS.find(c => c[0] === PA.cap) || PA_CAPS[0])[1];
  const sortCol = PA_COLS.find(c => c.k === PA.sort) || PA_COLS[2];
  const sorted = board
    .filter(r => !capRange || (r.mc != null && r.mc >= capRange[0] && r.mc < capRange[1]))
    .sort((a, b) => (sortCol.get(a) > sortCol.get(b) ? 1 : -1) * PA.dir);

  view().innerHTML = `
  <h1 class="page">Price Action Lab</h1>
  <div class="page-sub">Day-by-day behavior vs the market — who actually holds the bid when the index sells off.</div>

  <div class="card mb tight" style="z-index:30">
    <div class="filters" style="grid-template-columns:minmax(170px,1fr) auto auto;align-items:end">
      <div class="field" style="position:relative"><label>Stock</label>
        <input id="paStock" value="${PA.t}" placeholder="Type a ticker or company…" autocomplete="off" spellcheck="false">
        <div class="search-results glass" id="paResults"></div>
      </div>
      <div class="field"><label>Benchmark</label>
        <div class="chips" id="paIdx">${PA_IDX.map(([k, n]) => `<span class="chip ${PA.idx === k ? 'active' : ''}" data-i="${k}">${n}</span>`).join('')}</div>
      </div>
      <div class="field"><label>Window</label>
        <div class="chips" id="paWin">${PA_WINS.map(([l, d]) => `<span class="chip ${PA.win === d ? 'active' : ''}" data-w="${d}">${l}</span>`).join('')}</div>
      </div>
    </div>
  </div>

  <div class="card mb">
    <div class="card-title">${m.s.n} (${PA.t}) vs ${idx.name} — last ${winLabel} · ${pa.n} trading days
      <span><b style="color:${pa.ret >= 0 ? '#34d399' : '#f87171'}">${pa.ret >= 0 ? '+' : ''}${pa.ret.toFixed(1)}%</b> <span class="muted small">vs index ${pa.mret >= 0 ? '+' : ''}${pa.mret.toFixed(1)}%</span></span>
    </div>
    <div class="chart-stats">
      <div>Up on the market's down days<b style="color:${pa.mktDown.rate >= 50 ? '#34d399' : pa.mktDown.rate >= 38 ? '#fbbf24' : '#f87171'}">${pa.mktDown.stockUp} of ${pa.mktDown.days} (${pa.mktDown.rate.toFixed(0)}%)</b></div>
      <div>Red on the market's up days<b style="color:${pa.mktUp.rateDn <= 30 ? '#34d399' : pa.mktUp.rateDn <= 42 ? '#fbbf24' : '#f87171'}">${pa.mktUp.stockDn} of ${pa.mktUp.days} (${pa.mktUp.rateDn.toFixed(0)}%)</b></div>
      <div>Days beating the index<b class="num">${pa.beat.toFixed(0)}%</b></div>
      <div>Alpha over window<b style="color:${alpha >= 0 ? '#34d399' : '#f87171'}">${alpha >= 0 ? '+' : ''}${alpha.toFixed(1)}%</b></div>
    </div>
    <div class="muted-block" style="margin-top:12px">⇅ <b>Price Action signal (1Y): ${pasSig.v == null ? '—' : Math.round(pasSig.v) + '/100'}</b> — ${pasSig.read}</div>
  </div>

  <div class="grid g2 mb" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(310px,1fr));gap:16px">
    <div class="card" style="margin:0">
      <div class="card-title">The four kinds of day — who led whom</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        ${qcell(`▼ Index down · ${PA.t} UP`, pa.quad.dnUp.n, pa.mktDown.days, pa.quad.dnUp.avg, true)}
        ${qcell(`▼ Index down · ${PA.t} down`, pa.quad.dnDn.n, pa.mktDown.days, pa.quad.dnDn.avg, false)}
        ${qcell(`▲ Index up · ${PA.t} up`, pa.quad.upUp.n, pa.mktUp.days, pa.quad.upUp.avg, true)}
        ${qcell(`▲ Index up · ${PA.t} DOWN`, pa.quad.upDn.n, pa.mktUp.days, pa.quad.upDn.avg, false)}
      </div>
      <div class="muted small" style="margin-top:10px">Avg ${PA.t} move on index-down days: <b>${F.chg(pa.mktDown.avgStock, 2)}</b> (index ${F.chg(pa.mktDown.avgMkt, 2)}) · on index-up days: <b>${F.chg(pa.mktUp.avgStock, 2)}</b> (index ${F.chg(pa.mktUp.avgMkt, 2)})</div>
    </div>
    <div class="card" style="margin:0">
      <div class="card-title">Strength of daily changes</div>
      <canvas id="paHist"></canvas>
      <div class="chart-stats" style="margin-top:10px">
        <div>Avg up day / down day<b><span style="color:#34d399">+${(pa.avgUp ?? 0).toFixed(2)}%</span> / <span style="color:#f87171">${(pa.avgDn ?? 0).toFixed(2)}%</span></b></div>
        <div>Best day<b style="color:#34d399">+${pa.best.r.toFixed(1)}%${pa.best.date ? ' · ' + pa.best.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}</b></div>
        <div>Worst day<b style="color:#f87171">${pa.worst.r.toFixed(1)}%${pa.worst.date ? ' · ' + pa.worst.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}</b></div>
        <div>Volatility (ann.) · streaks<b class="num">${pa.vol.toFixed(0)}% · ▲${pa.maxUpStk} ▼${pa.maxDnStk} · now ${streakTxt}</b></div>
      </div>
    </div>
  </div>

  ${pa.worstDays ? `
  <div class="grid g2 mb" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(310px,1fr));gap:16px">
    <div class="card" style="margin:0">
      <div class="card-title">Stress test — the index's ${pa.worstDays.n} worst days</div>
      <div class="chart-stats">
        <div>${PA.t} avg on those days<b style="color:${pa.worstDays.avgStock >= 0 ? '#34d399' : '#f87171'}">${pa.worstDays.avgStock >= 0 ? '+' : ''}${pa.worstDays.avgStock.toFixed(2)}%</b></div>
        <div>Index avg<b style="color:#f87171">${pa.worstDays.avgMkt.toFixed(2)}%</b></div>
        <div>Held up better<b class="num">${pa.worstDays.wins} of ${pa.worstDays.n}</b></div>
        <div>Next-day bounce<b style="color:${(pa.worstDays.bounce ?? 0) >= 0 ? '#34d399' : '#f87171'}">${pa.worstDays.bounce == null ? '—' : (pa.worstDays.bounce >= 0 ? '+' : '') + pa.worstDays.bounce.toFixed(2) + '%'}</b></div>
      </div>
      <div class="muted small" style="margin-top:10px">Crash behavior is where coupling shows its true face — diversification that only works in calm tapes isn't diversification.</div>
    </div>
    <div class="card" style="margin:0">
      <div class="card-title">Participation — the index's ${pa.bestDays.n} best days</div>
      <div class="chart-stats">
        <div>${PA.t} avg on those days<b style="color:${pa.bestDays.avgStock >= 0 ? '#34d399' : '#f87171'}">${pa.bestDays.avgStock >= 0 ? '+' : ''}${pa.bestDays.avgStock.toFixed(2)}%</b></div>
        <div>Index avg<b style="color:#34d399">+${pa.bestDays.avgMkt.toFixed(2)}%</b></div>
        <div>Outpaced the index<b class="num">${pa.bestDays.wins} of ${pa.bestDays.n}</b></div>
        <div>Up/down capture (window)<b class="num">${pa.upCap != null ? Math.round(pa.upCap * 100) + '%' : '—'} / ${pa.dnCap != null ? Math.round(pa.dnCap * 100) + '%' : '—'}</b></div>
      </div>
      <div class="muted small" style="margin-top:10px">Missing the market's best days is as costly as eating its worst — the ideal profile wins both columns.</div>
    </div>
  </div>` : ''}

  <div class="card mb">
    <div class="card-title">Relative path — ${PA.t} vs ${idx.name} (rebased)
      <span class="muted small">β ${pa.beta != null ? pa.beta.toFixed(2) : '—'} · correlation ${pa.corr != null ? pa.corr.toFixed(2) : '—'}</span>
    </div>
    <canvas id="paRS"></canvas>
    <div class="muted small" style="margin-top:8px">Dashed line = ${idx.name} scaled to the same starting point. Divergence is the story; the gap at the right edge is the window's alpha.</div>
  </div>

  <div class="card mb">
    <div class="card-title">Monthly rounds — ${PA.t} vs ${idx.name}
      <span class="muted small">won ${pa.blocks.filter(b => b.sRet > b.mRet).length} of the last ${pa.blocks.length} 21-day rounds</span>
    </div>
    <div class="tbl-wrap" style="max-height:330px">
      <table class="tbl"><thead><tr><th>Round ending</th><th>${PA.t}</th><th>${PA.idx}</th><th>Edge</th><th></th></tr></thead>
      <tbody>${pa.blocks.slice().reverse().map(b => `
        <tr><td>${b.label}</td><td>${F.chg(b.sRet, 1)}</td><td>${F.chg(b.mRet, 1)}</td>
        <td>${F.chg(b.sRet - b.mRet, 1)}</td><td>${b.sRet > b.mRet ? '<b style="color:#34d399">W</b>' : '<b style="color:#f87171">L</b>'}</td></tr>`).join('')}
      </tbody></table>
    </div>
  </div>

  <div class="card mb">
    <div class="card-title">Down-day champions — whole universe, this window
      <span class="muted small">${sorted.length}${capRange ? ' of ' + board.length : ''} stocks vs ${idx.name} · ${PA.t} ranks #${gorRank || '—'} on down-day wins · click any column to sort</span>
    </div>
    <div class="chips mb" id="paCap">${PA_CAPS.map(([l]) => `<span class="chip ${PA.cap === l ? 'active' : ''}" data-c="${l}">${l === 'All' ? 'All caps' : l}</span>`).join('')}</div>
    <div class="tbl-wrap" style="max-height:64vh" id="paBoard">
      <table class="tbl">
        <thead><tr><th>#</th>${PA_COLS.map(c => `<th data-k="${c.k}" class="${PA.sort === c.k ? 'sorted' : ''}" style="cursor:pointer">${c.l}${PA.sort === c.k ? (PA.dir < 0 ? ' ↓' : ' ↑') : ''}</th>`).join('')}</tr></thead>
        <tbody>${sorted.map((r, i) => `
          <tr onclick="App.go('action/${r.t}')" ${r.t === PA.t ? 'style="background:rgba(52,211,153,.08)"' : ''}>
            <td class="num muted">${i + 1}</td>
            <td><span class="tk">${r.t}</span><div class="co">${r.n}</div></td>
            <td class="num">${r.mc != null ? F.big(r.mc) : '—'}</td>
            <td><b style="color:${r.gor >= 50 ? '#34d399' : r.gor >= 38 ? '#fbbf24' : '#f87171'}">${r.gor.toFixed(0)}%</b></td>
            <td><b style="color:${r.rog <= 30 ? '#34d399' : r.rog <= 42 ? '#fbbf24' : '#f87171'}">${r.rog.toFixed(0)}%</b></td>
            <td style="color:#34d399">+${(r.avgUp ?? 0).toFixed(2)}%</td>
            <td style="color:#f87171">${(r.avgDn ?? 0).toFixed(2)}%</td>
            <td>${r.beat.toFixed(0)}%</td>
            <td>${F.chg(r.ret, 1)}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
    <div class="muted small" style="margin-top:8px">"Up on index-down days" = share of ${idx.name} down days the stock still closed green · "Down on index-up days" = share of its up days the stock missed · click any row to inspect that stock.</div>
  </div>`;

  // wire controls — stock picker uses the app's own styled dropdown, not the native datalist
  const inp = $('#paStock'), res = $('#paResults');
  const paMatches = q => {
    q = q.trim().toUpperCase();
    const list = q ? RANKED.filter(x => x.s.t.toUpperCase().startsWith(q) || x.s.n.toUpperCase().includes(q)).slice(0, 8) : [];
    res.innerHTML = list.map(x => `<div class="sr-item" data-t="${x.s.t}">
      <span class="sr-tick">${x.s.t}</span><span class="sr-name">${x.s.n}</span>
      <span class="sr-score" style="color:${x.edge.pas.v != null ? scoreColor(x.edge.pas.v) : 'var(--muted)'}">⇅ ${x.edge.pas.v != null ? Math.round(x.edge.pas.v) : '—'}</span></div>`).join('');
    res.classList.toggle('open', list.length > 0);
  };
  inp.oninput = e => paMatches(e.target.value);
  inp.onfocus = e => e.target.select();
  inp.onkeydown = e => {
    if (e.key === 'Enter'){
      const top = res.querySelector('.sr-item');
      const v = top ? top.dataset.t : e.target.value.trim().toUpperCase();
      if (v) App.go('action/' + v);
    }
  };
  inp.onblur = () => setTimeout(() => res.classList.remove('open'), 160);
  res.onmousedown = e => { const it = e.target.closest('.sr-item'); if (it) App.go('action/' + it.dataset.t); };
  $('#paIdx').onclick = e => { const c = e.target.closest('.chip'); if (!c) return; PA.idx = c.dataset.i; renderAction(); };
  $('#paWin').onclick = e => { const c = e.target.closest('.chip'); if (!c) return; PA.win = +c.dataset.w; renderAction(); };
  $('#paCap').onclick = e => { const c = e.target.closest('.chip'); if (!c) return; PA.cap = c.dataset.c; renderAction(); };
  $('#paBoard thead').onclick = e => {
    const th = e.target.closest('th'); if (!th || !th.dataset.k) return;
    e.stopPropagation();
    const k = th.dataset.k;
    if (PA.sort === k) PA.dir *= -1;
    else { PA.sort = k; PA.dir = (PA_COLS.find(c => c.k === k).dir === 1) ? 1 : -1; }
    renderAction();
  };

  // charts
  barChart($('#paHist'), pa.hist.labels, [{ color: '#34d399', data: pa.hist.counts }], { height: 175 });
  const sTail = Array.from(m.series.slice(m.series.length - 1 - pa.n));
  const dTail = m.dates.slice(m.dates.length - 1 - pa.n);
  const iTail = Array.from(idx.series.slice(idx.series.length - 1 - pa.n));
  const scale = sTail[0] / iTail[0];
  lineChart($('#paRS'), sTail, dTail, { height: 270, overlays: [{ data: iTail.map(v => v * scale), color: 'rgba(148,163,184,.85)' }] });
}

// ============================================================
// SCREENER
// ============================================================
const SCR = { preset: 'all', sec: 'all', minScore: 0, maxPE: '', minDY: 0, minRG: -99, sort: 'score', dir: -1,
              edge: { mdi: 0, xgs: 0, qad: 0, tqs: 0, afs: 0, ces: 0, cfg: 0 } };

function renderScreener(params){
  if (params && params.get('sec')) { SCR.sec = params.get('sec'); SCR.preset = 'all'; }
  view().innerHTML = `
  <h1 class="page">Stock Screener</h1>
  <div class="page-sub">Filter the universe by strategy preset or your own criteria — every column is sortable.</div>

  <div class="card mb tight">
    <div class="chips mb" id="presetChips">
      ${Object.entries(PRESETS).map(([k, p]) => `<span class="chip ${SCR.preset === k ? 'active' : ''}" data-p="${k}" title="${p.desc}">${p.name}</span>`).join('')}
    </div>
    <div class="filters">
      <div class="field"><label>Sector</label>
        <select id="fSec"><option value="all">All sectors</option>${SECTORS.map(s => `<option ${SCR.sec === s ? 'selected' : ''}>${s}</option>`).join('')}</select>
      </div>
      <div class="field"><label>Min Emerald Score · <span id="fScoreV">${SCR.minScore}</span></label>
        <input type="range" id="fScore" min="0" max="90" step="5" value="${SCR.minScore}">
      </div>
      <div class="field"><label>Max P/E</label><input type="number" id="fPE" placeholder="any" value="${SCR.maxPE}"></div>
      <div class="field"><label>Min Dividend Yield %</label><input type="number" id="fDY" placeholder="0" step="0.5" value="${SCR.minDY || ''}"></div>
      <div class="field"><label>Min Revenue Growth %</label><input type="number" id="fRG" placeholder="any" value="${SCR.minRG > -99 ? SCR.minRG : ''}"></div>
    </div>
    <div class="muted small" style="margin:14px 0 8px">✦ <b>Edge signal minimums</b> — drag any signal above 0 to require it; combine several to stack conditions (stocks without that signal are excluded while its filter is active).</div>
    <div class="filters" id="edgeFilters">
      ${EDGE_DEFS.map(d => `<div class="field"><label title="${d.q}">${d.ic} ${d.name} · <span id="feV_${d.k}">${SCR.edge[d.k] > 0 ? '≥ ' + SCR.edge[d.k] : 'off'}</span></label>
        <input type="range" data-ek="${d.k}" min="0" max="90" step="5" value="${SCR.edge[d.k]}"></div>`).join('')}
    </div>
    <div class="muted small" style="margin-top:12px" id="presetDesc">${PRESETS[SCR.preset].desc}</div>
  </div>

  <div class="card tight">
    <div class="card-title"><span id="scrCount"></span></div>
    <div class="tbl-wrap" style="max-height:62vh" id="scrTable"></div>
  </div>`;

  $('#presetChips').onclick = e => {
    const c = e.target.closest('.chip'); if (!c) return;
    SCR.preset = c.dataset.p; renderScreener();
  };
  $('#fSec').onchange = e => { SCR.sec = e.target.value; drawScreenerTable(); };
  $('#fScore').oninput = e => { SCR.minScore = +e.target.value; $('#fScoreV').textContent = SCR.minScore; drawScreenerTable(); };
  $('#fPE').oninput = e => { SCR.maxPE = e.target.value; drawScreenerTable(); };
  $('#fDY').oninput = e => { SCR.minDY = +e.target.value || 0; drawScreenerTable(); };
  $('#fRG').oninput = e => { SCR.minRG = e.target.value === '' ? -99 : +e.target.value; drawScreenerTable(); };
  $('#edgeFilters').oninput = e => {
    const ek = e.target.dataset.ek; if (!ek) return;
    SCR.edge[ek] = +e.target.value;
    $('#feV_' + ek).textContent = SCR.edge[ek] > 0 ? '≥ ' + SCR.edge[ek] : 'off';
    drawScreenerTable();
  };
  drawScreenerTable();
}

const SCR_COLS = [
  { k: 'tk', l: 'Company', get: m => m.s.t, dir: 1 },
  { k: 'px', l: 'Price', get: m => m.s.px },
  { k: 'chg', l: '1D %', get: m => m.mo.ret1d },
  { k: 'mc', l: 'Mkt Cap', get: m => m.s.mc },
  { k: 'pe', l: 'P/E', get: m => m.s.pe ?? 9999, dir: 1 },
  { k: 'dy', l: 'Yield', get: m => m.s.dy },
  { k: 'rg', l: 'Rev Gr', get: m => m.s.rg3 ?? -999 },
  { k: 'roic', l: 'ROIC', get: m => m.s.roic ?? -999 },
  { k: 'up', l: 'DCF Upside', get: m => m.dcf ? m.dcf.upside : -999 },
  { k: 'edge', l: 'Edge ✦', get: m => m.edge.score },
  { k: 'score', l: 'Emerald', get: m => m.score },
  { k: 'rating', l: 'Rating', get: m => m.score }
];
function drawScreenerTable(){
  const list = RANKED.filter(m => {
    if (!PRESETS[SCR.preset].fn(m)) return false;
    if (SCR.sec !== 'all' && m.s.sec !== SCR.sec) return false;
    if (m.score < SCR.minScore) return false;
    if (SCR.maxPE !== '' && +SCR.maxPE > 0 && !(m.s.pe != null && m.s.pe <= +SCR.maxPE)) return false;
    if (SCR.minDY > 0 && m.s.dy < SCR.minDY) return false;
    if (SCR.minRG > -99 && (m.s.rg3 ?? -999) < SCR.minRG) return false;
    for (const k in SCR.edge){
      const min = SCR.edge[k];
      if (min > 0 && !(m.edge[k].v != null && m.edge[k].v >= min)) return false;
    }
    return true;
  });
  const col = SCR_COLS.find(c => c.k === SCR.sort) || SCR_COLS[9];
  list.sort((a, b) => (col.get(a) > col.get(b) ? 1 : -1) * SCR.dir);
  $('#scrCount').textContent = `${list.length} match${list.length === 1 ? '' : 'es'}`;
  $('#scrTable').innerHTML = `
  <table class="tbl">
    <thead><tr>${SCR_COLS.map(c => `<th data-k="${c.k}" class="${SCR.sort === c.k ? 'sorted' : ''}">${c.l}${SCR.sort === c.k ? (SCR.dir < 0 ? ' ↓' : ' ↑') : ''}</th>`).join('')}</tr></thead>
    <tbody>
      ${list.map(m => `<tr onclick="App.go('stock/${m.s.t}')">
        <td><span class="tk">${m.s.t}</span><div class="co">${m.s.n}</div></td>
        <td>${F.money(m.s.px)}</td>
        <td>${F.chg(m.mo.ret1d)}</td>
        <td>${F.big(m.s.mc)}</td>
        <td>${m.s.pe != null ? m.s.pe.toFixed(1) : '—'}</td>
        <td>${m.s.dy ? m.s.dy.toFixed(2) + '%' : '—'}</td>
        <td>${F.pct(m.s.rg3, true)}</td>
        <td>${F.pct(m.s.roic)}</td>
        <td>${m.dcf ? F.chg(m.dcf.upside, 0) : '<span class="muted">—</span>'}</td>
        <td><b style="color:${scoreColor(m.edge.score)}">${Math.round(m.edge.score)}</b></td>
        <td>${scoreCell(m.score)}</td>
        <td>${ratingTag(m)}</td>
      </tr>`).join('')}
    </tbody>
  </table>`;
  $('#scrTable thead').onclick = e => {
    const th = e.target.closest('th'); if (!th) return;
    const k = th.dataset.k;
    if (SCR.sort === k) SCR.dir *= -1;
    else { SCR.sort = k; SCR.dir = (SCR_COLS.find(c => c.k === k).dir === 1) ? 1 : -1; }
    drawScreenerTable();
  };
}

// ============================================================
// STOCK DETAIL
// ============================================================
const RANGES = { '1M': 21, '3M': 63, '6M': 126, '1Y': 252, '5Y': TRADING_DAYS };
let stockRange = '1Y';

function renderStock(t){
  t = t.toUpperCase();
  const m = METRICS.get(t);
  if (!m){
    if (DATA_MODE === 'demo'){
      view().innerHTML = `<div class="empty-state card"><div class="ei">∅</div><b>"${escHTML(t)}" isn't in the demo dataset</b><p>Start the data server (npm start) or deploy to load any Yahoo-listed ticker.</p></div>`;
      return;
    }
    view().innerHTML = `<div class="empty-state card"><div class="ei">◌</div><b>Loading ${escHTML(t)}…</b><p>Fetching live fundamentals and price history from Yahoo Finance.</p></div>`;
    App.loadTicker(t).then(ok => {
      if (!location.hash.includes('/stock/')) return;   // user navigated away
      if (ok) renderStock(t);
      else view().innerHTML = `<div class="empty-state card"><div class="ei">∅</div><b>Couldn't load "${escHTML(t)}"</b><p>Unknown symbol, no price data, or under a year of trading history (the scoring engine needs ~1 year).</p>
        <button class="btn primary" style="margin-top:16px" onclick="App.go('screener')">Back to the screener</button></div>`;
    });
    return;
  }
  const s = m.s;
  const watched = WATCH.includes(t);
  const peers = RANKED.filter(x => x.s.sec === s.sec && x.s.t !== t).slice(0, 5);
  const d = m.dcfP;

  view().innerHTML = `
  <div class="stock-head">
    <div class="id">
      <h1>${s.n} <span class="muted" style="font-weight:600;font-size:17px">${s.t}</span> ${ratingTag(m)}</h1>
      <div class="sub"><span class="sector-chip">${s.sec}</span><span>${s.ind}</span><span>·</span><span>${F.big(s.mc)} market cap</span></div>
    </div>
    <div class="px">
      <div class="p num">${F.money(s.px)}</div>
      <div class="c">${F.chg(m.mo.ret1d)} <span class="faint small">today</span></div>
    </div>
    <div class="stock-actions">
      <button class="icon-btn ${watched ? 'on' : ''}" title="Watchlist" onclick="App.toggleWatch('${t}')">${watched ? '★' : '☆'}</button>
      <button class="btn small" onclick="App.addCompare('${t}')">⇄ Compare</button>
      <button class="btn small" onclick="App.go('action/${t}')">⇅ Price action</button>
      <button class="btn small" onclick="App.go('portfolio?add=${t}')">◔ Add to portfolio</button>
      <span class="muted small" style="margin-left:auto">${s.d}</span>
    </div>
  </div>

  <div class="card mb">
    <div class="score-banner">
      ${ringHTML(m.score, 128, 'Emerald Score', true)}
      ${pillarsHTML(m)}
      <div class="verdict">
        <div class="vtag">${ratingTag(m)} <span class="sector-chip" title="${escHTML(m.arch.why)}">◈ ${m.arch.name}</span> <span class="sector-chip" title="How much the pillars agree, weighted by importance, plus data completeness (${Math.round(m.coverage * 100)}% of fields available)">${m.convLabel} conviction</span></div>
        <p>${m.verdict}</p>
        <p class="muted small" title="${escHTML(m.regime.desc)}">Adaptive weights (${m.arch.name} · ${m.regime.name}): Value ${Math.round(m.weights.sv * 100)}% · Growth ${Math.round(m.weights.sg * 100)}% · Quality ${Math.round(m.weights.sq * 100)}% · Health ${Math.round(m.weights.sh * 100)}% · Momentum ${Math.round(m.weights.sm * 100)}% · Edge ${Math.round(m.weights.edge * 100)}%</p>
      </div>
      <div style="min-width:230px;flex:1"><canvas id="stRadar"></canvas></div>
    </div>
  </div>

  <div class="card mb">
    <div class="card-title">Emerald Edge — eight proprietary signals
      <b style="color:${scoreColor(m.edge.score)}">${Math.round(m.edge.score)}</b>
    </div>
    <div class="edge-grid">
      ${EDGE_DEFS.map(d => {
        const sig = m.edge[d.k];
        return `<div class="edge-cell glass">
          <div class="eh">
            <span class="ei">${d.ic}</span>
            <span class="en">${d.name}<div class="eq">${d.q}</div></span>
            <span class="ev" style="color:${sig.v == null ? 'var(--muted)' : scoreColor(sig.v)}">${sig.v == null ? '—' : Math.round(sig.v)}</span>
          </div>
          <div class="pbar"><i style="width:${Math.round(sig.v ?? 0)}%;background:${sig.v == null ? 'transparent' : scoreColor(sig.v)}"></i></div>
          <div class="er">${sig.read}</div>
        </div>`;
      }).join('')}
    </div>
    <div class="muted-block">These eight signals are Emerald's own methodology — market-relative and ranked against the live universe, not fixed thresholds. See the Academy for how each works, and the <a href="#/action/${t}" style="color:var(--accent,#34d399)">Price Action Lab</a> for the day-by-day market battle behind the ⇅ signal.</div>
  </div>

  <div class="card mb">
    <div class="card-title">Price history
      <span class="range-btns">${Object.keys(RANGES).map(r => `<button class="${stockRange === r ? 'active' : ''}" data-r="${r}">${r}</button>`).join('')}</span>
    </div>
    <canvas id="stChart"></canvas>
    <div class="chart-stats">
      <div>52W range<b class="num">${F.money(m.mo.lo52)} – ${F.money(m.mo.hi52)}</b></div>
      <div>vs 50-day avg<b>${F.chg(m.mo.vs50, 1)}</b></div>
      <div>vs 200-day avg<b>${F.chg(m.mo.vs200, 1)}</b></div>
      <div>RSI (14)<b class="num">${m.mo.rsi.toFixed(0)}</b></div>
      <div>Beta<b class="num">${(s.beta ?? 1).toFixed(2)}</b></div>
      <div>1Y return<b>${F.chg(m.mo.ret1y, 1)}</b></div>
      <div>Analyst target<b class="num">${s.tp ? `${F.money(s.tp)} <span class="${s.tp >= s.px ? 'up' : 'down'} small">(${F.pct((s.tp / s.px - 1) * 100, true)})</span>` : '—'}</b></div>
    </div>
    <div class="muted small" style="margin-top:8px">— price&nbsp;&nbsp;<span style="color:#60a5fa">┄ 50-day SMA</span>&nbsp;&nbsp;<span style="color:#c084fc">┄ 200-day SMA</span></div>
  </div>

  <div class="grid g3 mb">
    <div class="card">
      <div class="card-title">Valuation <b style="color:${scoreColor(m.sv)}">${Math.round(m.sv)}</b></div>
      <div class="kv"><span class="k">P/E (trailing / fwd)</span><span class="v">${F.n(s.pe)} / ${F.n(s.fpe)}</span></div>
      <div class="kv"><span class="k">PEG ratio</span><span class="v">${s.pe && s.egf > 0 ? (s.pe / s.egf).toFixed(2) : '—'}</span></div>
      <div class="kv"><span class="k">P/S · P/B</span><span class="v">${F.n(s.ps)} · ${F.n(s.pb)}</span></div>
      <div class="kv"><span class="k">EV / EBITDA</span><span class="v">${F.n(s.ev)}</span></div>
      <div class="kv"><span class="k">FCF yield</span><span class="v">${F.pct(m.fcfYield)}</span></div>
      <div class="kv"><span class="k">Earnings yield</span><span class="v">${s.pe ? F.pct(100 / s.pe) : '—'}</span></div>
      <div class="kv"><span class="k">Graham number</span><span class="v">${m.graham ? F.money(m.graham) : '—'}</span></div>
      <div class="kv"><span class="k">Dividend yield</span><span class="v">${s.dy ? s.dy.toFixed(2) + '%' : '—'}</span></div>
      <div class="kv"><span class="k">Payout ratio</span><span class="v">${s.po ? F.pct(s.po) : '—'}</span></div>
      <div class="kv"><span class="k">Short interest</span><span class="v">${F.pct(s.si)}</span></div>
    </div>
    <div class="card">
      <div class="card-title">Growth <b style="color:${scoreColor(m.sg)}">${Math.round(m.sg)}</b></div>
      <canvas id="stGrowth"></canvas>
      <div class="muted small" style="margin:6px 0 10px"><span style="color:#34d399">■</span> revenue ($B) &nbsp;<span style="color:#60a5fa">■</span> EPS ($, scaled)</div>
      <div class="kv"><span class="k">Revenue CAGR (3y)</span><span class="v">${F.pct(s.rg3, true)}</span></div>
      <div class="kv"><span class="k">Revenue growth (TTM)</span><span class="v">${F.pct(s.rg1, true)}</span></div>
      <div class="kv"><span class="k">EPS CAGR (3y)</span><span class="v">${F.pct(s.eg, true)}</span></div>
      <div class="kv"><span class="k">Est. fwd EPS growth</span><span class="v">${F.pct(s.egf, true)}</span></div>
    </div>
    <div class="card">
      <div class="card-title">Profitability <b style="color:${scoreColor(m.sq)}">${Math.round(m.sq)}</b></div>
      <div class="kv"><span class="k">Gross margin</span><span class="v">${F.pct(s.gm)}</span></div>
      <div class="kv"><span class="k">Operating margin</span><span class="v">${F.pct(s.om)}</span></div>
      <div class="kv"><span class="k">Net margin</span><span class="v">${F.pct(s.nm)}</span></div>
      <div class="kv"><span class="k">FCF margin</span><span class="v">${F.pct(s.fcf)}</span></div>
      <div class="kv"><span class="k">Return on equity</span><span class="v">${F.pct(s.roe)}</span></div>
      <div class="kv"><span class="k">Return on assets</span><span class="v">${F.pct(s.roa)}</span></div>
      <div class="kv"><span class="k">Return on invested capital</span><span class="v">${F.pct(s.roic)}</span></div>
      <div class="kv"><span class="k">Revenue (TTM)</span><span class="v">${s.ps && s.mc ? F.big(s.mc / s.ps) : '—'}</span></div>
    </div>
  </div>

  <div class="grid g3 mb">
    <div class="card">
      <div class="card-title">Financial health <b style="color:${scoreColor(m.sh)}">${Math.round(m.sh)}</b></div>
      <div class="gauges mb">
        <div class="gauge">
          <div class="gv" style="color:${m.fscore >= 7 ? '#34d399' : m.fscore >= 5 ? '#fbbf24' : '#f87171'}">${m.fscore}/9</div>
          <div class="gl">Piotroski F-Score</div>
          <div class="gs ${m.fscore >= 7 ? 'up' : m.fscore >= 5 ? '' : 'down'}">${m.fscore >= 7 ? 'Strengthening' : m.fscore >= 5 ? 'Stable' : 'Deteriorating'}</div>
        </div>
        <div class="gauge">
          <div class="gv" style="color:${m.z == null ? '#8fa8a0' : m.z > 3 ? '#34d399' : m.z > 1.8 ? '#fbbf24' : '#f87171'}">${m.z == null ? '—' : m.z.toFixed(1)}</div>
          <div class="gl">Altman Z-Score</div>
          <div class="gs ${m.z == null ? '' : m.z > 3 ? 'up' : m.z > 1.8 ? '' : 'down'}">${m.z == null ? 'n/a (financial co.)' : m.z > 3 ? 'Safe zone' : m.z > 1.8 ? 'Grey zone' : 'Distress zone'}</div>
        </div>
      </div>
      <div class="kv"><span class="k">Debt / equity</span><span class="v">${F.n(s.de, 2)}</span></div>
      <div class="kv"><span class="k">Current ratio</span><span class="v">${F.n(s.cr, 2)}</span></div>
      <div class="kv"><span class="k">Interest coverage</span><span class="v">${F.x(s.ic)}</span></div>
      <div class="kv"><span class="k">Insider ownership</span><span class="v">${F.pct(s.io)}</span></div>
      <div class="kv"><span class="k">Analyst consensus</span><span class="v"><span class="up">${s.ar[0]} buy</span> · ${s.ar[1]} hold · <span class="down">${s.ar[2]} sell</span></span></div>
    </div>
    <div class="card">
      <div class="card-title">DCF intrinsic value <span class="more" id="dcfReset">reset</span></div>
      <div id="dcfBody"></div>
    </div>
    <div class="card">
      <div class="card-title">Signals — ${m.flags.green.length} green · ${m.flags.red.length} red</div>
      <div class="flags" style="max-height:380px;overflow:auto">
        ${m.flags.green.map(f => `<div class="flag green"><span class="fi">✓</span><span>${f}</span></div>`).join('')}
        ${m.flags.red.map(f => `<div class="flag red"><span class="fi">⚠</span><span>${f}</span></div>`).join('')}
        ${!m.flags.green.length && !m.flags.red.length ? '<div class="muted small">No notable signals.</div>' : ''}
      </div>
    </div>
  </div>

  <div class="card">
    <div class="card-title">Sector peers — ${s.sec}</div>
    <div class="tbl-wrap">
      <table class="tbl"><thead><tr><th>Company</th><th>Price</th><th>P/E</th><th>Rev Gr</th><th>ROIC</th><th>Emerald</th><th>Rating</th></tr></thead>
      <tbody>${peers.map(p => `<tr onclick="App.go('stock/${p.s.t}')">
        <td><span class="tk">${p.s.t}</span><div class="co">${p.s.n}</div></td>
        <td>${F.money(p.s.px)}</td><td>${F.n(p.s.pe)}</td><td>${F.pct(p.s.rg3, true)}</td><td>${F.pct(p.s.roic)}</td>
        <td>${scoreCell(p.score)}</td><td>${ratingTag(p)}</td></tr>`).join('')}
      </tbody></table>
    </div>
  </div>`;

  // radar
  radarChart($('#stRadar'), ['Value', 'Growth', 'Quality', 'Health', 'Momentum', 'Edge'],
    [{ color: '#34d399', values: [m.sv, m.sg, m.sq, m.sh, m.sm, m.edge.score] }], 215);

  // growth bars
  const yr = new Date().getFullYear();
  const labels = m.hist.rev.map((_, i) => String(yr - m.hist.rev.length + i));
  const epsScale = Math.max(...m.hist.rev) / Math.max(...m.hist.eps.map(Math.abs), 0.01) * 0.7;
  barChart($('#stGrowth'), labels, [
    { color: '#34d399', data: m.hist.rev },
    { color: '#60a5fa', data: m.hist.eps.map(v => v * epsScale) }
  ], { height: 150 });

  // price chart — long ranges lazily fetched from the API in live mode
  const drawPrice = async () => {
    let src = m.series, srcDates = m.dates;
    const n = RANGES[stockRange];
    if (n > src.length && DATA_MODE !== 'demo'){
      if (m.longSeries){ src = m.longSeries; srcDates = m.longDates; }
      else {
        try {
          const r = await fetch(`/api/chart?t=${encodeURIComponent(t)}&years=5`);
          if (r.ok){
            const j = await r.json();
            m.longSeries = j.closes; m.longDates = j.dates.map(d => new Date(d));
            src = m.longSeries; srcDates = m.longDates;
          }
        } catch { toast('Could not load extended history'); }
      }
    }
    const cnt = Math.min(n, src.length);
    const data = Array.from(src.slice(-cnt));
    const dates = srcDates.slice(-cnt);
    let overlays = [];
    if (cnt >= 126 && src.length >= 200){
      const sma = (k) => data.map((_, i) => {
        const gi = src.length - cnt + i;
        return gi >= k - 1 ? smaAt(src, k, gi) : null;
      });
      overlays = [{ color: '#60a5fa', data: sma(50) }, { color: '#c084fc', data: sma(200) }];
    }
    const cv = $('#stChart');
    if (cv) lineChart(cv, data, dates, { height: 290, overlays });
  };
  drawPrice();
  document.querySelectorAll('.range-btns button').forEach(b => b.onclick = () => {
    stockRange = b.dataset.r;
    document.querySelectorAll('.range-btns button').forEach(x => x.classList.toggle('active', x === b));
    drawPrice();
  });

  // interactive DCF
  const dcfState = { ...d };
  const drawDCF = () => {
    const res = runDCF(s, dcfState.growth, dcfState.discount, dcfState.terminal);
    $('#dcfBody').innerHTML = res ? `
      <div class="dcf-result">
        <span class="iv" style="color:${res.upside >= 0 ? '#34d399' : '#f87171'}">${F.money(res.iv)}</span>
        <span class="small muted">est. fair value vs ${F.money(s.px)}</span>
        <span class="tag ${res.upside >= 15 ? 'r-sb' : res.upside >= -10 ? 'r-h' : 'r-a'}">${res.upside >= 0 ? '+' : ''}${res.upside.toFixed(0)}% ${res.upside >= 0 ? 'upside' : 'premium'}</span>
      </div>
      <div class="small muted">10-year two-stage model on FCF/share of ${F.money(res.fcfps)}, growth fading to terminal. Adjust the assumptions:</div>
      <div class="dcf-sliders">
        <div class="ds"><span>FCF growth (yr 1)</span><input type="range" id="dG" min="0" max="28" step="0.5" value="${dcfState.growth}"><b>${dcfState.growth.toFixed(1)}%</b></div>
        <div class="ds"><span>Discount rate</span><input type="range" id="dR" min="6" max="15" step="0.1" value="${dcfState.discount}"><b>${dcfState.discount.toFixed(1)}%</b></div>
        <div class="ds"><span>Terminal growth</span><input type="range" id="dT" min="0" max="4" step="0.1" value="${dcfState.terminal}"><b>${dcfState.terminal.toFixed(1)}%</b></div>
      </div>
      <div class="muted-block">A margin of safety of 25%+ (price well below fair value) is what value investors look for before buying.</div>`
    : `<div class="empty-state" style="padding:30px 10px"><div class="ei">∅</div><b>DCF not applicable</b><p>${s.fcf == null ? 'Cash-flow data is not meaningful for this business model (e.g. banks).' : 'Negative free cash flow — there is nothing to discount yet.'}</p></div>`;
    if (res){
      $('#dG').oninput = e => { dcfState.growth = +e.target.value; drawDCF(); };
      $('#dR').oninput = e => { dcfState.discount = +e.target.value; drawDCF(); };
      $('#dT').oninput = e => { dcfState.terminal = +e.target.value; drawDCF(); };
    }
  };
  drawDCF();
  $('#dcfReset').onclick = () => { Object.assign(dcfState, dcfDefaults(s)); drawDCF(); };
}

// ============================================================
// COMPARE
// ============================================================
const CMP_COLORS = ['#34d399', '#60a5fa', '#c084fc', '#fbbf24'];
const CMP_ROWS = [
  { l: 'Price', get: m => m.s.px, fmt: F.money },
  { l: 'Market cap', get: m => m.s.mc, fmt: F.big },
  { l: 'P/E (trailing)', get: m => m.s.pe, fmt: v => F.n(v), best: 'min' },
  { l: 'P/E (forward)', get: m => m.s.fpe, fmt: v => F.n(v), best: 'min' },
  { l: 'PEG', get: m => m.s.pe && m.s.egf > 0 ? m.s.pe / m.s.egf : null, fmt: v => F.n(v, 2), best: 'min' },
  { l: 'EV / EBITDA', get: m => m.s.ev, fmt: v => F.n(v), best: 'min' },
  { l: 'FCF yield', get: m => m.fcfYield, fmt: F.pct, best: 'max' },
  { l: 'Dividend yield', get: m => m.s.dy || null, fmt: v => v ? v.toFixed(2) + '%' : '—', best: 'max' },
  { l: 'Payout ratio', get: m => m.s.po || null, fmt: F.pct, best: 'min' },
  { l: 'Revenue CAGR 3y', get: m => m.s.rg3, fmt: v => F.pct(v, true), best: 'max' },
  { l: 'Fwd EPS growth', get: m => m.s.egf, fmt: v => F.pct(v, true), best: 'max' },
  { l: 'Gross margin', get: m => m.s.gm, fmt: F.pct, best: 'max' },
  { l: 'Net margin', get: m => m.s.nm, fmt: F.pct, best: 'max' },
  { l: 'ROIC', get: m => m.s.roic, fmt: F.pct, best: 'max' },
  { l: 'Debt / equity', get: m => m.s.de, fmt: v => F.n(v, 2), best: 'min' },
  { l: 'Piotroski F-Score', get: m => m.fscore, fmt: v => v + '/9', best: 'max' },
  { l: 'Altman Z-Score', get: m => m.z, fmt: v => F.n(v), best: 'max' },
  { l: 'DCF upside', get: m => m.dcf ? m.dcf.upside : null, fmt: v => F.pct(v, true), best: 'max' },
  { l: 'RSI (14)', get: m => m.mo.rsi, fmt: v => F.n(v, 0) },
  { l: '1Y return', get: m => m.mo.ret1y, fmt: v => F.pct(v, true), best: 'max' },
  { l: '✦ Moat Durability', get: m => m.edge.mdi.v, fmt: v => Math.round(v), best: 'max' },
  { l: '✦ Expectation Gap', get: m => m.edge.xgs.v, fmt: v => Math.round(v), best: 'max' },
  { l: '✦ Quality vs Price', get: m => m.edge.qad.v, fmt: v => Math.round(v), best: 'max' },
  { l: '✦ Trend Quality', get: m => m.edge.tqs.v, fmt: v => Math.round(v), best: 'max' },
  { l: '✦ Antifragility', get: m => m.edge.afs.v, fmt: v => Math.round(v), best: 'max' },
  { l: '✦ Price Action', get: m => m.edge.pas.v, fmt: v => Math.round(v), best: 'max' },
  { l: '✦ Compounding Engine', get: m => m.edge.ces.v, fmt: v => Math.round(v), best: 'max' },
  { l: '✦ Crowd Friction', get: m => m.edge.cfg.v, fmt: v => Math.round(v), best: 'max' },
  { l: 'Edge Score', get: m => m.edge.score, fmt: v => Math.round(v), best: 'max' },
  { l: 'Emerald Score', get: m => m.score, fmt: v => Math.round(v), best: 'max' }
];

function renderCompare(){
  const ms = CMP.map(t => METRICS.get(t)).filter(Boolean);
  view().innerHTML = `
  <h1 class="page">Compare</h1>
  <div class="page-sub">Put up to four stocks side by side — best value in each row is highlighted.</div>
  <div class="cmp-slots">
    ${ms.map((m, i) => `<span class="cmp-slot glass" style="border-color:${CMP_COLORS[i]}55"><i style="width:9px;height:9px;border-radius:50%;background:${CMP_COLORS[i]}"></i>${m.s.t}<span class="x" onclick="App.rmCompare('${m.s.t}')">✕</span></span>`).join('')}
    ${CMP.length < 4 ? `<span class="cmp-add"><input id="cmpSearch" class="glass" style="border-radius:13px;border:1px dashed var(--border-2);background:transparent;color:var(--text);padding:9px 14px;font-size:13px;outline:none" placeholder="+ add ticker…" autocomplete="off"><div class="ac-list glass" id="cmpAC"></div></span>` : ''}
  </div>
  ${ms.length ? `
  <div class="grid g32 mb">
    <div class="card"><div class="card-title">Factor profile</div><canvas id="cmpRadar"></canvas></div>
    <div class="card tight">
      <div class="card-title">Head to head</div>
      <div class="tbl-wrap" style="max-height:540px">
        <table class="tbl cmp-table">
          <thead><tr><th>Metric</th>${ms.map((m, i) => `<th style="color:${CMP_COLORS[i]};cursor:pointer" onclick="App.go('stock/${m.s.t}')">${m.s.t}</th>`).join('')}</tr></thead>
          <tbody>
            ${CMP_ROWS.map(row => {
              const vals = ms.map(row.get);
              let bestIdx = -1;
              if (row.best){
                let bv = null;
                vals.forEach((v, i) => {
                  if (v == null) return;
                  if (bv == null || (row.best === 'max' ? v > bv : v < bv)){ bv = v; bestIdx = i; }
                });
              }
              return `<tr><td class="muted">${row.l}</td>${vals.map((v, i) => `<td class="${i === bestIdx ? 'best' : ''}">${v == null ? '—' : row.fmt(v)}</td>`).join('')}</tr>`;
            }).join('')}
            <tr><td class="muted">Rating</td>${ms.map(m => `<td>${ratingTag(m)}</td>`).join('')}</tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>` : `<div class="card empty-state"><div class="ei">⇄</div><b>Nothing to compare yet</b><p>Add tickers above, or hit “Compare” on any stock page.</p></div>`}`;

  if (ms.length) radarChart($('#cmpRadar'), ['Value', 'Growth', 'Quality', 'Health', 'Momentum', 'Edge'],
    ms.map((m, i) => ({ color: CMP_COLORS[i], values: [m.sv, m.sg, m.sq, m.sh, m.sm, m.edge.score] })), 330);

  const inp = $('#cmpSearch');
  if (inp) attachAutocomplete(inp, $('#cmpAC'), async t => {
    if (!METRICS.has(t)){
      toast(`Loading ${t}…`);
      if (!await App.loadTicker(t)){ toast(`Couldn't load "${t}"`); return; }
    }
    App.addCompare(t); render();
  });
}

// ============================================================
// WATCHLIST
// ============================================================
function renderWatchlist(){
  const ms = WATCH.map(t => METRICS.get(t)).filter(Boolean).sort((a, b) => b.score - a.score);
  view().innerHTML = `
  <h1 class="page">Watchlist</h1>
  <div class="page-sub">${ms.length ? `${ms.length} stock${ms.length === 1 ? '' : 's'} on your radar, sorted by Emerald Score.` : 'Track ideas before you commit capital.'}</div>
  ${ms.length ? `<div class="wl-grid">
    ${ms.map((m, i) => `
      <div class="card tight" style="cursor:pointer" onclick="App.go('stock/${m.s.t}')">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px">
          <div><b style="font-size:16px">${m.s.t}</b><div class="muted small" style="max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${m.s.n}</div></div>
          <div style="margin-left:auto">${ringHTML(m.score, 62, 'Score')}</div>
        </div>
        <canvas id="wlSpark${i}"></canvas>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px">
          <span><b class="num">${F.money(m.s.px)}</b> <span class="small">${F.chg(m.mo.ret1d)}</span></span>
          ${ratingTag(m)}
        </div>
        <div class="small muted" style="margin-top:9px;display:flex;justify-content:space-between">
          <span>P/E ${F.n(m.s.pe)}</span><span>Yield ${m.s.dy ? m.s.dy.toFixed(1) + '%' : '—'}</span>
          <span>DCF ${m.dcf ? F.pct(m.dcf.upside, true) : '—'}</span>
        </div>
        <button class="btn small danger" style="margin-top:12px;width:100%;justify-content:center" onclick="event.stopPropagation();App.toggleWatch('${m.s.t}')">Remove</button>
      </div>`).join('')}
  </div>` : `<div class="card empty-state"><div class="ei">☆</div><b>Your watchlist is empty</b><p>Star any stock from its page or the screener to follow it here.</p>
    <button class="btn primary" style="margin-top:16px" onclick="App.go('screener')">Find ideas in the screener</button></div>`}`;
  ms.forEach((m, i) => sparkline($('#wlSpark' + i), Array.from(m.series.slice(-126)), 42));
}

// ============================================================
// PORTFOLIO
// ============================================================
function renderPortfolio(params){
  const prefill = params ? params.get('add') : null;
  const rows = PORT.map(h => {
    const m = METRICS.get(h.t); if (!m) return null;
    const val = h.sh * m.s.px, cost = h.sh * h.cost;
    return { h, m, val, cost, gain: val - cost, day: val * m.mo.ret1d / 100 };
  }).filter(Boolean);
  const totV = rows.reduce((a, r) => a + r.val, 0);
  const totC = rows.reduce((a, r) => a + r.cost, 0);
  const totD = rows.reduce((a, r) => a + r.day, 0);
  const wScore = totV ? rows.reduce((a, r) => a + r.m.score * r.val, 0) / totV : 0;
  const wYield = totV ? rows.reduce((a, r) => a + (r.m.s.dy || 0) * r.val, 0) / totV : 0;

  // sector allocation
  const alloc = {};
  for (const r of rows) alloc[r.m.s.sec] = (alloc[r.m.s.sec] || 0) + r.val;
  const segs = Object.entries(alloc).sort((a, b) => b[1] - a[1])
    .map(([sec, v], i) => ({ label: sec, value: v, color: ['#34d399', '#60a5fa', '#c084fc', '#fbbf24', '#f87171', '#5eead4', '#fb923c', '#a3e635', '#f472b6', '#94a3b8'][i % 10] }));

  // health checks
  const alerts = [];
  for (const r of rows){
    const w = totV ? r.val / totV * 100 : 0;
    if (w > 30) alerts.push({ cls: 'red', txt: `${r.h.t} is ${w.toFixed(0)}% of the portfolio — concentration risk.` });
    if (r.m.score < 40) alerts.push({ cls: 'red', txt: `${r.h.t} scores ${Math.round(r.m.score)}/100 (${r.m.rating.label}) — review this position.` });
  }
  for (const sg of segs){ const w = sg.value / totV * 100; if (w > 55) alerts.push({ cls: 'red', txt: `${sg.label} is ${w.toFixed(0)}% of the book — heavy sector tilt.` }); }
  if (rows.length > 0 && rows.length < 4) alerts.push({ cls: 'red', txt: `Only ${rows.length} holding${rows.length === 1 ? '' : 's'} — diversification is thin.` });
  if (rows.length && !alerts.length) alerts.push({ cls: 'green', txt: 'No structural issues detected — sizing and quality look healthy.' });

  view().innerHTML = `
  <h1 class="page">Portfolio</h1>
  <div class="page-sub">Track positions against the Emerald engine — it flags weak holdings and concentration risk.</div>

  <div class="summary-cards mb">
    <div class="sum-card glass"><div class="sl">Market value</div><div class="sv num">${F.money(totV)}</div><div class="ss muted">${rows.length} holding${rows.length === 1 ? '' : 's'}</div></div>
    <div class="sum-card glass"><div class="sl">Total gain</div><div class="sv num ${totV - totC >= 0 ? 'up' : 'down'}">${totC ? (totV - totC >= 0 ? '+' : '−') + F.money(Math.abs(totV - totC)) : '$0.00'}</div><div class="ss">${totC ? F.chg((totV / totC - 1) * 100) : '<span class="muted">—</span>'}</div></div>
    <div class="sum-card glass"><div class="sl">Day P/L</div><div class="sv num ${totD >= 0 ? 'up' : 'down'}">${(totD >= 0 ? '+' : '−') + F.money(Math.abs(totD))}</div><div class="ss muted">vs yesterday</div></div>
    <div class="sum-card glass"><div class="sl">Portfolio score</div><div class="sv" style="color:${scoreColor(wScore)}">${rows.length ? Math.round(wScore) : '—'}</div><div class="ss muted">value-weighted</div></div>
    <div class="sum-card glass"><div class="sl">Est. yield</div><div class="sv num">${rows.length ? wYield.toFixed(2) + '%' : '—'}</div><div class="ss muted">≈ ${F.money(totV * wYield / 100)} / yr</div></div>
  </div>

  <div class="card mb tight">
    <div class="card-title">Add position</div>
    <div class="filters" style="grid-template-columns:2fr 1fr 1fr auto">
      <div class="field" style="position:relative"><label>Ticker</label>
        <input id="pTick" placeholder="e.g. MSFT" autocomplete="off" value="${prefill || ''}" style="text-transform:uppercase">
        <div class="ac-list glass" id="pAC"></div>
      </div>
      <div class="field"><label>Shares</label><input id="pSh" type="number" min="0" step="any" placeholder="10"></div>
      <div class="field"><label>Avg cost / share</label><input id="pCost" type="number" min="0" step="any" placeholder="market"></div>
      <button class="btn primary" id="pAdd">Add</button>
    </div>
  </div>

  ${rows.length ? `
  <div class="grid g23 mb">
    <div class="card tight">
      <div class="card-title">Holdings</div>
      <div class="tbl-wrap">
      <table class="tbl"><thead><tr><th>Position</th><th>Shares</th><th>Avg cost</th><th>Price</th><th>Value</th><th>Day</th><th>Total G/L</th><th>Weight</th><th>Emerald</th><th></th></tr></thead>
      <tbody>
        ${rows.map((r, i) => `<tr onclick="App.go('stock/${r.h.t}')">
          <td><span class="tk">${r.h.t}</span><div class="co">${r.m.s.n}</div></td>
          <td>${r.h.sh}</td><td>${F.money(r.h.cost)}</td><td>${F.money(r.m.s.px)}</td>
          <td><b>${F.money(r.val)}</b></td>
          <td>${F.chg(r.m.mo.ret1d)}</td>
          <td class="${r.gain >= 0 ? 'up' : 'down'}">${(r.gain >= 0 ? '+' : '−') + F.money(Math.abs(r.gain))}<div class="small">${F.chg((r.val / r.cost - 1) * 100, 1)}</div></td>
          <td>${(r.val / totV * 100).toFixed(1)}%</td>
          <td>${scoreCell(r.m.score)}</td>
          <td><button class="btn small danger" onclick="event.stopPropagation();App.rmHolding(${PORT.indexOf(r.h)})">✕</button></td>
        </tr>`).join('')}
      </tbody></table>
      </div>
    </div>
    <div style="display:flex;flex-direction:column;gap:16px">
      <div class="card">
        <div class="card-title">Sector allocation</div>
        <canvas id="pDonut"></canvas>
        <div class="legend mt">
          ${segs.map(sg => `<div class="li"><span class="sw" style="background:${sg.color}"></span>${sg.label}<span class="lv">${(sg.value / totV * 100).toFixed(1)}%</span></div>`).join('')}
        </div>
      </div>
      <div class="card">
        <div class="card-title">Portfolio health</div>
        <div class="flags">
          ${alerts.map(a => `<div class="flag ${a.cls}"><span class="fi">${a.cls === 'green' ? '✓' : '⚠'}</span><span>${a.txt}</span></div>`).join('')}
        </div>
      </div>
    </div>
  </div>` : `<div class="card empty-state"><div class="ei">◔</div><b>No positions yet</b><p>Add your first holding above — Emerald will score the whole book and warn you about risk.</p></div>`}`;

  const tickInp = $('#pTick');
  attachAutocomplete(tickInp, $('#pAC'), t => { tickInp.value = t; });
  $('#pAdd').onclick = async () => {
    const t = tickInp.value.trim().toUpperCase();
    let m = METRICS.get(t);
    if (!m && DATA_MODE !== 'demo'){
      toast(`Loading ${t}…`);
      if (await App.loadTicker(t)) m = METRICS.get(t);
    }
    if (!m) { toast(DATA_MODE === 'demo' ? 'Unknown ticker — demo mode only covers the built-in universe' : `Couldn't load "${t}" from Yahoo Finance`); return; }
    const sh = parseFloat($('#pSh').value);
    if (!sh || sh <= 0) { toast('Enter a share count'); return; }
    const cost = parseFloat($('#pCost').value) || m.s.px;
    const existing = PORT.find(h => h.t === t);
    if (existing){
      const totSh = existing.sh + sh;
      existing.cost = (existing.sh * existing.cost + sh * cost) / totSh;
      existing.sh = totSh;
    } else PORT.push({ t, sh, cost });
    store.set('em_port', PORT);
    toast(`Added ${sh} ${t} @ ${F.money(cost)}`);
    location.hash = '#/portfolio'; render();
  };
  if (rows.length) donutChart($('#pDonut'), segs, 200);
}

// ============================================================
// ACADEMY
// ============================================================
function renderAcademy(){
  const items = [
    ['◆', 'How the Emerald Score works — adaptive, not one-size-fits-all', `
      <p>Every stock gets a <b>0–100 composite score</b> from five classic pillars plus the Edge signals — but unlike most screeners, <b>the rubric adapts to what the company is and what the market is doing</b>:</p>
      <ul>
        <li><b>Value</b> — earnings yield, free-cash-flow yield, PEG, EV/EBITDA, price vs sector P/E, and discount to DCF fair value.</li>
        <li><b>Quality</b> — margins, ROE, ROA and especially <b>ROIC</b>: great businesses earn high returns on capital, year after year.</li>
        <li><b>Growth</b> — historical and forecast revenue & EPS growth, plus consistency between them (steady beats spiky).</li>
        <li><b>Health</b> — leverage, liquidity, interest coverage, Altman Z and Piotroski F. Balance-sheet risk turns drawdowns into permanent losses.</li>
        <li><b>Momentum</b> — price vs 50/200-day averages, 6-month return, 52-week position, RSI.</li>
      </ul>
      <p>Three layers make it adaptive:</p>
      <ul>
        <li><b>◈ Archetypes</b> — each stock is classified (Compounder, Hypergrowth, Dividend Anchor, Deep Value, Turnaround, Financial, All-rounder) and judged by the rubric that fits: a utility isn't graded on momentum, a hypergrowth name isn't condemned by P/E, a bank isn't penalized for missing EV metrics. The archetype and its weights are shown on every stock page.</li>
        <li><b>◉ Market regime</b> — the S&P 500's own trend sets a tilt: in a <b>risk-off</b> tape, health and quality are weighted up while momentum and growth are dialed down; in <b>risk-on</b>, the reverse, mildly. What matters in a storm differs from what matters in a melt-up.</li>
        <li><b>⚖ Live calibration</b> — ratio inputs (ROIC, margins, yields, growth) are scored as a blend of fixed anchors and the stock's <i>percentile in the live universe</i>, so "good" means good in today's actual market, not against stale hardcoded thresholds.</li>
      </ul>
      <p>Each rating also carries a <b>conviction</b> tag: High when the pillars broadly agree and the data is complete, Low when they conflict — a 60 made of all-60s is a steadier bet than a 60 made of 90s and 20s.</p>
      <p><b>78+ = Strong Buy</b>, 64+ = Buy, 50+ = Hold, 36+ = Underperform, below = Avoid. The score is a research filter, not an oracle — always read the flags and form your own thesis.</p>`],
    ['✦', 'The Emerald Edge signals — our own eight methods', `
      <p>The classic pillars use well-known finance. The <b>Edge signals are Emerald's own methodology</b>, built on two ideas most retail tools skip: a stock's behavior only means something <i>relative to the market</i>, and cheap/expensive only means something <i>relative to every other stock you could buy instead</i>. Together they carry 16% of the composite.</p>
      <ul>
        <li><b>⛨ Moat Durability Index</b> — high returns attract competition; the question is whether they <i>persist</i>. We measure the spread of ROIC over an estimated cost of capital, rank that return against the company's own sector peers, and weigh the evidence the spread is defensible: gross-margin pricing power, and how ruler-straight the real multi-year revenue path has been (steady compounding is moat evidence; spiky growth is not).</li>
        <li><b>⇋ Expectation Gap Score</b> — instead of guessing fair value, we run the DCF <i>backwards</i>: solve for the growth rate the current price already implies, then compare with what the company can plausibly deliver (forecast + historical growth). You make money when reality beats the bar the price has set — so buy low bars, not good stories.</li>
        <li><b>◈ Quality vs Price</b> — every stock gets two ranks against the whole live universe: business quality (ROIC, cash generation, margins) and price tag (EV/EBITDA, P/E, P/S). The signal scores the <i>gap</i>. Top-shelf goods on a mid-shelf tag is the setup that outperforms; a premium price on a mid-shelf business is how good companies become bad investments.</li>
        <li><b>∿ Trend Quality Score</b> — not <i>whether</i> it beat the market but <i>how</i>. We compute the information ratio against the S&amp;P 500 over the past year (excluding the noisy last month — the classic momentum refinement), the share of rolling quarters it was ahead, and penalize lottery-style profiles whose gains arrive in a few huge spikes — smooth outperformance tends to persist; spiky outperformance tends to revert.</li>
        <li><b>⌁ Antifragility Score</b> — convexity, measured: how much of the market's rallies does the stock capture versus how much of the sell-offs does it absorb? A stock that takes 90% of the upside but only 60% of the downside compounds wealth through whole cycles. We also check behavior on the market's 15 worst days, drawdown depth and duration, and the balance-sheet buffers that let a company play offense in a crisis.</li>
        <li><b>⇅ Price Action Score</b> — market-day independence, counted rather than assumed: on the days the index actually <i>fell</i>, how often did this stock close green? Plus rally participation, the share of all days it beats the tape, and whether buyers return the day after the market's worst sessions. A stock that rises on 55%+ of down days has its own demand — explore any name's full day-by-day record in the <b>Price Action Lab</b>.</li>
        <li><b>↻ Compounding Engine Score</b> — growth is only valuable if it funds itself. We estimate the internal compounding rate (ROIC × earnings retained), check how much of reported profit converts to actual cash, and whether profits grow faster than revenue. Companies that fail this test must borrow or dilute you to grow.</li>
        <li><b>⚖ Crowd Friction Gauge</b> — every trade has a counterparty. We cross-reference analyst conviction and price targets, short-seller pressure, insider ownership and momentum euphoria. The best setups are where informed believers are loud but the price hasn't moved yet; the worst are crowded euphoria with heavy short interest on the other side.</li>
      </ul>
      <p>Each signal is 0–100 and shown with a plain-English reading on every stock page. Screen for them with the <b>Edge Leaders</b> and <b>Mispriced Growth</b> presets.</p>`],
    ['▲', 'DCF: what a business is actually worth', `
      <p>A <b>discounted cash flow</b> model says a company is worth all the cash it will ever generate, discounted back to today. Emerald uses a 10-year two-stage model: free cash flow per share grows at your chosen rate, fading toward a terminal rate (~2.5%, long-run GDP-ish), discounted at a rate scaled to the stock's volatility (beta).</p>
      <p>Three honest rules:</p>
      <ul>
        <li>Small changes in assumptions move fair value a lot — that's why the sliders are there. Stress-test your thesis.</li>
        <li>Demand a <b>margin of safety</b>: buy meaningfully below fair value (25%+ is the classic bar) so being wrong doesn't ruin you.</li>
        <li>DCF doesn't work for banks (cash flow isn't meaningful) or cash-burners (nothing to discount). Use P/B and earnings power instead.</li>
      </ul>`],
    ['✚', 'Piotroski F-Score: is the business improving?', `
      <p>Nine yes/no accounting checks, one point each: profitability (positive income, positive operating cash flow, rising ROA, cash flow exceeding income), leverage & liquidity (falling debt, rising current ratio, no share dilution), and efficiency (rising gross margin and asset turnover).</p>
      <p><b>7–9</b> = fundamentals strengthening across the board. <b>0–3</b> = deteriorating; cheapness alone won't save it. The score famously works best for separating real value stocks from value traps.</p>`],
    ['◎', 'Altman Z-Score: will it survive?', `
      <p>A bankruptcy-risk formula blending working capital, retained earnings, operating profit, market value and sales — each relative to assets. <b>Above 3 = safe zone. 1.8–3 = grey. Below 1.8 = distress zone</b> (statistically meaningful default risk within two years).</p>
      <p>It's designed for industrial/operating companies — Emerald hides it for banks and insurers where the inputs don't translate.</p>`],
    ['⚠', 'Red flags that actually matter', `
      <ul>
        <li><b>Negative free cash flow</b> — accounting profits you can't deposit. Persistent burners need constant refinancing.</li>
        <li><b>Payout ratio &gt; 90%</b> — the dividend eats nearly all earnings; one bad year forces a cut (and the stock usually falls before the cut).</li>
        <li><b>Interest coverage &lt; 3×</b> — a modest earnings dip can make debt service painful.</li>
        <li><b>Shrinking revenue</b> — cost cuts can carry EPS for a while, but no company shrinks to greatness.</li>
        <li><b>Very high short interest</b> — sophisticated money is betting against it. Sometimes wrong, never meaningless.</li>
        <li><b>P/E &gt; 50</b> — fine for hyper-growers, fatal if growth merely slows to "good".</li>
      </ul>`],
    ['◈', 'Dividend investing without the traps', `
      <p>The yield you can trust = yield × probability it survives. Check three things before buying any payer:</p>
      <ul>
        <li><b>Payout ratio under ~70%</b> (or under 80% of free cash flow) leaves room for bad years and raises.</li>
        <li><b>Growth streak</b> — decades of consecutive increases (think KO, PG, JNJ, XOM) reveal a management culture that treats the dividend as sacred.</li>
        <li><b>A 7%+ yield is usually a warning</b>, not a gift — the market is pricing a cut. Compare the yield to the company's own history.</li>
      </ul>`],
    ['⇄', 'Building a portfolio that survives you', `
      <ul>
        <li><b>Position sizing:</b> no single stock above ~10–15% (Emerald warns at 30%); your best idea can still be wrong.</li>
        <li><b>Sector caps:</b> under ~35% per sector — correlated holdings fall together.</li>
        <li><b>10–20 holdings</b> captures most diversification benefit without diluting your judgment.</li>
        <li><b>Mix factor exposure:</b> some value, some quality compounders, some dividend ballast. They take turns leading.</li>
        <li><b>Rebalance on thesis, not price.</b> Sell when the reason you bought is broken, not because it's red this month.</li>
      </ul>`],
    ['✦', 'Glossary — every metric on this app', `
      <ul>
        <li><b>P/E</b> — price ÷ earnings per share. Years of profit you're paying for upfront.</li>
        <li><b>PEG</b> — P/E ÷ growth rate. Under ~1.5 suggests growth is reasonably priced.</li>
        <li><b>EV/EBITDA</b> — capital-structure-neutral valuation; useful across leverage levels.</li>
        <li><b>FCF yield</b> — free cash flow ÷ market cap. The cash return the business earns you at today's price.</li>
        <li><b>ROIC</b> — profit ÷ all invested capital. The single best one-number quality test; &gt;15% sustained is elite.</li>
        <li><b>Gross / operating / net margin</b> — profitability at each stage of the income statement; expanding margins beat high ones.</li>
        <li><b>Debt/equity & interest coverage</b> — how leveraged, and how easily profits cover the interest bill.</li>
        <li><b>Beta</b> — sensitivity to market swings; 1.5 ≈ moves 50% more than the index.</li>
        <li><b>RSI</b> — momentum oscillator; &gt;70 overbought, &lt;30 oversold.</li>
        <li><b>SMA 50/200</b> — moving averages; price above a rising 200-day defines an uptrend, and the 50 crossing above the 200 is the "golden cross".</li>
        <li><b>Graham number</b> — √(22.5 × EPS × book value/share); Ben Graham's ceiling for a defensive buy.</li>
      </ul>`]
  ];
  view().innerHTML = `
  <h1 class="page">Academy</h1>
  <div class="page-sub">How Emerald thinks about finding good investments — and how to use each tool properly.</div>
  ${items.map(([ic, title, body], i) => `
    <details class="acc glass" ${i === 0 ? 'open' : ''}>
      <summary><span class="ai">${ic}</span>${title}</summary>
      <div class="acc-body">${body}</div>
    </details>`).join('')}
  <div class="muted-block">Emerald is an educational research tool using an illustrative dataset. Nothing here is financial advice — always do your own diligence.</div>`;
}

// ============================================================
// SEARCH / AUTOCOMPLETE
// ============================================================
function searchStocks(q){
  q = q.trim().toUpperCase();
  if (!q) return [];
  return RANKED.filter(m => m.s.t.toUpperCase().startsWith(q) || m.s.n.toUpperCase().includes(q))
    .sort((a, b) => (b.s.t.toUpperCase().startsWith(q) - a.s.t.toUpperCase().startsWith(q)) || b.score - a.score)
    .slice(0, 8);
}
const escHTML = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* Hybrid autocomplete: instant matches from the loaded universe, plus a
   debounced Yahoo-wide symbol search (/api/search) covering EVERY listed
   equity/ETF. Remote picks are loaded on demand via App.loadTicker. */
function attachAutocomplete(input, listEl, onPick){
  if (!input || !listEl) return;
  let sel = -1, remote = [], rTimer = null, token = 0;
  const close = () => { listEl.classList.remove('open'); sel = -1; };
  const items = () => {
    const local = searchStocks(input.value)
      .map(m => ({ t: m.s.t, name: m.s.n, score: m.score }));
    const seen = new Set(local.map(it => it.t));
    const rem = remote.filter(r => !seen.has(r.sym)).slice(0, 6)
      .map(r => ({ t: r.sym, name: r.name, exch: r.exch }));
    return [...local, ...rem].slice(0, 10);
  };
  const draw = () => {
    const res = items();
    if (!res.length){ close(); return; }
    if (sel >= res.length) sel = res.length - 1;
    listEl.innerHTML = res.map((it, i) => `
      <div class="sr-item ${i === sel ? 'sel' : ''}" data-t="${escHTML(it.t)}">
        <span class="sr-tick">${escHTML(it.t)}</span><span class="sr-name">${escHTML(it.name)}</span>
        ${it.score != null
          ? `<span class="sr-score" style="color:${scoreColor(it.score)}">${Math.round(it.score)}</span>`
          : `<span class="sr-exch">${escHTML(it.exch || 'Yahoo')}</span>`}
      </div>`).join('');
    listEl.classList.add('open');
    listEl.querySelectorAll('.sr-item').forEach(el => {
      el.onmousedown = e => { e.preventDefault(); onPick(el.dataset.t); close(); };
    });
  };
  const queueRemote = () => {
    clearTimeout(rTimer);
    const q = input.value.trim();
    if (q.length < 1 || DATA_MODE === 'demo') { remote = []; return; }
    rTimer = setTimeout(async () => {
      const my = ++token;
      try {
        const r = await fetch('/api/search?q=' + encodeURIComponent(q));
        if (!r.ok) return;
        const j = await r.json();
        if (my === token && input.value.trim() === q){ remote = j.results || []; draw(); }
      } catch { /* offline — local results still shown */ }
    }, 260);
  };
  input.addEventListener('input', () => { sel = -1; remote = []; draw(); queueRemote(); });
  input.addEventListener('focus', () => { draw(); queueRemote(); });
  input.addEventListener('blur', () => setTimeout(close, 150));
  input.addEventListener('keydown', e => {
    const res = items();
    if (e.key === 'ArrowDown'){ sel = Math.min(sel + 1, res.length - 1); draw(); e.preventDefault(); }
    else if (e.key === 'ArrowUp'){ sel = Math.max(sel - 1, 0); draw(); e.preventDefault(); }
    else if (e.key === 'Enter'){
      const pick = (sel >= 0 && res[sel]) ? res[sel].t : (res[0] || {}).t;
      if (pick){ onPick(pick); close(); }
    } else if (e.key === 'Escape') close();
  });
}
// ============================================================
// ROUTER
// ============================================================
function render(){
  if (!METRICS) return; // data still loading
  const hash = location.hash.replace(/^#\//, '') || 'dashboard';
  const [pathPart, queryPart] = hash.split('?');
  const params = queryPart ? new URLSearchParams(queryPart) : null;
  const [page, arg] = pathPart.split('/');

  document.querySelectorAll('[data-route]').forEach(a =>
    a.classList.toggle('active', a.dataset.route === page));

  window.scrollTo(0, 0);
  switch (page){
    case 'screener':  renderScreener(params); break;
    case 'action':    renderAction(arg); break;
    case 'stock':     renderStock(decodeURIComponent(arg || '')); break;
    case 'compare':   renderCompare(); break;
    case 'watchlist': renderWatchlist(); break;
    case 'portfolio': renderPortfolio(params); break;
    case 'academy':   renderAcademy(); break;
    default:          renderDashboard();
  }
}
window.addEventListener('hashchange', render);
let rsTimer;
window.addEventListener('resize', () => { clearTimeout(rsTimer); rsTimer = setTimeout(render, 200); });

// ============================================================
// BOOT — wait for live data (or fallback), then compute & render
// ============================================================
function bootApp(){
  SECTORS = [...new Set(STOCKS.map(s => s.sec))].sort();
  METRICS = computeAll();
  MARKET = computeMarket(METRICS);
  INSIGHTS = buildInsights(METRICS);
  RANKED = [...METRICS.values()].sort((a, b) => b.score - a.score);
  if (DATA_MODE === 'demo'){
    // demo data can't fetch arbitrary tickers — hide entries we can't show
    WATCH = WATCH.filter(t => METRICS.has(t));
    CMP = CMP.filter(t => METRICS.has(t));
  } else {
    // restore saved watch/portfolio/compare tickers that live outside the universe
    const extras = [...new Set([...WATCH, ...PORT.map(h => h.t), ...CMP])].filter(t => !METRICS.has(t));
    if (extras.length){
      Promise.all(extras.map(t => App.loadTicker(t))).then(r => { if (r.some(Boolean)) render(); });
    }
  }

  attachAutocomplete($('#globalSearch'), $('#searchResults'), t => {
    $('#globalSearch').value = ''; App.go('stock/' + t);
  });

  const asof = DATA_ASOF ? new Date(DATA_ASOF).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
  const badge = DATA_MODE === 'live'
    ? `<span class="data-badge live" title="Real market data via Yahoo Finance · as of ${asof} · click to force refresh" onclick="App.refreshData()">● LIVE</span>`
    : DATA_MODE === 'cached'
      ? `<span class="data-badge cached" title="Offline — last saved real data from ${asof}">● CACHED</span>`
      : `<span class="data-badge demo" title="Live data unreachable — start the Node server (npm start) for real data">● DEMO</span>`;
  $('#marketPill').innerHTML = MARKET.idx.map(ix =>
    `<span><b>${ix.t}</b> <span class="${ix.chg >= 0 ? 'up' : 'down'}">${ix.chg >= 0 ? '+' : ''}${ix.chg.toFixed(2)}%</span></span>`).join('') + badge;

  const boot = document.getElementById('boot');
  if (boot){ boot.style.opacity = '0'; setTimeout(() => boot.remove(), 450); }
  render();
}
App.refreshData = async () => {
  toast('Refreshing market data…');
  localStorage.removeItem('em_universe');   // drop the fast-boot cache
  try { await fetch('/api/universe?refresh=1'); } catch { /* serverless ignores this */ }
  setTimeout(() => location.reload(), 600);
};
DATA_READY.then(bootApp);
