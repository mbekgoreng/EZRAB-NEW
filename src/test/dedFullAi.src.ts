/**
 * FULL AI DED ESTIMATE — Regression Test
 * SYNTHETIC_TEST_FIXTURE — Bukan DED nyata.
 */
import {
  validateQuantityDetail, validatePriceDetail, validateFullAiItem, verifySubtotal,
} from '../ai-tools/ded-full-ai/validator';
import { buildFullAiPrompt } from '../ai-tools/ded-full-ai/prompts';

let passed = 0, failed = 0;
const fails: string[] = [];
function t(name: string, cond: boolean) {
  if (cond) { passed++; } else { failed++; fails.push(name); console.log(`  ✗ ${name}`); }
}

console.log('=== FULL AI Regression ===');

// A. Quantity validation
t('quantity valid', validateQuantityDetail(
  { value: 0.81, unit: 'm3', provenance: 'DERIVED', confidence: 'HIGH' }, 'Test'
).valid);
t('quantity null value valid', validateQuantityDetail(
  { value: null, unit: 'm3', provenance: 'UNRESOLVED', confidence: 'LOW' }, 'Test'
).valid);
t('quantity negatif invalid', !validateQuantityDetail(
  { value: -1, unit: 'm3', provenance: 'DERIVED', confidence: 'HIGH' }, 'Test'
).valid);
t('quantity tanpa unit invalid', !validateQuantityDetail(
  { value: 1, unit: '', provenance: 'DERIVED', confidence: 'HIGH' }, 'Test'
).valid);
t('quantity provenance invalid', !validateQuantityDetail(
  { value: 1, unit: 'm3', provenance: 'KARANGAN', confidence: 'HIGH' }, 'Test'
).valid);
t('quantity tanpa object invalid', !validateQuantityDetail(null, 'Test').valid);

// B. Price validation
t('price valid', validatePriceDetail(
  { unitPrice: 4500000, unit: 'm3', source: 'AI_ESTIMATE' }, 'm3', 'Test'
).valid);
t('price null valid', validatePriceDetail(
  { unitPrice: null, unit: 'm3', source: 'UNRESOLVED' }, 'm3', 'Test'
).valid);
t('satuan harga beda invalid', !validatePriceDetail(
  { unitPrice: 1000, unit: "m'", source: 'AI_ESTIMATE' }, 'm3', 'Test'
).valid);
t('satuan harga cocok valid', validatePriceDetail(
  { unitPrice: 1000, unit: 'M3', source: 'AI_ESTIMATE' }, 'm3', 'Test'
).valid);
t('price source invalid', !validatePriceDetail(
  { unitPrice: 1000, unit: 'm3', source: 'KARANGAN' }, 'm3', 'Test'
).valid);

// C. Subtotal verification
const s1 = verifySubtotal(0.81, 4500000);
t('subtotal 0.81×4500000 = 3645000', s1.subtotal === 3645000);
const s2 = verifySubtotal(null, 4500000);
t('subtotal null jika quantity null', s2.subtotal === null);
const s3 = verifySubtotal(0.81, null);
t('subtotal null jika harga null (bukan Rp0)', s3.subtotal === null);
const s4 = verifySubtotal(0, 4500000);
t('subtotal null jika quantity 0', s4.subtotal === null);
const s5 = verifySubtotal(-1, 4500000);
t('subtotal null jika quantity negatif', s5.subtotal === null);

// D. Full item validation
t('item valid', validateFullAiItem({
  name: 'Kolom Praktis',
  quantity: { value: 0.81, unit: 'm3', provenance: 'DERIVED', confidence: 'HIGH' },
  price: { unitPrice: 4500000, unit: 'm3', source: 'AI_ESTIMATE' },
}, 0).valid);
t('item tanpa nama invalid', !validateFullAiItem({
  quantity: { value: 1, unit: 'm3', provenance: 'DERIVED', confidence: 'HIGH' },
  price: { unitPrice: 1000, unit: 'm3', source: 'AI_ESTIMATE' },
}, 0).valid);
t('item bukan object invalid', !validateFullAiItem(null, 0).valid);

// E. Prompt generation
const { system, prompt } = buildFullAiPrompt({
  projectType: 'BANGUNAN',
  documentText: 'Test DED',
  pageCount: 5,
  mode: 'FAST',
});
t('prompt FAST tidak kosong', prompt.length > 0 && system.length > 0);
t('prompt berisi JSON', system.includes('JSON'));

const adv = buildFullAiPrompt({ projectType: 'JALAN', documentText: 'x', pageCount: 1, mode: 'ADVANCED' });
t('prompt ADVANCED beda dari FAST', adv.system !== system);
t('prompt jalan mention STA', adv.system.includes('STA') || adv.system.includes('stationing'));

// F. Kegagalan: item invalid tetap dilaporkan (tidak dibuang diam-diam)
const invalidItem = validateFullAiItem({
  name: 'Item Aneh',
  quantity: { value: 'bukan angka', unit: 'm3', provenance: 'DERIVED', confidence: 'HIGH' },
  price: { unitPrice: 1000, unit: 'm3', source: 'AI_ESTIMATE' },
}, 0);
t('item invalid terdeteksi', !invalidItem.valid && invalidItem.errors.length > 0);

console.log(`\n${passed} PASS, ${failed} FAIL`);
if (fails.length) process.exit(1);
