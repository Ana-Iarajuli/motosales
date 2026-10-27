import {
  esc, safeUrl, loadData, setRates, getCurrency, toDisplay, mountCurrencySwitch, mountThemePicker, timeAgo, productCard, showMessage,
} from './shared.js';

mountThemePicker();

const PAGE_SIZE = 48;
const SIZE_ORDER = ['2XS', 'XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL'];
const GENDER_ORDER = ['Men', 'Women', 'Unisex', 'Kids'];

// Facets: list-type filters, each reading one or more values from a product.
const FACETS = {
  store: { label: 'Store', get: (p) => [p.source] },
  category: { label: 'Category', get: (p) => [p.category] },
  brand: { label: 'Brand', get: (p) => [p.brand], searchable: true },
  gender: { label: 'Gender', get: (p) => [p.gender], order: GENDER_ORDER },
  size: { label: 'Size', get: (p) => p.sizeTags, order: SIZE_ORDER },
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
  return key === 'store' ? data.storeById[value]?.name ?? value : value;
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
    const t = brandSearch.text.toLowerCase();
    if (t) entries = entries.filter(([v]) => v.toLowerCase().includes(t));
    const total = entries.length;
    if (!brandSearch.expanded && !t) entries = entries.filter(([v], i) => i < 10 || state[key].includes(v));
    searchBox = `<input type="search" class="facet-search" data-facet-search placeholder="Find a brand…" value="${esc(brandSearch.text)}" aria-label="Find a brand">`;
    if (total > 10 && !t) {
      moreButton = `<button type="button" class="link-btn" data-toggle-brands>${brandSearch.expanded ? 'Show fewer' : `Show all ${total}`}</button>`;
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
  return section(key, f.label, searchBox + list + moreButton);
}

// Remembers which filter sections the user collapsed, across re-renders.
const collapsed = {};
const section = (key, label, html) =>
  `<details class="facet" data-key="${key}" ${collapsed[key] ? '' : 'open'}><summary>${label}</summary>${html}</details>`;

function renderFilters() {
  const focusedSearch = document.activeElement?.matches?.('[data-facet-search]');
  const cur = getCurrency();
  $('filter-body').innerHTML = `
    <div class="facet toggles">
      <label class="switch"><input type="checkbox" id="f-best" ${state.best ? 'checked' : ''}><span>Best offer only</span>
        <small>Hide pricier copies of the same item from other stores and colorways</small></label>
      <label class="switch"><input type="checkbox" id="f-stock" ${state.stock ? 'checked' : ''}><span>In stock only</span></label>
      <label class="switch"><input type="checkbox" id="f-coupon" ${state.coupon ? 'checked' : ''}><span>Has extra coupon code</span></label>
    </div>
    ${section(
      'disc',
      'Discount',
      `<div class="pill-row">
        ${[0, 10, 20, 30, 40, 50, 70]
          .map((d) => `<button type="button" class="pill ${state.disc === d ? 'on' : ''}" data-disc="${d}">${d ? `${d}%+` : 'Any'}</button>`)
          .join('')}
      </div>`,
    )}
    ${section(
      'price',
      `Price (${cur})`,
      `<div class="price-inputs">
        <input type="number" min="0" inputmode="decimal" id="f-min" placeholder="Min" value="${esc(state.min)}" aria-label="Minimum price">
        <span>–</span>
        <input type="number" min="0" inputmode="decimal" id="f-max" placeholder="Max" value="${esc(state.max)}" aria-label="Maximum price">
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
  if (state.disc) chips.push(['disc', `${state.disc}%+ off`]);
  if (state.min !== '' || state.max !== '') chips.push(['price', `${state.min || 0} – ${state.max || '∞'} ${getCurrency()}`]);
  if (state.stock) chips.push(['stock', 'In stock']);
  if (state.coupon) chips.push(['coupon', 'Coupon code']);
  $('active-chips').innerHTML = chips
    .map(([id, label]) => `<button type="button" class="chip" data-chip="${esc(id)}">${esc(label)} <span aria-hidden="true">✕</span></button>`)
    .join('');
  $('filter-count').textContent = chips.length ? `(${chips.length})` : '';
}

function renderResults() {
  let list = data.products.filter((p) => passes(p));
  if (state.best) list = bestOnly(list);
  list.sort(SORTS[state.sort] ?? SORTS.discount);

  $('result-count').textContent = `${list.length.toLocaleString()} ${list.length === 1 ? 'deal' : 'deals'}`;
  if (!list.length) {
    $('grid').innerHTML = `<div class="message"><h2>No deals match</h2><p>Try removing a filter or widening the price range.</p></div>`;
    $('load-more').hidden = true;
    return;
  }
  $('grid').innerHTML = list.slice(0, shown).map((p) => productCard(p, data)).join('');
  $('load-more').hidden = list.length <= shown;
  $('load-more').textContent = `Show more deals (${(list.length - shown).toLocaleString()} left)`;
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
  $('hero-stats').innerHTML = `<strong>${data.products.length.toLocaleString()}</strong> sale items from <strong>${ok.length}</strong> of ${data.sources.length} stores · up to <strong>${topDisc}% off</strong> · updated ${timeAgo(data.generatedAt)}`;
  $('store-strip').innerHTML = data.sources
    .map((s) => {
      const live = s.count > 0;
      const note = live ? `${s.count.toLocaleString()} items${s.stale ? ' · cached' : ''}` : s.status === 'blocked' ? 'not available — browse on site' : 'temporarily unavailable';
      return `<a class="store-pill ${live ? '' : 'off'}" href="${esc(safeUrl(s.saleUrl))}" target="_blank" rel="noopener noreferrer nofollow"
        title="${esc(live ? `Open ${s.name}'s sale page` : `We couldn't collect ${s.name}'s sale items automatically. Click to browse them on ${s.name}.`)}">
        <span class="dot"></span>${esc(s.name)} <small>${note}</small> <span aria-hidden="true">↗</span></a>`;
    })
    .join('');
}

// ---- events -----------------------------------------------------------------

function bindEvents() {
  const body = $('filter-body');
  body.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.facet) {
      const arr = state[t.dataset.facet];
      if (t.checked) arr.push(t.value);
      else arr.splice(arr.indexOf(t.value), 1);
    } else if (t.id === 'f-best') state.best = t.checked;
    else if (t.id === 'f-stock') state.stock = t.checked;
    else if (t.id === 'f-coupon') state.coupon = t.checked;
    else if (t.id === 'f-min') state.min = t.value;
    else if (t.id === 'f-max') state.max = t.value;
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
    showMessage($('grid'), 'Could not load deals', e.message);
    return;
  }
  if (!data) {
    $('hero-stats').textContent = 'Collecting the latest deals from all stores — this takes about a minute on first start…';
    showMessage($('grid'), 'Gathering deals…', 'This page will refresh automatically.');
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
