// Data loading, currency formatting and small helpers shared by the deal pages.

import { t, tv } from './i18n.js';

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const safeUrl = (u) => (/^https?:\/\//i.test(u || '') ? u : '#');

const storage = {
  get(k) {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, v);
    } catch {}
  },
};

export async function loadData() {
  const res = await fetch('data/products.json', { cache: 'no-cache' });
  if (res.status === 503) return null; // local server is still scraping
  if (res.status === 404) throw new Error('No deal data has been generated yet. Run `npm run scrape` (or check the deploy build log).');
  if (!res.ok) throw new Error(`Could not load deals (HTTP ${res.status})`);
  const data = await res.json();

  data.storeById = Object.fromEntries(data.sources.map((s) => [s.id, s]));
  data.byId = new Map(data.products.map((p) => [p.id, p]));
  data.groups = new Map();
  for (const p of data.products) {
    if (!data.groups.has(p.matchKey)) data.groups.set(p.matchKey, []);
    data.groups.get(p.matchKey).push(p);
  }
  for (const group of data.groups.values()) {
    const stores = new Set(group.map((p) => p.source)).size;
    const best = Math.min(...group.map((p) => p.priceUSD));
    for (const p of group) {
      p.storeCount = stores;
      p.isBest = stores > 1 && p.priceUSD === best;
      p.search = `${p.title} ${p.brand} ${p.category} ${data.storeById[p.source]?.name ?? ''}`.toLowerCase();
    }
  }
  return data;
}

// ---- currency -------------------------------------------------------------

export const CURRENCIES = ['USD', 'EUR'];
let currency = CURRENCIES.includes(storage.get('currency')) ? storage.get('currency') : 'USD';
export const getCurrency = () => currency;

let rates = { USD: 1, EUR: 0.92 };
export const setRates = (r) => (rates = r || rates);

/** USD amount -> amount in the chosen display currency. */
export const toDisplay = (usd) => usd * rates[currency];

const formatters = {};
export function money(amount, cur = currency) {
  formatters[cur] ??= new Intl.NumberFormat(undefined, { style: 'currency', currency: cur, maximumFractionDigits: 2 });
  return formatters[cur].format(amount);
}
export const moneyUSD = (usd) => money(toDisplay(usd));

export function mountCurrencySwitch(onChange) {
  const sel = document.getElementById('currency');
  if (!sel) return;
  sel.innerHTML = CURRENCIES.map((c) => `<option ${c === currency ? 'selected' : ''}>${c}</option>`).join('');
  sel.addEventListener('change', () => {
    const prevRate = rates[currency];
    currency = sel.value;
    storage.set('currency', currency);
    onChange(prevRate);
  });
}

// ---- misc -----------------------------------------------------------------

export function timeAgo(iso) {
  const mins = Math.round((Date.now() - new Date(iso)) / 60000);
  if (mins < 1) return t('time.now');
  if (mins < 60) return t('time.min', { n: mins });
  const h = Math.round(mins / 60);
  if (h < 48) return t('time.hours', { n: h });
  return t('time.days', { n: Math.round(h / 24) });
}

/** Price HTML, with "from" wording when the store lists a price range. */
export const priceHtml = (p, html) => (p.priceFrom ? t('price.from', { price: html }) : html);

export const catLabel = (c) => tv('cat', c);
export const genderLabel = (g) => tv('gender', g);

export function productCard(p, data) {
  const store = data.storeById[p.source];
  const img = p.images[0];
  return `
    <a class="card" href="product.html?id=${encodeURIComponent(p.id)}">
      <div class="card-img">
        ${img ? `<img src="${esc(img)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<div class="no-img">${esc(t('card.noImage'))}</div>`}
        ${p.discountPct > 0 ? `<span class="badge-disc">−${p.discountPct}%</span>` : ''}
      </div>
      <div class="card-body">
        <div class="card-top"><span class="store-tag">${esc(store?.name ?? p.source)}</span><span class="brand">${esc(p.brand)}</span></div>
        <h3 class="card-title">${esc(p.title)}</h3>
        <div class="price-row">
          <span class="price">${priceHtml(p, moneyUSD(p.priceUSD))}</span>
          ${p.compareAtUSD ? `<s class="was">${moneyUSD(p.compareAtUSD)}</s>` : ''}
        </div>
        ${
          p.storeCount > 1
            ? `<div class="compare-note ${p.isBest ? 'best' : ''}">${p.isBest ? esc(t('card.best')) : ''}${esc(t('card.stores', { n: p.storeCount }))}</div>`
            : ''
        }
      </div>
    </a>`;
}

export function showMessage(el, title, body) {
  el.innerHTML = `<div class="message"><h2>${esc(title)}</h2><p>${esc(body)}</p></div>`;
}
