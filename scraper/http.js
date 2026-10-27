const HEADERS = {
  'user-agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36',
  'accept-language': 'en-US,en;q=0.9',
};

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Polite delay between paged requests to the same store. */
export const PAGE_DELAY_MS = 500;

export async function get(url, { json = false, retries = 2 } = {}) {
  const accept = json ? 'application/json' : 'text/html,application/xhtml+xml,*/*;q=0.8';
  for (let attempt = 0; ; attempt++) {
    let res;
    try {
      res = await fetch(url, { headers: { ...HEADERS, accept }, signal: AbortSignal.timeout(30000) });
    } catch (e) {
      if (attempt >= retries) throw e;
      await sleep(1000 * (attempt + 1));
      continue;
    }
    if (res.ok) return json ? res.json() : res.text();
    const err = new Error(`HTTP ${res.status} for ${url}`);
    err.status = res.status;
    // 403/404 won't fix themselves on retry
    if (res.status === 403 || res.status === 404 || attempt >= retries) throw err;
    await sleep(1000 * (attempt + 1));
  }
}
