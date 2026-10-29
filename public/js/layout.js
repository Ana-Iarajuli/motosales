// Page chrome shared by every page: left navigation, language / theme pickers and the account menu.
// Each page has empty placeholders (#sidebar, #lang-picker, #theme-picker, #user-menu) that this fills.

import { t, lang, LANGS, setLang, applyI18n } from './i18n.js';
import { getClient, onUserChange, usernameOf } from './auth.js';
import { esc } from './shared.js';

const icon = (paths) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

export const NAV = [
  { id: 'guide', href: 'guide.html', soon: true, icon: icon('<path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11v5c0 1.5 3 3 6 3s6-1.5 6-3v-5"/><path d="M22 9v6"/>') },
  { id: 'reviews', href: 'reviews.html', soon: true, icon: icon('<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>') },
  { id: 'practice', href: 'practice.html', soon: true, icon: icon('<path d="M9.5 4h5l4 15h-13z"/><path d="M8 10h8M7 15h10M3 20h18"/>') },
  { id: 'sales', href: './', icon: icon('<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8" r="1.5"/>') },
  { id: 'georiders', href: 'georiders.html', soon: true, icon: icon('<rect x="2" y="5" width="20" height="14" rx="4"/><path d="M10 9v6l5-3z"/>') },
];

const THEMES = [
  { id: 'tron', name: 'Tron · Cyan', colors: ['#00eaff', '#03070b'], bar: '#03070b' },
  { id: 'tron-orange', name: 'Tron · Orange', colors: ['#ff8a1a', '#080402'], bar: '#080402' },
  { id: 'classic', name: 'Classic', colors: ['#e4572e', '#f6f5f2'], bar: '#141416' },
];

const $ = (id) => document.getElementById(id);

// ---- dropdown menus ---------------------------------------------------------

const openMenus = new Set();

/** Wires a toggle button to a menu: click to open, outside click / Escape to close. */
function dropdown(btn, menu) {
  const set = (on) => {
    menu.hidden = !on;
    btn.setAttribute('aria-expanded', on);
    if (on) {
      for (const close of openMenus) close();
      openMenus.add(close);
    } else openMenus.delete(close);
  };
  const close = () => set(false);
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    set(menu.hidden);
  });
  return close;
}
document.addEventListener('click', (e) => {
  if (!e.target.closest('.menu')) for (const close of [...openMenus]) close();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') for (const close of [...openMenus]) close();
});

// ---- sidebar ----------------------------------------------------------------

function mountSidebar(active) {
  const nav = $('sidebar');
  if (!nav) return;
  nav.setAttribute('aria-label', t('nav.label'));
  nav.innerHTML = `
    <div class="sidebar-head">
      <span class="sidebar-title">${esc(t('nav.label'))}</span>
      <button type="button" class="icon-btn" id="nav-close" aria-label="${esc(t('nav.close'))}">✕</button>
    </div>
    <ul class="nav-list">
      ${NAV.map(
        (n) => `<li><a class="nav-item ${n.id === active ? 'on' : ''}" href="${n.href}" ${n.id === active ? 'aria-current="page"' : ''}>
          ${n.icon}<span>${esc(t(`nav.${n.id}`))}</span>${n.soon ? `<small class="nav-soon">${esc(t('nav.soon'))}</small>` : ''}</a></li>`,
      ).join('')}
    </ul>`;

  const scrim = document.createElement('div');
  scrim.className = 'scrim nav-scrim';
  scrim.hidden = true;
  document.body.append(scrim);
  const toggle = $('nav-toggle');
  const open = (on) => {
    nav.classList.toggle('open', on);
    scrim.hidden = !on;
    toggle?.setAttribute('aria-expanded', on);
    document.body.classList.toggle('no-scroll', on);
  };
  toggle?.addEventListener('click', () => open(true));
  $('nav-close').addEventListener('click', () => open(false));
  scrim.addEventListener('click', () => open(false));
  document.addEventListener('keydown', (e) => e.key === 'Escape' && nav.classList.contains('open') && open(false));
}

// ---- language & theme -------------------------------------------------------

function mountLangPicker() {
  const box = $('lang-picker');
  if (!box) return;
  const cur = LANGS.find((l) => l.id === lang);
  box.innerHTML = `
    <button type="button" class="tool-btn lang-btn" aria-haspopup="menu" aria-expanded="false" aria-label="${esc(t('lang.change'))}" title="${esc(t('lang.title'))}">${esc(cur.short)}</button>
    <div class="menu" role="menu" hidden>
      <h3>${esc(t('lang.title'))}</h3>
      ${LANGS.map((l) => `<button type="button" class="menu-item" role="menuitemradio" aria-checked="${l.id === lang}" data-lang="${l.id}" lang="${l.id}"><span class="lang-code">${esc(l.short)}</span>${esc(l.name)}</button>`).join('')}
    </div>`;
  dropdown(box.querySelector('button'), box.querySelector('.menu'));
  box.querySelector('.menu').addEventListener('click', (e) => {
    const id = e.target.closest('[data-lang]')?.dataset.lang;
    if (id && id !== lang) setLang(id);
  });
}

const swatch = (th) => `<span class="swatch" style="--a:${th.colors[0]};--b:${th.colors[1]}"></span>`;

// The saved theme is applied by an inline script in each page's <head> (avoids a flash).
function mountThemePicker() {
  const box = $('theme-picker');
  if (!box) return;
  box.innerHTML = `
    <button type="button" class="tool-btn" aria-haspopup="menu" aria-expanded="false" aria-label="${esc(t('theme.change'))}"></button>
    <div class="menu" role="menu" hidden>
      <h3>${esc(t('theme.title'))}</h3>
      ${THEMES.map((th) => `<button type="button" class="menu-item" role="menuitemradio" data-theme-id="${th.id}">${swatch(th)}${esc(th.name)}</button>`).join('')}
    </div>`;
  const btn = box.querySelector('button');
  const menu = box.querySelector('.menu');
  const close = dropdown(btn, menu);

  const apply = (id) => {
    const theme = THEMES.find((th) => th.id === id) ?? THEMES[0];
    document.documentElement.dataset.theme = theme.id;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme.bar);
    btn.innerHTML = swatch(theme);
    btn.title = `${t('theme.title')}: ${theme.name}`;
    menu.querySelectorAll('[data-theme-id]').forEach((o) => o.setAttribute('aria-checked', o.dataset.themeId === theme.id));
  };
  apply(document.documentElement.dataset.theme);
  menu.addEventListener('click', (e) => {
    const id = e.target.closest('[data-theme-id]')?.dataset.themeId;
    if (!id) return;
    apply(id);
    try {
      localStorage.setItem('theme', id);
    } catch {}
    close();
    btn.focus();
  });
}

// ---- account menu -----------------------------------------------------------

const PERSON = icon('<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>');

function renderUserMenu(box, user) {
  if (!user) {
    const back = location.pathname.endsWith('account.html') ? '' : `?next=${encodeURIComponent(location.pathname + location.search)}`;
    box.innerHTML = `<a class="tool-btn login-btn" href="account.html${back}">${PERSON}<span>${esc(t('user.login'))}</span></a>`;
    return;
  }
  const name = usernameOf(user);
  box.innerHTML = `
    <button type="button" class="tool-btn avatar-btn" aria-haspopup="menu" aria-expanded="false" aria-label="${esc(t('user.menu'))}" title="${esc(name)}">${esc(name.slice(0, 1).toUpperCase())}</button>
    <div class="menu" role="menu" hidden>
      <h3>${esc(name)}</h3>
      <a class="menu-item" role="menuitem" href="account.html">${PERSON}${esc(t('user.account'))}</a>
      <button type="button" class="menu-item" role="menuitem" data-logout>${icon('<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10"/>')}${esc(t('user.logout'))}</button>
    </div>`;
  dropdown(box.querySelector('button'), box.querySelector('.menu'));
  box.querySelector('[data-logout]').addEventListener('click', async () => {
    const client = await getClient();
    await client?.auth.signOut();
  });
}

function mountUserMenu() {
  const box = $('user-menu');
  if (!box) return;
  onUserChange((user) => renderUserMenu(box, user));
}

/** Call once per page, before rendering page content. `active` is the NAV id to highlight. */
export function mountLayout(active) {
  applyI18n();
  mountSidebar(active);
  mountLangPicker();
  mountThemePicker();
  mountUserMenu();
}
