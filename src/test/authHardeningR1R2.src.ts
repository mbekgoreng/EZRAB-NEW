// Suite: auth hardening R1 (default-deny demo capabilities) + R2
// (centralized logout + passcode logout endpoint).
// Gaya harness sama seperti suite src/test lainnya (plain-tsx, tanpa vitest).
// Tidak ada jaringan, database, Vercel, atau Supabase live: storage dan
// fetch di-mock; endpoint API diuji lewat handler aslinya dengan req/res mock.
//
// Jalankan:
//   npx --yes esbuild src/test/authHardeningR1R2.src.ts --bundle --platform=node --format=cjs --outfile=/tmp/auth-r1r2.cjs && node /tmp/auth-r1r2.cjs
import { resolveCapability } from '../auth/roleAccounts';
import { readStoredSession, ROLE_STORAGE_KEY } from '../auth/RoleContext';
import {
  clearTransientSessionStorage,
  logoutAll,
  logoutSessionsOnly,
  TRANSIENT_SESSION_KEYS,
} from '../auth/logoutAll';
import {
  beginLogout,
  clearLogoutInProgress,
  getLogoutGeneration,
  isLogoutInProgress,
} from '../auth/sessionBoundary';
// @ts-ignore — modul JS tanpa deklarasi tipe (pola secureInvitation.test.ts)
import accessHandler from '../../api/access/[action].js';

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, extra?: string): void {
  if (cond) {
    pass++;
    console.log(`  PASS ${name}`);
  } else {
    fail++;
    console.log(`  FAIL ${name}${extra ? ` — ${extra}` : ''}`);
  }
}

function mockStorage(initial: Record<string, string> = {}) {
  const store = new Map<string, string>(Object.entries(initial));
  return {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => {
      store.set(k, v);
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
    has: (k: string) => store.has(k),
  };
}

function mockRes() {
  const headers: Record<string, string> = {};
  const res: any = {
    headers,
    statusCode: 0,
    body: undefined,
    ended: false,
    setHeader(k: string, v: string) {
      headers[k] = v;
    },
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(obj: unknown) {
      res.body = obj;
      return res;
    },
    end() {
      res.ended = true;
      return res;
    },
  };
  return res;
}

const TEAM_SESSION = { roleId: 'team' };
const ESTIMATOR_SESSION = { roleId: 'estimator' };

async function main(): Promise<void> {
  console.log('=== R1.1 tanpa sesi: semua capability ditolak ===');
  check('tanpa sesi + view-dashboard -> false', resolveCapability(null, 'view-dashboard', false) === false);
  check('tanpa sesi + manage-users (pin true pun) -> false', resolveCapability(null, 'manage-users', true) === false);

  console.log('=== R1.2 sesi tersimpan malformed / role tak dikenal -> null ===');
  for (const [label, raw] of [
    ['bukan JSON', 'bukan-json{{{'],
    ['roleId bukan string', '{"roleId":123}'],
    ['roleId tak dikenal', '{"roleId":"bukan-role"}'],
    ['objek kosong', '{}'],
    ['string kosong', ''],
  ] as const) {
    (globalThis as any).localStorage = mockStorage(raw ? { [ROLE_STORAGE_KEY]: raw } : {});
    check(`readStoredSession(${label}) -> null`, readStoredSession() === null);
  }

  console.log('=== R1.3 sesi team palsu: badge pulih, capability sensitif ditolak ===');
  (globalThis as any).localStorage = mockStorage({
    [ROLE_STORAGE_KEY]: JSON.stringify({ roleId: 'team', name: 'Palsu', title: 'x', loginAt: '2026-10-28T00:00:00.000Z' }),
  });
  const forged = readStoredSession();
  check('sesi team palsu terbaca (badge pulih — didokumentasikan)', forged?.roleId === 'team');
  check('team palsu + manage-users (tanpa PIN tab) -> false', resolveCapability(forged, 'manage-users', false) === false);
  check('team palsu + manage-security (tanpa PIN tab) -> false', resolveCapability(forged, 'manage-security', false) === false);
  check('team palsu + verify-prices (tanpa PIN tab) -> false', resolveCapability(forged, 'verify-prices', false) === false);
  check('team palsu + view-dashboard -> true (non-sensitif)', resolveCapability(forged, 'view-dashboard', false) === true);
  check('team palsu + edit-estimate -> true (non-sensitif)', resolveCapability(forged, 'edit-estimate', false) === true);

  console.log('=== R1.4 capability tak dikenal / tak dimiliki -> false ===');
  check("capability 'terbang-ke-bulan' + team + PIN -> false", resolveCapability(TEAM_SESSION, 'terbang-ke-bulan', true) === false);
  check('manage-blog + team + PIN -> false (tak dimiliki role demo mana pun)', resolveCapability(TEAM_SESSION, 'manage-blog', true) === false);

  console.log('=== R1.5 capability demo yang sah (PIN di tab ini) ===');
  check('estimator + PIN + verify-prices -> true', resolveCapability(ESTIMATOR_SESSION, 'verify-prices', true) === true);
  check('estimator + PIN + manage-users -> false', resolveCapability(ESTIMATOR_SESSION, 'manage-users', true) === false);
  check('qs + PIN + verify-prices -> false', resolveCapability({ roleId: 'qs' }, 'verify-prices', true) === false);
  check('kontraktor + PIN + edit-estimate -> false', resolveCapability({ roleId: 'kontraktor' }, 'edit-estimate', true) === false);
  check('kontraktor + PIN + export-doc -> true', resolveCapability({ roleId: 'kontraktor' }, 'export-doc', true) === true);
  check('team + PIN + manage-users -> true', resolveCapability(TEAM_SESSION, 'manage-users', true) === true);
  check('team + PIN + manage-security -> true', resolveCapability(TEAM_SESSION, 'manage-security', true) === true);

  console.log('=== R2.1 clearTransient: hanya kunci transien yang hilang ===');
  const store1 = mockStorage({
    ezrab_ai_workspace_sessions_v2: '[...]',
    ezrab_prod_active_project_id: 'p1',
    ezrab_prod_projects: '[...]',
    ezrab_theme: 'dark',
    ezrab_onboarding_done_v1: '1',
    ezrab_project_backups: '[...]',
  });
  const cleared = clearTransientSessionStorage(store1 as any);
  check('transien terhapus (2 kunci)', cleared.length === 2 && !store1.has('ezrab_ai_workspace_sessions_v2') && !store1.has('ezrab_prod_active_project_id'));
  check('badan proyek utuh', store1.has('ezrab_prod_projects'));
  check('preferensi utuh (tema, onboarding)', store1.has('ezrab_theme') && store1.has('ezrab_onboarding_done_v1'));
  check('backup utuh', store1.has('ezrab_project_backups'));
  check('daftar transien tidak memuat badan proyek/tema', !TRANSIENT_SESSION_KEYS.includes('ezrab_prod_projects') && !TRANSIENT_SESSION_KEYS.includes('ezrab_theme'));

  console.log('=== R2.2 logoutAll sukses penuh ===');
  clearLogoutInProgress();
  const store2 = mockStorage({
    [ROLE_STORAGE_KEY]: JSON.stringify({ roleId: 'team' }),
    ezrab_ai_workspace_sessions_v2: '[...]',
    ezrab_prod_active_project_id: 'p1',
    ezrab_prod_projects: '[...]',
  });
  (globalThis as any).localStorage = store2;
  let roleCalled = false;
  let signOutCalled = false;
  const fetchCalls: Array<{ url: string; method: string }> = [];
  const ok = await logoutAll({
    logoutRole: () => {
      roleCalled = true;
    },
    hasSupabaseSession: true,
    signOutSupabase: async () => {
      signOutCalled = true;
    },
    fetchImpl: (async (url: string, init: any) => {
      fetchCalls.push({ url, method: init?.method });
      return { ok: true, status: 200 };
    }) as any,
  });
  check('role callback dipanggil', roleCalled);
  check('signOut dipanggil', signOutCalled);
  check('passcode logout POST /api/access/logout', fetchCalls.length === 1 && fetchCalls[0].url === '/api/access/logout' && fetchCalls[0].method === 'POST');
  check('kunci role terhapus', !store2.has(ROLE_STORAGE_KEY));
  check('transien terhapus', !store2.has('ezrab_ai_workspace_sessions_v2') && !store2.has('ezrab_prod_active_project_id'));
  check('badan proyek TIDAK terhapus', store2.has('ezrab_prod_projects'));
  check('result allAttemptedOk true', ok.allAttemptedOk === true && ok.errors.length === 0);
  check('flag batas sesi aktif', isLogoutInProgress() === true);
  check('generasi logout bertambah', getLogoutGeneration() >= 1);
  clearLogoutInProgress();
  check('flag bersih setelah clear', isLogoutInProgress() === false);

  console.log('=== R2.3 logoutAll: Supabase gagal -> tetap lanjut, klaim jujur ===');
  const store3 = mockStorage({ [ROLE_STORAGE_KEY]: 'x' });
  (globalThis as any).localStorage = store3;
  const partial = await logoutAll({
    logoutRole: () => undefined,
    hasSupabaseSession: true,
    signOutSupabase: async () => {
      throw new Error('jaringan putus');
    },
    fetchImpl: (async () => ({ ok: true, status: 200 })) as any,
  });
  check('supabaseOk false', partial.supabaseOk === false);
  check('allAttemptedOk false (tidak klaim palsu)', partial.allAttemptedOk === false);
  check('error tercatat', partial.errors.length >= 1);
  check('role tetap terhapus meski Supabase gagal', !store3.has(ROLE_STORAGE_KEY) && partial.roleCleared === true);
  check('passcode tetap dicoba meski Supabase gagal', partial.passcodeAttempted === true);
  clearLogoutInProgress();

  console.log('=== R2.4 logoutAll: passcode gagal -> klaim jujur ===');
  const partial2 = await logoutAll({
    logoutRole: () => undefined,
    hasSupabaseSession: false,
    fetchImpl: (async () => {
      throw new Error('fetch gagal');
    }) as any,
  });
  check('passcodeOk false', partial2.passcodeOk === false);
  check('allAttemptedOk false', partial2.allAttemptedOk === false);
  check('supabase tidak dicoba tanpa sesi', partial2.supabaseAttempted === false);
  clearLogoutInProgress();

  console.log('=== R2.5 logoutSessionsOnly: sesi saja, transien utuh ===');
  const store5 = mockStorage({ ezrab_ai_workspace_sessions_v2: '[...]', [ROLE_STORAGE_KEY]: 'x' });
  (globalThis as any).localStorage = store5;
  const only = await logoutSessionsOnly({
    logoutRole: () => undefined,
    hasSupabaseSession: false,
    fetchImpl: (async () => ({ ok: true, status: 200 })) as any,
  });
  check('transientCleared kosong', only.transientCleared.length === 0);
  check('sesi AI TIDAK terhapus (sessions-only)', store5.has('ezrab_ai_workspace_sessions_v2'));
  check('kunci role terhapus', !store5.has(ROLE_STORAGE_KEY));
  clearLogoutInProgress();

  console.log('=== R2.6 endpoint POST /api/access/logout ===');
  const noCookie = mockRes();
  await accessHandler({ method: 'POST', query: { action: 'logout' }, headers: {} }, noCookie);
  check('tanpa cookie -> 200 success', noCookie.statusCode === 200 && noCookie.body?.success === true);
  check('Set-Cookie penghapus (Max-Age=0, Path=/, HttpOnly, SameSite=Lax)', (() => {
    const c = String(noCookie.headers['Set-Cookie'] || '');
    return c.startsWith('ezrab_access=;') && c.includes('Path=/') && c.includes('HttpOnly') && c.includes('SameSite=Lax') && c.includes('Max-Age=0');
  })());
  const badCookie = mockRes();
  await accessHandler({ method: 'POST', query: { action: 'logout' }, headers: { cookie: 'ezrab_access=ruksak' } }, badCookie);
  check('cookie rusak -> 200 + clear header', badCookie.statusCode === 200 && String(badCookie.headers['Set-Cookie'] || '').includes('Max-Age=0'));
  const goodCookie = mockRes();
  await accessHandler({ method: 'POST', query: { action: 'logout' }, headers: { cookie: 'ezrab_access=v1.12345.abc' } }, goodCookie);
  check('cookie tampak valid -> 200 + clear header', goodCookie.statusCode === 200 && String(goodCookie.headers['Set-Cookie'] || '').includes('Max-Age=0'));
  const getLogout = mockRes();
  await accessHandler({ method: 'GET', query: { action: 'logout' }, headers: {} }, getLogout);
  check('GET logout -> 405', getLogout.statusCode === 405);
  const unknown = mockRes();
  await accessHandler({ method: 'POST', query: { action: 'tidak-ada' }, headers: {} }, unknown);
  check('aksi tak dikenal -> 404', unknown.statusCode === 404);
  const options = mockRes();
  await accessHandler({ method: 'OPTIONS', query: { action: 'logout' }, headers: {} }, options);
  check('OPTIONS -> 200 ended', options.statusCode === 200 && options.ended === true);

  console.log(`\nR1+R2: ${pass} lulus, ${fail} gagal`);
  if (fail > 0) process.exit(1);
}

void main();
