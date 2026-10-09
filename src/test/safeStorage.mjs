/**
 * EZRAB FASE 5C TASK 6 — Safe storage test (src/test/safeStorage.mjs)
 *
 * Verifies QuotaExceededError handling:
 * - Write failure returns ok:false with reason (never throws).
 * - Old data is never auto-deleted.
 * - Serialization failure is reported honestly.
 */

let pass = 0, fail = 0;
function check(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}

// Minimal in-memory localStorage mock with quota simulation
function makeMockStorage({ quotaError = false } = {}) {
  const data = new Map();
  return {
    _data: data,
    setItem(k, v) {
      if (quotaError) {
        const e = new Error('Quota exceeded');
        e.name = 'QuotaExceededError';
        throw e;
      }
      data.set(k, v);
    },
    getItem(k) { return data.has(k) ? data.get(k) : null; },
  };
}

function safeSetItem(storage, key, value) {
  try {
    storage.setItem(key, value);
    return { ok: true };
  } catch (err) {
    const reason = err?.name === 'QuotaExceededError' ? 'QUOTA_EXCEEDED' : 'UNKNOWN';
    return { ok: false, reason, message: 'Penyimpanan gagal.' };
  }
}

console.log('SAFE STORAGE');
const okStore = makeMockStorage();
const r1 = safeSetItem(okStore, 'k1', 'v1');
check('S1 normal write ok:true', r1.ok === true);
check('S2 data actually stored', okStore.getItem('k1') === 'v1');

const fullStore = makeMockStorage({ quotaError: true });
fullStore._data.set('existing', 'keep-me');
const r2 = safeSetItem(fullStore, 'k2', 'v2');
check('S3 quota error -> ok:false', r2.ok === false);
check('S4 quota error reason classified', r2.reason === 'QUOTA_EXCEEDED');
check('S5 old data NOT deleted on failure', fullStore.getItem('existing') === 'keep-me');
check('S6 failed write not stored', fullStore.getItem('k2') === null);
check('S7 user message present', typeof r2.message === 'string' && r2.message.length > 0);

// Serialization failure
function safeSetJSON(storage, key, data) {
  let s;
  try { s = JSON.stringify(data); }
  catch { return { ok: false, reason: 'SERIALIZE_ERROR' }; }
  return safeSetItem(storage, key, s);
}
const circular = {};
circular.self = circular;
const r3 = safeSetJSON(okStore, 'k3', circular);
check('S8 circular JSON -> SERIALIZE_ERROR', r3.ok === false && r3.reason === 'SERIALIZE_ERROR');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
