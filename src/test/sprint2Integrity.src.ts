/**
 * SPRINT 2 — Integrity Suite (AHSP / kuantitas / harga / finalisasi).
 *
 * Menguji modul ASLI (tanpa implementasi ulang):
 * - ded-canonical/canonicalDedPricing (matcher + gerbang harga kanonis)
 * - ded-ai-estimate/quantity, calculator, pricing, finalizeMapping
 * - engine/rab/rabItemFactory (jalur tulis RAB yang dipakai bulkAddRabItems)
 *
 * Catatan cakupan yang jujur:
 * - `convertAiItem` di service.ts TIDAK diekspor, jadi jalur konversi diuji
 *   lewat komposisi fungsi ekspor yang persis ia pakai (matchDedItemToAhsp →
 *   resolveDedPriceWithCanonical, resolveDedPriceForPolicy,
 *   attemptQuantityFromDimensionString).
 * - Dedup antar-pass hidup di method privat service.run (service.ts:575-582)
 *   dan filter "savable" finalisasi hidup di handler view.tsx:460-466 —
 *   keduanya tidak dapat dipanggil dari suite node; perilakunya diuji pada
 *   lapisan yang bisa dieksekusi (calculator/finalizeMapping/factory) dan
 *   sisanya didokumentasikan sebagai temuan berbasis bukti kode.
 * - Cek bernama awalan "FINDING:" menegaskan perilaku yang TERAMATI saat ini
 *   (bukan perilaku yang diharapkan) agar suite tetap catatan eksekutabel
 *   yang jujur; penjelasannya ada di laporan Sprint 2.
 *
 * Run: esbuild bundle (alias vitest -> shim) lalu node, seperti suite .src.ts lain.
 */
import {
  parseDimensionsString,
  detectLengthUnitFactor,
  attemptQuantityFromDimensionString,
} from '../ai-tools/ded-ai-estimate/quantity';
import { DedAiCalculator, validateQuantity, calcSubtotal, applyUnitChange } from '../ai-tools/ded-ai-estimate/calculator';
import { resolveDedPriceForPolicy, applyAiEstimatePrice, isSaneEstimate } from '../ai-tools/ded-ai-estimate/pricing';
import {
  matchDedItemToAhsp,
  resolveCanonicalCode,
  resolveDedPriceWithCanonical,
  checkSpecCompatibility,
} from '../ai-tools/ded-canonical/canonicalDedPricing';
import { mapDedAiItemToRabInput } from '../ai-tools/ded-ai-estimate/finalizeMapping';
import { createRabItemRecord } from '../engine/rab/rabItemFactory';
import type { DedAiItem } from '../ai-tools/ded-ai-estimate/types';

let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}

function mkItem(p: Partial<DedAiItem>): DedAiItem {
  return {
    id: 's2-1', name: 'Pekerjaan uji', category: 'Umum', units: 'm2',
    quantity: null, quantitySource: 'UNRESOLVED', unitPrice: null,
    priceSource: 'UNRESOLVED', subtotal: null, sourcePages: [1],
    provenance: [], stage: 'PARSE', ...p,
  } as DedAiItem;
}

/** Item plesteran kanonis yang sah (kendali positif, harga katalog nyata). */
const CANON_NAME = 'Pemasangan 1 m2 plesteran 1SP : 4PP tebal 15 mm';
const canonItem = mkItem({
  name: 'Plesteran dinding', category: 'Dinding', units: 'm2',
  quantity: 10, quantitySource: 'DED_EXPLICIT',
  unitPrice: 51622, priceSource: 'AHSP_2026', ahspCode: '3.7.4',
});
const aiItem = mkItem({
  name: 'Galian tanah biasa', category: 'Pekerjaan Tanah', units: 'm3',
  quantity: 2.5, quantitySource: 'DED_GEOMETRIC',
  unitPrice: 850000, priceSource: 'AI_ESTIMATE',
});

// =====================================================================
console.log('=== S1: Kode AHSP hostile / tidak ada ===');
const hostileCode = resolveCanonicalCode('9.9.9.9', 'm2');
check('S1 kode fiktif 9.9.9.9: status INVALID', hostileCode.status === 'INVALID', hostileCode.status);
check('S1 kode fiktif 9.9.9.9: harga null (bukan 0)', hostileCode.unitPrice === null);
const hostileMatch = matchDedItemToAhsp({ name: 'Plesteran dinding', unit: 'm2', claimedAhspCode: '9.9.9.9' });
check('S1 klaim model 9.9.9.9: match INVALID, tidak RESOLVED', hostileMatch.status === 'INVALID', hostileMatch.status);
check('S1 klaim model 9.9.9.9: harga match null', hostileMatch.unitPrice === null);
const hostileDecAi = resolveDedPriceWithCanonical('DATABASE', hostileMatch, { unitPrice: 500000, source: 'AI_ESTIMATE' });
check('S1 kode fiktif tidak memberi label kanonis: source AI_ESTIMATE', hostileDecAi.source === 'AI_ESTIMATE', hostileDecAi.source);
check('S1 kode fiktif tidak diteruskan: ahspCode undefined', hostileDecAi.ahspCode === undefined);
const hostileDecVer = resolveDedPriceWithCanonical('DATABASE', hostileMatch, { unitPrice: 500000, source: 'VERIFIED_SOURCE' });
check('S1 klaim VERIFIED_SOURCE gagal konfirmasi: turun AI_ESTIMATE', hostileDecVer.source === 'AI_ESTIMATE', hostileDecVer.source);
check('S1 klaim VERIFIED_SOURCE gagal konfirmasi: tanpa kode', hostileDecVer.ahspCode === undefined);
const hostileDecVerBad = resolveDedPriceWithCanonical('DATABASE', hostileMatch, { unitPrice: null, source: 'VERIFIED_SOURCE' });
check('S1 VERIFIED_SOURCE tanpa harga wajar: UNRESOLVED + null', hostileDecVerBad.source === 'UNRESOLVED' && hostileDecVerBad.unitPrice === null);
// Jalur ded-ai TIDAK PERNAH mengemisikan kode untuk harga non-kanonis:
const hostileMapped = mapDedAiItemToRabInput(mkItem({
  name: 'Plesteran dinding', category: 'Dinding', units: 'm2', quantity: 4,
  quantitySource: 'AI_INFERENCE', unitPrice: 500000, priceSource: 'AI_ESTIMATE',
}), 'DATABASE');
check('S1 mapper ded-ai: estimasi AI tanpa ahspCode', hostileMapped !== null && hostileMapped.ahspCode === undefined);
check('S1 mapper ded-ai: estimasi AI NEEDS_VERIFICATION', hostileMapped?.verificationStatus === 'NEEDS_VERIFICATION');
// KONTEKS KERENTANAN ASLI (Sprint 2, FINDING S1): gerbang identitas di
// factory dulu hanya menolak artefak parsing (kode kosong/desimal-fragmen,
// nama fragmen) — TIDAK memverifikasi keberadaan kode di katalog. Kode
// karangan + nama masuk akal lolos SAFE, dan caller yang meneruskan
// verificationStatus VERIFIED menghasilkan baris VERIFIED berkode AHSP
// palsu. Jalur ded-ai terlindungi di hulu (mapper), tetapi jalur tulis
// lain (bulkAddRabItems/factory langsung) tidak punya verifikasi
// keberadaan kode.
// PERBAIKAN: Sprint 3 (G1) menambahkan verifikasi eksistensi kanonis di
// factory (canonicalAhspCodeExists -> officialAhspRepository). Sprint 3.1
// (Keputusan A owner) mengonversi dua cek FINDING di bawah menjadi tes
// regresi POSITIF: keduanya memakai fixture hostile yang sama persis dan
// kini menegaskan perilaku aman — dan akan GAGAL bila kode fiktif/
// non-kanonis kembali diterima sebagai SAFE atau VERIFIED.
const hostileRec = createRabItemRecord({
  description: 'Plesteran dinding', volume: 1, unit: 'm2', unitPrice: 999999,
  ahspCode: '9.9.9.9', verificationStatus: 'VERIFIED',
} as never, 'proj-s2', {});
check('REGRESI G1 (dulu FINDING S1): kode fiktif 9.9.9.9 TIDAK BOLEH dinilai identity SAFE', (hostileRec as any).ahspIdentityStatus === 'UNSAFE', String((hostileRec as any).ahspIdentityStatus));
check('REGRESI G1 (dulu FINDING S1): baris berkode palsu TIDAK BOLEH berstatus VERIFIED (kode dipertahankan sebagai klaim tak terverifikasi)', hostileRec.ahspCode === '9.9.9.9' && hostileRec.verificationStatus === 'NEEDS_VERIFICATION', String(hostileRec.verificationStatus));

// =====================================================================
console.log('=== S2: Kecocokan kata mirip tetapi lingkup teknis beda ===');
const wrongScopeClaim = matchDedItemToAhsp({ name: 'Plesteran 1SP : 6PP tebal 15 mm', unit: 'm2', claimedAhspCode: '3.7.4' });
check('S2 klaim kode 1:4 untuk item 1:6: NEEDS_REVIEW (bukan RESOLVED)', wrongScopeClaim.status === 'NEEDS_REVIEW', wrongScopeClaim.status);
check('S2 klaim kode 1:4 untuk item 1:6: harga tidak diterbitkan', wrongScopeClaim.unitPrice === null);
check('S2 klaim yang digeser jadi kandidat pertama utk review', wrongScopeClaim.candidates[0]?.code === '3.7.4');
check('S2 checkSpecCompatibility menangkap konflik rasio 1:6 vs 1:4',
  checkSpecCompatibility('Plesteran 1SP : 6PP tebal 15 mm', CANON_NAME) !== null);
const wrongScopeName = matchDedItemToAhsp({ name: 'Pemasangan 1 m2 plesteran 1SP : 4PP tebal 20 mm', unit: 'm2' });
check('S2 nama mirip tebal 20mm (katalog 15mm): tidak auto-RESOLVED', wrongScopeName.status !== 'RESOLVED', wrongScopeName.status);
check('S2 nama mirip tebal 20mm: NEEDS_REVIEW berkandidat', wrongScopeName.status === 'NEEDS_REVIEW' && wrongScopeName.candidates.length > 0, wrongScopeName.status);
const exactName = matchDedItemToAhsp({ name: CANON_NAME, unit: 'm2' });
check('S2 kendali positif: judul persis + satuan persis RESOLVED', exactName.status === 'RESOLVED', exactName.status);
check('S2 kendali positif: harga kanonis katalog nyata Rp51.622', exactName.unitPrice === 51622, String(exactName.unitPrice));
const canonDecision = resolveDedPriceWithCanonical('DATABASE', exactName, { unitPrice: 999999, source: 'AI_ESTIMATE' });
check('S2 kendali positif: keputusan AHSP_2026 + kode 3.7.4', canonDecision.source === 'AHSP_2026' && canonDecision.ahspCode === '3.7.4');
check('S2 kendali positif: harga kanonis menang atas estimasi AI', canonDecision.unitPrice === 51622, String(canonDecision.unitPrice));

// =====================================================================
console.log('=== S3: Satuan tidak cocok dengan kandidat kanonis ===');
const unitMismatch = resolveCanonicalCode('3.7.4', 'm3');
check('S3 kode m2 diklaim utk item m3: UNIT_MISMATCH', unitMismatch.status === 'UNIT_MISMATCH', unitMismatch.status);
check('S3 UNIT_MISMATCH: harga null (tidak dikonversi diam-diam)', unitMismatch.unitPrice === null);
check('S3 UNIT_MISMATCH: kode tetap teridentifikasi utk review', unitMismatch.matchedCode === '3.7.4');
const unitMismatchMatch = matchDedItemToAhsp({ name: 'Plesteran dinding', unit: 'm3', claimedAhspCode: '3.7.4' });
check('S3 jalur klaim: status tetap UNIT_MISMATCH', unitMismatchMatch.status === 'UNIT_MISMATCH', unitMismatchMatch.status);
const unitMismatchDec = resolveDedPriceWithCanonical('DATABASE', unitMismatchMatch, { unitPrice: 750000, source: 'AI_ESTIMATE' });
check('S3 keputusan harga: BUKAN AHSP_2026 dan tanpa kode', unitMismatchDec.source !== 'AHSP_2026' && unitMismatchDec.ahspCode === undefined, unitMismatchDec.source);
// Pertahanan saat edit: mengganti satuan membatalkan harga kanonis.
const unitChanged = applyUnitChange(canonItem, 'm3');
check('S3 applyUnitChange: harga kanonis dibatalkan (null + UNRESOLVED)',
  unitChanged.unitPrice === null && unitChanged.priceSource === 'UNRESOLVED');
check('S3 applyUnitChange: kode + match kanonis dibersihkan',
  unitChanged.ahspCode === undefined && unitChanged.ahspMatch === undefined);

// =====================================================================
console.log('=== S4: Jebakan kuantitas ===');
const noUnit = attemptQuantityFromDimensionString('m3', '4000 x 150 x 200');
check('S4 dimensi tanpa satuan: quantity null (tidak dianggap meter)', noUnit.quantity === null);
check('S4 dimensi tanpa satuan: ambiguousUnit true', noUnit.ambiguousUnit === true);
check('S4 detectLengthUnitFactor tanpa penanda: unit null', detectLengthUnitFactor('4000 x 150 x 200').unit === null);
const withMm = attemptQuantityFromDimensionString('m3', '4000 x 150 x 200 mm');
check('S4 4000x150x200 mm = 0,12 m3', withMm.quantity !== null && Math.abs(withMm.quantity - 0.12) < 1e-9, String(withMm.quantity));
const withCm = attemptQuantityFromDimensionString('m3', '400 x 15 x 20 cm');
check('S4 400x15x20 cm = 0,12 m3', withCm.quantity !== null && Math.abs(withCm.quantity - 0.12) < 1e-9, String(withCm.quantity));
check('S4 parse "1.200 mm" = [1200] (ribuan Indonesia)', JSON.stringify(parseDimensionsString('1.200 mm')) === '[1200]',
  JSON.stringify(parseDimensionsString('1.200 mm')));
const localeTrap = attemptQuantityFromDimensionString('m', '1.200 mm');
check('S4 "1.200 mm" sebagai panjang = 1,2 m (bukan 0,0012)', localeTrap.quantity !== null && Math.abs(localeTrap.quantity - 1.2) < 1e-9, String(localeTrap.quantity));
check('S4 kuantitas absurd 120.000.000 m3 ditolak validasi',
  validateQuantity({ name: 'Galian tanah biasa', category: 'Pekerjaan Tanah', units: 'm3', quantity: 120000000, quantitySource: 'DED_EXPLICIT' }).ok === false);
check('S4 kuantitas negatif ditolak', validateQuantity({ name: 'Galian tanah biasa', units: 'm3', quantity: -5, quantitySource: 'DED_EXPLICIT' }).ok === false);
check('S4 kuantitas NaN ditolak', validateQuantity({ name: 'Galian tanah biasa', units: 'm3', quantity: NaN, quantitySource: 'DED_EXPLICIT' }).ok === false);
check('S4 calcSubtotal negatif -> null', calcSubtotal(-5, 1000) === null);
check('S4 calcSubtotal harga null -> null', calcSubtotal(10, null) === null);
check('S4 calcSubtotal nol -> null (bukan 0)', calcSubtotal(0, 1000) === null);
check('S4 elemen volume bersatuan panjang ditolak (kolom m\')',
  validateQuantity({ name: 'Kolom praktis 15/15', category: 'Struktur', units: "m'", quantity: 12, quantitySource: 'DED_EXPLICIT' }).ok === false);
check('S4 elemen luas bersatuan volume ditolak (dinding m3)',
  validateQuantity({ name: 'Dinding bata merah', category: 'Dinding', units: 'm3', quantity: 5, quantitySource: 'DED_EXPLICIT' }).ok === false);

// =====================================================================
console.log('=== S5: Provenance kuantitas ===');
check('S5 DED_EXPLICIT: validasi lolos',
  validateQuantity({ name: 'Plesteran dinding', category: 'Dinding', units: 'm2', quantity: 20, quantitySource: 'DED_EXPLICIT' }).ok === true);
check('S5 AI_INFERENCE: validasi lolos (aturan 2026-10-09)',
  validateQuantity({ name: 'Plesteran dinding', category: 'Dinding', units: 'm2', quantity: 20, quantitySource: 'AI_INFERENCE' }).ok === true);
check('S5 UNRESOLVED: validasi menolak meski ada angka',
  validateQuantity({ name: 'Plesteran dinding', category: 'Dinding', units: 'm2', quantity: 20, quantitySource: 'UNRESOLVED' }).ok === false);
const finProv = DedAiCalculator.finalizeItems([
  mkItem({ name: 'Plesteran dinding', category: 'Dinding', units: 'm2', quantity: 20, quantitySource: 'AI_INFERENCE', unitPrice: 51622, priceSource: 'AI_ESTIMATE' }),
  mkItem({ name: 'Plesteran dinding', category: 'Dinding', units: 'm2', quantity: 20, quantitySource: 'UNRESOLVED', unitPrice: 51622, priceSource: 'AI_ESTIMATE' }),
]);
check('S5 AI_INFERENCE terfinalisasi CALCULATED, sumber dipertahankan utk badge review',
  finProv[0].stage === 'CALCULATED' && finProv[0].quantitySource === 'AI_INFERENCE');
check('S5 UNRESOLVED terfinalisasi REJECTED + subtotal null',
  finProv[1].stage === 'REJECTED' && finProv[1].subtotal === null);
// FINDING: brief Sprint 2 mengharapkan ASSUMPTION tidak pernah masuk
// total, tetapi aturan yang berlaku (komentar calculator.ts pada
// validateQuantity + perbaikan 2026-10-09) mengizinkan ASSUMPTION sama
// seperti AI_INFERENCE: lolos validasi, CALCULATED, dan MASUK grandTotal.
// Mitigasi yang ada: view menghitungnya sebagai needsReview saat
// finalisasi (view.tsx handleFinalize) dan badge "Perlu Ditinjau".
const assumptionOut = DedAiCalculator.buildOutput({
  jobId: 's2', projectType: 'BANGUNAN', mode: 'FAST', policy: 'FULL_AI',
  projectName: 'Uji', pageCount: 1,
  items: [mkItem({ name: 'Plesteran dinding', category: 'Dinding', units: 'm2', quantity: 20, quantitySource: 'ASSUMPTION', unitPrice: 51622, priceSource: 'AI_ESTIMATE' })],
});
check('FINDING S5 ASSUMPTION: stage CALCULATED (bukan REJECTED)', assumptionOut.items[0].stage === 'CALCULATED', assumptionOut.items[0].stage);
check('FINDING S5 ASSUMPTION: nilainya MASUK grandTotal aplikasi', assumptionOut.grandTotal === 1032440, String(assumptionOut.grandTotal));

// =====================================================================
console.log('=== S6: Integritas harga ===');
check('S6 harga null -> UNRESOLVED + null', (() => { const r = applyAiEstimatePrice(null); return r.unitPrice === null && r.priceSource === 'UNRESOLVED'; })());
check('S6 harga tak wajar (Rp50) -> UNRESOLVED + null', (() => { const r = applyAiEstimatePrice(50); return r.unitPrice === null && r.priceSource === 'UNRESOLVED'; })());
check('S6 isSaneEstimate: 0 tidak wajar, 850000 wajar',
  isSaneEstimate(0) === false && isSaneEstimate(850000) === true);
const dbNoPrice = resolveDedPriceForPolicy('DATABASE', null);
check('S6 kebijakan DATABASE tanpa harga: UNRESOLVED + null (tidak pernah 0)', dbNoPrice.unitPrice === null && dbNoPrice.priceSource === 'UNRESOLVED');
const fullAiPrice = resolveDedPriceForPolicy('FULL_AI', 850000);
check('S6 kebijakan FULL_AI: label sumber AI_ESTIMATE (bukan kanonis)', fullAiPrice.priceSource === 'AI_ESTIMATE' && fullAiPrice.unitPrice === 850000);
const noMatch = matchDedItemToAhsp({ name: 'Zqxjk wvbnm plokijuh', unit: 'ls' });
check('S6 nama tanpa padanan: NO_MATCH', noMatch.status === 'NO_MATCH', noMatch.status);
const dbUnresolved = resolveDedPriceWithCanonical('DATABASE', noMatch, { unitPrice: null, source: 'UNRESOLVED' });
check('S6 DATABASE + NO_MATCH + tanpa estimasi: UNRESOLVED + null', dbUnresolved.source === 'UNRESOLVED' && dbUnresolved.unitPrice === null);
const dbFallback = resolveDedPriceWithCanonical('DATABASE', noMatch, { unitPrice: 750000, source: 'AI_ESTIMATE' });
check('S6 DATABASE + NO_MATCH + estimasi wajar: fallback AI_ESTIMATE', dbFallback.source === 'AI_ESTIMATE' && dbFallback.unitPrice === 750000);
check('S6 fallback DATABASE: catatan jujur "tidak ditemukan di database"', (dbFallback.notes || '').includes('tidak ditemukan di database'));
check('S6 fallback DATABASE: tanpa kode AHSP', dbFallback.ahspCode === undefined);
const fullAiCanon = resolveDedPriceWithCanonical('FULL_AI', exactName, { unitPrice: 999999, source: 'AI_ESTIMATE' });
check('S6 FULL_AI + match RESOLVED: kanonis menang (AHSP_2026, 51622)', fullAiCanon.source === 'AHSP_2026' && fullAiCanon.unitPrice === 51622);
const finNoPrice = DedAiCalculator.finalizeItems([
  mkItem({ name: 'Galian tanah biasa', category: 'Pekerjaan Tanah', units: 'm3', quantity: 5, quantitySource: 'DED_EXPLICIT', unitPrice: null, priceSource: 'UNRESOLVED' }),
]);
check('S6 item berharga null: subtotal null, tidak CALCULATED', finNoPrice[0].subtotal === null && finNoPrice[0].stage !== 'CALCULATED');

// =====================================================================
console.log('=== S7: Duplikat ===');
// Lapisan kalkulator/finalisasi TIDAK melakukan dedup: dua item identik
// dihitung dua kali. Dedup hanya ada di penggabungan antar-pass privat
// service.run dengan kunci nama|satuan (service.ts:578) — dimensi dan
// spesifikasi TIDAK termasuk kunci.
const dupA = mkItem({ name: 'Plesteran dinding', category: 'Dinding', units: 'm2', quantity: 10, quantitySource: 'DED_EXPLICIT', unitPrice: 51622, priceSource: 'AHSP_2026', ahspCode: '3.7.4' });
const dupOut = DedAiCalculator.buildOutput({
  jobId: 's2', projectType: 'BANGUNAN', mode: 'FAST', policy: 'DATABASE',
  projectName: 'Uji', pageCount: 1, items: [dupA, { ...dupA, id: 's2-2' }],
});
check('S7 dua item identik di lapisan finalisasi: totalItems 2 (tidak didedup di sini)', dupOut.coverage.totalItems === 2);
check('S7 dua item identik: grandTotal = 2x subtotal (risiko dobel bila lolos merge)', dupOut.grandTotal === 1032440, String(dupOut.grandTotal));
// Bukti tabrakan kunci merge: nama+satuan sama, dimensi berbeda -> kuantitas
// sah yang BERBEDA; kunci merge service (nama|satuan) akan membuang salah
// satunya dan mempertahankan yang pertama/berkuantitas.
const dimA = attemptQuantityFromDimensionString('m3', '4000 x 150 x 200 mm');
const dimB = attemptQuantityFromDimensionString('m3', '6000 x 200 x 300 mm');
check('FINDING S7 dimensi berbeda menghasilkan kuantitas berbeda (0,12 vs 0,36)',
  dimA.quantity !== null && dimB.quantity !== null && Math.abs(dimA.quantity - 0.12) < 1e-9 && Math.abs(dimB.quantity - 0.36) < 1e-9,
  `${dimA.quantity}/${dimB.quantity}`);
console.log('  FINDING S7: kunci dedup antar-pass = nama ternormalisasi + satuan saja (service.ts:578); item bernama sama bersatuan sama tetapi dimensi/spesifikasi berbeda akan tertelan merge (yang dipertahankan: pertama, atau yang berkuantitas bila yang pertama kosong).');

// =====================================================================
console.log('=== S8: Finalisasi & integrasi RAB ===');
const finA = DedAiCalculator.buildOutput({
  jobId: 's2', projectType: 'BANGUNAN', mode: 'FAST', policy: 'DATABASE',
  projectName: 'Uji', pageCount: 1, items: [canonItem, aiItem],
});
check('S8a item kanonis: CALCULATED + subtotal 516.220', finA.items[0].stage === 'CALCULATED' && finA.items[0].subtotal === 516220, `${finA.items[0].stage}/${finA.items[0].subtotal}`);
check('S8a item estimasi: CALCULATED + subtotal 2.125.000', finA.items[1].stage === 'CALCULATED' && finA.items[1].subtotal === 2125000, `${finA.items[1].stage}/${finA.items[1].subtotal}`);
check('S8a grandTotal deterministik = 2.641.220', finA.grandTotal === 2641220, String(finA.grandTotal));
const mapA = mapDedAiItemToRabInput(finA.items[0], 'DATABASE');
const mapB = mapDedAiItemToRabInput(finA.items[1], 'DATABASE');
check('S8a mapper kanonis: OFFICIAL_AHSP + VERIFIED + kode 3.7.4',
  mapA?.priceSourceKind === 'OFFICIAL_AHSP' && mapA?.verificationStatus === 'VERIFIED' && mapA?.ahspCode === '3.7.4');
check('S8a mapper estimasi: EZRAB_ASSUMPTION + NEEDS_VERIFICATION + tanpa kode',
  mapB?.priceSourceKind === 'EZRAB_ASSUMPTION' && mapB?.verificationStatus === 'NEEDS_VERIFICATION' && mapB?.ahspCode === undefined);
const recA = createRabItemRecord(mapA as never, 'proj-s2', { index: 0 });
const recB = createRabItemRecord(mapB as never, 'proj-s2', { index: 1 });
check('S8a factory: amount kanonis 516.220 + VERIFIED bertahan', recA.amount === 516220 && recA.verificationStatus === 'VERIFIED', `${recA.amount}/${recA.verificationStatus}`);
check('S8a factory: amount estimasi 2.125.000 + NEEDS_VERIFICATION bertahan', recB.amount === 2125000 && recB.verificationStatus === 'NEEDS_VERIFICATION', `${recB.amount}/${recB.verificationStatus}`);
check('S8a factory: baris estimasi tidak membawa kode AHSP', !recB.ahspCode);

// (b) campuran valid + tidak valid — predikat "savable" yang sama dengan
// handler view.tsx:465 (stage CALCULATED && subtotal != null && unitPrice != null).
const mixed = DedAiCalculator.finalizeItems([
  canonItem,
  mkItem({ name: 'Galian tanah biasa', category: 'Pekerjaan Tanah', units: 'm3', quantity: null, quantitySource: 'UNRESOLVED', unitPrice: 850000, priceSource: 'AI_ESTIMATE' }),
  mkItem({ name: 'Galian tanah biasa', category: 'Pekerjaan Tanah', units: 'm3', quantity: 5, quantitySource: 'DED_EXPLICIT', unitPrice: null, priceSource: 'UNRESOLVED' }),
  mkItem({ name: 'Galian tanah biasa', category: 'Pekerjaan Tanah', units: 'm3', quantity: 120000000, quantitySource: 'DED_EXPLICIT', unitPrice: 850000, priceSource: 'AI_ESTIMATE' }),
]);
const savable = mixed.filter((it) => it.stage === 'CALCULATED' && it.subtotal != null && it.unitPrice != null);
check('S8b campuran 4 item: tepat 1 yang savable', savable.length === 1, String(savable.length));
check('S8b yang savable adalah item kanonis', savable[0]?.ahspCode === '3.7.4');
check('S8b mapper atas yang savable menghasilkan tepat 1 baris', savable.flatMap((it) => { const m = mapDedAiItemToRabInput(it, 'DATABASE'); return m ? [m] : []; }).length === 1);
check('S8b item kuantitas absurd: REJECTED oleh kalkulator', mixed[3].stage === 'REJECTED' && mixed[3].subtotal === null);
// Pertahanan berlapis, dinyatakan apa adanya: mapper sendiri hanya menolak
// harga/kuantitas null — item REJECTED berharga tetap lolos mapper; yang
// menahannya adalah predikat stage di handler finalisasi.
check('S8b mapper saja TIDAK menahan item REJECTED berharga (gerbang stage ada di handler)',
  mapDedAiItemToRabInput(mixed[3], 'DATABASE') !== null);

// (c) semua terblokir: tidak ada sinyal sukses palsu pada lapisan yang
// menjadi masukan gerbang service (service.ts:653 NO_CALCULABLE_ITEMS).
const allBlocked = DedAiCalculator.buildOutput({
  jobId: 's2', projectType: 'BANGUNAN', mode: 'FAST', policy: 'DATABASE',
  projectName: 'Uji', pageCount: 1,
  items: [
    mkItem({ name: 'Galian tanah biasa', category: 'Pekerjaan Tanah', units: 'm3', quantity: null, quantitySource: 'UNRESOLVED', unitPrice: 850000, priceSource: 'AI_ESTIMATE' }),
    mkItem({ name: 'Galian tanah biasa', category: 'Pekerjaan Tanah', units: 'm3', quantity: 5, quantitySource: 'DED_EXPLICIT', unitPrice: null, priceSource: 'UNRESOLVED' }),
    mkItem({ name: 'Galian tanah biasa', category: 'Pekerjaan Tanah', units: 'm3', quantity: 9, quantitySource: 'UNRESOLVED', unitPrice: 850000, priceSource: 'AI_ESTIMATE' }),
  ],
});
check('S8c semua terblokir: grandTotal 0 dari subtotal null (bukan dari harga 0)', allBlocked.grandTotal === 0 && allBlocked.items.every((i) => i.subtotal === null));
check('S8c semua terblokir: cakupan 0/3 resolved (masukan gerbang NO_CALCULABLE_ITEMS)',
  allBlocked.coverage.itemsFullyResolved === 0 && allBlocked.coverage.totalItems === 3);
check('S8c semua terblokir: tidak ada item CALCULATED', allBlocked.items.every((i) => i.stage !== 'CALCULATED'));

// (d) mapper menolak item tanpa kuantitas / tanpa harga / sumber UNRESOLVED
// yang membawa angka (item tidak konsisten tidak boleh menyelinap).
check('S8d mapper: kuantitas null -> null', mapDedAiItemToRabInput(mkItem({ quantity: null, unitPrice: 1000, priceSource: 'AI_ESTIMATE' }), 'FULL_AI') === null);
check('S8d mapper: harga null -> null', mapDedAiItemToRabInput(mkItem({ quantity: 3, unitPrice: null, priceSource: 'UNRESOLVED' }), 'FULL_AI') === null);
check('S8d mapper: priceSource UNRESOLVED membawa angka -> tetap null',
  mapDedAiItemToRabInput(mkItem({ quantity: 3, unitPrice: 12345, priceSource: 'UNRESOLVED' }), 'FULL_AI') === null);

// (e) FINDING: finalisasi berulang. Jalur tulis (factory yang dipakai
// bulkAddRabItems) tidak punya kunci idempotensi: input yang sama selalu
// menghasilkan record baru ber-id acak. Dedup di bulkAddRabItems hanya
// aktif bila jalur template-apply memintanya (ProjectContext.tsx:1703+),
// bukan untuk finalisasi DED. Satu-satunya penjaga adalah state lokal
// `finalized` di view (view.tsx:74, DedAiResultView guard) — state yang
// ter-reset saat analisis baru / kembali ke layar input (view.tsx:265,449).
const recB2 = createRabItemRecord(mapB as never, 'proj-s2', { index: 1 });
check('FINDING S8e factory: input identik -> record kedua ber-id berbeda', recB2.id !== recB.id, `${recB.id} vs ${recB2.id}`);
check('FINDING S8e factory: record kedua membawa amount yang sama (akan dobel di RAB)', recB2.amount === recB.amount && recB2.description === recB.description);

// (f) FINDING: keadaan basi — proyek target terhapus. handleFinalize
// (view.tsx) hanya mengganti nama bila proyek tidak ditemukan, lalu tetap
// memanggil bulkAddRabItems dengan id basi; bulkAddRabItems hanya throw
// bila id kosong (ProjectContext.tsx:1693), dan factory tidak memvalidasi
// keberadaan proyek sama sekali.
const staleRec = createRabItemRecord(mapA as never, 'proyek-sudah-dihapus', { index: 0 });
check('FINDING S8f factory: record terikat proyek yang tidak ada tetap dibuat', staleRec.projectId === 'proyek-sudah-dihapus' && staleRec.amount === 516220);

// =====================================================================
console.log('=== S9: Total parsial ===');
const partialOut = DedAiCalculator.buildOutput({
  jobId: 's2', projectType: 'BANGUNAN', mode: 'FAST', policy: 'DATABASE',
  projectName: 'Uji', pageCount: 1,
  items: [
    canonItem,
    mkItem({ name: 'Galian tanah biasa', category: 'Pekerjaan Tanah', units: 'm3', quantity: 4, quantitySource: 'DED_EXPLICIT', unitPrice: 100000, priceSource: 'AI_ESTIMATE' }),
    mkItem({ name: 'Galian tanah biasa', category: 'Pekerjaan Tanah', units: 'm3', quantity: null, quantitySource: 'UNRESOLVED', unitPrice: 50000, priceSource: 'AI_ESTIMATE' }),
    mkItem({ name: 'Galian tanah biasa', category: 'Pekerjaan Tanah', units: 'm3', quantity: 7, quantitySource: 'DED_EXPLICIT', unitPrice: null, priceSource: 'UNRESOLVED' }),
    mkItem({ name: 'Galian tanah biasa', category: 'Pekerjaan Tanah', units: 'm3', quantity: 9, quantitySource: 'UNRESOLVED', unitPrice: 50000, priceSource: 'AI_ESTIMATE' }),
  ],
});
check('S9 grandTotal = jumlah 2 subtotal resolved saja (516.220 + 400.000)', partialOut.grandTotal === 916220, String(partialOut.grandTotal));
check('S9 cakupan melaporkan 2/5 resolved', partialOut.coverage.itemsFullyResolved === 2 && partialOut.coverage.totalItems === 5 && partialOut.coverage.itemsUnresolved === 3);
// itemsWithQuantity/itemsWithPrice menghitung KEHADIRAN field (termasuk
// pada item REJECTED yang angkanya tertahan) — bukan ketuntasan; angka
// ketuntasan yang jujur adalah itemsFullyResolved (2). Fixture: kuantitas
// hadir di item 1,2,4,5 dan harga di 1,2,3,5 -> 4/4.
check('S9 cakupan kehadiran field terpisah dari ketuntasan (4 berkuantitas, 4 berharga, 2 resolved)',
  partialOut.coverage.itemsWithQuantity === 4 && partialOut.coverage.itemsWithPrice === 4 && partialOut.coverage.itemsFullyResolved === 2,
  `${partialOut.coverage.itemsWithQuantity}/${partialOut.coverage.itemsWithPrice}/${partialOut.coverage.itemsFullyResolved}`);
check('S9 ringkasan kategori konsisten (1 resolved per kategori terhitung terpisah)', partialOut.categorySummaries.every((c) => c.itemCount === c.resolvedCount + c.unresolvedCount));

console.log(`\n=== HASIL SPRINT 2 INTEGRITY: ${pass} PASS, ${fail} FAIL ===`);
if (fail > 0) process.exit(1);
