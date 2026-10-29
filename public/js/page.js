// Placeholder for sections that aren't built yet (guide, reviews, practice, georiders).
// The section id comes from <body data-page="…">.

import { t } from './i18n.js';
import { mountLayout, NAV } from './layout.js';
import { esc } from './shared.js';

const id = document.body.dataset.page;
mountLayout(id);
document.title = `${t(`${id}.title`)} — SafeRide`;

document.getElementById('page').innerHTML = `
  <section class="soon">
    <div class="soon-icon">${NAV.find((n) => n.id === id)?.icon ?? ''}</div>
    <span class="soon-badge">${esc(t('soon.badge'))}</span>
    <h1>${esc(t(`${id}.title`))}</h1>
    <p class="soon-lead">${esc(t(`${id}.lead`))}</p>
    <p class="muted">${esc(t('soon.body'))}</p>
  </section>`;
