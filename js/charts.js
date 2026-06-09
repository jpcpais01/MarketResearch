/* ============================================================
   Emerald · chart library (zero-dependency canvas rendering)
   ============================================================ */

const ChartTip = (() => {
  let el = null;
  function get(){
    if (!el){ el = document.createElement('div'); el.className = 'ch-tip'; document.body.appendChild(el); }
    return el;
  }
  return {
    show(x, y, html){
      const t = get(); t.innerHTML = html; t.style.display = 'block';
      const r = t.getBoundingClientRect();
      let lx = x + 16, ly = y - r.height - 12;
      if (lx + r.width > innerWidth - 10) lx = x - r.width - 16;
      if (ly < 8) ly = y + 18;
      t.style.left = lx + 'px'; t.style.top = ly + 'px';
    },
    hide(){ if (el) el.style.display = 'none'; }
  };
})();

function setupCanvas(canvas, h){
  const dpr = window.devicePixelRatio || 1;
  // clientWidth includes the parent's padding — subtract it so the chart
  // fits the CONTENT box and never spills past the card's right edge
  const p = canvas.parentElement;
  const cs = getComputedStyle(p);
  const pad = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
  const w = Math.max(60, (p.clientWidth || 300) - pad);
  canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
  canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h };
}

const fmtUSD = v => '$' + (v >= 1000 ? v.toLocaleString('en-US', { maximumFractionDigits: 0 }) : v.toFixed(2));
const fmtDate = d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });

/* ---- main price chart with grid, gradient fill, crosshair tooltip ---- */
function lineChart(canvas, data, dates, opts = {}){
  const H = opts.height || 300;
  const { ctx, w, h } = setupCanvas(canvas, H);
  const padL = 8, padR = 56, padT = 14, padB = 22;
  const iw = w - padL - padR, ih = h - padT - padB;
  let min = Infinity, max = -Infinity;
  for (const v of data){ if (v < min) min = v; if (v > max) max = v; }
  const span = (max - min) || 1; min -= span * 0.06; max += span * 0.06;
  const X = i => padL + (i / (data.length - 1)) * iw;
  const Y = v => padT + (1 - (v - min) / (max - min)) * ih;
  const up = data[data.length - 1] >= data[0];
  const col = opts.color || (up ? '#34d399' : '#f87171');

  ctx.clearRect(0, 0, w, h);
  // grid + y labels
  ctx.font = '10.5px Segoe UI'; ctx.fillStyle = 'rgba(255,255,255,.38)'; ctx.textAlign = 'left';
  ctx.strokeStyle = 'rgba(255,255,255,.06)'; ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++){
    const v = min + (max - min) * (i / 4), y = Y(v);
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(w - padR + 6, y); ctx.stroke();
    ctx.fillText(fmtUSD(v), w - padR + 10, y + 3.5);
  }
  // x labels
  ctx.textAlign = 'center';
  if (dates){
    const ticks = 5;
    for (let i = 0; i <= ticks; i++){
      const idx = Math.round((data.length - 1) * (i / ticks));
      ctx.fillText(fmtDate(dates[idx]), X(idx), h - 6);
    }
  }
  // gradient fill
  const grad = ctx.createLinearGradient(0, padT, 0, h - padB);
  grad.addColorStop(0, col + '4D'); grad.addColorStop(1, col + '00');
  ctx.beginPath();
  for (let i = 0; i < data.length; i++) i ? ctx.lineTo(X(i), Y(data[i])) : ctx.moveTo(X(i), Y(data[i]));
  ctx.lineTo(X(data.length - 1), h - padB); ctx.lineTo(X(0), h - padB); ctx.closePath();
  ctx.fillStyle = grad; ctx.fill();
  // line
  ctx.beginPath();
  for (let i = 0; i < data.length; i++) i ? ctx.lineTo(X(i), Y(data[i])) : ctx.moveTo(X(i), Y(data[i]));
  ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.stroke();
  // overlays (e.g. SMA lines)
  if (opts.overlays) for (const o of opts.overlays){
    ctx.beginPath(); ctx.setLineDash([5, 5]);
    for (let i = 0; i < o.data.length; i++){
      const v = o.data[i]; if (v == null) continue;
      const x = X(i + (data.length - o.data.length)), y = Y(v);
      i && o.data[i - 1] != null ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.strokeStyle = o.color; ctx.lineWidth = 1.3; ctx.stroke(); ctx.setLineDash([]);
  }

  // crosshair interaction
  canvas.onmousemove = e => {
    const r = canvas.getBoundingClientRect();
    const mx = e.clientX - r.left;
    const idx = Math.round(((mx - padL) / iw) * (data.length - 1));
    if (idx < 0 || idx >= data.length){ ChartTip.hide(); return; }
    // redraw base then crosshair
    lineChartStatic(canvas, data, dates, opts, idx);
    const dlabel = dates ? fmtDate(dates[idx]) : '';
    const chg = idx > 0 ? ((data[idx] / data[0] - 1) * 100) : 0;
    ChartTip.show(e.clientX, e.clientY,
      `<b>${fmtUSD(data[idx])}</b> <span style="color:${chg >= 0 ? '#34d399' : '#f87171'}">${chg >= 0 ? '+' : ''}${chg.toFixed(1)}%</span><br><span style="color:#8fa8a0">${dlabel}</span>`);
  };
  canvas.onmouseleave = () => { ChartTip.hide(); lineChart(canvas, data, dates, opts); };
}
function lineChartStatic(canvas, data, dates, opts, hoverIdx){
  // re-render base chart then draw crosshair marker at hoverIdx
  canvas.onmousemove = null; canvas.onmouseleave = null;
  lineChart(canvas, data, dates, opts);
  const dpr = window.devicePixelRatio || 1;
  const ctx = canvas.getContext('2d');
  const w = canvas.width / dpr, h = canvas.height / dpr;
  const padL = 8, padR = 56, padT = 14, padB = 22;
  const iw = w - padL - padR, ih = h - padT - padB;
  let min = Infinity, max = -Infinity;
  for (const v of data){ if (v < min) min = v; if (v > max) max = v; }
  const span = (max - min) || 1; min -= span * 0.06; max += span * 0.06;
  const x = padL + (hoverIdx / (data.length - 1)) * iw;
  const y = padT + (1 - (data[hoverIdx] - min) / (max - min)) * ih;
  ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
  ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, h - padB); ctx.stroke(); ctx.setLineDash([]);
  ctx.beginPath(); ctx.arc(x, y, 4.5, 0, Math.PI * 2);
  ctx.fillStyle = data[data.length - 1] >= data[0] ? '#34d399' : '#f87171';
  ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
}

/* ---- sparkline ---- */
function sparkline(canvas, data, h = 44){
  const { ctx, w } = setupCanvas(canvas, h);
  let min = Infinity, max = -Infinity;
  for (const v of data){ if (v < min) min = v; if (v > max) max = v; }
  const span = (max - min) || 1;
  const X = i => (i / (data.length - 1)) * w;
  const Y = v => 3 + (1 - (v - min) / span) * (h - 8);
  const col = data[data.length - 1] >= data[0] ? '#34d399' : '#f87171';
  ctx.clearRect(0, 0, w, h);
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, col + '38'); grad.addColorStop(1, col + '00');
  ctx.beginPath();
  for (let i = 0; i < data.length; i++) i ? ctx.lineTo(X(i), Y(data[i])) : ctx.moveTo(X(i), Y(data[i]));
  ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath(); ctx.fillStyle = grad; ctx.fill();
  ctx.beginPath();
  for (let i = 0; i < data.length; i++) i ? ctx.lineTo(X(i), Y(data[i])) : ctx.moveTo(X(i), Y(data[i]));
  ctx.strokeStyle = col; ctx.lineWidth = 1.6; ctx.stroke();
}

/* ---- radar (pillar comparison) ---- */
function radarChart(canvas, axes, datasets, h = 280){
  const { ctx, w } = setupCanvas(canvas, h);
  const cx = w / 2, cy = h / 2 + 4, R = Math.min(w, h) / 2 - 34;
  const N = axes.length;
  const pt = (i, frac) => {
    const a = -Math.PI / 2 + (i / N) * Math.PI * 2;
    return [cx + Math.cos(a) * R * frac, cy + Math.sin(a) * R * frac];
  };
  ctx.clearRect(0, 0, w, h);
  // web
  ctx.strokeStyle = 'rgba(255,255,255,.09)'; ctx.lineWidth = 1;
  for (let ring = 1; ring <= 4; ring++){
    ctx.beginPath();
    for (let i = 0; i <= N; i++){ const [x, y] = pt(i % N, ring / 4); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.stroke();
  }
  for (let i = 0; i < N; i++){ const [x, y] = pt(i, 1); ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(x, y); ctx.stroke(); }
  // labels
  ctx.font = '600 10.5px Segoe UI'; ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (let i = 0; i < N; i++){ const [x, y] = pt(i, 1.17); ctx.fillText(axes[i], x, y); }
  // datasets
  for (const ds of datasets){
    ctx.beginPath();
    for (let i = 0; i <= N; i++){ const [x, y] = pt(i % N, Math.max(0.04, ds.values[i % N] / 100)); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.closePath();
    ctx.fillStyle = ds.color + '2E'; ctx.fill();
    ctx.strokeStyle = ds.color; ctx.lineWidth = 2; ctx.stroke();
    for (let i = 0; i < N; i++){
      const [x, y] = pt(i, Math.max(0.04, ds.values[i] / 100));
      ctx.beginPath(); ctx.arc(x, y, 2.8, 0, Math.PI * 2); ctx.fillStyle = ds.color; ctx.fill();
    }
  }
}

/* ---- donut ---- */
function donutChart(canvas, segments, h = 210){
  const { ctx, w } = setupCanvas(canvas, h);
  const cx = w / 2, cy = h / 2, R = Math.min(w, h) / 2 - 10, r = R * 0.62;
  const total = segments.reduce((a, s) => a + s.value, 0) || 1;
  let a0 = -Math.PI / 2;
  ctx.clearRect(0, 0, w, h);
  for (const seg of segments){
    const a1 = a0 + (seg.value / total) * Math.PI * 2;
    ctx.beginPath(); ctx.arc(cx, cy, R, a0 + 0.012, a1 - 0.012); ctx.arc(cx, cy, r, a1 - 0.012, a0 + 0.012, true);
    ctx.closePath(); ctx.fillStyle = seg.color; ctx.fill();
    a0 = a1;
  }
}

/* ---- grouped bar chart (financial history) ---- */
function barChart(canvas, labels, series, opts = {}){
  const H = opts.height || 190;
  const { ctx, w, h } = setupCanvas(canvas, H);
  const padL = 6, padR = 6, padT = 10, padB = 20;
  const iw = w - padL - padR, ih = h - padT - padB;
  let min = 0, max = -Infinity;
  for (const s of series) for (const v of s.data){ if (v == null) continue; if (v > max) max = v; if (v < min) min = v; }
  if (max <= 0) max = 1;
  const Y = v => padT + (1 - (v - min) / (max - min)) * ih;
  const groups = labels.length, gw = iw / groups;
  const bw = Math.min(26, (gw * 0.62) / series.length);
  ctx.clearRect(0, 0, w, h);
  // zero line
  ctx.strokeStyle = 'rgba(255,255,255,.14)'; ctx.beginPath(); ctx.moveTo(padL, Y(0)); ctx.lineTo(w - padR, Y(0)); ctx.stroke();
  ctx.font = '10px Segoe UI'; ctx.fillStyle = 'rgba(255,255,255,.4)'; ctx.textAlign = 'center';
  for (let g = 0; g < groups; g++){
    const cx = padL + gw * g + gw / 2;
    ctx.fillText(labels[g], cx, h - 5);
    for (let si = 0; si < series.length; si++){
      const v = series[si].data[g]; if (v == null) continue;
      const x = cx - (series.length * bw) / 2 + si * bw;
      const y0 = Y(0), y1 = Y(v);
      ctx.fillStyle = v >= 0 ? series[si].color : '#f87171';
      const top = Math.min(y0, y1), bh = Math.max(2, Math.abs(y0 - y1));
      ctx.beginPath();
      ctx.roundRect ? (ctx.roundRect(x, top, bw - 3, bh, 3), ctx.fill()) : ctx.fillRect(x, top, bw - 3, bh);
    }
  }
}

/* ---- SVG score ring (returns html) ---- */
function ringHTML(score, size = 86, label = 'Emerald', big = false){
  const sw = size > 100 ? 9 : 7;
  const r = (size - sw) / 2, c = 2 * Math.PI * r;
  const col = scoreColor(score);
  const off = c * (1 - clamp(score, 0, 100) / 100);
  return `<div class="ring ${big ? 'big' : ''}" style="width:${size}px;height:${size}px">
    <svg width="${size}" height="${size}">
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="rgba(255,255,255,.08)" stroke-width="${sw}"/>
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${col}" stroke-width="${sw}"
        stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${off}"
        style="filter:drop-shadow(0 0 6px ${col}66)"/>
    </svg>
    <div class="ring-val"><b style="color:${col}">${Math.round(score)}</b><span>${label}</span></div>
  </div>`;
}

/* ---- pillar bars (returns html) ---- */
function pillarsHTML(m){
  const rows = [['Value', m.sv], ['Growth', m.sg], ['Quality', m.sq], ['Health', m.sh], ['Momentum', m.sm], ['Edge ✦', m.edge.score]];
  return `<div class="pillars">` + rows.map(([l, v]) => `
    <div class="pillar">
      <span class="pl">${l}</span>
      <span class="pbar"><i style="width:${Math.round(v)}%;background:${scoreColor(v)}"></i></span>
      <span class="pv" style="color:${scoreColor(v)}">${Math.round(v)}</span>
    </div>`).join('') + `</div>`;
}
