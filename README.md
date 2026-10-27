# MotoSales

Compares motorcycle gear sales across online stores, finds the same product at different shops, and sends the shopper to the store's product page to buy.

## Run

Requires Node.js 18+ (no `npm install` needed — there are no dependencies).

```sh
npm start            # http://localhost:3000
npm run scrape       # refresh public/data/products.json manually
```

On start, the server scrapes all stores if the data is missing or older than 6 hours, and then re-scrapes every 6 hours.

## Deploy (Netlify)

The site also runs as plain static files. `netlify.toml` makes each Netlify build run the scraper (`npm run build`) and publish `public/`. There is no server; the frontend loads `data/products.json`.

1. Connect the GitHub repo in Netlify. Build settings come from `netlify.toml`.
2. Optional: add `APIFY_TOKEN` (and the other env vars below) under Site configuration → Environment variables.
3. Keep deals fresh: Netlify only builds on push, so `.github/workflows/refresh-deals.yml` triggers a rebuild every 6 hours. Create a build hook (Site configuration → Build & deploy → Build hooks) and save its URL as the GitHub repository secret `NETLIFY_BUILD_HOOK`.

Each build downloads the previous `data/products.json` from the live site. Stores that fail during a build keep their last results, and the paid Apify source still refreshes only once a day.

| Env var | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `REFRESH_HOURS` | `6` | How often stores are re-scraped |
| `APIFY_TOKEN` | — | Enables RevZilla via the Apify actor `parseforge/revzilla-scraper` (paid) |
| `APIFY_MAX_ITEMS` | `200` | Max RevZilla items per Apify run (cost cap) |
| `APIFY_REFRESH_HOURS` | `24` | Minimum time between Apify runs |
| `PREVIOUS_DATA_URL` | `$URL/data/products.json` on Netlify | Where a fresh build fetches the last run's data |
| `REVZILLA_QUERY` | empty | Search term passed to the Apify actor |

## Stores

| Store | How it's collected | Status |
|---|---|---|
| Alpinestars | Shopify `products.json` | ✅ |
| MotorcycleGear.com | Shopify `products.json` | ✅ |
| REV'IT! Outlet | Shopify `products.json` (EUR; the outlet lists no original prices) | ✅ |
| FC-Moto | HTML listing, `?p=N` paging (includes extra coupon codes) | ✅ |
| Dainese (DE) | SFCC `Search-UpdateGrid` endpoint (EUR) | ✅ |
| RevZilla | Blocks direct requests (HTTP 403) → optional Apify actor | ⚠️ needs `APIFY_TOKEN` |
| Cycle Gear | Blocks direct requests (HTTP 403) | ❌ link to sale page only |
| Louis | Blocks direct requests (HTTP 403) | ❌ link to sale page only |

Blocked stores still appear in the store strip with a link to their sale page. The realistic way to add them is an official product feed: RevZilla, Cycle Gear and Louis run affiliate programs, which usually include product/price feeds. Add a new adapter in `scraper/adapters/` and register it in `scraper/sources.js`.

The RevZilla Apify actor searches the whole catalogue (it has no "sale" filter). MotoSales keeps only items priced below MSRP. Its output field names are not formally documented, so `adapters/apify.js` accepts several common names. Check the first run's results.

If a store fails during a refresh, its products from the previous run are kept and marked as cached.

## How comparison works

- Prices are normalized to USD (EUR→USD via the ECB rate from frankfurter.dev) and can be shown in USD or EUR.
- Each product gets a `matchKey`: brand + category + gender + the set of model words, with colors and filler words removed (`scraper/normalize.js`). Products with the same key at different stores are treated as the same item.
- **Best offer only** (on by default) shows only the cheapest listing of each item. The product page shows a per-store comparison table with a "Go to store" link for each offer.

## Layout

```
server.js                 local server (gzip data, scheduled refresh); not used on Netlify
scraper/index.js          runs all sources, normalizes, writes public/data/products.json
scraper/sources.js        the store list
scraper/adapters/         shopify, fcmoto, dainese, apify, jsonld (fallback)
scraper/normalize.js      brand/category/gender/size detection, match keys
public/                   index.html (listing + filters), product.html (details + comparison)
```

Store HTML changes over time. If a store's count drops to 0, update its adapter.
