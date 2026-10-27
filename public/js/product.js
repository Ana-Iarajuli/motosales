import {
  esc, safeUrl, loadData, setRates, getCurrency, moneyUSD, money, mountCurrencySwitch, mountThemePicker, timeAgo, productCard, showMessage,
} from './shared.js';

mountThemePicker();

const root = document.getElementById('product');
const OUT = 'target="_blank" rel="noopener noreferrer nofollow"';
let data;
let product;

const listLink = (params, label) => `<a href="./?${new URLSearchParams(params)}">${esc(label)}</a>`;

/** "$199" plus the store's own price when it charges in another currency. */
function priceWithNative(p, amount, amountUSD) {
  const main = moneyUSD(amountUSD);
  return p.currency === getCurrency() ? main : `${main} <span class="native">(${money(amount, p.currency)} at store)</span>`;
}

function stockLabel(p) {
  if (p.inStock === true) return '<span class="stock in">In stock</span>';
  if (p.inStock === false) return '<span class="stock out">Out of stock</span>';
  return '<span class="stock unknown">Check on store</span>';
}

/** One row per store (its cheapest listing), cheapest store first. */
function offersByStore(group) {
  const perStore = new Map();
  for (const p of group) {
    const cur = perStore.get(p.source);
    if (!cur) perStore.set(p.source, { best: p, variants: 1 });
    else {
      cur.variants++;
      if (p.priceUSD < cur.best.priceUSD) cur.best = p;
    }
  }
  return [...perStore.values()].sort((a, b) => a.best.priceUSD - b.best.priceUSD);
}

function renderCompare() {
  const group = data.groups.get(product.matchKey) || [product];
  const offers = offersByStore(group);
  const storeName = (p) => data.storeById[p.source]?.name ?? p.source;

  if (offers.length < 2) {
    const others = group.filter((p) => p.id !== product.id);
    return `
      <section class="panel compare">
        <h2>Price comparison</h2>
        <p class="muted">We only found this item on sale at <strong>${esc(storeName(product))}</strong>. Other stores may sell it at full price or not stock it.</p>
        ${
          others.length
            ? `<p class="muted">${others.length} other colorway${others.length > 1 ? 's' : ''} at the same store:</p>
               <ul class="variant-list">${others
                 .sort((a, b) => a.priceUSD - b.priceUSD)
                 .map((p) => `<li><a href="product.html?id=${encodeURIComponent(p.id)}">${esc(p.title)}${p.colors.length ? ` — ${esc(p.colors.join(', '))}` : ''}</a> <strong>${moneyUSD(p.priceUSD)}</strong></li>`)
                 .join('')}</ul>`
            : ''
        }
      </section>`;
  }

  const cheapest = offers[0].best.priceUSD;
  const priciest = offers[offers.length - 1].best.priceUSD;
  const rows = offers
    .map(({ best: p, variants }, i) => {
      const isCurrent = p.source === product.source;
      return `
      <tr class="${i === 0 ? 'is-best' : ''} ${isCurrent ? 'is-current' : ''}">
        <td data-label="Store">
          <strong>${esc(storeName(p))}</strong>
          ${i === 0 ? '<span class="tag best">Best price</span>' : ''}
          ${variants > 1 ? `<div class="muted small">${variants} colorways, cheapest shown</div>` : ''}
        </td>
        <td data-label="Price">
          <strong>${p.priceFrom ? '<small>from</small> ' : ''}${moneyUSD(p.priceUSD)}</strong>
          ${p.currency !== getCurrency() ? `<div class="muted small">${money(p.price, p.currency)}</div>` : ''}
          ${i > 0 ? `<div class="muted small">+${moneyUSD(p.priceUSD - cheapest)}</div>` : ''}
        </td>
        <td data-label="Was">${p.compareAtUSD ? `<s>${moneyUSD(p.compareAtUSD)}</s>` : '—'}</td>
        <td data-label="Discount">${p.discountPct ? `−${p.discountPct}%` : '—'}</td>
        <td data-label="Stock">${stockLabel(p)}</td>
        <td class="actions">
          ${isCurrent && p.id === product.id ? '<span class="muted small">Viewing</span>' : `<a class="link-btn" href="product.html?id=${encodeURIComponent(p.id)}">Details</a>`}
          <a class="btn btn-sm" href="${esc(safeUrl(p.url))}" ${OUT}>Go to store ↗</a>
        </td>
      </tr>`;
    })
    .join('');

  return `
    <section class="panel compare">
      <h2>Price comparison <span class="muted">· ${offers.length} stores</span></h2>
      <p class="muted">Save up to <strong>${moneyUSD(priciest - cheapest)}</strong> by buying at ${esc(storeName(offers[0].best))}. Prices converted to ${getCurrency()} at today's exchange rate; shipping and taxes not included.</p>
      <div class="table-wrap">
        <table class="offers">
          <thead><tr><th>Store</th><th>Price</th><th>Was</th><th>Discount</th><th>Stock</th><th><span class="sr-only">Actions</span></th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </section>`;
}

function renderSimilar() {
  const sameGroup = new Set([product.matchKey]);
  const pool = data.products.filter((p) => p.category === product.category && !sameGroup.has(p.matchKey) && p.inStock !== false);
  const seen = new Set();
  const picks = pool
    .sort((a, b) => (b.brand === product.brand) - (a.brand === product.brand) || b.discountPct - a.discountPct)
    .filter((p) => !seen.has(p.matchKey) && seen.add(p.matchKey))
    .slice(0, 8);
  if (!picks.length) return '';
  return `
    <section class="similar">
      <div class="section-head">
        <h2>More ${esc(product.category.toLowerCase())} deals</h2>
        ${listLink({ category: product.category }, 'See all →')}
      </div>
      <div class="grid">${picks.map((p) => productCard(p, data)).join('')}</div>
    </section>`;
}

function render() {
  const p = product;
  const store = data.storeById[p.source];
  document.title = `${p.title} — ${store?.name ?? ''} deal | MotoSales`;
  const imgs = p.images.length ? p.images : [null];
  const savingsUSD = p.compareAtUSD ? p.compareAtUSD - p.priceUSD : 0;

  root.innerHTML = `
    <nav class="breadcrumb" aria-label="Breadcrumb">
      <a href="./">All deals</a> <span>/</span> ${listLink({ category: p.category }, p.category)} <span>/</span> ${listLink({ brand: p.brand }, p.brand)}
    </nav>

    <article class="pdp">
      <div class="gallery">
        <div class="gallery-main">
          ${imgs[0] ? `<img id="main-img" src="${esc(imgs[0])}" alt="${esc(p.title)}" referrerpolicy="no-referrer">` : '<div class="no-img">No image</div>'}
          ${p.discountPct > 0 ? `<span class="badge-disc lg">−${p.discountPct}%</span>` : ''}
        </div>
        ${
          imgs.length > 1
            ? `<div class="thumbs">${imgs
                .map((src, i) => `<button type="button" class="thumb ${i === 0 ? 'on' : ''}" data-src="${esc(src)}" aria-label="Image ${i + 1}"><img src="${esc(src)}" alt="" loading="lazy" referrerpolicy="no-referrer"></button>`)
                .join('')}</div>`
            : ''
        }
      </div>

      <div class="pdp-info">
        <div class="pdp-meta">
          <span class="store-tag">${esc(store?.name ?? p.source)}</span>
          <span>${esc(p.category)}</span><span>·</span><span>${esc(p.gender)}</span>
        </div>
        <p class="pdp-brand">${listLink({ brand: p.brand }, p.brand)}</p>
        <h1>${esc(p.title)}</h1>

        <div class="pdp-price">
          <span class="price xl">${p.priceFrom ? '<small>from</small> ' : ''}${priceWithNative(p, p.price, p.priceUSD)}</span>
          ${p.compareAtUSD ? `<div class="was-line"><s>${moneyUSD(p.compareAtUSD)}</s> <span class="save">You save ${moneyUSD(savingsUSD)}</span></div>` : '<div class="was-line muted">Original price not listed by the store</div>'}
        </div>

        ${
          p.couponCode
            ? `<div class="coupon">🏷️ Extra discount with code <code>${esc(p.couponCode)}</code> — about <strong>${money(p.couponPrice, p.currency)}</strong> at checkout</div>`
            : ''
        }
        ${p.storeCount > 1 ? `<div class="compare-note ${p.isBest ? 'best' : ''}">${p.isBest ? '★ This is the lowest price we found' : 'A lower price is available at another store — see comparison below'}</div>` : ''}

        <a class="btn btn-lg cta" href="${esc(safeUrl(p.url))}" ${OUT}>View deal on ${esc(store?.name ?? 'store')} ↗</a>
        <p class="muted small">Price checked ${timeAgo(data.generatedAt)}. Final price, sizes and stock are on ${esc(store?.name ?? 'the store')}'s website.</p>

        <dl class="specs">
          <div><dt>Availability</dt><dd>${stockLabel(p)}</dd></div>
          ${p.sizes.length ? `<div><dt>Sizes available</dt><dd class="size-chips">${p.sizes.map((s) => `<span>${esc(s)}</span>`).join('')}</dd></div>` : ''}
          ${p.colors.length ? `<div><dt>Color${p.colors.length > 1 ? 's' : ''}</dt><dd>${esc(p.colors.join(', '))}</dd></div>` : ''}
          <div><dt>Sold by</dt><dd>${esc(store?.name ?? p.source)} (${esc(store?.region ?? '')})</dd></div>
        </dl>
        ${p.description ? `<p class="description">${esc(p.description)}${p.description.length >= 500 ? '…' : ''}</p>` : ''}
      </div>
    </article>

    ${renderCompare()}
    ${renderSimilar()}
  `;

  root.querySelector('.thumbs')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.thumb');
    if (!btn) return;
    document.getElementById('main-img').src = btn.dataset.src;
    root.querySelectorAll('.thumb').forEach((t) => t.classList.toggle('on', t === btn));
  });
}

async function boot() {
  try {
    data = await loadData();
  } catch (e) {
    return showMessage(root, 'Could not load deals', e.message);
  }
  if (!data) return showMessage(root, 'Gathering deals…', 'Deals are still being collected. Please try again in a minute.');
  setRates(data.rates);
  product = data.byId.get(new URLSearchParams(location.search).get('id'));
  if (!product) {
    root.innerHTML = `<div class="message"><h2>This deal is no longer listed</h2><p>It may have sold out or the sale ended. <a href="./">Browse all current deals →</a></p></div>`;
    return;
  }
  mountCurrencySwitch(render);
  render();
}

boot();
