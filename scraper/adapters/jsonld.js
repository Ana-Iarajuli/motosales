// Best-effort fallback: reads schema.org Product data embedded as JSON-LD.
// Used for stores without a dedicated adapter. Stores behind bot protection
// (HTTP 403) are reported as "blocked" rather than worked around.
import { get } from '../http.js';
import { decodeEntities, parsePrice } from '../normalize.js';

function* walk(node) {
  if (Array.isArray(node)) for (const n of node) yield* walk(n);
  else if (node && typeof node === 'object') {
    yield node;
    for (const k of ['@graph', 'itemListElement', 'item']) if (node[k]) yield* walk(node[k]);
  }
}

export function jsonld({ url }) {
  return async function fetchProducts() {
    const html = await get(url);
    const items = [];
    for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
      let data;
      try {
        data = JSON.parse(m[1]);
      } catch {
        continue;
      }
      for (const n of walk(data)) {
        if (n['@type'] !== 'Product' || !n.url) continue;
        const offer = [].concat(n.offers || [])[0] || {};
        const price = parsePrice(offer.price ?? offer.lowPrice);
        if (price == null) continue;
        const name = decodeEntities(n.name || '');
        items.push({
          sourceId: n.sku || n.productID || n.url,
          title: name,
          brand: typeof n.brand === 'string' ? n.brand : n.brand?.name,
          url: new URL(n.url, url).href,
          images: [].concat(n.image || []).map((i) => (typeof i === 'string' ? i : i.url)).filter(Boolean),
          price,
          compareAt: null,
          inStock: offer.availability ? /InStock/i.test(offer.availability) : null,
          categoryText: name,
          genderText: name,
        });
      }
    }
    return items;
  };
}
