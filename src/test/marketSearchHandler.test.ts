/**
 * MARKET SEARCH HANDLER — tes kontrak ESM untuk POST /api/market/search.
 *
 * Latar: api/market/search.js dulunya CommonJS (require + module.exports)
 * di paket "type": "module" sehingga impornya crash
 * (ReferenceError: require is not defined in ES module scope) dan menggagalkan
 * apiEndpointInventory.test.ts. Setelah konversi ESM, tes ini mengunci
 * kontrak HTTP yang TIDAK berubah:
 *  - non-POST            -> 405 { error: 'METHOD_NOT_ALLOWED' }
 *  - materialName/baseUnit hilang -> 400 { error: 'MISSING_PARAMS: ...' }
 *  - provider resolve    -> 200 { candidates, isLive, searchedAt, limitations,
 *                           errorCode, errorMessage, provider }
 *  - error provider dikategorikan (AUTH_ERROR/RATE_LIMIT/PROVIDER_ERROR/
 *    TIMEOUT/NETWORK_ERROR) dan tetap HTTP 200 dengan errorCode terisi.
 *  - tanpa SERPER_API_KEY -> provider 'unavailable', candidates [],
 *    isLive false, errorCode null (jujur, bukan mock).
 *
 * Provider Serper diuji dengan stub global fetch — tidak ada jaringan nyata.
 * Jalankan: npx tsx src/test/marketSearchHandler.test.ts
 */

import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, cond: boolean, detail?: string): void {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    failures.push(name);
    console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`);
  }
}

const API_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../api');

type MockRes = {
  statusCode: number;
  body: any;
  status(code: number): MockRes;
  json(payload: any): MockRes;
};

function mockRes(): MockRes {
  const res: MockRes = {
    statusCode: 0,
    body: undefined,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(payload: any) {
      res.body = payload;
      return res;
    },
  };
  return res;
}

const savedKey = process.env.SERPER_API_KEY;
const savedFetch = globalThis.fetch;

function restoreEnv(): void {
  if (savedKey === undefined) delete process.env.SERPER_API_KEY;
  else process.env.SERPER_API_KEY = savedKey;
  globalThis.fetch = savedFetch;
}

console.log('\n[1] Impor ESM:');
const handlerMod = await import(join(API_DIR, 'market/search.js'));
check('api/market/search.js terimpor sebagai ESM', !!handlerMod);
check('default export adalah function', typeof handlerMod.default === 'function');
const handler = handlerMod.default as (req: any, res: any) => Promise<any>;

const providerMod = await import(join(API_DIR, '_lib/marketSearch/serperProvider.js'));
check('serperProvider.js terimpor sebagai ESM', !!providerMod);
check('createMarketSearchProvider adalah function', typeof providerMod.createMarketSearchProvider === 'function');

console.log('\n[2] Validasi method & input:');
{
  const res = mockRes();
  await handler({ method: 'GET', body: {} }, res);
  check('GET -> 405', res.statusCode === 405, `dapat ${res.statusCode}`);
  check('GET -> error METHOD_NOT_ALLOWED', res.body?.error === 'METHOD_NOT_ALLOWED');
}
{
  const res = mockRes();
  await handler({ method: 'POST', body: {} }, res);
  check('POST body kosong -> 400', res.statusCode === 400, `dapat ${res.statusCode}`);
  check(
    'POST body kosong -> MISSING_PARAMS',
    res.body?.error === 'MISSING_PARAMS: materialName dan baseUnit wajib.',
    res.body?.error,
  );
}
{
  const res = mockRes();
  await handler({ method: 'POST', body: { materialName: 'Semen' } }, res);
  check('POST tanpa baseUnit -> 400 MISSING_PARAMS', res.statusCode === 400 && String(res.body?.error).startsWith('MISSING_PARAMS'));
}
{
  const res = mockRes();
  await handler({ method: 'POST', body: undefined }, res);
  check('POST tanpa body -> 400 MISSING_PARAMS', res.statusCode === 400 && String(res.body?.error).startsWith('MISSING_PARAMS'));
}

console.log('\n[3] Tanpa SERPER_API_KEY -> provider unavailable (kontrak jujur):');
{
  delete process.env.SERPER_API_KEY;
  const res = mockRes();
  await handler({ method: 'POST', body: { materialName: 'Semen Portland', baseUnit: 'kg' } }, res);
  check('status 200', res.statusCode === 200, `dapat ${res.statusCode}`);
  check('provider = unavailable', res.body?.provider === 'unavailable', res.body?.provider);
  check('candidates = []', Array.isArray(res.body?.candidates) && res.body.candidates.length === 0);
  check('isLive = false', res.body?.isLive === false);
  check('errorCode = null', res.body?.errorCode === null);
  check('errorMessage = null', res.body?.errorMessage === null);
  check(
    'limitations jujur terisi',
    res.body?.limitations === 'Provider pencarian belum tersedia. Gunakan input manual atau saran AI.',
    res.body?.limitations,
  );
  check('searchedAt string ISO', typeof res.body?.searchedAt === 'string' && !Number.isNaN(Date.parse(res.body.searchedAt)));
}

console.log('\n[4] Dengan key + fetch stub sukses -> kandidat produk terparse:');
{
  process.env.SERPER_API_KEY = 'test-key-bukan-asli';
  globalThis.fetch = (async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      organic: [
        { title: 'Semen Tiga Roda 50kg', link: 'https://www.tokopedia.com/toko/semen', snippet: 'Harga Rp 65.000 per sak' },
        { title: 'Artikel blog tentang semen', link: 'https://example.com/blog/semen', snippet: 'Rp 1.000' },
      ],
    }),
  })) as any;
  const res = mockRes();
  await handler(
    { method: 'POST', body: { materialName: 'Semen', baseUnit: 'kg', region: 'Jakarta', limit: 10 } },
    res,
  );
  check('status 200', res.statusCode === 200, `dapat ${res.statusCode}`);
  check('provider = serper', res.body?.provider === 'serper', res.body?.provider);
  check('isLive = true', res.body?.isLive === true);
  check('errorCode = null', res.body?.errorCode === null);
  check('hanya kandidat produk (blog terfilter)', res.body?.candidates?.length === 1, `dapat ${res.body?.candidates?.length}`);
  check('sellerName dari hostname', res.body?.candidates?.[0]?.sellerName === 'tokopedia.com', res.body?.candidates?.[0]?.sellerName);
  check('listedPrice terekstrak dari snippet', res.body?.candidates?.[0]?.listedPrice === 65000, String(res.body?.candidates?.[0]?.listedPrice));
}

console.log('\n[5] Kategori error provider (tetap HTTP 200, errorCode terisi):');
async function errorCase(name: string, fetchImpl: any, expectedCode: string): Promise<void> {
  process.env.SERPER_API_KEY = 'test-key-bukan-asli';
  globalThis.fetch = fetchImpl;
  const res = mockRes();
  await handler({ method: 'POST', body: { materialName: 'Semen', baseUnit: 'kg' } }, res);
  check(`${name} -> 200`, res.statusCode === 200, `dapat ${res.statusCode}`);
  check(`${name} -> errorCode ${expectedCode}`, res.body?.errorCode === expectedCode, res.body?.errorCode);
  check(`${name} -> candidates [] & isLive false`, res.body?.candidates?.length === 0 && res.body?.isLive === false);
  check(`${name} -> provider serper`, res.body?.provider === 'serper');
}
await errorCase('HTTP 401', (async () => ({ ok: false, status: 401, json: async () => ({}) })) as any, 'AUTH_ERROR');
await errorCase('HTTP 429', (async () => ({ ok: false, status: 429, json: async () => ({}) })) as any, 'RATE_LIMIT');
await errorCase('HTTP 503', (async () => ({ ok: false, status: 503, json: async () => ({}) })) as any, 'PROVIDER_ERROR');
await errorCase(
  'fetch abort',
  (async () => {
    const e = new Error('The operation was aborted');
    e.name = 'AbortError';
    throw e;
  }) as any,
  'TIMEOUT',
);
await errorCase(
  'fetch throw generik',
  (async () => {
    throw new Error('socket hang up');
  }) as any,
  'NETWORK_ERROR',
);

restoreEnv();

console.log(`\nHasil: ${passed} lolos, ${failed} gagal`);
if (failed > 0) {
  console.log('GAGAL:', failures.join(', '));
  process.exit(1);
}
console.log('SEMUA TEST MARKET SEARCH HANDLER LOLOS');
