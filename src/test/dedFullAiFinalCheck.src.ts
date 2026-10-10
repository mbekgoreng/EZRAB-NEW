/**
 * FINAL CHECK — Normalisasi price & quantity semua bentuk
 * Menguji: flat numeric, nested object, null, undefined, string, zero
 */
import { verifySubtotal } from '../ai-tools/ded-full-ai/validator';

let passed = 0, failed = 0;
const fails: string[] = [];
function t(name: string, cond: boolean) {
  if (cond) { passed++; } else { failed++; fails.push(name); console.log(`  ✗ ${name}`); }
}

// Replika fungsi normalisasi dari service.ts (dengan fix array)
function normalizeItem(raw: any) {
  const isFlatPrice = typeof raw.price === 'number';
  const isNestedPrice = raw.price && typeof raw.price === 'object' && !Array.isArray(raw.price);
  const isNestedQty = raw.quantity && typeof raw.quantity === 'object' && !Array.isArray(raw.quantity);
  return {
    quantity: isNestedQty ? raw.quantity : {
      value: typeof raw.qty === 'number' ? raw.qty : null,
      unit: raw.unit || '',
      formula: raw.formula || undefined,
      provenance: raw.provenance || 'UNRESOLVED',
    },
    price: isNestedPrice ? raw.price : {
      unitPrice: isFlatPrice ? raw.price : null,
      unit: raw.priceUnit || raw.unit || '',
      source: raw.priceSource || 'AI_ESTIMATE',
    },
  };
}

console.log('=== FINAL CHECK: Normalisasi semua bentuk ===\n');

// 1. Flat numeric price
console.log('-- 1. Flat numeric price --');
const n1 = normalizeItem({ qty: 9.6, unit: 'm3', price: 85000, priceUnit: 'm3', provenance: 'DERIVED' });
t('flat price 85000 → unitPrice 85000', n1.price.unitPrice === 85000);
t('flat qty 9.6 → value 9.6', n1.quantity.value === 9.6);

// 2. Nested price object
console.log('-- 2. Nested price object --');
const n2 = normalizeItem({
  quantity: { value: 1.8, unit: 'm3', provenance: 'DERIVED' },
  price: { unitPrice: 1150000, unit: 'm3', source: 'AI_ESTIMATE' },
});
t('nested price preserved', n2.price.unitPrice === 1150000);
t('nested qty preserved', n2.quantity.value === 1.8);

// 3. Null price
console.log('-- 3. Null price --');
const n3 = normalizeItem({ qty: 10, unit: 'm2', price: null, provenance: 'DERIVED' });
t('null price → unitPrice null (bukan 0)', n3.price.unitPrice === null);

// 4. Undefined price (missing)
console.log('-- 4. Missing price --');
const n4 = normalizeItem({ qty: 10, unit: 'm2', provenance: 'DERIVED' });
t('missing price → unitPrice null', n4.price.unitPrice === null);

// 5. String price (tidak diparse, aman)
console.log('-- 5. String price --');
const n5 = normalizeItem({ qty: 10, unit: 'm2', price: "85000", provenance: 'DERIVED' });
t('string price → unitPrice null (tidak dipaksa parse)', n5.price.unitPrice === null);

// 6. Explicit zero price
console.log('-- 6. Explicit zero price --');
const n6 = normalizeItem({ qty: 10, unit: 'm2', price: 0, priceUnit: 'm2', provenance: 'DERIVED' });
t('price 0 → unitPrice 0 (eksplisit)', n6.price.unitPrice === 0);
const s6 = verifySubtotal(10, 0);
t('subtotal dengan harga 0 → null (tidak dihitung)', s6.subtotal === null);

// 7. Quantity null
console.log('-- 7. Quantity null --');
const n7 = normalizeItem({ qty: null, unit: 'm3', price: 85000, priceUnit: 'm3', provenance: 'UNRESOLVED' });
t('qty null → value null', n7.quantity.value === null);

// 8. Quantity zero
console.log('-- 8. Quantity zero --');
const n8 = normalizeItem({ qty: 0, unit: 'm3', price: 85000, priceUnit: 'm3', provenance: 'DERIVED' });
t('qty 0 → value 0', n8.quantity.value === 0);
const s8 = verifySubtotal(0, 85000);
t('subtotal qty 0 → null', s8.subtotal === null);

// 9. Quantity negative
console.log('-- 9. Quantity negative --');
const n9 = normalizeItem({ qty: -5, unit: 'm3', price: 85000, priceUnit: 'm3', provenance: 'DERIVED' });
t('qty negatif → value -5 (ditolak validator)', n9.quantity.value === -5);
const s9 = verifySubtotal(-5, 85000);
t('subtotal negatif → null', s9.subtotal === null);

// 10. Nested quantity null
console.log('-- 10. Nested quantity null --');
const n10 = normalizeItem({ quantity: null, price: 85000 });
t('quantity null → dinormalisasi dari flat', n10.quantity.value === null);

// 11. Unknown shape (array)
console.log('-- 11. Unknown shape --');
const n11 = normalizeItem({ qty: 5, unit: 'm2', price: [85000], provenance: 'DERIVED' });
t('price array → unitPrice null (aman)', n11.price.unitPrice === null);

// 12. Subtotal dari nilai ternormalisasi (bukan mentah)
console.log('-- 12. Subtotal dari ternormalisasi --');
const n12 = normalizeItem({ qty: 1.8, unit: 'm3', price: 1150000, priceUnit: 'm3', provenance: 'DERIVED' });
const s12 = verifySubtotal(n12.quantity.value, n12.price.unitPrice);
t('1.8 × 1150000 = 2070000', s12.subtotal === 2070000);

// 13. verifySubtotal tolak NaN/Infinity
console.log('-- 13. verifySubtotal tolak non-finite --');
t('NaN price → subtotal null', verifySubtotal(1.8, NaN).subtotal === null);
t('Infinity price → subtotal null', verifySubtotal(1.8, Infinity).subtotal === null);
t('NaN qty → subtotal null', verifySubtotal(NaN, 100).subtotal === null);
t('negatif price → subtotal null', verifySubtotal(1.8, -5000).subtotal === null);

console.log(`\n${passed} PASS, ${failed} FAIL`);
if (fails.length) { console.log('Gagal:', fails.join(', ')); process.exit(1); }
