/**
 * engine-status final-chain health check (O-01, Fast Track 2026-11-24).
 * Run: node src/test/engineStatusFinalChains.mjs
 *
 * Invokes the real handler with stubbed req/res and stubbed env — no live
 * provider is ever called. Pins:
 *  1. Only Crown+Atmo keys configured -> `ready`, all chains ready.
 *  2. Only LEGACY keys (Gemini/Atria/Dahl/gemini-oai/ZyRouter) -> `no_keys`,
 *     all chains false (previously a false `ready`).
 *  3. No keys -> `no_keys`.
 *  4. Only River -> `ready`; fast chains ready, deep chains NOT (deep
 *     chains are Atmo-only per the final spec).
 *  5. Numbered key forms work (CROWN_API_KEY_3 alone counts).
 *  6. Response leaks no provider/model names and no key counts; shape is
 *     exactly { success, status, chains, time }.
 *  7. Whitespace-only key values are ignored.
 *  8. Non-GET still 405 (pre-existing contract).
 */
import handler from '../../api/ai/engine-status.js';

let passed = 0;
let failed = 0;
const failures = [];
const check = (name, cond, detail) => {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; failures.push(name); console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); }
};

// Every env var the old AND new health check could read.
const KEY_VARS = [];
for (const [prefix, n] of [
  ['CROWN_API_KEY', 4], ['RIVER_API_KEY', 10], ['ATMO_API_KEY', 4],
  ['GEMINI_API_KEY', 6], ['ATRIA_API_KEY', 14], ['DAHL_API_KEY', 80],
  ['GEMINI_OAI_KEY', 12],
]) {
  KEY_VARS.push(prefix);
  for (let i = 1; i <= n; i++) KEY_VARS.push(`${prefix}_${i}`);
}
KEY_VARS.push('ZYROUTER_API_KEY', 'ZROUTER_API_KEY');

const saved = {};
for (const k of KEY_VARS) saved[k] = process.env[k];
function clearKeys() { for (const k of KEY_VARS) delete process.env[k]; }
function restoreKeys() {
  for (const k of KEY_VARS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
}

function mkReq(method = 'GET') {
  return { method, headers: {}, socket: { remoteAddress: '127.0.0.1' } };
}
function mkRes() {
  const res = { statusCode: 0, body: undefined, headers: {} };
  res.setHeader = (k, v) => { res.headers[k.toLowerCase()] = v; };
  res.status = (code) => {
    res.statusCode = code;
    return {
      json: (obj) => { res.body = obj; return res; },
      end: () => res,
    };
  };
  return res;
}
async function call(method = 'GET') {
  const res = mkRes();
  await handler(mkReq(method), res);
  return res;
}
const allChains = (b, expected) =>
  ['chatFast', 'chatDeep', 'dedFast', 'dedDeep', 'docai']
    .every((k) => b.chains[k] === expected[k]);

console.log('\n[1] final-chain readiness:');
clearKeys();
process.env.CROWN_API_KEY = 'k-crown';
process.env.ATMO_API_KEY = 'k-atmo';
{
  const r = await call();
  check('Crown+Atmo only -> status ready', r.statusCode === 200 && r.body.status === 'ready', JSON.stringify(r.body));
  check('Crown+Atmo only -> all 5 chains ready',
    allChains(r.body, { chatFast: true, chatDeep: true, dedFast: true, dedDeep: true, docai: true }),
    JSON.stringify(r.body.chains));
}

console.log('\n[2] legacy keys alone must NOT read ready:');
clearKeys();
process.env.GEMINI_API_KEY_1 = 'k-gemini';
process.env.ATRIA_API_KEY_1 = 'k-atria';
process.env.DAHL_API_KEY_1 = 'k-dahl';
process.env.GEMINI_OAI_KEY_1 = 'k-oai';
process.env.ZYROUTER_API_KEY = 'k-zy';
{
  const r = await call();
  check('legacy keys only -> status no_keys', r.body.status === 'no_keys', JSON.stringify(r.body));
  check('legacy keys only -> all 5 chains false',
    allChains(r.body, { chatFast: false, chatDeep: false, dedFast: false, dedDeep: false, docai: false }),
    JSON.stringify(r.body.chains));
}

console.log('\n[3] no keys:');
clearKeys();
{
  const r = await call();
  check('no keys -> status no_keys', r.body.status === 'no_keys', JSON.stringify(r.body));
  check('no keys -> all 5 chains false',
    allChains(r.body, { chatFast: false, chatDeep: false, dedFast: false, dedDeep: false, docai: false }),
    JSON.stringify(r.body.chains));
}

console.log('\n[4] per-chain split (deep chains are Atmo-only):');
clearKeys();
process.env.RIVER_API_KEY = 'k-river';
{
  const r = await call();
  check('River only -> status ready', r.body.status === 'ready', JSON.stringify(r.body));
  check('River only -> fast chains ready, deep chains NOT',
    allChains(r.body, { chatFast: true, chatDeep: false, dedFast: true, dedDeep: false, docai: true }),
    JSON.stringify(r.body.chains));
}
clearKeys();
process.env.CROWN_API_KEY_3 = 'k-crown-3';
{
  const r = await call();
  check('numbered Crown key (CROWN_API_KEY_3) counts -> ready', r.body.status === 'ready', JSON.stringify(r.body));
  check('Crown only -> deep chains NOT ready',
    r.body.chains.chatDeep === false && r.body.chains.dedDeep === false,
    JSON.stringify(r.body.chains));
}
clearKeys();
process.env.ATMO_API_KEY = 'k-atmo';
{
  const r = await call();
  check('Atmo only -> all 5 chains ready (Atmo is in every chain)',
    allChains(r.body, { chatFast: true, chatDeep: true, dedFast: true, dedDeep: true, docai: true }),
    JSON.stringify(r.body.chains));
}

console.log('\n[5] whitespace-only keys ignored:');
clearKeys();
process.env.CROWN_API_KEY = '   ';
{
  const r = await call();
  check('blank Crown key -> no_keys', r.body.status === 'no_keys', JSON.stringify(r.body));
}

console.log('\n[6] privacy + shape:');
clearKeys();
process.env.CROWN_API_KEY = 'k-crown';
process.env.RIVER_API_KEY_2 = 'k-river-2';
process.env.ATMO_API_KEY_1 = 'k-atmo-1';
{
  const r = await call();
  const raw = JSON.stringify(r.body).toLowerCase();
  const leaked = ['crown', 'river', 'atmo', 'gemini', 'zyrouter', 'zrouter',
    'atria', 'dahl', 'deepseek', 'gpt', 'minimax', 'glm', 'mistral', 'nemotron',
    'k-crown', 'k-river-2', 'k-atmo-1'].filter((s) => raw.includes(s));
  check('response leaks no provider/model names or key values', leaked.length === 0, `leaked: ${leaked.join(', ')}`);
  const keys = Object.keys(r.body).sort();
  check('response shape is exactly { success, status, chains, time }',
    JSON.stringify(keys) === JSON.stringify(['chains', 'status', 'success', 'time']),
    `keys: ${keys.join(', ')}`);
  check('success=true, status string, time ISO-parseable',
    r.body.success === true && typeof r.body.status === 'string' && !Number.isNaN(Date.parse(r.body.time)));
  check('chains has exactly the 5 feature keys, all booleans',
    JSON.stringify(Object.keys(r.body.chains).sort()) ===
      JSON.stringify(['chatDeep', 'chatFast', 'dedDeep', 'dedFast', 'docai']) &&
    Object.values(r.body.chains).every((v) => typeof v === 'boolean'),
    JSON.stringify(r.body.chains));
}

console.log('\n[7] pre-existing contract:');
clearKeys();
{
  const r = await call('POST');
  check('non-GET -> 405', r.statusCode === 405, `got ${r.statusCode}`);
}

restoreKeys();
console.log(`\nHasil: ${passed} lolos, ${failed} gagal`);
if (failed > 0) { console.log('GAGAL:', failures.join(' | ')); process.exit(1); }
console.log('SEMUA TEST ENGINE-STATUS FINAL CHAINS LOLOS');
