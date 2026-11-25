/**
 * B1 — Batch 1 (Authentication & security, P0) regression suite.
 *
 * Pins the three B1 fixes so they cannot silently regress:
 *  - PE-5: the dead browser migration `migrateLocalStorageToSupabase`
 *    (which self-assigned SUPER_ADMIN from the browser) is disabled
 *    fail-closed. Source audit + runtime refusal.
 *  - PE-7: server/ legacy header-trust mode is explicit opt-in only —
 *    the default is trusted (fail-closed). Source audit + runtime
 *    default-deny + explicit-opt-in-still-works.
 *  - OD-A4-1: the 20261124 RLS hardening approver set is global admins
 *    + workspace SUPER_ADMINs only (ESTIMATOR no longer approves).
 *    Source audit only — the behavioral verification is the local
 *    PostgreSQL 16 run of supabase/tests/p1_rls_negative_tests.sql
 *    (Q-6a–Q-6s, 26/26, logs in the B1 evidence folder); that suite
 *    needs psql, not tsx.
 *
 * Plain-tsx suite (no vitest import): run with
 *   npx --yes tsx src/test/b1AuthHardening.test.ts
 * from the repo root.
 */
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'node:url';
import { migrateLocalStorageToSupabase } from '../services/supabaseMigration';
import { AuthFoundation } from '../../server/auth/authFoundation';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');

let failures = 0;
let passes = 0;

async function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn();
    passes++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failures++;
    console.log(`  ✗ ${name}`);
    console.log(`    ${(e as Error).message}`);
  }
}

function ok(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}

const readSrc = (rel: string): string =>
  fs.readFileSync(path.join(repoRoot, rel), 'utf8');

async function main(): Promise<void> {
  console.log('B1 — Auth hardening regressions (PE-5, PE-7, OD-A4-1):');

  console.log('\n[PE-5] Browser migration disabled (fail-closed):');
  const migSrc = readSrc('src/services/supabaseMigration.ts');
  await test('no SUPER_ADMIN self-assign remains in the file', () => {
    ok(!migSrc.includes("role: 'SUPER_ADMIN'"), 'SUPER_ADMIN self-assign still present');
    ok(!migSrc.includes("from('workspace_members')"), 'workspace_members insert still present');
    ok(!migSrc.includes('getSupabaseClient'), 'browser Supabase client still used by the migration');
  });
  await test('file states the disablement (B1/PE-5)', () => {
    ok(migSrc.includes('DINONAKTIFKAN'), 'disablement marker missing');
    ok(migSrc.includes('PE-5'), 'PE-5 reference missing');
  });
  await test('calling the migration refuses without touching anything', async () => {
    const res = await migrateLocalStorageToSupabase();
    ok(res.ok === false, `expected ok:false, got ${JSON.stringify(res)}`);
    ok(res.migrated === 0, `expected migrated:0, got ${res.migrated}`);
    ok(
      res.errors.length === 1 && res.errors[0].includes('DINONAKTIFKAN'),
      `expected a single DINONAKTIFKAN error, got ${JSON.stringify(res.errors)}`
    );
  });

  console.log('\n[PE-7] Legacy header-trust is explicit opt-in only:');
  const foundationSrc = readSrc('server/auth/authFoundation.ts');
  await test('no NODE_ENV-based legacy default remains', () => {
    ok(
      !foundationSrc.includes("NODE_ENV === 'production' ? 'trusted' : 'legacy-development'"),
      'old NODE_ENV-based legacy default still present'
    );
  });
  await test('default mode is trusted; legacy needs explicit opt-in', () => {
    ok(
      foundationSrc.includes("if (value === 'legacy-development' || value === 'trusted') return value;"),
      'explicit-mode passthrough missing'
    );
    ok(foundationSrc.includes("return 'trusted';"), 'trusted default missing');
  });
  await test('default (no opt-in, non-production, no Supabase) denies forged headers', async () => {
    const saved = {
      mode: process.env.EZRAB_AUTH_MODE,
      nodeEnv: process.env.NODE_ENV,
      url: process.env.SUPABASE_URL,
      secret: process.env.SUPABASE_SECRET_KEY,
      service: process.env.SUPABASE_SERVICE_ROLE_KEY,
      pub: process.env.SUPABASE_PUBLISHABLE_KEY,
      anon: process.env.SUPABASE_ANON_KEY,
    };
    delete process.env.EZRAB_AUTH_MODE;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SECRET_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SUPABASE_PUBLISHABLE_KEY;
    delete process.env.SUPABASE_ANON_KEY;
    process.env.NODE_ENV = 'test';
    try {
      const foundation = new AuthFoundation();
      let code = '';
      try {
        await foundation.authenticate({ 'x-user-id': 'attacker', 'x-user-role': 'SUPER_ADMIN' });
      } catch (e) {
        code = (e as Error).message;
      }
      ok(code === 'AUTH_REQUIRED', `expected AUTH_REQUIRED, got '${code}'`);
    } finally {
      if (saved.mode === undefined) delete process.env.EZRAB_AUTH_MODE;
      else process.env.EZRAB_AUTH_MODE = saved.mode;
      if (saved.nodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = saved.nodeEnv;
      if (saved.url === undefined) delete process.env.SUPABASE_URL;
      else process.env.SUPABASE_URL = saved.url;
      if (saved.secret === undefined) delete process.env.SUPABASE_SECRET_KEY;
      else process.env.SUPABASE_SECRET_KEY = saved.secret;
      if (saved.service === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      else process.env.SUPABASE_SERVICE_ROLE_KEY = saved.service;
      if (saved.pub === undefined) delete process.env.SUPABASE_PUBLISHABLE_KEY;
      else process.env.SUPABASE_PUBLISHABLE_KEY = saved.pub;
      if (saved.anon === undefined) delete process.env.SUPABASE_ANON_KEY;
      else process.env.SUPABASE_ANON_KEY = saved.anon;
    }
  });
  await test('explicit legacy opt-in still resolves headers (local-dev escape hatch)', async () => {
    const savedMode = process.env.EZRAB_AUTH_MODE;
    process.env.EZRAB_AUTH_MODE = 'legacy-development';
    try {
      const foundation = new AuthFoundation();
      const id = await foundation.authenticate({ 'x-user-id': 'dev-user', 'x-user-role': 'ESTIMATOR' });
      ok(id.userId === 'dev-user' && id.role === 'ESTIMATOR', `unexpected legacy identity ${JSON.stringify(id)}`);
      ok(id.source === 'legacy_development', `unexpected source ${id.source}`);
    } finally {
      if (savedMode === undefined) delete process.env.EZRAB_AUTH_MODE;
      else process.env.EZRAB_AUTH_MODE = savedMode;
    }
  });

  console.log('\n[OD-A4-1] Approver set is global admins + workspace SUPER_ADMINs:');
  const hardeningSrc = readSrc('supabase/migrations/20261124_price_assumptions_rls_hardening.sql');
  await test('approver function calls ezrab_is_global_admin()', () => {
    ok(
      hardeningSrc.includes('public.ezrab_is_global_admin()'),
      'global-admin check missing from the approver function'
    );
  });
  await test('ESTIMATOR is no longer an approver role', () => {
    ok(
      !hardeningSrc.includes("role in ('SUPER_ADMIN', 'ESTIMATOR')"),
      'ESTIMATOR still listed as an approver role'
    );
    ok(hardeningSrc.includes("role = 'SUPER_ADMIN'"), 'SUPER_ADMIN-only role check missing');
  });
  await test('preflight requires 20261116 (global_admins) before apply', () => {
    ok(hardeningSrc.includes("table_name = 'global_admins'"), 'global_admins preflight check missing');
    ok(hardeningSrc.includes('ezrab_is_global_admin'), 'ezrab_is_global_admin preflight check missing');
  });
  const rlsTestsSrc = readSrc('supabase/tests/p1_rls_negative_tests.sql');
  await test('negative tests pin the new approver set (Q-6r/Q-6s)', () => {
    ok(rlsTestsSrc.includes('Q-6r'), 'Q-6r (ESTIMATOR denied) missing from the test file');
    ok(rlsTestsSrc.includes('Q-6s'), 'Q-6s (global admin approves) missing from the test file');
    ok(
      rlsTestsSrc.includes("current_setting('p1.ws_b')::uuid, current_setting('p1.uid_b')::uuid, 'SUPER_ADMIN'"),
      'test approver B is not SUPER_ADMIN'
    );
    ok(
      rlsTestsSrc.includes('insert into public.global_admins'),
      'global-admin setup row missing from the test file'
    );
  });

  console.log(`\nb1AuthHardening.test: ${passes} PASS, ${failures} FAIL`);
  if (failures > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
