import {
  esc, safeUrl, loadData, setRates, getCurrency, moneyUSD, money, mountCurrencySwitch, timeAgo, productCard, showMessage, priceHtml, catLabel, genderLabel,
} from './shared.js';
import { t } from './i18n.js';
import { mountLayout } from './layout.js';

mountLayout('sales');
document.title = t('pdp.pageTitle');

const root = document.getElementById('product');
const OUT = 'target="_blank" rel="noopener noreferrer nofollow"';
let data;
let product;

const listLink = (params, label) => `<a href="./?${new URLSearchParams(params)}">${esc(label)}</a>`;

/** "$199" plus the store's own price when it charges in another currency. */
function priceWithNative(p, amount, amountUSD) {
  const main = moneyUSD(amountUSD);
  return p.currency === getCurrency() ? main : `${main} <span class="native">${t('pdp.atStore', { price: money(amount, p.currency) })}</span>`;
}

function stockLabel(p) {
  if (p.inStock === true) return `<span class="stock in">${t('stock.in')}</span>`;
  if (p.inStock === false) return `<span class="stock out">${t('stock.out')}</span>`;
  return `<span class="stock unknown">${t('stock.unknown')}</span>`;
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
        <h2>${t('cmp.title')}</h2>
        <p class="muted">${t('cmp.only', { store: `<strong>${esc(storeName(product))}</strong>` })}</p>
        ${
          others.length
            ? `<p class="muted">${t('cmp.colorways', { n: others.length })}</p>
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
        <td data-label="${t('cmp.store')}">
          <strong>${esc(storeName(p))}</strong>
          ${i === 0 ? `<span class="tag best">${t('cmp.best')}</span>` : ''}
          ${variants > 1 ? `<div class="muted small">${t('cmp.variants', { n: variants })}</div>` : ''}
        </td>
        <td data-label="${t('cmp.price')}">
          <strong>${priceHtml(p, moneyUSD(p.priceUSD))}</strong>
          ${p.currency !== getCurrency() ? `<div class="muted small">${money(p.price, p.currency)}</div>` : ''}
          ${i > 0 ? `<div class="muted small">+${moneyUSD(p.priceUSD - cheapest)}</div>` : ''}
        </td>
        <td data-label="${t('cmp.was')}">${p.compareAtUSD ? `<s>${moneyUSD(p.compareAtUSD)}</s>` : '—'}</td>
        <td data-label="${t('cmp.discount')}">${p.discountPct ? `−${p.discountPct}%` : '—'}</td>
        <td data-label="${t('cmp.stock')}">${stockLabel(p)}</td>
        <td class="actions">
          ${isCurrent && p.id === product.id ? `<span class="muted small">${t('cmp.viewing')}</span>` : `<a class="link-btn" href="product.html?id=${encodeURIComponent(p.id)}">${t('cmp.details')}</a>`}
          <a class="btn btn-sm" href="${esc(safeUrl(p.url))}" ${OUT}>${t('cmp.go')}</a>
        </td>
      </tr>`;
    })
    .join('');

  return `
    <section class="panel compare">
      <h2>${t('cmp.title')} <span class="muted">${t('cmp.stores', { n: offers.length })}</span></h2>
      <p class="muted">${t('cmp.saveUpTo', { amount: `<strong>${moneyUSD(priciest - cheapest)}</strong>`, store: esc(storeName(offers[0].best)), cur: getCurrency() })}</p>
      <div class="table-wrap">
        <table class="offers">
          <thead><tr><th>${t('cmp.store')}</th><th>${t('cmp.price')}</th><th>${t('cmp.was')}</th><th>${t('cmp.discount')}</th><th>${t('cmp.stock')}</th><th><span class="sr-only">${t('cmp.actions')}</span></th></tr></thead>
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
        <h2>${esc(t('similar.title', { category: catLabel(product.category).toLowerCase() }))}</h2>
        ${listLink({ category: product.category }, t('similar.all'))}
      </div>
      <div class="grid">${picks.map((p) => productCard(p, data)).join('')}</div>
    </section>`;
}

function render() {
  const p = product;
  const store = data.storeById[p.source];
  document.title = t('pdp.docTitle', { title: p.title, store: store?.name ?? '' });
  const imgs = p.images.length ? p.images : [null];
  const savingsUSD = p.compareAtUSD ? p.compareAtUSD - p.priceUSD : 0;

  root.innerHTML = `
    <nav class="breadcrumb" aria-label="Breadcrumb">
      <a href="./">${esc(t('pdp.allDeals'))}</a> <span>/</span> ${listLink({ category: p.category }, catLabel(p.category))} <span>/</span> ${listLink({ brand: p.brand }, p.brand)}
    </nav>

    <article class="pdp">
      <div class="gallery">
        <div class="gallery-main">
          ${imgs[0] ? `<img id="main-img" src="${esc(imgs[0])}" alt="${esc(p.title)}" referrerpolicy="no-referrer">` : `<div class="no-img">${esc(t('card.noImage'))}</div>`}
          ${p.discountPct > 0 ? `<span class="badge-disc lg">−${p.discountPct}%</span>` : ''}
        </div>
        ${
          imgs.length > 1
            ? `<div class="thumbs">${imgs
                .map((src, i) => `<button type="button" class="thumb ${i === 0 ? 'on' : ''}" data-src="${esc(src)}" aria-label="${esc(t('pdp.image', { n: i + 1 }))}"><img src="${esc(src)}" alt="" loading="lazy" referrerpolicy="no-referrer"></button>`)
                .join('')}</div>`
            : ''
        }
      </div>

      <div class="pdp-info">
        <div class="pdp-meta">
          <span class="store-tag">${esc(store?.name ?? p.source)}</span>
          <span>${esc(catLabel(p.category))}</span><span>·</span><span>${esc(genderLabel(p.gender))}</span>
        </div>
        <p class="pdp-brand">${listLink({ brand: p.brand }, p.brand)}</p>
        <h1>${esc(p.title)}</h1>

        <div class="pdp-price">
          <span class="price xl">${priceHtml(p, priceWithNative(p, p.price, p.priceUSD))}</span>
          ${p.compareAtUSD ? `<div class="was-line"><s>${moneyUSD(p.compareAtUSD)}</s> <span class="save">${t('pdp.save', { amount: moneyUSD(savingsUSD) })}</span></div>` : `<div class="was-line muted">${t('pdp.noOriginal')}</div>`}
        </div>

        ${
          p.couponCode
            ? `<div class="coupon">${t('pdp.coupon', { code: `<code>${esc(p.couponCode)}</code>`, price: `<strong>${money(p.couponPrice, p.currency)}</strong>` })}</div>`
            : ''
        }
        ${p.storeCount > 1 ? `<div class="compare-note ${p.isBest ? 'best' : ''}">${t(p.isBest ? 'pdp.isBest' : 'pdp.notBest')}</div>` : ''}

        <a class="btn btn-lg cta" href="${esc(safeUrl(p.url))}" ${OUT}>${t('pdp.cta', { store: esc(store?.name ?? p.source) })}</a>
        <p class="muted small">${t('pdp.checked', { ago: esc(timeAgo(data.generatedAt)), store: esc(store?.name ?? p.source) })}</p>

        <dl class="specs">
          <div><dt>${t('pdp.availability')}</dt><dd>${stockLabel(p)}</dd></div>
          ${p.sizes.length ? `<div><dt>${t('pdp.sizes')}</dt><dd class="size-chips">${p.sizes.map((s) => `<span>${esc(s)}</span>`).join('')}</dd></div>` : ''}
          ${p.colors.length ? `<div><dt>${t('pdp.color', { n: p.colors.length })}</dt><dd>${esc(p.colors.join(', '))}</dd></div>` : ''}
          <div><dt>${t('pdp.soldBy')}</dt><dd>${esc(store?.name ?? p.source)} (${esc(store?.region ?? '')})</dd></div>
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
    root.querySelectorAll('.thumb').forEach((el) => el.classList.toggle('on', el === btn));
  });
}

async function boot() {
  try {
    data = await loadData();
  } catch (e) {
    return showMessage(root, t('results.error'), e.message);
  }
  if (!data) return showMessage(root, t('results.gathering'), t('pdp.stillCollecting'));
  setRates(data.rates);
  product = data.byId.get(new URLSearchParams(location.search).get('id'));
  if (!product) {
    root.innerHTML = `<div class="message"><h2>${t('pdp.gone')}</h2><p>${t('pdp.goneHint')} <a href="./">${t('pdp.browseAll')}</a></p></div>`;
    return;
  }
  mountCurrencySwitch(render);
  render();
}

boot();
