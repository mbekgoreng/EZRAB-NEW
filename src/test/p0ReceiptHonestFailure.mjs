/**
 * P0 data-integrity — receipt OCR honest failure (no network).
 * Run: node src/test/p0ReceiptHonestFailure.mjs
 *
 * Regression test: when /api/ai/receipt/scan is unavailable, analyzeReceipt
 * MUST fail honestly instead of fabricating supplier names, prices, and
 * invoice numbers (previously returned mock data with confidence HIGH).
 */
import { register } from 'node:module';

// Compile TS on the fly via tsx if available; fallback: use tsx loader.
// We import the TS source directly — tsx must be installed (it is, per package.json).
const { analyzeReceipt, buildMockReceiptResultForTests, DEFAULT_MASTER_PRICE_CATALOG } =
  await import('../services/aiReceiptIntelligence.ts');

let failures = 0;
const test = async (name, fn) => {
  try { await fn(); console.log(`✓ ${name}`); }
  catch (e) { failures++; console.error(`✗ ${name}: ${e.message}`); }
};
const ok = (c, m) => { if (!c) throw new Error(m); };

await test('honest failure: no mock flag => success:false, no fabricated data', async () => {
  const r = await analyzeReceipt({ projectId: 'P1', fileName: 'nota.jpg', fileData: 'dummy' });
  ok(r.success === false, 'must fail, got success=true');
  ok(!r.result, 'must not return a fabricated result');
  ok(typeof r.error === 'string' && r.error.includes('tidak tersedia'), 'error must be honest, got: ' + r.error);
});

await test('explicit test opt-in still yields mock structure for unit tests', async () => {
  const r = await analyzeReceipt({
    projectId: 'P1', fileName: 'nota.jpg', fileData: 'dummy', __allowMockFallback: true,
  });
  ok(r.success === true && r.result, 'opt-in should succeed');
  ok(r.result.lineItems.length > 0, 'mock should have line items');
});

await test('mock builder is exported separately and marked test-only', async () => {
  const built = buildMockReceiptResultForTests(
    { projectId: 'P1', fileName: 'nota.jpg', fileData: 'dummy' },
    1234,
    DEFAULT_MASTER_PRICE_CATALOG
  );
  ok(built && built.lineItems.length > 0, 'builder should work standalone');
});

console.log(failures === 0 ? '\nALL RECEIPT HONEST-FAILURE TESTS PASSED' : `\n${failures} TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
