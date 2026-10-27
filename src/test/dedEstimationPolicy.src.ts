/**
 * DED-to-RAB — Dua Kebijakan Harga: FULL_AI vs DATABASE (owner 2026-10-27).
 *
 * Run: npx esbuild src/test/dedEstimationPolicy.src.ts --bundle --platform=node
 *      --format=cjs --outfile=/tmp/dedpolicy.cjs && node /tmp/dedpolicy.cjs
 *
 * Memetakan spesifikasi §10 (16 kasus) ke fungsi murni yang dapat diuji
 * tanpa provider AI. Kasus yang butuh provider (panggilan gateway penuh)
 * TIDAK diklaim di sini — lihat laporan untuk batasannya.
 * Kebijakan ditegakkan di service layer (pricing.ts + gerbang Full AI),
 * bukan hanya di instruksi UI/prompt.
 */
import { resolveDedPriceForPolicy, applyAiEstimatePrice, isSaneEstimate } from '../ai-tools/ded-ai-estimate/pricing';
import { DedAiCalculator, calcSubtotal } from '../ai-tools/ded-ai-estimate/calculator';
import { classifyPassOutcome, decideNoItemsError } from '../ai-tools/ded-ai-estimate/service';
import { applyFullAiPricePolicy } from '../ai-tools/ded-full-ai/service';
import { validatePriceDetail, validateQuantityDetail, verifySubtotal } from '../ai-tools/ded-full-ai/validator';

let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}

console.log('\n== 1. Pemilihan mode Full AI (kasus 1, 4, 6) ==');
const fullOk = resolveDedPriceForPolicy('FULL_AI', 850000, 'Estimasi AI');
check('1.1 FULL_AI menerima estimasi wajar sebagai AI_ESTIMATE', fullOk.priceSource === 'AI_ESTIMATE' && fullOk.unitPrice === 850000);
check('1.2 FULL_AI membulatkan estimasi', resolveDedPriceForPolicy('FULL_AI', 850000.6).unitPrice === 850001);
check('1.3 default (policy undefined) = FULL_AI, perilaku lama utuh', resolveDedPriceForPolicy(undefined, 850000).priceSource === 'AI_ESTIMATE');

console.log('\n== 2. Pemilihan mode Database (kasus 2, 5) ==');
const dbSane = resolveDedPriceForPolicy('DATABASE', 850000, 'Estimasi AI');
check('2.1 DATABASE menolak estimasi wajar sekalipun → UNRESOLVED null', dbSane.priceSource === 'UNRESOLVED' && dbSane.unitPrice === null);
check('2.2 DATABASE + harga hilang → tetap UNRESOLVED null (bukan Rp0)', resolveDedPriceForPolicy('DATABASE', null).unitPrice === null);
const dbFull = applyFullAiPricePolicy('DATABASE', { unitPrice: 1150000, unit: 'm3', source: 'AI_ESTIMATE' });
check('2.3 FullAI DATABASE menolak AI_ESTIMATE → UNRESOLVED null', dbFull.unitPrice === null && dbFull.source === 'UNRESOLVED');
const dbVerified = applyFullAiPricePolicy('DATABASE', { unitPrice: 1150000, unit: 'm3', source: 'VERIFIED_SOURCE', ahspCode: '3.7.4' });
check('2.4 FullAI DATABASE meloloskan VERIFIED_SOURCE ber-ahspCode', dbVerified.unitPrice === 1150000 && dbVerified.source === 'VERIFIED_SOURCE');
const dbVerifiedNoCode = applyFullAiPricePolicy('DATABASE', { unitPrice: 1150000, unit: 'm3', source: 'VERIFIED_SOURCE' });
check('2.5 FullAI DATABASE menolak klaim VERIFIED tanpa ahspCode', dbVerifiedNoCode.unitPrice === null && dbVerifiedNoCode.source === 'UNRESOLVED');
const dbUser = applyFullAiPricePolicy('DATABASE', { unitPrice: 900000, unit: 'm3', source: 'USER_INPUT' });
check('2.6 FullAI DATABASE meloloskan USER_INPUT', dbUser.unitPrice === 900000 && dbUser.source === 'USER_INPUT');
const fullAiPass = applyFullAiPricePolicy('FULL_AI', { unitPrice: 1150000, unit: 'm3', source: 'AI_ESTIMATE' });
check('2.7 FullAI FULL_AI meneruskan estimasi apa adanya (perilaku lama)', fullAiPass.unitPrice === 1150000 && fullAiPass.source === 'AI_ESTIMATE');

console.log('\n== 3. Persistensi mode (kasus 3) ==');
const out = DedAiCalculator.buildOutput({
  jobId: 'job-1', projectType: 'BANGUNAN', mode: 'FAST', policy: 'DATABASE',
  projectName: 'Tes', pageCount: 1,
  items: [{
    id: 'dedai-1', name: 'Pekerjaan uji', category: 'Lain-lain', units: 'm2',
    quantity: 10, quantitySource: 'DED_EXPLICIT', unitPrice: null, priceSource: 'UNRESOLVED',
    subtotal: null, sourcePages: [1], provenance: [], stage: 'PARSE',
  } as never],
});
check('3.1 buildOutput menyimpan policy DATABASE', (out as any).policy === 'DATABASE');
const roundTrip = JSON.parse(JSON.stringify(out));
check('3.2 policy bertahan lewat JSON (jalur draft localStorage)', roundTrip.policy === 'DATABASE');
check('3.3 buildOutput tanpa policy → default FULL_AI', (DedAiCalculator.buildOutput({
  jobId: 'job-2', projectType: 'BANGUNAN', mode: 'FAST', projectName: 'Tes', pageCount: 1, items: [],
}) as any).policy === 'FULL_AI');

console.log('\n== 4. Harga malformed ditolak (kasus 8, 9) ==');
for (const [label, v] of [['NaN', NaN], ['Infinity', Infinity], ['string', '850000' as never], ['negatif', -5], ['sub-100', 50], ['>50M', 60_000_000_000]] as const) {
  check(`4.${label} FULL_AI → UNRESOLVED`, resolveDedPriceForPolicy('FULL_AI', v as never).priceSource === 'UNRESOLVED');
}
check('4.7 isSaneEstimate menolak string', isSaneEstimate('850000' as never) === false);
check('4.8 applyAiEstimatePrice menolak 0', applyAiEstimatePrice(0).priceSource === 'UNRESOLVED');
const unitMismatch = validatePriceDetail({ unitPrice: 100000, unit: 'm3', source: 'AI_ESTIMATE' }, 'm2', 'Item uji');
check('4.9 satuan harga ≠ satuan quantity → error validator', unitMismatch.valid === false && unitMismatch.errors.some((e) => e.includes('tidak cocok')));
const negPrice = validatePriceDetail({ unitPrice: -100, unit: 'm2', source: 'AI_ESTIMATE' }, 'm2', 'Item uji');
check('4.10 harga negatif → error validator', negPrice.valid === false);
const noUnit = validateQuantityDetail({ value: 10, unit: '', provenance: 'EXPLICIT', confidence: 'HIGH' }, 'Item uji');
check('4.11 quantity tanpa satuan → error validator', noUnit.valid === false && noUnit.errors.some((e) => e.includes('unit hilang')));
const badSource = validatePriceDetail({ unitPrice: 100000, unit: 'm2', source: 'HARGA_TOKO' }, 'm2', 'Item uji');
check('4.12 price.source di luar enum → error validator', badSource.valid === false);

console.log('\n== 5. Peringatan spesifikasi hilang (kasus 10) ==');
const unverifiedClaim = validatePriceDetail({ unitPrice: 100000, unit: 'm2', source: 'VERIFIED_SOURCE' }, 'm2', 'Item uji');
check('5.1 klaim VERIFIED tanpa ahspCode → warning (bukan diam-diam lolos)', unverifiedClaim.warnings.some((w) => w.includes('kode AHSP')));

console.log('\n== 6. Mesin deterministik + total parsial (kasus 11, 12) ==');
check('6.1 subtotal = qty × price di kode', calcSubtotal(10, 100000) === 1_000_000);
check('6.2 qty null → subtotal null (bukan 0)', calcSubtotal(null, 100000) === null);
check('6.3 price null → subtotal null (bukan 0)', calcSubtotal(10, null) === null);
check('6.4 verifySubtotal menolak non-finite', verifySubtotal(NaN, 100000).verified === false && verifySubtotal(NaN, 100000).subtotal === null);
const mixed = DedAiCalculator.buildOutput({
  jobId: 'job-3', projectType: 'BANGUNAN', mode: 'FAST', policy: 'FULL_AI',
  projectName: 'Tes', pageCount: 1,
  items: [
    { id: 'a', name: 'A', category: 'X', units: 'm2', quantity: 10, quantitySource: 'DED_EXPLICIT', unitPrice: 100000, priceSource: 'AI_ESTIMATE', subtotal: null, sourcePages: [1], provenance: [], stage: 'PARSE' } as never,
    { id: 'b', name: 'B', category: 'X', units: 'm2', quantity: 5, quantitySource: 'DED_EXPLICIT', unitPrice: null, priceSource: 'UNRESOLVED', subtotal: null, sourcePages: [1], provenance: [], stage: 'PARSE' } as never,
  ],
});
check('6.5 total hanya menjumlah item terhitung (parsial, item tanpa harga tak ikut)', mixed.grandTotal === 1_000_000);
check('6.6 coverage menandai item belum tuntas', mixed.coverage.itemsUnresolved === 1 && mixed.coverage.itemsFullyResolved === 1);

console.log('\n== 7. Gagal provider tidak memfabrikasi (kasus 13) ==');
const malformed = classifyPassOutcome(null, true);
check('7.1 respons rusak → MALFORMED, 0 item', malformed.status === 'MALFORMED_RESPONSE' && malformed.items.length === 0);
const emptyOutcome = classifyPassOutcome({ workItems: [] }, false);
check('7.2 respons kosong → EMPTY, 0 item', emptyOutcome.status === 'EMPTY_RESPONSE' && emptyOutcome.items.length === 0);
const noItemsErr = decideNoItemsError(['FAILED', 'FAILED'], { errorCode: 'MODEL_ERROR', stage: 'ai', message: 'Model gagal', retryable: true });
check('7.3 semua pass gagal → error diteruskan, tanpa item fabrikasi', noItemsErr.errorCode === 'MODEL_ERROR' && !('items' in noItemsErr));
const noDataErr = decideNoItemsError(['OK', 'OK'], null);
check('7.4 pass sah tapi kosong → NO_DATA, bukan total palsu', noDataErr.errorCode === 'NO_DATA');

console.log('\n== 8. Ganti mode tidak memakai cache basi (kasus 14) ==');
const raw = 750000;
const first = resolveDedPriceForPolicy('FULL_AI', raw);
const second = resolveDedPriceForPolicy('DATABASE', raw);
const third = resolveDedPriceForPolicy('FULL_AI', raw);
check('8.1 FULL_AI → DATABASE mengubah hasil (tanpa cache)', first.priceSource === 'AI_ESTIMATE' && second.priceSource === 'UNRESOLVED');
check('8.2 DATABASE → FULL_AI kembali ke hasil awal (stateless)', third.priceSource === 'AI_ESTIMATE' && third.unitPrice === 750000);
const gateIn = { unitPrice: 500000, unit: 'm3', source: 'AI_ESTIMATE' };
applyFullAiPricePolicy('DATABASE', gateIn);
check('8.3 gerbang tidak memutasi objek harga input', gateIn.unitPrice === 500000 && gateIn.source === 'AI_ESTIMATE');

console.log('\n== 9. Jalur finalisasi utuh (kasus 15) ==');
const finalized = (mixed.items as any[]).filter((it: any) => it.stage === 'CALCULATED' && it.subtotal != null && it.unitPrice != null);
check('9.1 hanya item CALCULATED + subtotal + harga yang lolos filter finalisasi', finalized.length === 1 && finalized[0].id === 'a');
check('9.2 item tanpa harga subtotalnya null (tidak menyumbang total)', (mixed.items as any[]).find((it: any) => it.id === 'b')?.subtotal == null);

console.log(`\n=== HASIL: ${pass} PASS, ${fail} FAIL ===`);
if (fail > 0) process.exit(1);
