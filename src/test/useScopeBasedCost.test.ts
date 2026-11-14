/**
 * useScopeBasedCost hook tests
 *
 * Verifies:
 * - Weir calculator gets scope-based cost breakdown
 * - Non-weir calculator returns NO_MAPPING
 * - Missing price state is returned when prices unavailable
 * - Hook result contains line items with AHSP codes
 */

import { computeScopeBasedCost } from '../hooks/useScopeBasedCost';
import { PriceContext } from '../engine/pricing/contracts/types';

const priceContext: PriceContext = {
  projectId: 'test-project',
  location: 'Probolinggo, Jawa Timur',
  effectiveDate: '2026-01-01',
  periodVersion: '2026',
};

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (e) {
    console.error(`✗ ${name}: ${e}`);
    process.exitCode = 1;
  }
}

function assertTrue(cond: boolean, msg?: string) {
  if (!cond) throw new Error(msg || 'Expected true');
}

function assertEqual(actual: unknown, expected: unknown, msg?: string) {
  if (actual !== expected) {
    throw new Error(`${msg || 'Assertion failed'}: expected ${expected}, got ${actual}`);
  }
}

// ---------------------------------------------------------------------------
// TESTS
// ---------------------------------------------------------------------------

test('Weir calculator has mapping and returns line items', () => {
  const result = computeScopeBasedCost(
    'weir.body',
    { weirLength: 25, weirHeight: 3.5, crestWidth: 2, baseWidth: 6 },
    priceContext,
    'test-project'
  );

  assertTrue(result.hasMapping, 'Weir body should have mapping');
  assertTrue(result.lineItems.length > 0, 'Should have line items');
  assertTrue(result.auditTrail.length > 0, 'Should have audit trail');
});

test('Non-weir calculator returns NO_MAPPING', () => {
  const result = computeScopeBasedCost(
    'residential.beton',
    { length: 10, width: 5, height: 0.2 },
    priceContext,
    'test-project'
  );

  assertEqual(result.hasMapping, false, 'Residential calculator should not have mapping');
  assertEqual(result.status, 'NO_MAPPING');
  assertEqual(result.lineItems.length, 0);
});

test('Weir body 350 m3 has correct body volume in line items', () => {
  const result = computeScopeBasedCost(
    'weir.body',
    { weirLength: 25, weirHeight: 3.5, crestWidth: 2, baseWidth: 6 },
    priceContext,
    'test-project'
  );

  const bodyItem = result.lineItems.find((li) => li.name.includes('Tubuh'));
  assertTrue(!!bodyItem, 'Should have body work item');
  assertEqual(bodyItem!.quantity, 350, 'Body quantity should be 350 m3');
});

test('Hook returns valid status (PRICE_MISSING, PARTIAL, or RESOLVED)', () => {
  const result = computeScopeBasedCost(
    'weir.body',
    { weirLength: 25, weirHeight: 3.5, crestWidth: 2, baseWidth: 6 },
    priceContext,
    'test-project'
  );

  assertTrue(
    result.status === 'PRICE_MISSING' || result.status === 'RESOLVED' || result.status === 'PARTIAL',
    `Status should be PRICE_MISSING, PARTIAL, or RESOLVED, got ${result.status}`
  );
});

// G1 CANARY (2026-11-14) — identitas AHSP line item HARUS cocok dengan
// pekerjaannya, bukan hanya "kodenya ada". Lima tes di atas lolos dengan
// line item yang ter-resolve — tetapi 6 dari 12 kode registry bendung
// (scopeAhspRegistry) SALAH untuk Bina Marga dan kini ter-resolve ke item
// yang SALAH (bukti probe G1; registry ditulis a506967 dengan skema nomor
// karangan 3.1.x = beton — padahal di Lampiran V BM 3.1.x = galian; BUKTI:
// 3.1.(5) sudah berarti "Galian Struktur 2-4 M" SEBELUM strip a506967):
//   Beton K-250 Pondasi (3.1.(5)) -> C.5 "Galian Struktur 2-4 M" (SALAH)
//   Beton K-300 Tubuh (3.1.(7))   -> C.7 "Tambahan biaya galian..." (SALAH)
//   Urugan Pasir (2.2.(1))        -> B.2 "Pasangan Batu dengan Mortar" (SALAH)
//   Urugan Tanah (2.2.(3))        -> B.4 "Pasangan Batu ... DS-4" (SALAH)
//   Buang Tanah (2.3.(1))         -> B.9 "Gorong-gorong Pipa Beton" (SALAH)
//   Dewatering (2.4.(1))          -> B.79 "Bahan Drainase Porous" (SALAH)
// Tes ini SENGAJA MERAH sampai registry di-remap ke kode BM terverifikasi
// (butuh keputusan engineering: konversi K->fc', grade tulangan, pita
// kedalaman galian; bekisting + buang tanah TIDAK ADA di master BM).
// JANGAN "perbaiki" tes ini dengan melonggarkan asersi identitas —
// melonggarkannya berarti membiarkan beton dihargai sebagai galian dan
// ditampilkan ke user sebagai "Estimasi Biaya Resmi (CostPolicyEngine)".
test('G1 CANARY: line item beton terpetakan ke item AHSP Beton (bukan galian)', () => {
  const result = computeScopeBasedCost(
    'weir.body',
    { weirLength: 25, weirHeight: 3.5, crestWidth: 2, baseWidth: 6 },
    priceContext,
    'test-project'
  );

  const bodyConcrete = result.lineItems.find((li) => li.name.includes('Beton K-300 Tubuh Bendung'));
  assertTrue(!!bodyConcrete, 'Should have body concrete line item');
  assertTrue(bodyConcrete!.ahspName.toLowerCase().includes('beton'),
    `Body concrete must map to a Beton AHSP item, got "${bodyConcrete!.ahspName}" (${bodyConcrete!.ahspCode})`);

  const foundationConcrete = result.lineItems.find((li) => li.name.includes('Beton K-250 Pondasi'));
  assertTrue(!!foundationConcrete, 'Should have foundation concrete line item');
  assertTrue(foundationConcrete!.ahspName.toLowerCase().includes('beton'),
    `Foundation concrete must map to a Beton AHSP item, got "${foundationConcrete!.ahspName}" (${foundationConcrete!.ahspCode})`);
});

test('Summary contains cost breakdown', () => {
  const result = computeScopeBasedCost(
    'weir.body',
    { weirLength: 25, weirHeight: 3.5, crestWidth: 2, baseWidth: 6 },
    priceContext,
    'test-project'
  );

  assertTrue(!!result.summary, 'Should have summary');
  assertTrue(result.summary!.directCost >= 0, 'Direct cost should be >= 0');
  assertTrue(result.summary!.grandTotal >= result.summary!.directCost, 'Grand total >= direct cost');
});

console.log('\nDone.');
