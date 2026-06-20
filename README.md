# NexaBuy — Purchase Copilot

> Paste any product URL. Get a live price comparison, trend signal, nearby store availability, and a return/cancel assistant — in under 15 seconds.

![NexaBuy](public/logo.png)

---

## What it does

Online shopping has a trust problem. Prices vary wildly across retailers, demand shifts constantly, and figuring out how to return something feels like a maze. NexaBuy is the copilot that fixes all of that from a single URL.

| Feature | What you get |
|---|---|
| **Price Reality Check** | Scrapes your product, searches Amazon / Walmart / eBay / Flipkart / Newegg, AI-verifies each result is the *same* product, shows a side-by-side USD-normalized price table with a **Good Deal / Average / Wait** verdict |
| **Trend Signal** | Real Google Trends data for the product + category — direction (↗ ↘ →), 12-month timeline, rising search queries, and a one-sentence buying signal |
| **Nearby Stores** | OpenStreetMap + Overpass finds physical stores near your location; enriched with live stock/price from Wire for major retailers |
| **Price Watchlist** | Save any product, re-check price + comparisons on demand, track verdict changes over time |
| **Cancel / Return Assistant** | Paste an order URL → scrapes the retailer's real policy page → exact step-by-step instructions + ready-to-send email draft |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Browser (Next.js)                     │
│  page.tsx  ·  PriceCard  ·  TrendCard  ·  NearbyMap  ·  ... │
└────────────────────────┬────────────────────────────────────┘
                         │ fetch
┌────────────────────────▼────────────────────────────────────┐
│                   Next.js API Routes                         │
│                                                              │
│  /api/analyze        /api/nearby       /api/watchlist        │
│  /api/cancelreturn   /api/scrape       /api/wire/*           │
└──────┬──────────────────┬──────────────────┬────────────────┘
       │                  │                  │
┌──────▼──────┐  ┌────────▼────────┐  ┌─────▼──────────────┐
│  lib/scraper│  │   lib/wire.ts   │  │    lib/groq.ts      │
│             │  │                 │  │                      │
│ Anakin URL  │  │ Wire Actions    │  │ Llama 3.3 70B        │
│ Scraper API │  │ ─ Amazon search │  │ ─ extractProductInfo │
│ (browser    │  │ ─ Walmart search│  │ ─ verifyProductMatch │
│  rendering) │  │ ─ eBay search   │  │ ─ generateVerdict    │
└─────────────┘  │ ─ Flipkart      │  │ ─ trendNarrative     │
                 │ ─ Newegg        │  │ ─ extractReturnSteps │
                 │ ─ Google Trends │  └──────────────────────┘
                 │ ─ Store stock   │
                 └────────┬────────┘          ┌─────────────┐
                          │                   │  lib/osm.ts  │
                 ┌────────▼────────┐          │              │
                 │   lib/trends.ts │          │ Nominatim    │
                 │                 │          │ geocoding    │
                 │ buildTrendSignal│          │              │
                 │ product+category│          │ Overpass API │
                 │ timeline parse  │          │ nearby POIs  │
                 └─────────────────┘          └─────────────┘

                 ┌─────────────────────────────────────────┐
                 │              lib/db.ts                   │
                 │          MySQL — watchlist table         │
                 └─────────────────────────────────────────┘
```

**Data flow for a price analysis:**
1. Anakin scraper renders the product page (JS-heavy sites included)
2. Groq LLM extracts clean product name, price, currency, category
3. Wire searches 5 retailers in parallel with a precision-normalized query
4. Groq verifies each result is the same product (not just brand-adjacent)
5. All prices converted to USD for fair comparison
6. Groq generates the verdict + summary
7. Google Trends Wire action fetches 12-month timeline for product + category
8. Everything returned in one response to the client

---

## Tech stack

- **Framework** — Next.js 16 (App Router)
- **Language** — TypeScript
- **AI / LLM** — Groq API, Llama 3.3 70B Versatile
- **Scraping** — Anakin URL Scraper (browser rendering)
- **Retail data** — Wire (Anakin) — Amazon, Walmart, eBay, Flipkart, Newegg, Google Trends
- **Maps** — OpenStreetMap (Nominatim + Overpass), React Leaflet
- **Database** — PostgreSQL via Neon serverless driver (`@neondatabase/serverless`) — Vercel Postgres compatible
- **Styling** — Plain CSS (globals.css, no framework)

---

## How to run

### Prerequisites

- Node.js 18+
- MySQL 8 running locally (or any accessible MySQL instance)
- API keys for Anakin (scraper + Wire) and Groq

### 1. Clone and install

```bash
git clone <repo-url>
cd NexaBuy
npm install
```

### 2. Set up environment variables

Create a `.env` file in the project root:

```env
# Anakin — used for both the URL scraper and Wire retail actions
WIRE_API_KEY=your_anakin_api_key

# Groq — LLM for product matching, verdicts, trend narratives
GROQ_API_KEY=your_groq_api_key

# PostgreSQL connection string (Vercel Postgres / Neon)
DATABASE_URL=postgres://user:password@host/nexabuy

# Optional overrides (defaults shown)
# WIRE_BASE_URL=https://api.anakin.io/v1/wire
# ANAKIN_SCRAPER_URL=https://api.anakin.io/v1/url-scraper
```

### 3. Initialize the database

**Option A — Neon / Vercel Postgres dashboard (recommended for Vercel deploy):**
Paste the contents of `db/schema.sql` into the SQL editor in your Neon or Vercel Postgres dashboard and run it.

**Option B — via script (local Postgres):**
```bash
node db/init.js
```

### 4. Run the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### 5. Build for production

```bash
npm run build
npm run start
```

---

## Project structure

```
NexaBuy/
├── app/
│   ├── api/
│   │   ├── analyze/        # Core: scrape → match → compare → verdict
│   │   ├── nearby/         # Geocode + OSM stores + Wire stock
│   │   ├── watchlist/      # CRUD + re-check (GET/POST/PUT/DELETE)
│   │   ├── cancelreturn/   # Policy scrape + LLM step extraction
│   │   ├── scrape/         # Raw scraper endpoint
│   │   └── wire/           # Wire catalog + task passthrough
│   ├── cancel-return/      # Cancel/Return page
│   ├── page.tsx            # Main copilot UI
│   ├── layout.tsx
│   └── globals.css
├── components/
│   ├── PriceCard.tsx       # Price table + verdict pill
│   ├── TrendCard.tsx       # Trend timeline + direction signal
│   ├── NearbyMap.tsx       # Leaflet map + store pins
│   ├── WatchlistDrawer.tsx # Slide-out watchlist panel
│   ├── ReturnChecklist.tsx # Step list + email draft
│   └── LoadingSteps.tsx    # Animated progress steps
├── lib/
│   ├── wire.ts             # Wire API: catalog, tasks, price search, trends
│   ├── groq.ts             # All LLM calls
│   ├── scraper.ts          # Anakin URL scraper + fallback fetch
│   ├── trends.ts           # Trend signal orchestration + timeline parsing
│   ├── osm.ts              # Nominatim geocoding + Overpass store search
│   └── db.ts               # MySQL query helper
├── db/
│   ├── schema.sql          # Database schema
│   └── init.js             # DB init script
└── public/
    └── logo.png
```

---

## API endpoints

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/analyze` | Full product analysis — scrape, compare, verdict, trends |
| `POST` | `/api/nearby` | Find nearby stores by location + product name |
| `GET` | `/api/watchlist` | List all watched products |
| `POST` | `/api/watchlist` | Add a product to the watchlist |
| `PUT` | `/api/watchlist` | Re-check price for a watchlist item |
| `DELETE` | `/api/watchlist` | Remove a watchlist item |
| `POST` | `/api/cancelreturn` | Get return/cancel steps + email draft |
| `POST` | `/api/scrape` | Raw page scrape |
| `GET` | `/api/wire/catalog` | Wire catalog lookup |
| `POST` | `/api/wire/task` | Raw Wire task execution |

---

## Key design decisions

**AI product matching** — Every retailer result goes through Groq before being shown. Different model numbers (S26 ≠ M56) are rejected. Same model in a different storage tier is shown with a "different variant" label. This prevents false comparisons that would mislead the verdict.

**Currency normalization** — All prices are converted to USD before sorting, diffing, and passing to the LLM. A ₹52,499 Flipkart price is shown as `₹52,499 (~$628)` — never compared raw against a USD price.

**Precise search queries** — Product names are stripped of SEO filler before being sent to retailer search APIs (`"Samsung Galaxy M56 5G (8GB/256GB) – Best Smartphone"` → `"Samsung Galaxy M56 5G"`), which significantly improves the chance of getting the right model back.

**Retry logic** — Wire API calls that time out or return empty results are retried once (2s delay) before falling through to the honest fallback message. This handles API flakiness without blowing the response time budget.
