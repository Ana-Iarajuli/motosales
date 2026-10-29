# SafeRide

A site for motorcycle riders in Georgia. Right now it has:

- **Sales**: compares motorcycle gear sales across online stores, finds the same product at different shops, and sends the shopper to the store's product page to buy.
- **Accounts**: registration with a unique username, email verification, login with email or username, and password reset by email.
- **Languages**: English and Georgian (ქართული). Add `?lang=ka` to a link to open it in Georgian.
- **Placeholder sections** in the left menu: Beginner's guide, Reviews, Where to practice, Georiders.

## Run

Requires Node.js 18+ (no `npm install` needed — there are no dependencies).

```sh
cp .env.example .env # optional: fill in the Supabase keys to enable accounts
npm start            # http://localhost:3000
npm run scrape       # refresh public/data/products.json manually
```

On start, the server scrapes all stores if the data is missing or older than 6 hours, and then re-scrapes every 6 hours. Without the Supabase settings, everything works except accounts. The account page then says accounts aren't switched on.

## Accounts (Supabase)

[Supabase Auth](https://supabase.com/docs/guides/auth) stores the accounts: password hashes, email verification and reset emails. The free tier is enough. One-time setup:

1. Create a project at [supabase.com](https://supabase.com).
2. **SQL Editor** → paste and run [`supabase/schema.sql`](supabase/schema.sql). It creates unique usernames and the two lookup functions.
3. **Authentication → Sign In / Providers → Email**: keep **Confirm email** on. Optionally set the minimum password length to 8.
4. **Authentication → URL Configuration**:
   - Site URL: `https://saferide.netlify.app` (your Netlify URL).
   - Redirect URLs: add `https://saferide.netlify.app/**` and `http://localhost:3000/**`.
5. **Authentication → Emails → SMTP Settings**: set up your own SMTP server. **This is required for real users**: Supabase's built-in mailer only sends to your own team's addresses and only a few emails per hour.
   - Without your own domain: [Brevo](https://www.brevo.com) (free, 300 emails/day) can send from a verified single address.
   - With a domain: [Resend](https://resend.com) (free, 3,000/month).
6. Optionally translate the email texts under **Authentication → Emails → Templates**. Use one language, or write both in each email.
7. Copy the keys from **Project Settings → API Keys** into `.env` locally, and into Netlify → Site configuration → Environment variables:

| Env var | Where it's used |
|---|---|
| `SUPABASE_URL` | browser + server, e.g. `https://abcd1234.supabase.co` |
| `SUPABASE_PUBLISHABLE_KEY` | browser (public by design; the legacy `anon` key also works) |
| `SUPABASE_SECRET_KEY` | **server only**, used by `/api/login` (the legacy `service_role` key also works). Mark it secret in Netlify and never put it in frontend code. |

Then trigger a new deploy, because `config.json` is written at build time.

How it works:

- The browser talks to Supabase directly for sign-up, email login, resend, password reset and logout.
- **Username login** goes through `netlify/functions/login.mjs`, which is `/api/login`. It looks up the email for the username with the secret key, then logs in. This keeps users' emails private: the browser can never ask "what's the email of user X?".
- Usernames are 3–20 characters (Latin letters, digits and `_`) and unique regardless of case. A unique index on `profiles` enforces this, so two people can't register the same name at the same moment.
- The forgot-password form shows the same answer whether or not the email has an account, so nobody can use it to check which emails are registered.

## Deploy (Netlify)

The site runs as static files plus one function. `netlify.toml` makes each Netlify build run `npm run build`, which writes `public/config.json` and scrapes the stores. It then publishes `public/` and deploys `netlify/functions/`.

1. Connect the GitHub repo in Netlify. Build settings come from `netlify.toml`.
2. Add the environment variables: Supabase (above), plus optionally `APIFY_TOKEN` and the other variables below.
3. Keep deals fresh: Netlify only builds on push, so `.github/workflows/refresh-deals.yml` triggers a rebuild every 6 hours. Create a build hook (Site configuration → Build & deploy → Build hooks) and save its URL as the GitHub **repository** secret `NETLIFY_BUILD_HOOK`.

Each build downloads the previous `data/products.json` from the live site. Stores that fail during a build keep their last results, and the paid Apify source still refreshes only once a day.

| Env var | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | HTTP port (local server) |
| `REFRESH_HOURS` | `6` | How often stores are re-scraped (local server) |
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

The RevZilla Apify actor searches the whole catalogue (it has no "sale" filter). SafeRide keeps only items priced below MSRP. Its output field names are not formally documented, so `adapters/apify.js` accepts several common names. Check the first run's results.

If a store fails during a refresh, its products from the previous run are kept and marked as cached.

## How comparison works

- Prices are normalized to USD (EUR→USD via the ECB rate from frankfurter.dev) and can be shown in USD or EUR.
- Each product gets a `matchKey`: brand + category + gender + the set of model words, with colors and filler words removed (`scraper/normalize.js`). Products with the same key at different stores are treated as the same item.
- **Best offer only** (on by default) shows only the cheapest listing of each item. The product page shows a per-store comparison table with a "Go to store" link for each offer.

## Translations

All UI text lives in `public/js/i18n.js`: English is the source, and each language is one object. To add a language (e.g. Russian), copy the `ka` block, translate it, and add it to `LANGS` and `DICTS`. Missing keys fall back to English. Static HTML uses `data-i18n="key"` attributes; scripts call `t('key', { vars })`.

## Layout

```
server.js                    local server (gzip data, scheduled refresh, /config.json, /api/login)
netlify/functions/login.mjs  username login (Netlify Function; server.js runs it locally)
supabase/schema.sql          usernames table + functions, run once in Supabase
scripts/write-config.js      writes public/config.json (Supabase URL + publishable key) at build
scraper/index.js             runs all sources, normalizes, writes public/data/products.json
scraper/sources.js           the store list
scraper/adapters/            shopify, fcmoto, dainese, apify, jsonld (fallback)
scraper/normalize.js         brand/category/gender/size detection, match keys
public/index.html            sales listing + filters        (js/list.js)
public/product.html          deal details + comparison      (js/product.js)
public/account.html          login / register / reset       (js/account.js, js/auth.js)
public/{guide,reviews,practice,georiders}.html   placeholder sections (js/page.js)
public/js/layout.js          left menu, language / theme pickers, account menu
public/js/i18n.js            translations
```

Store HTML changes over time. If a store's count drops to 0, update its adapter.
