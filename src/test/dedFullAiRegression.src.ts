/**
 * REGRESSION TEST — Pola kegagalan: semua item NEEDS_CONFIRMATION, total Rp0
 * Berdasarkan laporan: pdf-gambar-rumah-1-lantai_compress.pdf
 * SYNTHETIC_TEST_FIXTURE — mensimulasikan respons AI aktual
 */
import { FullAiItem, FullAiExclusionReason } from '../ai-tools/ded-full-ai/types';
import { verifySubtotal } from '../ai-tools/ded-full-ai/validator';

let passed = 0, failed = 0;
const fails: string[] = [];
function t(name: string, cond: boolean) {
  if (cond) { passed++; } else { failed++; fails.push(name); console.log(`  ✗ ${name}`); }
}

// Simulasi fungsi penentuan status dari service.ts (dengan exclusionReason)
function determineStatus(q: any, p: any): { status: FullAiItem['status']; exclusionReason: FullAiExclusionReason } {
  let status: FullAiItem['status'] = 'READY';
  let exclusionReason: FullAiExclusionReason = null;

  if (q.value == null) {
    status = 'UNRESOLVED'; exclusionReason = 'MISSING_QUANTITY';
  } else if (typeof q.value !== 'number' || q.value < 0) {
    status = 'UNRESOLVED'; exclusionReason = 'INVALID_QUANTITY';
  } else if (!q.unit) {
    status = 'UNRESOLVED'; exclusionReason = 'MISSING_UNIT';
  } else if (q.provenance === 'UNRESOLVED') {
    status = 'UNRESOLVED'; exclusionReason = 'UNRESOLVED_PROVENANCE';
  } else if (q.provenance === 'NEEDS_CONFIRMATION') {
    status = 'NEEDS_CONFIRMATION'; exclusionReason = 'NEEDS_CONFIRMATION';
  } else if (p.unitPrice == null) {
    status = 'NEEDS_CONFIRMATION'; exclusionReason = 'MISSING_UNIT_PRICE';
  } else if (p.source === 'UNRESOLVED') {
    status = 'NEEDS_CONFIRMATION'; exclusionReason = 'PRICE_UNRESOLVED';
  } else if (p.unit && q.unit) {
    const norm = (u: string) => u.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (norm(p.unit) !== norm(q.unit)) {
      status = 'NEEDS_CONFIRMATION'; exclusionReason = 'INVALID_PRICE_UNIT';
    }
  }
  return { status, exclusionReason };
}

console.log('=== REGRESSION: Pola kegagalan NEEDS_CONFIRMATION massal ===\n');

// KASUS 1: Item DERIVED dengan harga AI valid → harus READY (masuk total)
console.log('-- Kasus 1: Beton Sloof (DERIVED + AI_ESTIMATE) --');
const r1 = determineStatus(
  { value: 1.8, unit: 'm3', provenance: 'DERIVED' },
  { unitPrice: 1150000, unit: 'm3', source: 'AI_ESTIMATE' }
);
t('DERIVED + harga AI valid = READY', r1.status === 'READY');
t('tidak ada exclusionReason', r1.exclusionReason === null);
const s1 = verifySubtotal(1.8, 1150000);
t('subtotal 1.8 × 1150000 = 2070000', s1.subtotal === 2070000);

// KASUS 2: Item EXPLICIT (Dari DED) dengan harga AI → harus READY
console.log('-- Kasus 2: Pelat lantai (EXPLICIT + AI_ESTIMATE) --');
const r2 = determineStatus(
  { value: 3.6, unit: 'm3', provenance: 'EXPLICIT' },
  { unitPrice: 1150000, unit: 'm3', source: 'AI_ESTIMATE' }
);
t('EXPLICIT + harga AI valid = READY', r2.status === 'READY');

// KASUS 3: Item ASSUMPTION dengan harga valid → harus READY (masuk total dengan label)
console.log('-- Kasus 3: Pembesian (ASSUMPTION + AI_ESTIMATE) --');
const r3 = determineStatus(
  { value: 450, unit: 'kg', provenance: 'ASSUMPTION' },
  { unitPrice: 18500, unit: 'kg', source: 'AI_ESTIMATE' }
);
t('ASSUMPTION + harga valid = READY (masuk total)', r3.status === 'READY');

// KASUS 4: Volume valid, harga null → NEEDS_CONFIRMATION dengan alasan jelas
console.log('-- Kasus 4: Volume valid, harga null --');
const r4 = determineStatus(
  { value: 10, unit: 'm2', provenance: 'DERIVED' },
  { unitPrice: null, unit: 'm2', source: 'UNRESOLVED' }
);
t('harga null = NEEDS_CONFIRMATION', r4.status === 'NEEDS_CONFIRMATION');
t('alasan = MISSING_UNIT_PRICE', r4.exclusionReason === 'MISSING_UNIT_PRICE');

// KASUS 5: Satuan harga beda → INVALID_PRICE_UNIT
console.log('-- Kasus 5: Satuan tidak cocok --');
const r5 = determineStatus(
  { value: 2.5, unit: 'm3', provenance: 'DERIVED' },
  { unitPrice: 50000, unit: "m'", source: 'AI_ESTIMATE' }
);
t('satuan beda = NEEDS_CONFIRMATION', r5.status === 'NEEDS_CONFIRMATION');
t('alasan = INVALID_PRICE_UNIT', r5.exclusionReason === 'INVALID_PRICE_UNIT');

// KASUS 6: Quantity null → MISSING_QUANTITY
console.log('-- Kasus 6: Quantity null --');
const r6 = determineStatus(
  { value: null, unit: '', provenance: 'UNRESOLVED' },
  { unitPrice: null, unit: '', source: 'UNRESOLVED' }
);
t('qty null = UNRESOLVED', r6.status === 'UNRESOLVED');
t('alasan = MISSING_QUANTITY', r6.exclusionReason === 'MISSING_QUANTITY');

// KASUS 7: Grand total hanya dari READY
console.log('-- Kasus 7: Grand total --');
const items = [
  { status: 'READY' as const, subtotal: 2070000 },
  { status: 'READY' as const, subtotal: 4140000 },
  { status: 'NEEDS_CONFIRMATION' as const, subtotal: null },
  { status: 'UNRESOLVED' as const, subtotal: null },
];
const total = items.filter((it) => it.subtotal != null && it.subtotal > 0)
  .reduce((s, it) => s + (it.subtotal || 0), 0);
t('total = 6210000 (hanya dari READY)', total === 6210000);
t('2 item dikecualikan', items.filter((it) => it.subtotal == null).length === 2);

// KASUS 8: Semua item belum lengkap → total Rp0 dengan alasan jelas
console.log('-- Kasus 8: Semua item incomplete --');
const emptyItems = [
  determineStatus({ value: null, unit: '', provenance: 'UNRESOLVED' }, { unitPrice: null, unit: '', source: 'UNRESOLVED' }),
  determineStatus({ value: 10, unit: 'm2', provenance: 'DERIVED' }, { unitPrice: null, unit: 'm2', source: 'UNRESOLVED' }),
];
const allExcluded = emptyItems.every((r) => r.exclusionReason !== null);
t('semua item punya alasan eksklusi jelas', allExcluded);
t('bukan sekadar NEEDS_CONFIRMATION tanpa penjelasan',
  emptyItems[0].exclusionReason === 'MISSING_QUANTITY' &&
  emptyItems[1].exclusionReason === 'MISSING_UNIT_PRICE');

console.log(`\n${passed} PASS, ${failed} FAIL`);
if (fails.length) { console.log('Gagal:', fails.join(', ')); process.exit(1); }
