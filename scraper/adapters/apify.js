// Runs a hosted Apify actor and maps its dataset items. Apify bills per result, so the
// item count is capped (APIFY_MAX_ITEMS) and sources using this set `minIntervalHours`.
// The actor's output keys aren't formally documented, so several common names are accepted.
import { parsePrice } from '../normalize.js';

const first = (obj, keys) => {
  for (const k of keys) if (obj[k] != null && obj[k] !== '') return obj[k];
  return null;
};

function mapItem(it) {
  const title = first(it, ['name', 'title', 'productName']);
  const url = first(it, ['url', 'productUrl', 'link']);
  const price = parsePrice(first(it, ['price', 'salePrice', 'currentPrice', 'finalPrice']));
  if (!title || !url || price == null) return null;
  const msrp = parsePrice(first(it, ['msrp', 'MSRP', 'originalPrice', 'regularPrice', 'listPrice', 'compareAtPrice']));
  const image = first(it, ['image', 'imageUrl', 'image_url', 'thumbnail']) ?? [].concat(it.images ?? [])[0];
  const availability = first(it, ['availability', 'availabilityStatus', 'inStock', 'stock']);
  return {
    sourceId: String(first(it, ['id', 'sku', 'productId']) ?? url),
    title: String(title),
    brand: first(it, ['brand', 'brandName', 'manufacturer']),
    url: String(url),
    images: image ? [typeof image === 'string' ? image : image.url] : [],
    price,
    compareAt: msrp && msrp > price ? msrp : null,
    inStock: availability == null ? null : typeof availability === 'boolean' ? availability : !/out|unavailable|sold/i.test(availability),
    categoryText: `${title} ${first(it, ['category', 'categoryName']) ?? ''}`,
    genderText: String(title),
  };
}

export function apify({ actor, input, onlyDiscounted = true }) {
  return async function fetchProducts() {
    const token = process.env.APIFY_TOKEN;
    const maxItems = Number(process.env.APIFY_MAX_ITEMS) || 200;
    const res = await fetch(`https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?clean=true`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ ...input, maxItems }),
      signal: AbortSignal.timeout(330000), // run-sync waits up to 300 s
    });
    if (!res.ok) throw new Error(`Apify HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const items = (await res.json()).map(mapItem).filter(Boolean);
    return onlyDiscounted ? items.filter((i) => i.compareAt) : items;
  };
}
