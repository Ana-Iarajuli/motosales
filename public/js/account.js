// account.html: log in, register, forgot / reset password, email verification landing and profile.
// The view comes from ?view=…; email links from Supabase land on ?view=verified and ?view=reset.

import { t, lang } from './i18n.js';
import { mountLayout } from './layout.js';
import { esc } from './shared.js';
import { getClient, logIn, usernameAvailable, usernameOf, USERNAME_RE, EMAIL_RE, MIN_PASSWORD } from './auth.js';

// Read before the Supabase client consumes the URL hash: expired links arrive as #error_code=…
const linkError = new URLSearchParams(location.hash.slice(1)).get('error_code');

mountLayout(null);
document.title = t('auth.pageTitle');

const root = document.getElementById('account');
const params = new URLSearchParams(location.search);
const here = `${location.origin}${location.pathname}`;
let client;

// ---- small form helpers ---------------------------------------------------

function field({ name, label, type = 'text', autocomplete, hint = '', value = '', attrs = '' }) {
  return `
    <label class="field">
      <span class="field-label">${esc(label)}</span>
      <input name="${name}" type="${type}" autocomplete="${autocomplete}" value="${esc(value)}" required ${attrs}>
      <small class="field-hint" data-hint="${name}" data-default="${esc(hint)}">${esc(hint)}</small>
    </label>`;
}

const showPasswordToggle = () =>
  `<label class="switch show-pass"><input type="checkbox" data-show-pass><span>${esc(t('auth.showPassword'))}</span></label>`;

const viewLink = (view, label) => `<a href="?view=${view}" data-view="${view}">${esc(label)}</a>`;

function card(title, lead, body) {
  root.innerHTML = `
    <h1>${esc(title)}</h1>
    ${lead ? `<p class="auth-lead">${lead}</p>` : ''}
    ${body}`;
  root.querySelector('input')?.focus();
}

function setHint(form, name, text, kind = 'error') {
  const el = form.querySelector(`[data-hint="${name}"]`);
  el.textContent = text ?? el.dataset.default;
  el.className = `field-hint ${text ? kind : ''}`;
  form.elements[name].toggleAttribute('aria-invalid', kind === 'error' && !!text);
}

function setMessage(form, html, kind = 'error') {
  const el = form.querySelector('.form-msg');
  el.innerHTML = html;
  el.className = `form-msg ${kind}`;
  el.hidden = !html;
}

/** Disables the form while `fn` runs; shows its thrown error. */
async function busy(form, fn) {
  const btn = form.querySelector('[type="submit"]');
  const label = btn.textContent;
  btn.disabled = true;
  btn.textContent = t('auth.wait');
  setMessage(form, '');
  try {
    await fn();
  } catch (e) {
    setMessage(form, esc(authError(e)));
  } finally {
    btn.disabled = false;
    btn.textContent = label;
  }
}

function authError(e) {
  const code = e?.code || '';
  const msg = String(e?.message || '').toLowerCase();
  if (code === 'invalid_credentials' || msg.includes('invalid login')) return t('auth.err.credentials');
  if (code === 'email_not_confirmed' || msg.includes('not confirmed')) return t('auth.err.unconfirmed');
  if (code.startsWith('over_') || e?.status === 429) return t('auth.err.rate');
  if (code === 'weak_password') return t('auth.err.passwordWeak');
  if (code === 'same_password') return t('auth.err.samePassword');
  // the profiles insert (unique username) failing inside sign-up surfaces as this generic message
  if (msg.includes('database error saving new user')) return t('auth.err.usernameTaken');
  console.error(e);
  return t('auth.err.generic');
}

function checkPasswords(form, name = 'password') {
  const pw = form.elements[name].value;
  if (pw.length < MIN_PASSWORD) return setHint(form, name, t('auth.err.passwordShort')), false;
  setHint(form, name, null);
  if (form.elements.repeat.value !== pw) return setHint(form, 'repeat', t('auth.err.passwordMismatch')), false;
  setHint(form, 'repeat', null);
  return true;
}

function resendButton(email) {
  return `<button type="button" class="link-btn" data-resend="${esc(email)}">${esc(t('auth.resend'))}</button>`;
}

async function resend(btn) {
  const { error } = await client.auth.resend({ type: 'signup', email: btn.dataset.resend, options: { emailRedirectTo: `${here}?view=verified` } });
  btn.replaceWith(Object.assign(document.createElement('span'), { className: 'muted', textContent: error ? authError(error) : t('auth.resent') }));
}

// ---- views ----------------------------------------------------------------

const VIEWS = {
  off() {
    card(t('auth.off.title'), esc(t('auth.off.body')), '');
  },

  login({ message } = {}) {
    card(
      t('auth.login.title'),
      esc(t('auth.login.lead')),
      `<form class="auth-form" novalidate>
        ${field({ name: 'identifier', label: t('auth.identifier'), autocomplete: 'username', attrs: 'autocapitalize="none" spellcheck="false"' })}
        ${field({ name: 'password', label: t('auth.password'), type: 'password', autocomplete: 'current-password' })}
        <div class="form-row">${showPasswordToggle()}${viewLink('forgot', t('auth.login.forgot'))}</div>
        <div class="form-msg" hidden></div>
        <button type="submit" class="btn btn-lg cta">${esc(t('auth.login.submit'))}</button>
        <p class="auth-switch">${esc(t('auth.login.new'))} ${viewLink('register', t('auth.login.create'))}</p>
      </form>`,
    );
    const form = root.querySelector('form');
    if (message) setMessage(form, esc(message));
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const identifier = form.elements.identifier.value.trim();
      const password = form.elements.password.value;
      if (!identifier || !password) return setMessage(form, esc(t('auth.err.credentials')));
      busy(form, async () => {
        try {
          await logIn(client, identifier, password);
        } catch (err) {
          if (authError(err) === t('auth.err.unconfirmed') && identifier.includes('@')) {
            return setMessage(form, `${esc(t('auth.err.unconfirmed'))}<br>${resendButton(identifier)}`);
          }
          throw err;
        }
        const next = params.get('next');
        location.href = next?.startsWith('/') && !next.startsWith('//') ? next : './';
      });
    });
  },

  register() {
    card(
      t('auth.register.title'),
      esc(t('auth.register.lead')),
      `<form class="auth-form" novalidate>
        ${field({ name: 'username', label: t('auth.username'), autocomplete: 'username', hint: t('auth.register.usernameHint'), attrs: 'minlength="3" maxlength="20" autocapitalize="none" spellcheck="false"' })}
        ${field({ name: 'email', label: t('auth.email'), type: 'email', autocomplete: 'email' })}
        ${field({ name: 'password', label: t('auth.password'), type: 'password', autocomplete: 'new-password', hint: t('auth.register.passwordHint'), attrs: `minlength="${MIN_PASSWORD}"` })}
        ${field({ name: 'repeat', label: t('auth.register.repeat'), type: 'password', autocomplete: 'new-password' })}
        <div class="form-row">${showPasswordToggle()}</div>
        <div class="form-msg" hidden></div>
        <button type="submit" class="btn btn-lg cta">${esc(t('auth.register.submit'))}</button>
        <p class="auth-switch">${esc(t('auth.register.have'))} ${viewLink('login', t('auth.register.login'))}</p>
      </form>`,
    );
    const form = root.querySelector('form');

    const checkUsername = async () => {
      const name = form.elements.username.value.trim();
      if (!USERNAME_RE.test(name)) return setHint(form, 'username', t('auth.err.usernameFormat')), false;
      const free = await usernameAvailable(client, name);
      setHint(form, 'username', t(free ? 'auth.ok.usernameFree' : 'auth.err.usernameTaken'), free ? 'ok' : 'error');
      return free;
    };
    form.elements.username.addEventListener('change', () => checkUsername().catch(() => setHint(form, 'username', null)));

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      busy(form, async () => {
        const email = form.elements.email.value.trim();
        const emailOk = EMAIL_RE.test(email);
        setHint(form, 'email', emailOk ? null : t('auth.err.email'));
        const pwOk = checkPasswords(form);
        if (!(await checkUsername()) || !emailOk || !pwOk) return;

        const { error } = await client.auth.signUp({
          email,
          password: form.elements.password.value,
          options: { data: { username: form.elements.username.value.trim() }, emailRedirectTo: `${here}?view=verified` },
        });
        if (error) throw error;
        go('check', { email });
      });
    });
  },

  check({ email }) {
    card(
      t('auth.check.title'),
      t('auth.check.body', { email: `<strong>${esc(email)}</strong>` }),
      `<p class="muted">${esc(t('auth.check.spam'))}</p>
       <p>${resendButton(email)}</p>
       <p class="auth-switch">${viewLink('login', t('auth.back'))}</p>`,
    );
  },

  forgot({ message } = {}) {
    card(
      t('auth.forgot.title'),
      esc(t('auth.forgot.lead')),
      `<form class="auth-form" novalidate>
        ${field({ name: 'email', label: t('auth.email'), type: 'email', autocomplete: 'email' })}
        <div class="form-msg" hidden></div>
        <button type="submit" class="btn btn-lg cta">${esc(t('auth.forgot.submit'))}</button>
        <p class="auth-switch">${viewLink('login', t('auth.back'))}</p>
      </form>`,
    );
    const form = root.querySelector('form');
    if (message) setMessage(form, esc(message));
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const email = form.elements.email.value.trim();
      if (!EMAIL_RE.test(email)) return setHint(form, 'email', t('auth.err.email'));
      setHint(form, 'email', null);
      busy(form, async () => {
        const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: `${here}?view=reset` });
        if (error) throw error;
        // same answer whether or not the email has an account, so the form can't be used to probe emails
        setMessage(form, t('auth.forgot.sent', { email: `<strong>${esc(email)}</strong>` }), 'ok');
        form.querySelector('[type="submit"]').remove();
      });
    });
  },

  reset() {
    card(
      t('auth.reset.title'),
      '',
      `<form class="auth-form" novalidate>
        ${field({ name: 'password', label: t('auth.reset.new'), type: 'password', autocomplete: 'new-password', hint: t('auth.register.passwordHint'), attrs: `minlength="${MIN_PASSWORD}"` })}
        ${field({ name: 'repeat', label: t('auth.register.repeat'), type: 'password', autocomplete: 'new-password' })}
        <div class="form-row">${showPasswordToggle()}</div>
        <div class="form-msg" hidden></div>
        <button type="submit" class="btn btn-lg cta">${esc(t('auth.reset.submit'))}</button>
      </form>`,
    );
    const form = root.querySelector('form');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!checkPasswords(form)) return;
      busy(form, async () => {
        const { error } = await client.auth.updateUser({ password: form.elements.password.value });
        if (error) throw error;
        form.innerHTML = `<div class="form-msg ok">${esc(t('auth.reset.done'))}</div>
          <a class="btn btn-lg cta" href="./">${esc(t('auth.profile.toDeals'))}</a>`;
      });
    });
  },

  verified({ user }) {
    card(
      t('auth.verified.title'),
      esc(t('auth.verified.body', { name: usernameOf(user) })),
      `<a class="btn btn-lg cta" href="./">${esc(t('auth.profile.toDeals'))}</a>`,
    );
  },

  profile({ user }) {
    const since = new Date(user.created_at).toLocaleDateString(lang, { year: 'numeric', month: 'long', day: 'numeric' });
    card(
      t('auth.profile.title'),
      '',
      `<div class="profile-head"><span class="avatar">${esc(usernameOf(user).slice(0, 1).toUpperCase())}</span><strong>${esc(usernameOf(user))}</strong></div>
       <dl class="specs">
         <div><dt>${esc(t('auth.username'))}</dt><dd>${esc(usernameOf(user))}</dd></div>
         <div><dt>${esc(t('auth.email'))}</dt><dd>${esc(user.email)}</dd></div>
         <div><dt>${esc(t('auth.profile.since'))}</dt><dd>${esc(since)}</dd></div>
       </dl>
       <div class="profile-actions">
         <a class="btn" href="?view=reset" data-view="reset">${esc(t('auth.profile.changePassword'))}</a>
         <button type="button" class="btn" data-logout>${esc(t('user.logout'))}</button>
       </div>`,
    );
  },
};

// ---- routing ----------------------------------------------------------------

async function currentUser() {
  const { data } = await client.auth.getSession();
  return data.session?.user ?? null;
}

async function go(view, opts = {}, { push = true } = {}) {
  const user = await currentUser();
  let target = view;
  if (['login', 'register', 'forgot', 'check'].includes(view) && user) target = 'profile';
  if (view === 'profile' && !user) target = 'login';
  if (view === 'reset' && !user) {
    target = 'forgot';
    opts = { message: t('auth.reset.expired') };
  }
  if (view === 'verified' && !user) {
    target = 'login';
    if (linkError) opts = { message: t('auth.verified.expired') };
  }
  if (push) {
    const next = params.get('next');
    history.replaceState(null, '', target === 'login' ? location.pathname + (next ? `?next=${encodeURIComponent(next)}` : '') : `?view=${target}`);
  }
  VIEWS[target]({ ...opts, user });
}

root.addEventListener('click', async (e) => {
  const link = e.target.closest('[data-view]');
  if (link) {
    e.preventDefault();
    go(link.dataset.view);
  }
  const resendBtn = e.target.closest('[data-resend]');
  if (resendBtn) resend(resendBtn);
  if (e.target.closest('[data-logout]')) await client.auth.signOut();
});

root.addEventListener('change', (e) => {
  if (!e.target.matches('[data-show-pass]')) return;
  for (const input of e.target.form.querySelectorAll('input[name="password"], input[name="repeat"]')) input.type = e.target.checked ? 'text' : 'password';
});

async function boot() {
  root.innerHTML = `<p class="muted">${esc(t('auth.wait'))}</p>`;
  client = await getClient();
  if (!client) return VIEWS.off();
  client.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') go('login');
  });
  const view = params.get('view');
  go(['login', 'register', 'forgot', 'reset', 'verified'].includes(view) ? view : 'profile', {}, { push: false });
}

boot();
