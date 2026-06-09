# 💎 Emerald — Investment Research PWA

A progressive web app for finding good investments, powered by **real market data** (Yahoo Finance). Dark glassmorphism UI, zero build step, one tiny server.

## Run it locally

```powershell
npm install   # first time only
npm start     # → http://localhost:4173
```

On first launch the server pulls the full universe (~90 companies: live quotes, fundamentals, annual income statements, analyst ratings, 2-year price history) — takes about a minute, with a progress bar. After that it's cached on disk and refreshed every 6 hours (click the **● LIVE** badge to force a refresh).

Chrome/Edge will offer **Install** in the address bar to run it as a standalone app.

## Deploy to Vercel

Just import the repo on [vercel.com](https://vercel.com/new) (framework preset: **Other**) — no configuration needed. Or from the CLI:

```powershell
npx vercel --prod
```

It works out of the box because the project ships two interchangeable backends:

- **Locally** → `server.mjs` builds the whole universe in one process and caches it on disk.
- **On Vercel** → the `api/` folder becomes serverless functions. `/api/universe` returns a chunk manifest, and the browser assembles the universe from parallel `/api/batch` calls (8 tickers each, ~64s total limit per function — each chunk takes ~4s). Responses carry `s-maxage=21600`, so Vercel's CDN caches every chunk for 6 hours: after the first visitor, everyone else loads instantly and Yahoo is barely touched.

Both backends share the exact same fetch/mapping code (`api/_lib/yahoo.js`), and the frontend auto-detects which one it's talking to. Repeat visits boot instantly from a 30-minute localStorage cache.

**Data modes** (shown as a badge in the top bar):
- **● LIVE** — real data from the API (local server or Vercel functions)
- **● CACHED** — offline, using your last saved real data
- **● DEMO** — no API reachable at all; bundled illustrative dataset

## What's inside

| View | What it does |
|---|---|
| **Dashboard** | Index tape, top Emerald picks, sector heatmap, gainers/losers, research-signal feed, watchlist snapshot |
| **Screener** | 9 strategy presets (Value Gems, Compounders, Dividend Income, GARP, Momentum, Turnaround Watch, Caution List…) + custom filters, fully sortable |
| **Stock page** | Price chart (1M–5Y with 50/200-day SMAs), 5-pillar score radar, full fundamentals, **interactive DCF with sliders**, Piotroski F-Score, Altman Z-Score, green/red flag detection, sector peers |
| **Compare** | Up to 4 stocks: radar overlay + 21-metric head-to-head with best-in-row highlighting |
| **Watchlist** | Persistent (localStorage) idea tracker sorted by score |
| **Portfolio** | Positions with P/L, value-weighted portfolio score, sector-allocation donut, concentration & quality alerts |
| **Academy** | How every model works and how to use it without hurting yourself |

## How "is this a good investment?" is decided

Each stock gets a **0–100 Emerald Score** from five independently scored pillars:

- **Value 26%** — earnings & FCF yield, PEG, EV/EBITDA, P/E vs sector median, discount to DCF fair value
- **Quality 24%** — gross/operating/net margins, ROE, ROA, ROIC, FCF margin
- **Growth 20%** — 3-yr & TTM revenue growth, historical & forecast EPS growth, consistency
- **Health 14%** — debt/equity, current ratio, interest coverage, Altman Z, Piotroski F
- **Momentum 16%** — price vs 50/200-day SMA, 6-month return, 52-week position, RSI

Plus standalone models: 10-year two-stage **DCF** (user-adjustable growth/discount/terminal), **Graham number**, **Piotroski F-Score** (9 fundamental-trend checks), **Altman Z-Score** (bankruptcy risk), and a rule-based **flag engine** (fortress balance sheets, golden crosses, stretched payouts, cash burn, value traps…).

## The Emerald Edge signals (original methodology)

Five detection methods designed for this app — they answer questions the textbook metrics don't score, and carry 16% of the composite:

| Signal | Question it answers | How |
|---|---|---|
| **⛨ Moat Durability Index** | Is the excess return defensible? | ROIC spread over estimated cost of capital × persistence evidence (pricing power, growth consistency, scale) |
| **⇋ Expectation Gap Score** | What growth is the price *already* paying for? | Runs the DCF **backwards** — solves for market-implied growth, compares to achievable growth. Buy beatable bars, not stories |
| **⌁ Antifragility Score** | How does it behave under stress? | Up-day/down-day asymmetry, max drawdown, time spent underwater, balance-sheet shock absorbers — from the real price path |
| **↻ Compounding Engine Score** | Can it fund its own growth? | Internal compounding rate (ROIC × retention) × cash conversion × operating leverage × **real share-count trend** (buybacks vs dilution) |
| **⚖ Crowd Friction Gauge** | Who's on the other side of the trade? | Analyst conviction vs short pressure vs insider ownership vs euphoria — rewards loud believers with a lagging price |

Screen for them with the **Edge Leaders** and **Mispriced Growth** presets.

## Architecture

```
api/_lib/yahoo.js   shared Yahoo Finance fetchers + ticker universe (single source of truth)
api/universe.js     Vercel fn: chunk manifest
api/batch.js        Vercel fn: fetch up to 12 tickers (CDN-cached 6h)
api/chart.js        Vercel fn: price history for one symbol (CDN-cached 1h)
server.mjs          local Node server: static files + same API, disk cache, 6h TTL
vercel.json         function maxDuration + sw.js cache header
index.html          app shell + boot screen
manifest.webmanifest / sw.js / icons/   PWA plumbing (API calls never cached)
css/styles.css      glassmorphism design system
js/live.js          universal loader: auto-detects backend; live → cache → demo
js/data.js          bundled fallback dataset (used only when offline w/o cache)
js/analysis.js      scoring engine, DCF, F/Z-scores, flags
js/edge.js          the five Emerald Edge signals
js/charts.js        zero-dependency canvas charts (line+SMA, radar, donut, bars, rings)
js/app.js           hash router, 7 views, search, localStorage state
```

> ⚠️ Educational research tool. Yahoo Finance data is unofficial and can be delayed or imperfect. Not financial advice.
