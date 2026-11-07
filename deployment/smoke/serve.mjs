// Server statis smoke-test lokal: menyajikan dist/ + mem-proxy /api ke
// runner (meniru topologi Nginx container web -> api) untuk verifikasi
// Fase 7 tanpa Docker. Bukan untuk produksi.
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
const DIST = path.resolve('dist');
const API = { host: '127.0.0.1', port: 3102 };
const MIME = { '.html':'text/html', '.js':'application/javascript', '.css':'text/css', '.json':'application/json', '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg', '.webp':'image/webp', '.xml':'application/xml', '.txt':'text/plain', '.ico':'image/x-icon', '.woff2':'font/woff2' };
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname.startsWith('/api/')) {
    const p = http.request({ ...API, path: req.url, method: req.method, headers: req.headers }, (up) => { res.writeHead(up.statusCode, up.headers); up.pipe(res); });
    p.on('error', () => { res.writeHead(502); res.end('api down'); });
    req.pipe(p); return;
  }
  let file = path.join(DIST, url.pathname);
  try { const s = await stat(file); if (s.isDirectory()) file = path.join(file, 'index.html'); } catch { file = path.join(DIST, 'index.html'); }
  try { const data = await readFile(file); res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' }); res.end(data); }
  catch { res.writeHead(404); res.end('not found'); }
});
server.listen(4327, () => console.log('smoke on 4327'));
