/**
 * Batch 4 regression: BOQ document rows must preserve missing prices.
 *
 * Root cause covered: mapBoqRows used to coerce a null unit price to 0 and
 * drop priceStatus, so BOQ/commercial documents silently showed Rp0 and the
 * "HARGA BELUM TERSEDIA" markers in xlsxGenerator could never fire (the same
 * defect class as the Phase 2H P1-3 fix in rabIntegration, which this mapper
 * missed). Expected values below are independent of the implementation.
 *
 * Run: bundle with esbuild and execute with node (house pattern).
 */
import { mapBoqRows } from '../document-engine/integrations/boqIntegration';

let pass = 0,
  fail = 0;
const check = (label: string, cond: boolean, detail: string) => {
  if (cond) {
    pass++;
    console.log(`  [PASS] ${label}`);
  } else {
    fail++;
    console.log(`  [FAIL] ${label} — ${detail}`);
  }
};

console.log('B4-BOQ-1: harga hilang tetap hilang (tidak jadi Rp0)');
{
  const rows = mapBoqRows([
    { code: 'X', description: 'Item tanpa harga', unit: 'm3', volume: 5, unitPrice: null, priceStatus: 'PRICE_UNRESOLVED' },
  ] as any);
  check('unitPrice tetap null', rows[0].unitPrice === null, `dapat ${rows[0].unitPrice}`);
  check('total tetap null', rows[0].total === null, `dapat ${rows[0].total}`);
  check(
    'priceStatus diteruskan',
    (rows[0] as any).priceStatus === 'PRICE_UNRESOLVED',
    `dapat ${(rows[0] as any).priceStatus}`
  );
}

console.log('B4-BOQ-2: harga hilang tanpa priceStatus eksplisit diturunkan sebagai PRICE_UNRESOLVED');
{
  const rows = mapBoqRows([
    { code: 'Y', description: 'Item null polos', unit: 'm2', volume: 3, unitPrice: null },
  ] as any);
  check('unitPrice null', rows[0].unitPrice === null, `dapat ${rows[0].unitPrice}`);
  check(
    'priceStatus = PRICE_UNRESOLVED',
    (rows[0] as any).priceStatus === 'PRICE_UNRESOLVED',
    `dapat ${(rows[0] as any).priceStatus}`
  );
  check('total null (bukan 3 x 0)', rows[0].total === null, `dapat ${rows[0].total}`);
}

console.log('B4-BOQ-3: item berharga dihitung persis (kuantitas x harga satuan)');
{
  const rows = mapBoqRows([
    { code: 'Z', description: 'Beton K-250', unit: 'm3', volume: 12.5, unitPrice: 1250000 },
  ] as any);
  // Independent expectation: 12.5 x 1,250,000 = 15,625,000
  check('total = 15.625.000', rows[0].total === 15625000, `dapat ${rows[0].total}`);
  check(
    'priceStatus = PRICE_RESOLVED',
    (rows[0] as any).priceStatus === 'PRICE_RESOLVED',
    `dapat ${(rows[0] as any).priceStatus}`
  );
}

console.log('B4-BOQ-4: totalPrice eksplisit dari sumber menang atas hasil kali');
{
  const rows = mapBoqRows([
    { code: 'W', description: 'Item LS', unit: 'LS', volume: 1, unitPrice: 100, totalPrice: 777000 },
  ] as any);
  check('total = 777.000 (dari sumber)', rows[0].total === 777000, `dapat ${rows[0].total}`);
}

console.log('B4-BOQ-5: harga 0 yang SAH (eksplisit) tidak diubah jadi null');
{
  const rows = mapBoqRows([
    { code: 'V', description: 'Item gratis eksplisit', unit: 'bh', volume: 2, unitPrice: 0, priceStatus: 'PRICE_RESOLVED' },
  ] as any);
  check('unitPrice tetap 0', rows[0].unitPrice === 0, `dapat ${rows[0].unitPrice}`);
  check('total = 0', rows[0].total === 0, `dapat ${rows[0].total}`);
}

console.log(`\nbatch4BoqIntegrity: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
