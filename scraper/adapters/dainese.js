// Dainese (Salesforce Commerce Cloud): the outlet page loads its grid from Search-UpdateGrid.
import { get, sleep, PAGE_DELAY_MS } from '../http.js';
import { decodeEntities, tidyTitle } from '../normalize.js';

const ORIGIN = 'https://www.dainese.com';
const PAGE_SIZE = 48;

const pick = (s, re) => {
  const m = s.match(re);
  return m ? decodeEntities(m[1]).trim() : null;
};

function parseGrid(html) {
  const items = [];
  for (const tile of html.split('<div class="product" data-pid="').slice(1)) {
    const pid = tile.slice(0, tile.indexOf('"'));
    let gtm = {};
    try {
      gtm = JSON.parse(pick(tile, /data-gtm-click-event="([^"]+)"/)).ecommerce.items[0];
    } catch {}
    const href = pick(tile, /data-href="([^"]+)"/);
    const sale = parseFloat(pick(tile, /class="sales">\s*<span class="value" content="([\d.]+)"/));
    const list = parseFloat(pick(tile, /strike-through list">\s*<span class="value" content="([\d.]+)"/));
    const price = Number.isFinite(sale) ? sale : gtm.price;
    if (!href || !price) continue;
    const name = pick(tile, /tile-image[^>]*title="([^"]+)"/) || pick(tile, /title="([^"]+)"/) || gtm.item_name || pid;
    const images = [...tile.matchAll(/class="[^"]*tile-image[^"]*"\s+src="([^"]+)"/g)].slice(0, 6).map((m) => decodeEntities(m[1]));
    const hints = [gtm.item_category2, gtm.item_category3, gtm.product_category, gtm.product_segment, gtm.product_line]
      .filter(Boolean)
      .join(' ');
    items.push({
      sourceId: pid,
      title: tidyTitle(name),
      brand: 'Dainese',
      url: ORIGIN + href,
      images: images.length ? images : [],
      price,
      compareAt: Number.isFinite(list) && list > price ? list : null,
      inStock: gtm.item_availability ? gtm.item_availability === 'in stock' : null,
      colors: gtm.item_variant ? [tidyTitle(gtm.item_variant.toUpperCase())] : [],
      categoryText: `${name} ${hints}`,
      genderText: `${name} ${gtm.item_gender === 'Unisex' ? '' : gtm.item_gender || ''}`,
    });
  }
  return items;
}

export function dainese({ site, locale, cgid, maxPages = 12 }) {
  return async function fetchProducts() {
    const seen = new Map();
    for (let page = 0; page < maxPages; page++) {
      const url = `${ORIGIN}/on/demandware.store/${site}/${locale}/Search-UpdateGrid?cgid=${cgid}&start=${page * PAGE_SIZE}&sz=${PAGE_SIZE}`;
      const items = parseGrid(await get(url));
      let added = 0;
      for (const it of items) if (!seen.has(it.sourceId)) seen.set(it.sourceId, it), added++;
      if (items.length < PAGE_SIZE || !added) break;
      await sleep(PAGE_DELAY_MS);
    }
    return [...seen.values()];
  };
}
