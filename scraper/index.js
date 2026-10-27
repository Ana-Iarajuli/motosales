import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { SOURCES } from './sources.js';
import { normalizeBrand, brandFromTitle, classify, detectGender, normalizeSizes, matchKey } from './normalize.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DATA_FILE = path.join(ROOT, 'data', 'products.json');

const FALLBACK_USD_PER_EUR = 1.08;

/** Returns how many USD one unit of each currency is worth. */
async function fetchRates() {
  for (const url of ['https://api.frankfurter.dev/v1/latest?base=EUR&symbols=USD', 'https://api.frankfurter.app/latest?from=EUR&to=USD']) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
      const usd = (await res.json()).rates?.USD;
      if (usd) return { rates: { USD: 1, EUR: usd }, live: true };
    } catch {}
  }
  return { rates: { USD: 1, EUR: FALLBACK_USD_PER_EUR }, live: false };
}

const round2 = (n) => (n == null ? null : Math.round(n * 100) / 100);

function finalize(source, raw, toUSD) {
  const brand = normalizeBrand(raw.brand) || brandFromTitle(raw.title) || raw.title.split(/\s+/)[0];
  const rate = toUSD[source.currency];
  const discountPct = raw.compareAt ? Math.round((1 - raw.price / raw.compareAt) * 100) : 0;
  const category = classify(raw.categoryText || raw.title);
  const gender = detectGender(raw.genderText || raw.title);
  return {
    id: `${source.id}:${raw.sourceId}`,
    source: source.id,
    title: raw.title,
    brand,
    category,
    gender,
    url: raw.url,
    images: raw.images?.filter(Boolean) ?? [],
    currency: source.currency,
    price: raw.price,
    priceFrom: !!raw.priceFrom,
    compareAt: raw.compareAt ?? null,
    priceUSD: round2(raw.price * rate),
    compareAtUSD: round2(raw.compareAt ? raw.compareAt * rate : null),
    discountPct,
    couponCode: raw.couponCode ?? null,
    couponPrice: raw.couponPrice ?? null,
    inStock: raw.inStock ?? null,
    sizes: raw.sizes ?? [],
    sizeTags: normalizeSizes(raw.sizes ?? []),
    colors: raw.colors ?? [],
    description: raw.description || '',
    matchKey: matchKey(brand, raw.title, category, gender),
  };
}

async function runSource(source, toUSD, log) {
  const started = Date.now();
  const meta = { id: source.id, name: source.name, region: source.region, currency: source.currency, saleUrl: source.saleUrl };
  try {
    const raw = await source.fetch();
    const products = raw.map((r) => finalize(source, r, toUSD));
    log(`  ✓ ${source.name}: ${products.length} products (${((Date.now() - started) / 1000).toFixed(1)}s)`);
    return { meta: { ...meta, status: products.length ? 'ok' : 'empty', count: products.length }, products };
  } catch (e) {
    const status = e.status === 403 ? 'blocked' : 'error';
    log(`  ✗ ${source.name}: ${status} — ${e.message}`);
    return { meta: { ...meta, status, count: 0, error: e.message }, products: [] };
  }
}

export async function runScrape({ log = console.log } = {}) {
  log(`Scraping ${SOURCES.length} stores…`);
  const { rates, live } = await fetchRates();
  if (!live) log(`  ! Exchange-rate API unavailable, using fallback EUR→USD ${FALLBACK_USD_PER_EUR}`);

  let previous = null;
  try {
    previous = JSON.parse(await fs.readFile(DATA_FILE, 'utf8'));
  } catch {}

  const results = await Promise.all(
    SOURCES.map((s) => {
      // Rate-limited (paid) sources reuse their last results until the interval passes.
      const prev = previous?.sources.find((p) => p.id === s.id);
      if (s.minIntervalHours && prev?.status === 'ok' && Date.now() - new Date(prev.lastSuccess) < s.minIntervalHours * 36e5) {
        log(`  = ${s.name}: reusing results from ${prev.lastSuccess}`);
        return { meta: prev, products: previous.products.filter((p) => p.source === s.id), reused: true };
      }
      return runSource(s, rates, log);
    }),
  );

  // If a store fails this run, keep its products from the previous run rather than dropping them.
  for (const r of results) {
    if (r.meta.status === 'ok' || !previous) continue;
    const old = previous.products.filter((p) => p.source === r.meta.id);
    if (old.length) {
      r.products = old;
      r.meta.stale = true;
      r.meta.count = old.length;
      r.meta.lastSuccess = previous.sources.find((s) => s.id === r.meta.id)?.lastSuccess ?? previous.generatedAt;
    }
  }

  const now = new Date().toISOString();
  const data = {
    generatedAt: now,
    rates: { USD: 1, EUR: Math.round(10000 / rates.EUR) / 10000 }, // 1 USD in each currency, for display
    sources: results.map((r) => ({
      ...r.meta,
      lastSuccess: r.meta.status === 'ok' && !r.reused ? now : r.meta.lastSuccess ?? null,
    })),
    products: results.flatMap((r) => r.products),
  };

  await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
  const tmp = `${DATA_FILE}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data));
  await fs.rename(tmp, DATA_FILE);
  log(`Saved ${data.products.length} products to ${path.relative(ROOT, DATA_FILE)}`);
  return data;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  runScrape().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
