/**
 * Tests: Auth mode fail-safe resolution + demo PIN login trace
 * (audit auth 2026-10-17).
 *
 * Verifies:
 * 1. AUTH_ENABLED=false  → 'open' (perilaku hari ini, apa pun env-nya)
 * 2. AUTH_ENABLED=true + Supabase valid   → 'real-login'
 * 3. AUTH_ENABLED=true + Supabase KOSONG   → 'failsafe-demo' (tidak terkunci)
 * 4. AUTH_ENABLED=true + Supabase setengah → 'failsafe-demo' (http, key pendek,
 *    placeholder — tidak boleh jadi 'real-login' dengan form login yang gagal)
 * 5. Demo PIN login (roleAccounts.verifyRolePin): 5 PIN demo diterima,
 *    PIN salah / format salah ditolak — jalur demo login tidak rusak.
 *
 * Run: npx tsx src/test/authMode.test.ts
 */
import {
  resolveAuthMode,
  isSupabaseReadyForAuth,
  isOpenAccessMode,
  type AuthEnvShape,
} from '../auth/authMode';
import { ROLE_ACCOUNTS, verifyRolePin } from '../auth/roleAccounts';

function assert(value: boolean, message: string): void {
  if (!value) throw new Error(`ASSERT FAILED: ${message}`);
}

const VALID_ENV: AuthEnvShape = {
  VITE_SUPABASE_URL: 'https://abcdefghijklmnop.supabase.co',
  VITE_SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.dummy-payload-signature-xyz',
};

export async function runAuthModeTests(): Promise<void> {
  // 1. Flag false → selalu 'open' (env valid maupun tidak)
  assert(resolveAuthMode(false, {}) === 'open', 'flag=false + env kosong harus open');
  assert(resolveAuthMode(false, VALID_ENV) === 'open', 'flag=false + env valid harus open');

  // 2. Flag true + Supabase valid → 'real-login'
  assert(resolveAuthMode(true, VALID_ENV) === 'real-login', 'flag=true + env valid harus real-login');
  assert(
    resolveAuthMode(true, {
      VITE_SUPABASE_URL: VALID_ENV.VITE_SUPABASE_URL,
      VITE_SUPABASE_PUBLISHABLE_KEY: VALID_ENV.VITE_SUPABASE_ANON_KEY,
    }) === 'real-login',
    'publishable key (bukan anon) juga diterima'
  );

  // 3. Flag true + env kosong → 'failsafe-demo' (owner tidak terkunci)
  assert(resolveAuthMode(true, {}) === 'failsafe-demo', 'flag=true + env kosong harus failsafe-demo');

  // 4. Konfigurasi setengah jadi → 'failsafe-demo', BUKAN 'real-login'
  const halfBaked: Array<[string, AuthEnvShape]> = [
    ['URL http (bukan https)', { VITE_SUPABASE_URL: 'http://localhost:54321', VITE_SUPABASE_ANON_KEY: VALID_ENV.VITE_SUPABASE_ANON_KEY }],
    ['URL https terlalu pendek', { VITE_SUPABASE_URL: 'https://x', VITE_SUPABASE_ANON_KEY: VALID_ENV.VITE_SUPABASE_ANON_KEY }],
    ['key placeholder pendek', { VITE_SUPABASE_URL: VALID_ENV.VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY: 'test-key' }],
    ['key kosong', { VITE_SUPABASE_URL: VALID_ENV.VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY: '' }],
    ['URL kosong + key valid', { VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: VALID_ENV.VITE_SUPABASE_ANON_KEY }],
    // Catatan: nilai valid yang hanya ber-spasi di sekitarnya BUKAN setengah jadi —
    // ia diterima setelah trim (diuji di bawah), jadi tidak ada di daftar ini.
  ];
  for (const [label, env] of halfBaked) {
    assert(
      resolveAuthMode(true, env) === 'failsafe-demo',
      `konfigurasi setengah (${label}) harus failsafe-demo`
    );
  }
  // Catatan: nilai ber-spasi valid tetap diterima setelah trim
  assert(
    isSupabaseReadyForAuth({
      VITE_SUPABASE_URL: `  ${VALID_ENV.VITE_SUPABASE_URL}  `,
      VITE_SUPABASE_ANON_KEY: ` ${VALID_ENV.VITE_SUPABASE_ANON_KEY} `,
    }) === true,
    'nilai valid ber-spasi harus diterima setelah trim'
  );

  // isOpenAccessMode: open & failsafe-demo terbuka; real-login tidak
  assert(isOpenAccessMode('open') === true, 'open = akses terbuka');
  assert(isOpenAccessMode('failsafe-demo') === true, 'failsafe-demo = akses terbuka');
  assert(isOpenAccessMode('real-login') === false, 'real-login = akses tertutup');

  // resolveAuthMode tidak pernah melempar (fail-safe default)
  assert(resolveAuthMode(true) === 'failsafe-demo', 'tanpa env (tsx/node) harus failsafe-demo');

  console.log('PASS authMode: flag/env matrix → open / real-login / failsafe-demo');
}

export async function runDemoPinTraceTests(): Promise<void> {
  // Trace jalur demo login: RoleLoginPanel → useRole().loginWithPin →
  // verifyRolePin(roleAccounts.ts). PIN diverifikasi sungguhan, bukan pajangan.
  assert(ROLE_ACCOUNTS.length === 5, 'harus ada 5 akun role demo');

  const expectedPins: Record<string, string> = {
    qs: '111111',
    estimator: '222222',
    kontraktor: '333333',
    konsultan: '444444',
    team: '555555',
  };
  for (const account of ROLE_ACCOUNTS) {
    const pin = expectedPins[account.id];
    assert(!!pin, `PIN terdokumentasi untuk role ${account.id}`);
    assert(verifyRolePin(account.id, pin) === true, `PIN demo role ${account.id} harus diterima`);
  }

  // PIN salah / format salah / role tak dikenal → ditolak
  assert(verifyRolePin('qs', '000000') === false, 'PIN salah harus ditolak');
  assert(verifyRolePin('qs', '11111') === false, 'PIN 5 digit harus ditolak');
  assert(verifyRolePin('qs', '1111111') === false, 'PIN 7 digit harus ditolak');
  assert(verifyRolePin('qs', ' 111111 ') === true, 'PIN valid ber-spasi diterima setelah trim');
  assert(verifyRolePin('qs', 'aaaaaa') === false, 'PIN non-digit harus ditolak');
  assert(verifyRolePin('qs', '222222') === false, 'PIN role lain harus ditolak');
  assert(verifyRolePin('tidak-ada', '111111') === false, 'role tak dikenal harus ditolak');
  assert(verifyRolePin('qs', '') === false, 'PIN kosong harus ditolak');

  console.log('PASS demoPin: 5 PIN demo diterima, PIN salah/format salah ditolak');
}

async function main(): Promise<void> {
  await runAuthModeTests();
  await runDemoPinTraceTests();
  console.log('PASS authMode.test.ts: semua uji fail-safe + trace demo login lulus');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
