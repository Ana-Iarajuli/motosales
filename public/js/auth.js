// Accounts, backed by Supabase Auth (passwords, email verification and reset emails).
// The project URL and publishable key come from config.json, which the Netlify build
// (scripts/write-config.js) or the local server writes from environment variables.
// Without it, accounts are simply switched off and the rest of the site works as before.

const SDK_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';

export const USERNAME_RE = /^[A-Za-z0-9_]{3,20}$/;
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const MIN_PASSWORD = 8;

let clientPromise;

/** The Supabase client, or null when accounts aren't configured. */
export function getClient() {
  clientPromise ??= (async () => {
    const res = await fetch('config.json', { cache: 'no-cache' });
    if (!res.ok) return null;
    const cfg = await res.json();
    if (!cfg.supabaseUrl || !cfg.supabaseKey) return null;
    const { createClient } = await import(SDK_URL);
    // implicit flow: email links work even when opened on another device than the one used to sign up
    return createClient(cfg.supabaseUrl, cfg.supabaseKey, { auth: { flowType: 'implicit', detectSessionInUrl: true, persistSession: true } });
  })().catch((e) => {
    console.warn('Accounts unavailable:', e);
    return null;
  });
  return clientPromise;
}

export const usernameOf = (user) => user?.user_metadata?.username || user?.email?.split('@')[0] || '';

export async function getUser() {
  const client = await getClient();
  if (!client) return null;
  const { data } = await client.auth.getSession();
  return data.session?.user ?? null;
}

/** Calls fn(user | null) now and on every login / logout. */
export async function onUserChange(fn) {
  const client = await getClient();
  if (!client) return fn(null, false);
  client.auth.onAuthStateChange((_event, session) => fn(session?.user ?? null, true));
}

/** Logs in with an email or a username. Usernames are resolved server-side so emails stay private. */
export async function logIn(client, identifier, password) {
  if (identifier.includes('@')) {
    const { error } = await client.auth.signInWithPassword({ email: identifier, password });
    if (error) throw error;
    return;
  }
  const res = await fetch('api/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: identifier, password }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(body.message || body.error || `HTTP ${res.status}`), { code: body.error, status: res.status });
  const { error } = await client.auth.setSession({ access_token: body.access_token, refresh_token: body.refresh_token });
  if (error) throw error;
}

export async function usernameAvailable(client, name) {
  const { data, error } = await client.rpc('username_available', { name });
  if (error) throw error;
  return data === true;
}
