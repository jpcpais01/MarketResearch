/* ============================================================
   Emerald · shared Yahoo Finance fetchers
   Used by BOTH the local server (server.mjs) and the Vercel
   serverless functions (api/*.js). One source of truth for the
   ticker universe and the field mapping.
   (Underscore-prefixed folder → not exposed as a function.)
   ============================================================ */
import YahooFinance from 'yahoo-finance2';

export const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey', 'ripHistorical'] });

export const TICKERS = [
  'AAPL','MSFT','NVDA','GOOGL','AMZN','META','AVGO','ORCL','CRM','ADBE','AMD','INTC','QCOM','TXN','CSCO','NOW','INTU','AMAT','MU','PLTR','SNOW','CRWD','PANW','SHOP','UBER','ABNB','NFLX','PYPL',
  'BRK.B','JPM','V','MA','BAC','GS','MS','AXP','WFC',
  'UNH','LLY','JNJ','ABBV','MRK','PFE','TMO','ISRG','AMGN','GILD','CVS','MDT',
  'WMT','COST','PG','KO','PEP','MCD','NKE','SBUX','HD','LOW','TGT','CMG','DIS','F','GM',
  'XOM','CVX','COP','CAT','DE','BA','GE','LMT','UPS','UNP','LIN','SHW','FCX',
  'T','VZ','TMUS','NEE','DUK','SO','O','PLD','AMT',
  'RIVN','SNAP'
];

export const INDEX_SYMS = [
  { t: 'SPX', sym: '^GSPC', n: 'S&P 500' },
  { t: 'NDX', sym: '^NDX',  n: 'Nasdaq 100' },
  { t: 'DJI', sym: '^DJI',  n: 'Dow Jones' }
];

export const ySym = t => t.replace('.', '-');
const pct = v => (v == null || !isFinite(v)) ? null : v * 100;
const num = v => (v == null || !isFinite(v)) ? null : v;

/* Symbol search across ALL of Yahoo Finance (any listed equity/ETF). */
export async function searchSymbols(q){
  const r = await yahooFinance.search(q, { quotesCount: 8, newsCount: 0, enableFuzzyQuery: true });
  return (r.quotes || [])
    .filter(x => x.symbol && (x.quoteType === 'EQUITY' || x.quoteType === 'ETF'))
    .map(x => ({
      sym: x.symbol,
      name: x.shortname || x.longname || x.symbol,
      exch: x.exchDisp || x.exchange || '',
      type: x.quoteType
    }));
}

export async function fetchChart(sym, years){
  const period1 = new Date(Date.now() - years * 365.25 * 86400e3);
  const ch = await yahooFinance.chart(sym, { period1, interval: '1d' });
  const quotes = (ch.quotes || []).filter(q => q.close != null);
  return {
    closes: quotes.map(q => +q.close.toFixed(4)),
    dates: quotes.map(q => +new Date(q.date))
  };
}

export async function fetchStock(t){
  const sym = ySym(t);
  const q = await yahooFinance.quoteSummary(sym, {
    modules: ['price', 'summaryDetail', 'financialData', 'defaultKeyStatistics',
              'assetProfile', 'earningsTrend', 'recommendationTrend']
  });

  const p = q.price || {}, sd = q.summaryDetail || {}, fd = q.financialData || {};
  const ks = q.defaultKeyStatistics || {}, ap = q.assetProfile || {};
  const px = num(p.regularMarketPrice);
  if (!px) throw new Error('no price');

  // real annual income statements → multi-year growth, interest coverage, dilution
  let rg3 = null, eg = null, ic = null, revHist = null, dil = null;
  try {
    const fts = await yahooFinance.fundamentalsTimeSeries(sym, {
      period1: new Date(Date.now() - 5.2 * 365.25 * 86400e3), type: 'annual', module: 'financials'
    });
    const rows = (fts || []).filter(r => r.periodType !== 'TTM').sort((a, b) => new Date(a.date) - new Date(b.date));
    const revs = rows.map(r => num(r.totalRevenue)).filter(v => v > 0);
    if (revs.length >= 3){
      rg3 = (Math.pow(revs[revs.length - 1] / revs[0], 1 / (revs.length - 1)) - 1) * 100;
      revHist = revs.map(v => +(v / 1e9).toFixed(2));
    }
    const nis = rows.map(r => num(r.netIncome)).filter(v => v != null);
    if (nis.length >= 3 && nis[0] > 0 && nis[nis.length - 1] > 0)
      eg = (Math.pow(nis[nis.length - 1] / nis[0], 1 / (nis.length - 1)) - 1) * 100;
    const lastY = rows[rows.length - 1];
    if (num(lastY?.EBIT) && num(lastY?.interestExpense) && lastY.interestExpense !== 0)
      ic = Math.abs(lastY.EBIT / lastY.interestExpense);
    const shs = rows.map(r => num(r.dilutedAverageShares) ?? num(r.basicAverageShares)).filter(v => v > 0);
    if (shs.length >= 3)
      dil = (Math.pow(shs[shs.length - 1] / shs[0], 1 / (shs.length - 1)) - 1) * 100; // +ve = dilution, −ve = buybacks
  } catch { /* fundamentals optional */ }

  const { closes, dates } = await fetchChart(sym, 2.1);

  const mcap = num(p.marketCap) ?? num(sd.marketCap);
  const totalRev = num(fd.totalRevenue);
  const rec = q.recommendationTrend?.trend?.[0];
  const trend = q.earningsTrend?.trend || [];
  const gFwd = num(trend.find(x => x.period === '+1y')?.growth)
            ?? num(trend.find(x => x.period === '+5y')?.growth);
  // ROIC approximation: NI / (book equity + total debt)
  let roic = null;
  if (totalRev && fd.profitMargins != null && mcap && ks.priceToBook){
    const ni = totalRev * fd.profitMargins;
    const equity = mcap / ks.priceToBook;
    roic = ni / (equity + (num(fd.totalDebt) ?? 0)) * 100;
  }
  let dy = num(sd.dividendYield);
  if (dy != null) dy = dy < 1 ? dy * 100 : dy;   // yahoo sometimes pre-multiplies

  return {
    t,
    n: p.shortName || p.longName || t,
    sec: ap.sector || 'Other',
    ind: ap.industry || '—',
    px,
    mc: mcap ? mcap / 1e9 : null,
    pe: num(sd.trailingPE),
    fpe: num(ks.forwardPE) ?? num(sd.forwardPE),
    pb: num(ks.priceToBook),
    ps: num(sd.priceToSalesTrailing12Months) ?? (mcap && totalRev ? mcap / totalRev : null),
    ev: num(ks.enterpriseToEbitda),
    dy: dy ?? 0,
    po: pct(sd.payoutRatio) ?? 0,
    rg3,
    rg1: pct(fd.revenueGrowth),
    eg,
    egf: pct(gFwd),
    gm: pct(fd.grossMargins),
    om: pct(fd.operatingMargins),
    nm: pct(fd.profitMargins),
    roe: pct(fd.returnOnEquity),
    roa: pct(fd.returnOnAssets),
    roic,
    de: fd.debtToEquity != null ? fd.debtToEquity / 100 : null,
    cr: num(fd.currentRatio),
    ic,
    fcf: (num(fd.freeCashflow) && totalRev) ? fd.freeCashflow / totalRev * 100 : null,
    beta: num(sd.beta) ?? 1.0,
    si: pct(ks.shortPercentOfFloat) ?? 0,
    io: pct(ks.heldPercentInsiders) ?? 0,
    ar: rec ? [(rec.strongBuy || 0) + (rec.buy || 0), rec.hold || 0, (rec.sell || 0) + (rec.strongSell || 0)] : [0, 0, 0],
    tp: num(fd.targetMeanPrice),
    d: (ap.longBusinessSummary || '').split('. ').slice(0, 2).join('. ').slice(0, 300),
    dil, revHist, closes, dates
  };
}
