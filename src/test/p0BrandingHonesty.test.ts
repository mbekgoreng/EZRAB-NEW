/**
 * P0-B extension — branding identity honesty (no network).
 * Run: npx tsx src/test/p0BrandingHonesty.test.ts
 *
 * Regression: brandingClient.getLocalFallback() previously returned a
 * fabricated company ("PT EZRAB KONSTRUKSI DIGITAL", fake NPWP/phone/
 * director), which flowed into PDF/Excel exports as if it were the user's
 * real company — bypassing the P0-B exporter fix.
 */
import { BrandingClient } from '../services/brandingClient';

let failures = 0;
const test = (name: string, fn: () => void) => {
  try { fn(); console.log(`✓ ${name}`); }
  catch (e: any) { failures++; console.error(`✗ ${name}: ${e.message}`); }
};
const ok = (c: boolean, m: string) => { if (!c) throw new Error(m); };

const FORBIDDEN = [
  'PT EZRAB KONSTRUKSI DIGITAL',
  'SCBD District 8',
  '01.234.567.8-012.000',
  'Ahmad Yusuf',
  'Hendra Kusuma',
  '021-5088-9900',
  '+62 21 5088-9900',
  'ezrab.co.id',
];

test('local fallback contains NO fabricated identity', () => {
  const c = new BrandingClient();
  const b = (c as any).getLocalFallback('ws-test-honesty');
  const blob = JSON.stringify(b);
  for (const s of FORBIDDEN) {
    ok(!blob.includes(s), `fabricated string still present: "${s}"`);
  }
});

test('identity fields are empty (honest "belum diisi")', () => {
  const c = new BrandingClient();
  const b = (c as any).getLocalFallback('ws-test-honesty');
  for (const f of ['companyName', 'address', 'phone', 'email', 'website', 'taxNumber', 'directorName', 'leadEstimatorName'] as const) {
    ok(b[f] === '', `field ${f} should be empty, got "${b[f]}"`);
  }
});

test('non-identity app config defaults are preserved', () => {
  const c = new BrandingClient();
  const b = (c as any).getLocalFallback('ws-test-honesty');
  ok(b.workspaceId === 'ws-test-honesty', 'workspaceId must pass through');
  ok(typeof b.subscriptionPlan === 'string', 'subscriptionPlan default must exist');
});

console.log(failures === 0 ? '\nALL BRANDING HONESTY TESTS PASSED' : `\n${failures} TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
