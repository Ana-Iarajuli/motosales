// Shopify stores expose /collections/<handle>/products.json publicly.
import { get, sleep, PAGE_DELAY_MS } from '../http.js';
import { stripHtml } from '../normalize.js';

const withWidth = (src, w) => (src ? `${src}${src.includes('?') ? '&' : '?'}width=${w}` : null);

function optionValues(product, nameRe, variants) {
  const idx = product.options.findIndex((o) => nameRe.test(o.name));
  if (idx < 0) return [];
  return [...new Set(variants.map((v) => v[`option${idx + 1}`]).filter(Boolean))];
}

function mapProduct(base, p) {
  const variants = p.variants || [];
  if (!variants.length) return null;
  const available = variants.filter((v) => v.available);
  const pool = available.length ? available : variants;
  const cheapest = pool.reduce((a, v) => (parseFloat(v.price) < parseFloat(a.price) ? v : a));
  const price = parseFloat(cheapest.price);
  const compareAt = parseFloat(cheapest.compare_at_price) || null;

  return {
    sourceId: String(p.id),
    title: p.title,
    brand: p.vendor,
    url: `${base}/products/${p.handle}`,
    images: (p.images || []).slice(0, 6).map((i) => withWidth(i.src, 800)),
    price,
    compareAt: compareAt && compareAt > price ? compareAt : null,
    inStock: available.length > 0,
    sizes: optionValues(p, /size|größe|grosse/i, available),
    colors: optionValues(p, /colou?r|farbe/i, variants),
    categoryText: `${p.title} ${p.product_type || ''}`,
    genderText: `${p.title} ${(p.tags || []).join(' ')}`,
    description: stripHtml(p.body_html || '').slice(0, 500),
  };
}

export function shopify({ base, collection, maxPages = 8 }) {
  return async function fetchProducts() {
    const out = [];
    for (let page = 1; page <= maxPages; page++) {
      const data = await get(`${base}/collections/${collection}/products.json?limit=250&page=${page}`, { json: true });
      const products = data.products || [];
      for (const p of products) {
        const item = mapProduct(base, p);
        if (item) out.push(item);
      }
      if (products.length < 250) break;
      await sleep(PAGE_DELAY_MS);
    }
    return out;
  };
}
