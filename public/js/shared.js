// Data loading, currency formatting and small helpers shared by both pages.

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

// ---- theme ----------------------------------------------------------------
// The saved theme is applied by an inline script in each page's <head> (avoids a flash);
// this wires up the picker button.

const THEMES = [
  { id: 'tron', name: 'Tron · Cyan', colors: ['#00eaff', '#03070b'], bar: '#03070b' },
  { id: 'tron-orange', name: 'Tron · Orange', colors: ['#ff8a1a', '#080402'], bar: '#080402' },
  { id: 'classic', name: 'Classic', colors: ['#e4572e', '#f6f5f2'], bar: '#141416' },
];

const swatch = (t) => `<span class="swatch" style="--a:${t.colors[0]};--b:${t.colors[1]}"></span>`;

export function mountThemePicker() {
  const btn = document.getElementById('theme-btn');
  const menu = document.getElementById('theme-menu');
  if (!btn || !menu) return;

  const apply = (id) => {
    const theme = THEMES.find((t) => t.id === id) ?? THEMES[0];
    document.documentElement.dataset.theme = theme.id;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme.bar);
    btn.innerHTML = swatch(theme);
    btn.title = `Theme: ${theme.name}`;
    menu.querySelectorAll('[data-theme-id]').forEach((o) => o.setAttribute('aria-checked', o.dataset.themeId === theme.id));
  };
  const open = (on) => {
    menu.hidden = !on;
    btn.setAttribute('aria-expanded', on);
  };

  menu.innerHTML =
    '<h3>Theme</h3>' +
    THEMES.map((t) => `<button type="button" class="theme-option" role="menuitemradio" data-theme-id="${t.id}">${swatch(t)}${esc(t.name)}</button>`).join('');
  apply(document.documentElement.dataset.theme);

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    open(menu.hidden);
  });
  menu.addEventListener('click', (e) => {
    const id = e.target.closest('[data-theme-id]')?.dataset.themeId;
    if (!id) return;
    apply(id);
    storage.set('theme', id);
    open(false);
    btn.focus();
  });
  document.addEventListener('click', (e) => {
    if (!menu.hidden && !menu.contains(e.target)) open(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !menu.hidden) {
      open(false);
      btn.focus();
    }
  });
}

// ---- misc -----------------------------------------------------------------

export function timeAgo(iso) {
  const mins = Math.round((Date.now() - new Date(iso)) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
}

export function productCard(p, data) {
  const store = data.storeById[p.source];
  const img = p.images[0];
  return `
    <a class="card" href="product.html?id=${encodeURIComponent(p.id)}">
      <div class="card-img">
        ${img ? `<img src="${esc(img)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : '<div class="no-img">No image</div>'}
        ${p.discountPct > 0 ? `<span class="badge-disc">−${p.discountPct}%</span>` : ''}
      </div>
      <div class="card-body">
        <div class="card-top"><span class="store-tag">${esc(store?.name ?? p.source)}</span><span class="brand">${esc(p.brand)}</span></div>
        <h3 class="card-title">${esc(p.title)}</h3>
        <div class="price-row">
          <span class="price">${p.priceFrom ? '<small>from</small> ' : ''}${moneyUSD(p.priceUSD)}</span>
          ${p.compareAtUSD ? `<s class="was">${moneyUSD(p.compareAtUSD)}</s>` : ''}
        </div>
        ${
          p.storeCount > 1
            ? `<div class="compare-note ${p.isBest ? 'best' : ''}">${p.isBest ? '★ Best price · ' : ''}${p.storeCount} stores compared</div>`
            : ''
        }
      </div>
    </a>`;
}

export function showMessage(el, title, body) {
  el.innerHTML = `<div class="message"><h2>${esc(title)}</h2><p>${esc(body)}</p></div>`;
}
