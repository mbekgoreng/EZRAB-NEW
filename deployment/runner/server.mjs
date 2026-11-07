/**
 * EZRAB — Portable API runner (pengganti Vercel Functions di luar Vercel).
 *
 * Melayani handler yang SAMA PERSIS dengan yang berjalan di Vercel:
 * file-file di `api/` (ESM, `export default async (req, res)`) di-import
 * apa adanya — TIDAK ada logika bisnis yang ditulis ulang di sini.
 * File ini hanya menyediakan permukaan platform yang selama ini
 * disediakan Vercel:
 *
 *  1. Routing file-based: /api/ai/chat -> api/ai/chat.js,
 *     segmen dinamis [action] -> req.query.action (sama seperti Vercel).
 *  2. Objek req/res bergaya Node: req.query, req.body (JSON ter-parse,
 *     batas ukuran sama seperti helper readJsonBody), res.status().json(),
 *     res.setHeader(), res.end() — persis yang diasumsikan handler dan
 *     api/_lib/security.js.
 *  3. Gerbang akses yang mereplikasi middleware.ts (Edge) memakai sumber
 *     kebenaran Node yang sama: api/_lib/accessGate.js
 *     (checkAccessSession / getAccessConfig adalah kembaran yang
 *     ter-cross-test dengan middleware). Perilaku fail-closed identik:
 *     env belum terkonfigurasi -> /app/* diarahkan ke /access dan API
 *     sensitif menjawab 503 ACCESS_NOT_CONFIGURED.
 *  4. Endpoint kesehatan GET /health (di luar /api, untuk Docker
 *     healthcheck & Nginx).
 *
 * Yang SENGAJA tidak dilakukan di sini:
 *  - Rewrite host blog (blog.ezrab.site) dan SPA fallback — itu tugas
 *    Nginx (lihat nginx/ezrab.conf), setara pemisahan di Vercel antara
 *    vercel.json rewrites dan Functions.
 *  - Streaming/SSE ke klien: tidak ada handler yang membutuhkannya
 *    (gateway AI mengonsumsi SSE provider secara internal dan selalu
 *    menjawab JSON) — terverifikasi dari kode api/_lib/aiGateway.js.
 *
 * Env: PORT (default 3001), HOST (default 0.0.0.0),
 *      API_BODY_LIMIT_BYTES (default 4718592 = 4,5 MB, menyamai batas
 *      payload Vercel Functions untuk plan yang dipakai).
 *
 * Tanpa dependensi npm — Node >= 20 murni.
 */
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API_DIR = path.resolve(__dirname, '../../api');

const PORT = Number(process.env.PORT || 3001);
const HOST = process.env.HOST || '0.0.0.0';
const BODY_LIMIT = Number(process.env.API_BODY_LIMIT_BYTES || 4_718_592);

/** Peta rute eksplisit: path publik -> file handler di api/. */
const ROUTES = [
  { pattern: /^\/api\/access\/([^/]+)$/, file: 'access/[action].js', param: 'action' },
  { pattern: /^\/api\/invitations\/([^/]+)$/, file: 'invitations/[action].js', param: 'action' },
  { pattern: /^\/api\/ai\/chat$/, file: 'ai/chat.js' },
  { pattern: /^\/api\/ai\/engine-status$/, file: 'ai/engine-status.js' },
  { pattern: /^\/api\/ai\/multi-provider\/execute$/, file: 'ai/multi-provider/execute.js' },
  { pattern: /^\/api\/ai\/multi-provider\/providers$/, file: 'ai/multi-provider/providers.js' },
  { pattern: /^\/api\/ai\/tools\/execute$/, file: 'ai/tools/execute.js' },
  { pattern: /^\/api\/credits\/balance$/, file: 'credits/balance.js' },
  { pattern: /^\/api\/credits\/estimate$/, file: 'credits/estimate.js' },
  { pattern: /^\/api\/credits\/usage$/, file: 'credits/usage.js' },
  { pattern: /^\/api\/market\/search$/, file: 'market/search.js' },
];

const handlerCache = new Map();
async function loadHandler(file) {
  if (!handlerCache.has(file)) {
    const mod = await import(pathToFileURL(path.join(API_DIR, file)).href);
    handlerCache.set(file, mod.default);
  }
  return handlerCache.get(file);
}

// ------------------------------------------------------------- gate ----
// Replikasi middleware.ts memakai accessGate.js (sumber yang sama).
let gateModule = null;
async function getGate() {
  if (!gateModule) {
    gateModule = await import(
      pathToFileURL(path.join(API_DIR, '_lib/accessGate.js')).href
    );
  }
  return gateModule;
}

const PUBLIC_API_PATHS = new Set(['/api/ai/engine-status']);
const GATED_API_PREFIXES = ['/api/ai/', '/api/credits/', '/api/market/'];

/**
 * Mengembalikan null bila permintaan boleh lanjut ke handler, atau
 * { status, json } / { redirect } bila gerbang menjawab sendiri.
 * Hanya berlaku untuk prefix yang di-gate middleware.ts; /api/access/*
 * dan /api/invitations/* TIDAK di-gate oleh middleware (invitations
 * menegakkan auth-nya sendiri di dalam handler).
 */
async function applyGate(req, pathname) {
  if (pathname.startsWith('/api/access/')) return null;
  if (!GATED_API_PREFIXES.some((p) => pathname.startsWith(p))) return null;
  if (PUBLIC_API_PATHS.has(pathname)) return null;

  const gate = await getGate();
  const { configured } = gate.getAccessConfig();
  const session = configured
    ? gate.checkAccessSession(req)
    : { active: false };
  if (session.active) return null;
  if (!configured) {
    return {
      status: 503,
      json: { success: false, error: 'ACCESS_NOT_CONFIGURED' },
    };
  }
  return { status: 401, json: { success: false, error: 'ACCESS_REQUIRED' } };
}

// -------------------------------------------------------- req/res shim --
function decorateRes(res) {
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (obj) => {
    if (!res.hasHeader('Content-Type')) {
      res.setHeader('Content-Type', 'application/json');
    }
    res.end(JSON.stringify(obj));
    return res;
  };
  return res;
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > BODY_LIMIT) {
      const err = new Error('Payload too large');
      err.status = 413;
      throw err;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

// ------------------------------------------------------------- server --
const server = http.createServer(async (req, res) => {
  decorateRes(res);
  const url = new URL(req.url || '/', 'http://internal');
  const pathname = url.pathname;

  if (pathname === '/health') {
    return res.status(200).json({
      ok: true,
      service: 'ezrab-api',
      time: new Date().toISOString(),
    });
  }

  const route = ROUTES.map((r) => ({ ...r, m: pathname.match(r.pattern) })).find(
    (r) => r.m,
  );
  if (!route) {
    return res
      .status(404)
      .json({ success: false, error: 'NOT_FOUND', path: pathname });
  }

  // Query string -> req.query (Vercel melakukan hal yang sama), termasuk
  // parameter segmen dinamis [action].
  req.query = Object.fromEntries(url.searchParams.entries());
  if (route.param) req.query[route.param] = route.m[1];

  // Gerbang akses (pengganti Edge Middleware untuk permukaan API).
  try {
    const gateAnswer = await applyGate(req, pathname);
    if (gateAnswer) return res.status(gateAnswer.status).json(gateAnswer.json);
  } catch (err) {
    console.error('[runner] gate error', err);
    return res
      .status(503)
      .json({ success: false, error: 'ACCESS_NOT_CONFIGURED' });
  }

  // Body: Vercel menyerahkan req.body ter-parse untuk JSON. Handler juga
  // toleran terhadap stream mentah (readJsonBody membaca stream bila
  // req.body kosong), tetapi menyamai perilaku Vercel lebih aman:
  // parse di sini, simpan mentah bila bukan JSON agar handler yang
  // membaca string tetap bekerja.
  const contentType = String(req.headers['content-type'] || '');
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    try {
      const raw = await readBody(req);
      if (raw) {
        if (contentType.includes('application/json')) {
          try {
            req.body = JSON.parse(raw);
          } catch {
            req.body = raw;
          }
        } else {
          req.body = raw;
        }
      } else {
        req.body = undefined;
      }
    } catch (err) {
      return res
        .status(err.status || 400)
        .json({ success: false, error: 'PAYLOAD_TOO_LARGE' });
    }
  }

  try {
    const handler = await loadHandler(route.file);
    await handler(req, res);
    if (!res.writableEnded) res.end();
  } catch (err) {
    console.error('[runner] handler error', route.file, err);
    if (!res.writableEnded) {
      res
        .status(500)
        .json({ success: false, error: 'INTERNAL_ERROR' });
    }
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[ezrab-api] listening on http://${HOST}:${PORT} (health: /health)`);
});

export const ROUTE_FILES = ROUTES.map((r) => r.file);
