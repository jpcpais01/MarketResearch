/* Regenerate the ticker universe from live index-constituent lists.
   Fetches the S&P 500 and S&P 400 (MidCap) member tables from Wikipedia,
   merges them with EXTRAS (popular non-index names), dedupes, and prints
   a JS array ready to paste into api/_lib/yahoo.js.

   Run:  node scripts/fetch-tickers.mjs            (prints summary + writes scripts/tickers.json)
*/
import fs from 'node:fs';

const SOURCES = [
  { name: 'S&P 500',        url: 'https://en.wikipedia.org/wiki/List_of_S%26P_500_companies' },
  { name: 'S&P 400 MidCap', url: 'https://en.wikipedia.org/wiki/List_of_S%26P_400_companies' }
];

// Popular names not in those two indexes that the app already covers / users expect.
const EXTRAS = [
  // US growth / tech / fintech not in the S&P indexes
  'SHOP', 'SNOW', 'PLTR', 'COIN', 'HOOD', 'SOFI', 'AFRM', 'MSTR', 'RIVN', 'SNAP', 'NET', 'MDB', 'DDOG', 'ZS', 'HUBS', 'TTD', 'RBLX', 'DASH', 'ABNB', 'LYFT', 'SPOT', 'CRWD', 'PANW', 'OKTA', 'TEAM', 'SMCI', 'CELH', 'WBD', 'MRNA', 'NTR',
  'DKNG', 'CVNA', 'ROKU', 'U', 'PINS', 'TWLO', 'DOCU', 'ZM', 'BILL', 'GTLB', 'S', 'PATH', 'APP', 'DUOL', 'TOST', 'BROS', 'CAVA', 'ONON', 'CPNG', 'RDDT', 'TEM', 'IOT', 'ALAB', 'GME', 'LCID', 'NIO', 'XPEV', 'LI', 'MELI', 'ARM',
  // Large liquid ADRs (NYSE/NASDAQ listed)
  'TSM', 'ASML', 'BABA', 'PDD', 'JD', 'BIDU', 'NTES', 'TCOM', 'SE', 'GRAB', 'NU', 'INFY', 'IBN', 'HDB', 'MUFG', 'SMFG', 'HSBC', 'UBS', 'DB', 'SAN', 'BBVA', 'ING', 'BCS', 'LYG', 'NWG',
  'AZN', 'NVO', 'NVS', 'SNY', 'GSK', 'TAK', 'SAP', 'SHEL', 'BP', 'TTE', 'E', 'EQNR', 'UL', 'DEO', 'BTI', 'RIO', 'BHP', 'VALE', 'SCCO', 'PBR', 'ITUB', 'ABEV', 'AMX', 'TM', 'HMC', 'STLA', 'RACE', 'SONY', 'ERIC', 'NOK', 'STM', 'PHG'
];

async function membersOf(src){
  const res = await fetch(src.url, { headers: { 'User-Agent': 'Mozilla/5.0 (emerald-research-tool)' } });
  if (!res.ok) throw new Error(`${src.name}: HTTP ${res.status}`);
  const html = await res.text();
  // Symbols appear as links to /wiki/ or quote pages inside the constituents table;
  // the robust signal is the dedicated symbol cell: <td>...>SYM</a></td> at row start.
  // Wikipedia marks both tables with id="constituents".
  const tableMatch = html.match(/<table[^>]*id="constituents"[\s\S]*?<\/table>/);
  if (!tableMatch) throw new Error(`${src.name}: constituents table not found`);
  const rows = tableMatch[0].split('<tr');
  const syms = [];
  for (const row of rows.slice(2)){ // skip table open + header row
    // first cell of each row is the ticker symbol
    const cell = row.match(/<td[^>]*>\s*(?:<a[^>]*>)?([A-Z][A-Z0-9.\-]{0,6})(?:<\/a>)?\s*<\/td>/);
    if (cell) syms.push(cell[1].replace('-', '.'));   // normalize BRK-B → BRK.B
  }
  if (syms.length < 100) throw new Error(`${src.name}: only ${syms.length} symbols parsed — page layout changed?`);
  return syms;
}

const all = [];
for (const src of SOURCES){
  const syms = await membersOf(src);
  console.log(`${src.name}: ${syms.length} symbols`);
  all.push(...syms);
}
all.push(...EXTRAS);
const unique = [...new Set(all)].sort();
console.log(`total unique: ${unique.length}`);
fs.writeFileSync(new URL('./tickers.json', import.meta.url), JSON.stringify(unique, null, 0) + '\n');
console.log('wrote scripts/tickers.json');

/* --- splice into api/_lib/yahoo.js --- */
const yahooPath = new URL('../api/_lib/yahoo.js', import.meta.url);
let src = fs.readFileSync(yahooPath, 'utf8');
const lines = [];
for (let i = 0; i < unique.length; i += 20) lines.push('  ' + unique.slice(i, i + 20).map(t => `'${t}'`).join(','));
src = src.replace(/export const TICKERS = \[[\s\S]*?\];/, 'export const TICKERS = [\n' + lines.join(',\n') + '\n];');
fs.writeFileSync(yahooPath, src);
console.log('spliced TICKERS into api/_lib/yahoo.js');
