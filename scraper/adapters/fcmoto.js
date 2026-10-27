// FC-Moto (Shopware) sale listing: product cards in server-rendered HTML, paged with ?p=N.
import { get, sleep, PAGE_DELAY_MS } from '../http.js';
import { decodeEntities, parsePrice } from '../normalize.js';

const pick = (s, re) => {
  const m = s.match(re);
  return m ? decodeEntities(m[1]).trim() : null;
};

function parseCards(html) {
  const items = [];
  for (const card of html.split('class="card product-box').slice(1)) {
    const infoRaw = pick(card, /data-product-information="([^"]+)"/);
    if (!infoRaw) continue;
    let info;
    try {
      info = JSON.parse(infoRaw);
    } catch {
      continue;
    }
    const url = pick(card, /<a href="([^"]+)"\s+class="product-name"/);
    const priceBlock = card.slice(card.indexOf('product-price-wrapper'), card.indexOf('product-price-wrapper') + 800);
    const price = parsePrice(pick(priceBlock, /product-price[^"]*">\s*(?:from\s*)?\$([\d,]+\.\d{2})/));
    if (!url || price == null) continue;
    const compareAt = parsePrice(pick(priceBlock, /list-price-price">\s*\$([\d,]+\.\d{2})/));
    const couponCode = pick(card, /emz-coupon-code-label">\s*([^<]+?)\s*</);
    const couponPrice = parsePrice(pick(card, /emz-promo-discount[^>]*>\s*\$([\d,]+\.\d{2})/));
    const image = pick(card, /<img src="([^"]+)"/);
    items.push({
      sourceId: info.id,
      title: info.name,
      url,
      images: image ? [image] : [],
      price,
      priceFrom: /product-price-wrapper">\s*from/.test(priceBlock),
      compareAt: compareAt && compareAt > price ? compareAt : null,
      couponCode: couponCode && couponPrice && couponPrice < price ? couponCode : null,
      couponPrice: couponCode && couponPrice && couponPrice < price ? couponPrice : null,
      inStock: null,
      categoryText: info.name,
      genderText: info.name,
    });
  }
  return items;
}

export function fcmoto({ url, maxPages = 15 }) {
  return async function fetchProducts() {
    const seen = new Map();
    for (let page = 1; page <= maxPages; page++) {
      const html = await get(`${url}?p=${page}`);
      const items = parseCards(html);
      let added = 0;
      for (const it of items) if (!seen.has(it.sourceId)) seen.set(it.sourceId, it), added++;
      if (!added) break;
      await sleep(PAGE_DELAY_MS);
    }
    return [...seen.values()];
  };
}
