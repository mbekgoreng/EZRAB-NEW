/**
 * FULL AI QA — Simulasi respons AI realistis (Type 36)
 * Menguji: validasi, status, subtotal, error paths, edge cases.
 * SYNTHETIC_TEST_FIXTURE
 */
import {
  validateFullAiItem, verifySubtotal,
} from '../ai-tools/ded-full-ai/validator';
import { FullAiItem } from '../ai-tools/ded-full-ai/types';

let passed = 0, failed = 0;
const fails: string[] = [];
function t(name: string, cond: boolean) {
  if (cond) { passed++; } else { failed++; fails.push(name); console.log(`  ✗ ${name}`); }
}

// Simulasi loop pemrosesan item dari service.ts
function processItem(raw: any, idx: number): FullAiItem {
  const validation = validateFullAiItem(raw, idx);
  const q = raw.quantity || {};
  const p = raw.price || {};
  const { subtotal } = verifySubtotal(
    typeof q.value === 'number' ? q.value : null,
    typeof p.unitPrice === 'number' ? p.unitPrice : null
  );

  let status: FullAiItem['status'] = 'READY';
  if (q.value == null || q.provenance === 'UNRESOLVED') status = 'UNRESOLVED';
  else if (q.provenance === 'NEEDS_CONFIRMATION' || q.provenance === 'ASSUMPTION') status = 'NEEDS_CONFIRMATION';
  else if (p.unitPrice == null || p.source === 'UNRESOLVED') status = 'NEEDS_CONFIRMATION';

  const includeInTotal = status === 'READY' && subtotal != null && subtotal > 0;

  return {
    id: `test-${idx}`, no: idx + 1,
    name: String(raw.name || `Item ${idx + 1}`),
    category: String(raw.category || 'Lain-lain'),
    quantity: {
      value: typeof q.value === 'number' ? q.value : null,
      unit: String(q.unit || ''),
      formula: q.formula, provenance: q.provenance || 'UNRESOLVED',
      confidence: q.confidence || 'LOW',
    },
    price: {
      unitPrice: typeof p.unitPrice === 'number' ? p.unitPrice : null,
      unit: String(p.unit || ''), source: p.source || 'UNRESOLVED',
    },
    subtotal: includeInTotal ? subtotal : null,
    subtotalVerified: true,
    status: includeInTotal ? 'READY' : status,
  };
}

console.log('=== FULL AI QA: Simulasi Respons AI ===\n');

// KASUS 1: Item valid dengan provenance DERIVED
console.log('-- Kasus 1: Kolom valid --');
const kolom = processItem({
  name: 'Kolom Praktis 15/15',
  category: 'Struktur',
  quantity: { value: 0.81, unit: 'm3', formula: '12 × 0.15 × 0.15 × 3', provenance: 'DERIVED', confidence: 'HIGH' },
  price: { unitPrice: 4500000, unit: 'm3', source: 'AI_ESTIMATE' },
}, 0);
t('kolom status READY', kolom.status === 'READY');
t('kolom subtotal 3645000', kolom.subtotal === 3645000);
t('kolom provenance DERIVED', kolom.quantity.provenance === 'DERIVED');

// KASUS 2: Item dengan asumsi
console.log('-- Kasus 2: Dinding dengan asumsi --');
const dinding = processItem({
  name: 'Dinding Bata',
  category: 'Dinding',
  quantity: { value: 85.5, unit: 'm2', formula: 'luas bruto - bukaan', provenance: 'ASSUMPTION', confidence: 'MEDIUM', assumptions: ['Bukaan 15% dari luas'] },
  price: { unitPrice: 185000, unit: 'm2', source: 'AI_ESTIMATE' },
}, 1);
t('dinding status NEEDS_CONFIRMATION', dinding.status === 'NEEDS_CONFIRMATION');
t('dinding tidak masuk total (subtotal null)', dinding.subtotal === null);

// KASUS 3: Item tanpa harga
console.log('-- Kasus 3: Item tanpa harga --');
const noPrice = processItem({
  name: 'Pekerjaan Khusus',
  category: 'Lain-lain',
  quantity: { value: 10, unit: 'm2', provenance: 'DERIVED', confidence: 'MEDIUM' },
  price: { unitPrice: null, unit: 'm2', source: 'UNRESOLVED' },
}, 2);
t('tanpa harga: subtotal null (bukan Rp0)', noPrice.subtotal === null);
t('tanpa harga: status bukan READY', noPrice.status !== 'READY');

// KASUS 4: Item UNRESOLVED
console.log('-- Kasus 4: Item tidak jelas --');
const unresolved = processItem({
  name: 'Pekerjaan Tidak Jelas',
  category: 'Lain-lain',
  quantity: { value: null, unit: '', provenance: 'UNRESOLVED', confidence: 'LOW' },
  price: { unitPrice: null, unit: '', source: 'UNRESOLVED' },
}, 3);
t('unresolved: status UNRESOLVED', unresolved.status === 'UNRESOLVED');
t('unresolved: tetap ada di output (tidak dibuang)', unresolved.name === 'Pekerjaan Tidak Jelas');

// KASUS 5: Satuan tidak cocok
console.log('-- Kasus 5: Satuan harga vs quantity beda --');
const mismatch = validateFullAiItem({
  name: 'Balok',
  quantity: { value: 2.5, unit: 'm3', provenance: 'DERIVED', confidence: 'HIGH' },
  price: { unitPrice: 50000, unit: "m'", source: 'AI_ESTIMATE' },
}, 4);
t('satuan beda terdeteksi sebagai error', !mismatch.valid);
t('error message jelas', mismatch.errors.some((e) => e.includes('tidak cocok')));

// KASUS 6: EXPLICIT tanpa bukti
console.log('-- Kasus 6: EXPLICIT tanpa formula --');
const explicitNoProof = validateFullAiItem({
  name: 'Pondasi',
  quantity: { value: 5.0, unit: 'm3', provenance: 'EXPLICIT', confidence: 'HIGH' },
  price: { unitPrice: 3800000, unit: 'm3', source: 'AI_ESTIMATE' },
}, 5);
t('EXPLICIT tanpa bukti dapat warning', explicitNoProof.warnings.length > 0);
t('EXPLICIT tanpa bukti tetap valid struktur', explicitNoProof.valid);

// KASUS 7: Nilai tidak masuk akal
console.log('-- Kasus 7: Volume negatif --');
const negative = validateFullAiItem({
  name: 'Item Aneh',
  quantity: { value: -5, unit: 'm3', provenance: 'DERIVED', confidence: 'HIGH' },
  price: { unitPrice: 1000, unit: 'm3', source: 'AI_ESTIMATE' },
}, 6);
t('volume negatif ditolak', !negative.valid);

// KASUS 8: Quantity 0
console.log('-- Kasus 8: Quantity nol --');
const zeroQty = processItem({
  name: 'Item Nol',
  category: 'Test',
  quantity: { value: 0, unit: 'm3', provenance: 'DERIVED', confidence: 'HIGH' },
  price: { unitPrice: 1000, unit: 'm3', source: 'AI_ESTIMATE' },
}, 7);
t('quantity 0: subtotal null', zeroQty.subtotal === null);

// KASUS 9: Grand total hanya dari item READY
console.log('-- Kasus 9: Grand total --');
const items = [kolom, dinding, noPrice, unresolved, zeroQty];
const grandTotal = items
  .filter((it) => it.subtotal != null && it.subtotal > 0)
  .reduce((s, it) => s + (it.subtotal || 0), 0);
t('grand total hanya dari item READY (3645000)', grandTotal === 3645000);
const excluded = items.filter((it) => it.subtotal == null).length;
t('4 item dikecualikan dari total', excluded === 4);

// KASUS 10: Provenance tidak valid
console.log('-- Kasus 10: Provenance ngawur --');
const badProv = validateFullAiItem({
  name: 'Item X',
  quantity: { value: 1, unit: 'm3', provenance: 'DARI_LANGIT', confidence: 'HIGH' },
  price: { unitPrice: 1000, unit: 'm3', source: 'AI_ESTIMATE' },
}, 8);
t('provenance invalid ditolak', !badProv.valid);

console.log(`\n${passed} PASS, ${failed} FAIL`);
if (fails.length) { console.log('\nGagal:', fails.join(', ')); process.exit(1); }
