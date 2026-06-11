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
  'A','AA','AAL','AAON','AAPL','ABBV','ABEV','ABNB','ABT','ACGL','ACI','ACM','ACN','ADBE','ADC','ADI','ADM','ADP','ADSK','AEE',
  'AEIS','AEP','AES','AFG','AFL','AFRM','AGCO','AHR','AIG','AIT','AIZ','AJG','AKAM','ALAB','ALB','ALGM','ALGN','ALK','ALL','ALLE',
  'ALLY','ALV','AM','AMAT','AMCR','AMD','AME','AMG','AMGN','AMH','AMKR','AMP','AMT','AMX','AMZN','AN','ANET','ANF','AON','AOS',
  'APA','APD','APG','APH','APO','APP','APPF','APTV','AR','ARE','ARES','ARM','ARMK','ARW','ARWR','ASB','ASH','ASML','ATI','ATO',
  'ATR','AVAV','AVB','AVGO','AVNT','AVT','AVTR','AVY','AWK','AXON','AXP','AXTA','AYI','AZN','AZO','BA','BABA','BAC','BAH','BALL',
  'BAX','BBVA','BBWI','BBY','BC','BCO','BCS','BDC','BDX','BEN','BF.B','BG','BHF','BHP','BIDU','BIIB','BILL','BIO','BJ','BKH',
  'BKNG','BKR','BLD','BLDR','BLK','BLKB','BMRN','BMY','BNY','BP','BR','BRBR','BRK.B','BRKR','BRO','BROS','BRX','BSX','BSY','BTI',
  'BURL','BWA','BWXT','BX','BXP','BYD','C','CACI','CAG','CAH','CAR','CARR','CART','CASY','CAT','CAVA','CB','CBOE','CBRE','CBSH',
  'CBT','CCI','CCK','CCL','CDNS','CDP','CDW','CEG','CELH','CF','CFG','CFR','CG','CGNX','CHD','CHDN','CHE','CHH','CHRD','CHRW',
  'CHTR','CHWY','CI','CIEN','CINF','CL','CLF','CLH','CLX','CMC','CMCSA','CME','CMG','CMI','CMS','CNC','CNH','CNM','CNO','CNP',
  'CNX','CNXC','COF','COHR','COIN','COKE','COLB','COLM','COO','COP','COR','COST','COTY','CPAY','CPB','CPNG','CPRI','CPRT','CPT','CR',
  'CRBG','CRH','CRL','CRM','CROX','CRS','CRUS','CRWD','CSCO','CSGP','CSL','CSX','CTAS','CTRE','CTSH','CTVA','CUBE','CUZ','CVLT','CVNA',
  'CVS','CVX','CW','CXT','CYTK','D','DAL','DAR','DASH','DB','DBX','DCI','DD','DDOG','DE','DECK','DELL','DEO','DG','DGX',
  'DHI','DHR','DINO','DIS','DKNG','DKS','DLB','DLR','DLTR','DOC','DOCN','DOCS','DOCU','DOV','DOW','DPZ','DRI','DT','DTE','DTM',
  'DUK','DUOL','DVA','DVN','DXCM','DY','E','EA','EBAY','ECL','ED','EEFT','EFX','EG','EGP','EHC','EIX','EL','ELAN','ELF',
  'ELS','ELV','EME','EMR','ENS','ENSG','ENTG','EOG','EPR','EQH','EQIX','EQNR','EQR','EQT','ERIC','ERIE','ES','ESAB','ESNT','ESS',
  'ETN','ETR','EVR','EVRG','EW','EWBC','EXC','EXE','EXEL','EXLS','EXP','EXPD','EXPE','EXPO','EXR','F','FAF','FANG','FAST','FBIN',
  'FCFS','FCN','FCX','FDS','FDX','FDXF','FE','FFIN','FFIV','FHI','FHN','FICO','FIS','FISV','FITB','FIVE','FIX','FLEX','FLG','FLR',
  'FLS','FN','FNB','FND','FNF','FOUR','FOX','FOXA','FR','FRT','FSLR','FTI','FTNT','FTV','G','GAP','GATX','GBCI','GD','GDDY',
  'GE','GEF','GEHC','GEN','GEV','GGG','GHC','GILD','GIS','GL','GLPI','GLW','GM','GME','GMED','GNRC','GNTX','GOOG','GOOGL','GPC',
  'GPK','GPN','GRAB','GRMN','GS','GSK','GT','GTLB','GTLS','GWRE','GWW','GXO','H','HAE','HAL','HALO','HAS','HBAN','HCA','HD',
  'HDB','HGV','HIG','HII','HIMS','HL','HLI','HLNE','HLT','HMC','HOG','HOMB','HON','HOOD','HPE','HPQ','HQY','HR','HRB','HRL',
  'HSBC','HSIC','HST','HSY','HUBB','HUBS','HUM','HWC','HWM','HXL','IBKR','IBM','IBN','IBOC','ICE','IDA','IDCC','IDXX','IEX','IFF',
  'ILMN','INCY','INFY','ING','INGR','INTC','INTU','INVH','IOT','IP','IPGP','IQV','IR','IRM','IRT','ISRG','IT','ITT','ITUB','ITW',
  'IVZ','J','JAZZ','JBHT','JBL','JCI','JD','JEF','JHG','JKHY','JLL','JNJ','JPM','KBH','KBR','KD','KDP','KEX','KEY','KEYS',
  'KHC','KIM','KKR','KLAC','KMB','KMI','KNF','KNSL','KNX','KO','KR','KRC','KRG','KTOS','KVUE','L','LAD','LAMR','LCID','LDOS',
  'LEA','LECO','LEN','LFUS','LH','LHX','LI','LII','LIN','LITE','LIVN','LLY','LMT','LNT','LNTH','LOPE','LOW','LPX','LRCX','LSTR',
  'LULU','LUV','LVS','LYB','LYFT','LYG','LYV','M','MA','MAA','MANH','MAR','MAS','MASI','MAT','MCD','MCHP','MCK','MCO','MDB',
  'MDLZ','MDT','MEDP','MELI','MET','META','MGM','MIDD','MKC','MKSI','MLI','MLM','MMM','MMS','MNST','MO','MOG.A','MORN','MOS','MP',
  'MPC','MPWR','MRK','MRNA','MRSH','MS','MSA','MSCI','MSFT','MSI','MSM','MSTR','MTB','MTD','MTDR','MTG','MTN','MTSI','MTZ','MU',
  'MUFG','MUR','MUSA','MZTI','NBIX','NCLH','NDAQ','NDSN','NEE','NEM','NET','NEU','NFG','NFLX','NI','NIO','NJR','NKE','NLY','NNN',
  'NOC','NOK','NOV','NOVT','NOW','NRG','NSA','NSC','NTAP','NTES','NTNX','NTR','NTRS','NU','NUE','NVDA','NVO','NVR','NVS','NVST',
  'NVT','NWE','NWG','NWS','NWSA','NXPI','NXST','NXT','NYT','O','OC','ODFL','OGE','OGS','OHI','OKE','OKTA','OLED','OLLI','OLN',
  'OMC','ON','ONB','ONON','ONTO','OPCH','ORA','ORCL','ORI','ORLY','OSK','OTIS','OVV','OXY','OZK','P','PAG','PANW','PATH','PAYX',
  'PB','PBF','PBR','PCAR','PCG','PCTY','PDD','PEG','PEGA','PEN','PEP','PFE','PFG','PFGC','PG','PGR','PH','PHG','PHM','PII',
  'PINS','PK','PKG','PLD','PLNT','PLTR','PM','PNC','PNFP','PNR','PNW','PODD','POOL','POR','POST','PPC','PPG','PPL','PR','PRI',
  'PRU','PSA','PSKY','PSN','PSX','PTC','PVH','PWR','PYPL','Q','QCOM','QLYS','R','RACE','RBA','RBC','RBLX','RCL','RDDT','REG',
  'REGN','REXR','RF','RGA','RGEN','RGLD','RH','RIO','RIVN','RJF','RL','RLI','RMBS','RMD','RNR','ROIV','ROK','ROKU','ROL','ROP',
  'ROST','RPM','RRC','RRX','RS','RSG','RTX','RVTY','RYAN','RYN','S','SAIA','SAIC','SAM','SAN','SAP','SARO','SATS','SBAC','SBRA',
  'SBUX','SCCO','SCHW','SCI','SE','SEIC','SF','SFM','SGI','SHC','SHEL','SHOP','SHW','SIGI','SITM','SJM','SLAB','SLB','SLGN','SLM',
  'SMCI','SMFG','SMG','SN','SNA','SNAP','SNDK','SNOW','SNPS','SNX','SNY','SO','SOFI','SOLS','SOLV','SON','SONY','SPG','SPGI','SPOT',
  'SPXC','SR','SRE','SSB','SSD','ST','STAG','STE','STLA','STLD','STM','STRL','STT','STWD','STX','STZ','SW','SWK','SWKS','SWX',
  'SYF','SYK','SYNA','SYY','T','TAK','TAP','TCBI','TCOM','TDG','TDY','TEAM','TECH','TEL','TEM','TER','TEX','TFC','TGT','THC',
  'THG','THO','TJX','TKO','TKR','TLN','TM','TMHC','TMO','TMUS','TNL','TOL','TOST','TPL','TPR','TREX','TRGP','TRMB','TROW','TRU',
  'TRV','TSCO','TSLA','TSM','TSN','TT','TTC','TTD','TTE','TTEK','TTMI','TTWO','TWLO','TXN','TXNM','TXRH','TXT','TYL','U','UAL',
  'UBER','UBS','UBSI','UDR','UFPI','UGI','UHS','UL','ULS','ULTA','UMBF','UNH','UNM','UNP','UPS','URI','USB','USFD','UTHR','V',
  'VAL','VALE','VC','VEEV','VFC','VICI','VICR','VLO','VLTO','VLY','VMC','VMI','VNO','VNOM','VNT','VOYA','VRSK','VRSN','VRT','VRTX',
  'VST','VTR','VTRS','VVV','VZ','WAB','WAL','WAT','WBD','WBS','WCC','WDAY','WDC','WEC','WELL','WEX','WFC','WFRD','WH','WHR',
  'WING','WLK','WM','WMB','WMG','WMS','WMT','WPC','WRB','WSM','WSO','WST','WTFC','WTRG','WTS','WTW','WWD','WY','WYNN','XEL',
  'XOM','XPEV','XPO','XRAY','XYL','XYZ','YETI','YUM','ZBH','ZBRA','ZION','ZM','ZS','ZTS'
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

/* Headlines + full company profile for one symbol (stock-page extras).
   The universe payload only carries a 300-char description to stay slim;
   the full text rides along with the news fetch. */
export async function fetchNews(t){
  const sym = ySym(t);
  const [sr, prof] = await Promise.all([
    yahooFinance.search(sym, { quotesCount: 0, newsCount: 10 }),
    yahooFinance.quoteSummary(sym, { modules: ['assetProfile'] }).catch(() => null)
  ]);
  return {
    t,
    desc: prof?.assetProfile?.longBusinessSummary || null,
    news: (sr.news || []).map(n => ({
      ti: n.title,
      pub: n.publisher,
      url: n.link,
      at: n.providerPublishTime ? +new Date(n.providerPublishTime) : null
    }))
  };
}

export async function fetchChart(sym, years){
  const period1 = new Date(Date.now() - years * 365.25 * 86400e3);
  const ch = await yahooFinance.chart(sym, { period1, interval: '1d' });
  const quotes = (ch.quotes || []).filter(q => q.close != null);
  return {
    closes: quotes.map(q => +q.close.toFixed(q.close >= 5 ? 2 : 4)),
    dates: quotes.map(q => +new Date(q.date))
  };
}

/* Dates as day-number deltas: [day0, +d, +d, …] (days since epoch).
   ~3 bytes per trading day instead of 14 — nearly halves the payload. */
export function encodeDates(ms){
  const out = new Array(ms.length);
  let prev = 0;
  for (let i = 0; i < ms.length; i++){
    const day = Math.floor(ms[i] / 86400000);   // UTC calendar day of the bar
    out[i] = i ? day - prev : day;
    prev = day;
  }
  return out;
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
    dil, revHist, closes, dd: encodeDates(dates)
  };
}
