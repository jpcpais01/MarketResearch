# 💎 Emerald — Investment Research PWA

A progressive web app for finding good investments, powered by **real market data** (Yahoo Finance). Dark glassmorphism UI, zero build step, one tiny server.

## Run it locally

```powershell
npm install   # first time only
npm start     # → http://localhost:4173
```

On first launch the server pulls the full universe (~1,000 companies — S&P 500 + S&P 400 MidCap + large ADRs and popular growth names: live quotes, fundamentals, annual income statements, analyst ratings, 2-year price history) — takes several minutes, with a progress bar. After that it's cached on disk and refreshed every 6 hours (click the **● LIVE** badge to force a refresh). Regenerate the ticker list anytime with `node scripts/fetch-tickers.mjs` (pulls current index constituents from Wikipedia).

Chrome/Edge will offer **Install** in the address bar to run it as a standalone app.

## Deploy to Vercel

Just import the repo on [vercel.com](https://vercel.com/new) (framework preset: **Other**) — no configuration needed. Or from the CLI:

```powershell
npx vercel --prod
```

It works out of the box because the project ships two interchangeable backends:

- **Locally** → `server.mjs` builds the whole universe in one process and caches it on disk.
- **On Vercel** → the `api/` folder becomes serverless functions. `/api/universe` returns a chunk manifest, and the browser assembles the universe from parallel `/api/batch` calls (16 tickers each). Responses carry `s-maxage=21600`, so Vercel's CDN caches every chunk for 6 hours: after the first visitor, everyone else loads instantly and Yahoo is barely touched.

Both backends share the exact same fetch/mapping code (`api/_lib/yahoo.js`), and the frontend auto-detects which one it's talking to. **Progressive boot:** on the chunked path the app renders as soon as the indexes plus the first ~80 stocks arrive; the rest streams in the background and the views refresh when complete. Dates ship delta-encoded (about half the bytes), and repeat visits boot instantly from a 30-minute IndexedDB cache.

**Data modes** (shown as a badge in the top bar):
- **● LIVE** — real data from the API (local server or Vercel functions)
- **● CACHED** — offline, using your last saved real data
- **● DEMO** — no API reachable at all; bundled illustrative dataset

## What's inside

| View | What it does |
|---|---|
| **Dashboard** | Index tape, top Emerald picks, sector heatmap, gainers/losers, research-signal feed, watchlist snapshot |
| **Search** | Hybrid: instant results from the loaded universe **plus Yahoo-wide symbol search** — open any listed equity/ETF on Earth and it's fetched & scored on demand |
| **Screener** | 11 strategy presets (Value Gems, Compounders, Dividend Income, GARP, Momentum, Edge Leaders, Mispriced Growth, Turnaround Watch, Caution List…) + custom filters incl. per-Edge-signal minimums, fully sortable |
| **Price Action Lab** | Day-by-day behavior vs S&P 500 / Nasdaq 100 / Dow over 1M–2Y windows: how often it rises on index-down days, four-quadrant day matrix, strength histogram, stress test on the market's worst days, relative path chart, monthly rounds, universe-wide down-day champions leaderboard |
| **Stock page** | Price chart (1M–5Y with 50/200-day SMAs), 5-pillar score radar, full fundamentals, **interactive DCF with sliders**, Piotroski F-Score, Altman Z-Score, green/red flag detection, sector peers |
| **Compare** | Up to 4 stocks: radar overlay + 21-metric head-to-head with best-in-row highlighting |
| **Watchlist** | Persistent (localStorage) idea tracker sorted by score |
| **Portfolio** | Positions with P/L, value-weighted portfolio score, sector-allocation donut, concentration & quality alerts |
| **Academy** | How every model works and how to use it without hurting yourself |

## How "is this a good investment?" is decided

Each stock gets a **0–100 Emerald Score** from five classic pillars (Value, Quality, Growth, Health, Momentum) plus the Edge signals — blended **adaptively**, not with fixed weights:

- **◈ Archetype-aware** — every stock is classified (Compounder, Hypergrowth, Dividend Anchor, Deep Value, Turnaround, Financial, All-rounder) and judged by the rubric that fits it: a hypergrowth name isn't condemned by P/E, a utility isn't graded on momentum, a bank isn't penalized for missing EV metrics. The archetype and the exact weights used are shown on each stock page.
- **◉ Regime-aware** — the S&P 500's own trend (vs its 200-day average + 3-month return) sets a risk-on / neutral / risk-off tilt: in stress, health & quality weight up and momentum & growth down; in an uptrend, mildly the reverse.
- **⚖ Live-calibrated** — ratio inputs (ROIC, margins, yields, growth) are scored as a 50/50 blend of absolute anchors and the stock's percentile in the live 300-stock universe, so "good" adapts to today's actual market.
- **Conviction-tagged** — every rating carries High/Moderate/Low conviction from pillar agreement × data completeness: a 60 made of all-60s is steadier than a 60 made of 90s and 20s.

Plus standalone models: 10-year two-stage **DCF** (user-adjustable growth/discount/terminal), **Graham number**, **Piotroski F-Score** (9 fundamental-trend checks), **Altman Z-Score** (bankruptcy risk), and a rule-based **flag engine** (fortress balance sheets, golden crosses, stretched payouts, cash burn, value traps…).

## The Emerald Edge signals (original methodology)

Eight detection methods designed for this app — they answer questions the textbook metrics don't score, and carry 16% of the composite. Two ideas power the suite: **market-relative behavior** (signals measured against the real S&P 500 series, not in isolation) and **cross-sectional rank** (cheap/good are relative statements, scored against the whole live universe):

| Signal | Question it answers | How |
|---|---|---|
| **⛨ Moat Durability Index** | Is the excess return defensible? | ROIC spread over estimated cost of capital × sector-relative ROIC rank × pricing power × how ruler-straight the real multi-year revenue path is (R² of the log-revenue trend) |
| **⇋ Expectation Gap Score** | What growth is the price *already* paying for? | Runs the DCF **backwards** — solves for market-implied growth, compares to achievable growth. Buy beatable bars, not stories |
| **◈ Quality vs Price** | Do you get more than you pay for? | Ranks business quality (ROIC, cash conversion, margins) and price tag (EV/EBITDA, P/E, P/S) against the whole universe and scores the **gap** — top-shelf goods on a mid-shelf tag |
| **∿ Trend Quality Score** | Is it beating the market persistently — or luckily? | Information ratio vs the S&P 500 over 12 months excluding the noisy last month (classic 12-1 momentum), consistency across rolling quarters, and a penalty for lottery-style gain spikes |
| **⌁ Antifragility Score** | Does it gain more in rallies than it loses in stress? | Convexity, measured: up-market capture minus down-market capture, behavior on the market's 15 worst days, drawdown depth/duration, balance-sheet shock absorbers |
| **⇅ Price Action Score** | Can it rise when the market falls? | Counted, not assumed: % of index-down days the stock closed green, rally participation, daily beat rate, next-day bounce after the market's worst sessions — explored in depth on the **Price Action Lab** page |
| **↻ Compounding Engine Score** | Can it fund its own growth? | Internal compounding rate (ROIC × retention) × cash conversion × operating leverage × **real share-count trend** (buybacks vs dilution) |
| **⚖ Crowd Friction Gauge** | Who's on the other side of the trade? | Analyst conviction and price targets vs short pressure vs insider ownership vs euphoria — rewards loud believers with a lagging price |

Screen for them with the **Edge Leaders** and **Mispriced Growth** presets.

## Architecture

```
api/_lib/yahoo.js   shared Yahoo Finance fetchers + ticker universe (single source of truth)
api/universe.js     Vercel fn: chunk manifest
api/batch.js        Vercel fn: fetch up to 12 tickers (CDN-cached 6h) — also powers on-demand loads
api/chart.js        Vercel fn: price history for one symbol (CDN-cached 1h)
api/search.js       Vercel fn: Yahoo-wide symbol search (CDN-cached 24h)
server.mjs          local Node server: static files + same API, disk cache, 6h TTL
vercel.json         function maxDuration + sw.js cache header
index.html          app shell + boot screen
manifest.webmanifest / sw.js / icons/   PWA plumbing (API calls never cached)
css/styles.css      glassmorphism design system
js/live.js          universal loader: auto-detects backend; live → cache → demo
js/data.js          bundled fallback dataset (used only when offline w/o cache)
js/analysis.js      scoring engine, DCF, F/Z-scores, flags
js/edge.js          the eight Emerald Edge signals
js/charts.js        zero-dependency canvas charts (line+SMA, radar, donut, bars, rings)
js/app.js           hash router, 7 views, search, localStorage state
```

> ⚠️ Educational research tool. Yahoo Finance data is unofficial and can be delayed or imperfect. Not financial advice.
