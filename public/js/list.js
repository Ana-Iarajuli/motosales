import {
  esc, safeUrl, loadData, setRates, getCurrency, toDisplay, mountCurrencySwitch, timeAgo, productCard, showMessage, catLabel, genderLabel,
} from './shared.js';
import { t } from './i18n.js';
import { mountLayout } from './layout.js';

mountLayout('sales');
document.title = t('sales.pageTitle');

const PAGE_SIZE = 48;
const SIZE_ORDER = ['2XS', 'XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL'];
const GENDER_ORDER = ['Men', 'Women', 'Unisex', 'Kids'];

// Facets: list-type filters, each reading one or more values from a product.
const FACETS = {
  store: { get: (p) => [p.source] },
  category: { get: (p) => [p.category] },
  brand: { get: (p) => [p.brand], searchable: true },
  gender: { get: (p) => [p.gender], order: GENDER_ORDER },
  size: { get: (p) => p.sizeTags, order: SIZE_ORDER },
};

const DEFAULTS = { q: '', min: '', max: '', disc: 0, stock: false, coupon: false, best: true, sort: 'discount' };
const state = { ...DEFAULTS, ...Object.fromEntries(Object.keys(FACETS).map((k) => [k, []])) };
let shown = PAGE_SIZE;
let data;
const brandSearch = { text: '', expanded: false };

const $ = (id) => document.getElementById(id);

// ---- URL <-> state ----------------------------------------------------------

function readUrl() {
  const u = new URLSearchParams(location.search);
  for (const k of Object.keys(FACETS)) state[k] = u.get(k) ? u.get(k).split('~') : [];
  state.q = u.get('q') ?? '';
  state.min = u.get('min') ?? '';
  state.max = u.get('max') ?? '';
  state.disc = Number(u.get('disc')) || 0;
  state.stock = u.get('stock') === '1';
  state.coupon = u.get('coupon') === '1';
  state.best = u.get('best') !== '0';
  state.sort = u.get('sort') || DEFAULTS.sort;
}

function writeUrl() {
  const u = new URLSearchParams();
  for (const k of Object.keys(FACETS)) if (state[k].length) u.set(k, state[k].join('~'));
  if (state.q) u.set('q', state.q);
  if (state.min !== '') u.set('min', state.min);
  if (state.max !== '') u.set('max', state.max);
  if (state.disc) u.set('disc', state.disc);
  if (state.stock) u.set('stock', '1');
  if (state.coupon) u.set('coupon', '1');
  if (!state.best) u.set('best', '0');
  if (state.sort !== DEFAULTS.sort) u.set('sort', state.sort);
  history.replaceState(null, '', u.toString() ? `?${u}` : location.pathname);
}

// ---- filtering --------------------------------------------------------------

function passes(p, skipFacet) {
  for (const [k, f] of Object.entries(FACETS)) {
    if (k === skipFacet || !state[k].length) continue;
    if (!f.get(p).some((v) => state[k].includes(v))) return false;
  }
  if (state.q) {
    for (const word of state.q.toLowerCase().split(/\s+/)) if (word && !p.search.includes(word)) return false;
  }
  const price = toDisplay(p.priceUSD);
  if (state.min !== '' && price < Number(state.min)) return false;
  if (state.max !== '' && price > Number(state.max)) return false;
  if (state.disc && p.discountPct < state.disc) return false;
  if (state.stock && p.inStock === false) return false;
  if (state.coupon && !p.couponCode) return false;
  return true;
}

/** Keeps only the cheapest listing of each product (across stores and colorways). */
function bestOnly(list) {
  const best = new Map();
  for (const p of list) {
    const cur = best.get(p.matchKey);
    if (!cur || p.priceUSD < cur.priceUSD || (p.priceUSD === cur.priceUSD && p.discountPct > cur.discountPct)) best.set(p.matchKey, p);
  }
  return [...best.values()];
}

const SORTS = {
  discount: (a, b) => b.discountPct - a.discountPct || savings(b) - savings(a),
  savings: (a, b) => savings(b) - savings(a) || b.discountPct - a.discountPct,
  'price-asc': (a, b) => a.priceUSD - b.priceUSD,
  'price-desc': (a, b) => b.priceUSD - a.priceUSD,
  compared: (a, b) => b.storeCount - a.storeCount || b.discountPct - a.discountPct,
  name: (a, b) => a.title.localeCompare(b.title),
};
const savings = (p) => (p.compareAtUSD ? p.compareAtUSD - p.priceUSD : 0);

// ---- rendering --------------------------------------------------------------

function facetCounts(key) {
  const counts = new Map();
  for (const p of data.products) {
    if (!passes(p, key)) continue;
    for (const v of FACETS[key].get(p)) counts.set(v, (counts.get(v) || 0) + 1);
  }
  // keep selected values visible even when their count drops to 0
  for (const v of state[key]) if (!counts.has(v)) counts.set(v, 0);
  return counts;
}

function facetLabel(key, value) {
  if (key === 'store') return data.storeById[value]?.name ?? value;
  if (key === 'category') return catLabel(value);
  if (key === 'gender') return genderLabel(value);
  return value;
}

function renderFacet(key) {
  const f = FACETS[key];
  let entries = [...facetCounts(key)];
  if (f.order) entries.sort((a, b) => f.order.indexOf(a[0]) - f.order.indexOf(b[0]));
  else if (key === 'store') entries.sort((a, b) => facetLabel(key, a[0]).localeCompare(facetLabel(key, b[0])));
  else entries.sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(b[0]));

  let searchBox = '';
  let moreButton = '';
  if (f.searchable) {
    const needle = brandSearch.text.toLowerCase();
    if (needle) entries = entries.filter(([v]) => v.toLowerCase().includes(needle));
    const total = entries.length;
    if (!brandSearch.expanded && !needle) entries = entries.filter(([v], i) => i < 10 || state[key].includes(v));
    searchBox = `<input type="search" class="facet-search" data-facet-search placeholder="${esc(t('filters.findBrand'))}" value="${esc(brandSearch.text)}" aria-label="${esc(t('filters.findBrand'))}">`;
    if (total > 10 && !needle) {
      moreButton = `<button type="button" class="link-btn" data-toggle-brands>${esc(brandSearch.expanded ? t('filters.fewer') : t('filters.all', { n: total }))}</button>`;
    }
  }
  if (key === 'size' && !entries.length) return '';

  const opts = entries
    .map(([v, n]) => {
      const checked = state[key].includes(v);
      return `<label class="check ${n === 0 && !checked ? 'is-empty' : ''}">
        <input type="checkbox" data-facet="${key}" value="${esc(v)}" ${checked ? 'checked' : ''}>
        <span>${esc(facetLabel(key, v))}</span><span class="count">${n}</span>
      </label>`;
    })
    .join('');
  const list = key === 'size' ? `<div class="size-grid">${opts}</div>` : `<div class="check-list">${opts}</div>`;
  return section(key, t(`facet.${key}`), searchBox + list + moreButton);
}

// Remembers which filter sections the user collapsed, across re-renders.
const collapsed = {};
const section = (key, label, html) =>
  `<details class="facet" data-key="${key}" ${collapsed[key] ? '' : 'open'}><summary>${esc(label)}</summary>${html}</details>`;

function renderFilters() {
  const focusedSearch = document.activeElement?.matches?.('[data-facet-search]');
  const cur = getCurrency();
  $('filter-body').innerHTML = `
    <div class="facet toggles">
      <label class="switch"><input type="checkbox" id="f-best" ${state.best ? 'checked' : ''}><span>${esc(t('filters.best'))}</span>
        <small>${esc(t('filters.bestHint'))}</small></label>
      <label class="switch"><input type="checkbox" id="f-stock" ${state.stock ? 'checked' : ''}><span>${esc(t('filters.stock'))}</span></label>
      <label class="switch"><input type="checkbox" id="f-coupon" ${state.coupon ? 'checked' : ''}><span>${esc(t('filters.coupon'))}</span></label>
    </div>
    ${section(
      'disc',
      t('filters.discount'),
      `<div class="pill-row">
        ${[0, 10, 20, 30, 40, 50, 70]
          .map((d) => `<button type="button" class="pill ${state.disc === d ? 'on' : ''}" data-disc="${d}">${d ? `${d}%+` : esc(t('filters.any'))}</button>`)
          .join('')}
      </div>`,
    )}
    ${section(
      'price',
      t('filters.price', { cur }),
      `<div class="price-inputs">
        <input type="number" min="0" inputmode="decimal" id="f-min" placeholder="${esc(t('filters.min'))}" value="${esc(state.min)}" aria-label="${esc(t('filters.minLabel'))}">
        <span>–</span>
        <input type="number" min="0" inputmode="decimal" id="f-max" placeholder="${esc(t('filters.max'))}" value="${esc(state.max)}" aria-label="${esc(t('filters.maxLabel'))}">
      </div>`,
    )}
    ${['category', 'store', 'brand', 'gender', 'size'].map(renderFacet).join('')}
  `;
  if (focusedSearch) {
    const el = document.querySelector('[data-facet-search]');
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }
}

function renderChips() {
  const chips = [];
  for (const k of Object.keys(FACETS)) for (const v of state[k]) chips.push([`${k}:${v}`, facetLabel(k, v)]);
  if (state.q) chips.push(['q', `“${state.q}”`]);
  if (state.disc) chips.push(['disc', t('chip.disc', { d: state.disc })]);
  if (state.min !== '' || state.max !== '') chips.push(['price', `${state.min || 0} – ${state.max || '∞'} ${getCurrency()}`]);
  if (state.stock) chips.push(['stock', t('chip.stock')]);
  if (state.coupon) chips.push(['coupon', t('chip.coupon')]);
  $('active-chips').innerHTML = chips
    .map(([id, label]) => `<button type="button" class="chip" data-chip="${esc(id)}">${esc(label)} <span aria-hidden="true">✕</span></button>`)
    .join('');
  $('filter-count').textContent = chips.length ? `(${chips.length})` : '';
}

function renderResults() {
  let list = data.products.filter((p) => passes(p));
  if (state.best) list = bestOnly(list);
  list.sort(SORTS[state.sort] ?? SORTS.discount);

  $('result-count').textContent = t('results.count', { n: list.length });
  if (!list.length) {
    $('grid').innerHTML = `<div class="message"><h2>${esc(t('results.none'))}</h2><p>${esc(t('results.noneHint'))}</p></div>`;
    $('load-more').hidden = true;
    return;
  }
  $('grid').innerHTML = list.slice(0, shown).map((p) => productCard(p, data)).join('');
  $('load-more').hidden = list.length <= shown;
  $('load-more').textContent = t('results.more', { n: list.length - shown });
}

function render({ resetPage = true } = {}) {
  if (resetPage) shown = PAGE_SIZE;
  writeUrl();
  renderFilters();
  renderChips();
  renderResults();
  $('sort').value = state.sort;
  $('q').value = state.q;
}

function renderHeader() {
  const ok = data.sources.filter((s) => s.count > 0);
  const discounted = data.products.filter((p) => p.discountPct > 0);
  const topDisc = Math.max(0, ...discounted.map((p) => p.discountPct));
  $('hero-stats').innerHTML = t('hero.stats', {
    items: `<strong>${data.products.length.toLocaleString()}</strong>`,
    ok: `<strong>${ok.length}</strong>`,
    total: data.sources.length,
    disc: `<strong>${topDisc}</strong>`,
    ago: esc(timeAgo(data.generatedAt)),
  });
  $('store-strip').innerHTML = data.sources
    .map((s) => {
      const live = s.count > 0;
      const note = live ? t('store.items', { n: s.count }) + (s.stale ? t('store.cached') : '') : t(s.status === 'blocked' ? 'store.blocked' : 'store.down');
      return `<a class="store-pill ${live ? '' : 'off'}" href="${esc(safeUrl(s.saleUrl))}" target="_blank" rel="noopener noreferrer nofollow"
        title="${esc(t(live ? 'store.open' : 'store.blockedTitle', { store: s.name }))}">
        <span class="dot"></span>${esc(s.name)} <small>${esc(note)}</small> <span aria-hidden="true">↗</span></a>`;
    })
    .join('');
}

// ---- events -----------------------------------------------------------------

function bindEvents() {
  const body = $('filter-body');
  body.addEventListener('change', (e) => {
    const el = e.target;
    if (el.dataset.facet) {
      const arr = state[el.dataset.facet];
      if (el.checked) arr.push(el.value);
      else arr.splice(arr.indexOf(el.value), 1);
    } else if (el.id === 'f-best') state.best = el.checked;
    else if (el.id === 'f-stock') state.stock = el.checked;
    else if (el.id === 'f-coupon') state.coupon = el.checked;
    else if (el.id === 'f-min') state.min = el.value;
    else if (el.id === 'f-max') state.max = el.value;
    else return;
    render();
  });
  body.addEventListener('input', (e) => {
    if (e.target.matches('[data-facet-search]')) {
      brandSearch.text = e.target.value;
      renderFilters();
    }
  });
  body.addEventListener('click', (e) => {
    const disc = e.target.closest('[data-disc]');
    if (disc) {
      state.disc = Number(disc.dataset.disc);
      render();
    }
    if (e.target.closest('[data-toggle-brands]')) {
      brandSearch.expanded = !brandSearch.expanded;
      renderFilters();
    }
  });
  body.addEventListener('toggle', (e) => (collapsed[e.target.dataset.key] = !e.target.open), true);

  $('active-chips').addEventListener('click', (e) => {
    const id = e.target.closest('[data-chip]')?.dataset.chip;
    if (!id) return;
    const [k, ...rest] = id.split(':');
    if (FACETS[k]) state[k] = state[k].filter((v) => v !== rest.join(':'));
    else if (k === 'price') state.min = state.max = '';
    else if (k === 'stock' || k === 'coupon') state[k] = false;
    else state[k] = DEFAULTS[k];
    render();
  });

  $('clear-filters').addEventListener('click', () => {
    Object.assign(state, DEFAULTS, Object.fromEntries(Object.keys(FACETS).map((k) => [k, []])));
    brandSearch.text = '';
    render();
  });

  $('sort').addEventListener('change', (e) => {
    state.sort = e.target.value;
    render();
  });

  let qTimer;
  $('q').addEventListener('input', (e) => {
    clearTimeout(qTimer);
    qTimer = setTimeout(() => {
      state.q = e.target.value.trim();
      render();
    }, 200);
  });
  $('search-form').addEventListener('submit', (e) => e.preventDefault());

  $('load-more').addEventListener('click', () => {
    shown += PAGE_SIZE;
    renderResults();
  });

  const open = (on) => {
    $('filters').classList.toggle('open', on);
    $('scrim').hidden = !on;
    document.body.classList.toggle('no-scroll', on);
  };
  $('open-filters').addEventListener('click', () => open(true));
  $('close-filters').addEventListener('click', () => open(false));
  $('scrim').addEventListener('click', () => open(false));

  mountCurrencySwitch((prevRate) => {
    // price bounds are typed in the display currency, so convert them along
    const conv = (v) => (v === '' ? '' : String(Math.round(toDisplay(Number(v) / prevRate))));
    state.min = conv(state.min);
    state.max = conv(state.max);
    renderHeader();
    render({ resetPage: false });
  });
}

// ---- boot -------------------------------------------------------------------

async function boot() {
  try {
    data = await loadData();
  } catch (e) {
    showMessage($('grid'), t('results.error'), e.message);
    return;
  }
  if (!data) {
    $('hero-stats').textContent = t('hero.collecting');
    showMessage($('grid'), t('results.gathering'), t('results.autoRefresh'));
    setTimeout(boot, 10000);
    return;
  }
  setRates(data.rates);
  readUrl();
  renderHeader();
  bindEvents();
  render({ resetPage: true });
}

boot();
