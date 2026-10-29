// POST /api/login {username, password} -> {access_token, refresh_token}
// Logging in with a username needs the account's email, which must not be exposed to the browser.
// This looks it up with the Supabase secret key (server-side only) and does the password login here.
// Logins with an email address go straight from the browser to Supabase and never reach this.
// Runs as a Netlify Function in production; server.js calls the same handler locally.

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

/** Supabase request headers. Legacy JWT keys also need Authorization; new sb_… keys must not send it. */
const keyHeaders = (key) => ({ apikey: key, ...(key.startsWith('eyJ') && { authorization: `Bearer ${key}` }), 'content-type': 'application/json' });

export default async function handler(req) {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });
  const { SUPABASE_URL: url, SUPABASE_PUBLISHABLE_KEY: publicKey, SUPABASE_SECRET_KEY: secretKey } = process.env;
  if (!url || !publicKey || !secretKey) return json(503, { error: 'not_configured' });

  let body;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'bad_request' });
  }
  const username = String(body?.username ?? '').trim();
  const password = String(body?.password ?? '');
  if (!/^[A-Za-z0-9_]{3,20}$/.test(username) || !password) return json(400, { error: 'invalid_credentials' });

  const lookup = await fetch(`${url}/rest/v1/rpc/email_for_login`, {
    method: 'POST',
    headers: keyHeaders(secretKey),
    body: JSON.stringify({ identifier: username }),
  });
  if (!lookup.ok) {
    console.error('email_for_login failed', lookup.status, await lookup.text());
    return json(502, { error: 'lookup_failed' });
  }
  const email = await lookup.json();
  // unknown username gets the same answer as a wrong password
  if (!email) return json(400, { error: 'invalid_credentials' });

  const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: keyHeaders(publicKey),
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return json(res.status, { error: data.error_code || data.error || 'invalid_credentials', message: data.msg || data.error_description });
  return json(200, { access_token: data.access_token, refresh_token: data.refresh_token });
}

export const config = { path: '/api/login' };
