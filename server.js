import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { runScrape, DATA_FILE } from './scraper/index.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, 'public');
const PORT = Number(process.env.PORT) || 3000;
const REFRESH_HOURS = Number(process.env.REFRESH_HOURS) || 6;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

let scraping = null;
function refresh() {
  if (!scraping) {
    scraping = runScrape({ log: (m) => console.log(`[scrape] ${m}`) })
      .catch((e) => console.error('[scrape] failed:', e))
      .finally(() => (scraping = null));
  }
  return scraping;
}

function dataAgeHours() {
  try {
    return (Date.now() - fs.statSync(DATA_FILE).mtimeMs) / 36e5;
  } catch {
    return Infinity;
  }
}

function send(res, status, body, type = 'text/plain; charset=utf-8', extra = {}) {
  res.writeHead(status, { 'content-type': type, ...extra });
  res.end(body);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');

  // Same URL the static (Netlify) build serves; handled here to add gzip and a "still scraping" reply.
  if (url.pathname === '/data/products.json') {
    if (!fs.existsSync(DATA_FILE)) {
      return send(res, 503, JSON.stringify({ error: 'Collecting deals, try again shortly', scraping: !!scraping }), MIME['.json']);
    }
    const gzip = /\bgzip\b/.test(req.headers['accept-encoding'] || '');
    res.writeHead(200, { 'content-type': MIME['.json'], 'cache-control': 'no-cache', ...(gzip && { 'content-encoding': 'gzip' }) });
    const stream = fs.createReadStream(DATA_FILE);
    return (gzip ? stream.pipe(zlib.createGzip()) : stream).pipe(res);
  }

  const rel = path.normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
  const file = path.join(PUBLIC, rel || 'index.html');
  if (!file.startsWith(PUBLIC)) return send(res, 403, 'Forbidden');
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return send(res, 404, 'Not found');
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
});

server.listen(PORT, () => {
  console.log(`MotoSales running at http://localhost:${PORT}`);
  if (dataAgeHours() > REFRESH_HOURS) refresh();
  setInterval(refresh, REFRESH_HOURS * 36e5).unref();
});
