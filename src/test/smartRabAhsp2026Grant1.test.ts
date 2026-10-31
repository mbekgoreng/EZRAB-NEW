/**
 * EZRAB — SMART RAB → AHSP 2026 — GRANT 1 (PEMETAAN LANGSUNG) TEST SUITE
 *
 * Membuktikan penerapan §1 draf pemetaan (SE DJBK No. 47/SE/Dk/2026,
 * Lampiran VI AHSP Bidang Cipta Karya) ke `RabTemplateService`:
 *
 *  1. Plesteran 1:4 (komponen `c-plester`, template rumah) kini memakai kode
 *     AHSP 2026 kanonis 3.7.4 dan — lewat gerbang resmi yang sudah ada —
 *     ter-generate sebagai OFFICIAL_AHSP dengan harga DHSP persis draf
 *     Rp 56.784/m2 (resolver FULL 6/6, satuan m2 lolos unit-gate).
 *  2. Item di luar §1 TIDAK berubah: sloof `c-sloof` tetap A.4.1.1.2 /
 *     Rp 4.200.000 dan tetap REFERENCE (bukan resmi) — Grant 2/3 belum
 *     disetujui, jadi tidak boleh ikut terpetakan atau terhapus.
 *  3. Kloset duduk `c-kloset` SENGAJA belum dipetakan (blocked, tercatat di
 *     laporan Grant 1): kode 3.18.3.1 di katalog kanonis bersatuan "buah"
 *     (komponen bersatuan "unit" → unit-gate gagal) dan komposisi resolver
 *     PARTIAL 4/6 — memaksakan kode hanya akan mengganti status menjadi
 *     UNIT_MISMATCH tanpa harga resmi. Tes ini mengunci keadaan itu agar
 *     tidak ada yang memetakannya diam-diam.
 *
 * Jalankan: npx --yes tsx src/test/smartRabAhsp2026Grant1.test.ts
 */

import { strict as assert } from 'assert';
import { RabTemplateService } from '../services/rabTemplateService';

// Mock localStorage for Node test environment
const storage: Record<string, string> = {};
(global as any).window = {
  localStorage: {
    getItem: (key: string) => storage[key] || null,
    setItem: (key: string, val: string) => { storage[key] = val; },
    removeItem: (key: string) => { delete storage[key]; },
    clear: () => { Object.keys(storage).forEach(k => delete storage[k]); }
  }
};
(global as any).localStorage = (global as any).window.localStorage;

let groups = 0;
let passed = 0;
function group(name: string, fn: () => void) {
  groups++;
  try {
    fn();
    passed++;
    console.log(`  PASS  ${name}`);
  } catch (err) {
    console.error(`  FAIL  ${name}`);
    console.error(err);
  }
}

const svc = RabTemplateService.getInstance();
const house = svc.getTemplateById('HOUSE-T36-1FL');
assert.ok(house, 'Template HOUSE-T36-1FL harus ada');
const comp = (id: string) => {
  const c = (house.components || []).find(x => x.id === id);
  assert.ok(c, `Komponen ${id} harus ada di template rumah`);
  return c;
};

const generated = svc.generateRabFromTemplate(house, {}, undefined, 'STANDARD', []);
const itemByDescription = (name: string) => {
  const it = generated.items.find(i => i.description === name);
  assert.ok(it, `Item generate "${name}" harus ada`);
  return it;
};

console.log('================================================================');
console.log('SMART RAB → AHSP 2026 — GRANT 1 (PEMETAAN LANGSUNG)');
console.log('================================================================');

group('1. c-plester terpetakan ke kode AHSP 2026 3.7.4 (draf §1)', () => {
  const p = comp('c-plester');
  assert.strictEqual(p.ahspCode, '3.7.4');
  assert.strictEqual(p.unit, 'm2');
  // Harga seed komponen diselaraskan ke harga DHSP draf agar fallback
  // referensi tidak lagi membawa harga legacy untuk kode resmi ini.
  assert.strictEqual(p.unitPrice, 56784);
});

group('2. Generate: plesteran menjadi OFFICIAL_AHSP Rp 56.784/m2 (persis draf)', () => {
  const item = itemByDescription(comp('c-plester').name);
  assert.strictEqual(item.ahspCode, '3.7.4');
  assert.strictEqual(item.priceSourceKind, 'OFFICIAL_AHSP');
  assert.strictEqual(item.ahspMappingStatus, 'VERIFIED');
  assert.strictEqual(item.unitPrice, 56784);
});

group('3. Sloof (Grant 2/3) TIDAK berubah: tetap A.4.1.1.2 / Rp 4.200.000 REFERENCE', () => {
  const s = comp('c-sloof');
  assert.strictEqual(s.ahspCode, 'A.4.1.1.2');
  assert.strictEqual(s.unitPrice, 4200000);
  const item = itemByDescription(s.name);
  assert.strictEqual(item.ahspCode, 'A.4.1.1.2');
  assert.strictEqual(item.unitPrice, 4200000);
  assert.notStrictEqual(item.priceSourceKind, 'OFFICIAL_AHSP');
});

group('4. Kloset duduk BELUM dipetakan (blocked: unit-gate + komposisi PARTIAL)', () => {
  const k = comp('c-kloset');
  assert.strictEqual(k.ahspCode, 'A.5.1.1.1');
  assert.strictEqual(k.unitPrice, 2450000);
  const item = itemByDescription(k.name);
  assert.notStrictEqual(item.priceSourceKind, 'OFFICIAL_AHSP');
});

group('5. Kesiapan pemetaan: c-plester terhitung terverifikasi', () => {
  const readiness = svc.getTemplateMappingReadiness(house);
  assert.ok(readiness.verifiedCodeCount >= 1, 'minimal c-plester terverifikasi');
});

console.log('----------------------------------------------------------------');
if (passed === groups) {
  console.log(`🎉 ALL GRANT 1 TESTS PASSED SUCCESSFULLY (${passed}/${groups} GROUPS)`);
} else {
  console.error(`❌ GRANT 1 TESTS FAILED (${passed}/${groups} groups passed)`);
  process.exit(1);
}
console.log('================================================================');
