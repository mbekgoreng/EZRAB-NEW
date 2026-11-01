/**
 * SPRINT 3.1 — Workstream A: evaluator kewajaran kuantitas deterministik
 * (reasonableness.ts) + investigasi MALFORMED_RESPONSE landscape
 * (retry terbatas executeDedPassAttempt di service.ts).
 *
 * Menguji modul ASLI:
 * - ded-ai-estimate/reasonableness: evaluateQuantityReasonableness,
 *   applyQuantityReasonablenessReview.
 * - ded-ai-estimate/service: executeDedPassAttempt (klien AI terskrip —
 *   deterministik, tanpa jaringan), parseDedAiModelResponse,
 *   classifyPassOutcome, decideNoItemsError.
 * - ded-ai-estimate/quantity: attemptQuantityFromDimensionString
 *   (perilaku hulu untuk formula tak sah).
 * - ded-ai-estimate/calculator: DedAiCalculator.buildOutput (kasus 10:
 *   ASSUMPTION bertanda review TETAP masuk Total Estimasi tunggal).
 *
 * Kasus 1–10 mengikuti §4.1 brief Sprint 3.1. Kasus 5 memakai pola
 * residu matriks Sprint 3 yang asli (Balok gedung 0,000245 m³): dimensi
 * bergaya sumber yang hitung-ulangnya 0,24525 m³ — selisih tepat
 * 1000×, pola selip mm↔m.
 *
 * Run: esbuild bundle lalu node, seperti suite .src.ts lain.
 */
import {
  evaluateQuantityReasonableness,
  applyQuantityReasonablenessReview,
} from '../ai-tools/ded-ai-estimate/reasonableness';
import {
  executeDedPassAttempt,
  parseDedAiModelResponse,
  classifyPassOutcome,
  decideNoItemsError,
  DED_PASS_MAX_MALFORMED_RETRIES,
} from '../ai-tools/ded-ai-estimate/service';
import { attemptQuantityFromDimensionString } from '../ai-tools/ded-ai-estimate/quantity';
import { DedAiCalculator } from '../ai-tools/ded-ai-estimate/calculator';
import type { DedAiItem } from '../ai-tools/ded-ai-estimate/types';

let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}

let seq = 0;
function mkItem(over: Partial<DedAiItem>): DedAiItem {
  seq++;
  return {
    id: `uji-${seq}`,
    name: 'Pekerjaan Uji',
    category: 'Struktur',
    units: 'm3',
    quantity: null,
    quantitySource: 'AI_INFERENCE',
    unitPrice: null,
    priceSource: 'UNRESOLVED',
    subtotal: null,
    sourcePages: [],
    provenance: [],
    stage: 'PARSE',
    ...over,
  } as DedAiItem;
}

async function main() {
  console.log('=== Kasus 1: kecil, derivasi konsisten — Sprint 3.2: total di bawah amplop fragmen → NEEDS_REVIEW ===');
  {
    // Plat 1200×100×50 mm = 0,006 m³ — hitung-ulang dimensinya menjelaskan
    // nilai kecil itu persis (desain Sprint 3.1: REASONABLE). Sprint 3.2
    // menambahkan sumbu skala TOTAL-item: 0,006 m³ untuk kelas struktural
    // berada di bawah amplop fragmen 0,01 m³ (elemen utuh terkecil
    // ≈0,043–0,09 m³), jadi total sekecil ini wajib ditinjau sebagai
    // kemungkinan fragmen — BUKAN ditolak: item tetap di total, dan basis
    // derivasinya dipertahankan di derivationReasonCode. Kasus "kecil yang
    // sah tetap REASONABLE" kini diwakili A5 sprint32Scale (sloof 0,045 m³,
    // di atas amplop fragmen).
    const item = mkItem({
      name: 'Plat Tangga',
      quantity: 0.006,
      quantitySource: 'DED_GEOMETRIC',
      rawDimensions: '1200 x 100 x 50 mm',
      quantityFormula: '1200 x 100 x 50 mm (= 1,2 × 0,1 × 0,05)',
    });
    const r = evaluateQuantityReasonableness(item);
    check('1a REGRESI Sprint 3.2 (dulu REASONABLE): outcome NEEDS_REVIEW oleh sumbu skala', r?.outcome === 'NEEDS_REVIEW', JSON.stringify(r));
    check('1b REGRESI Sprint 3.2: primer TOTAL_QUANTITY_BELOW_SCALE_ENVELOPE + derivasi dipertahankan',
      r?.reasonCode === 'TOTAL_QUANTITY_BELOW_SCALE_ENVELOPE' && (r as any)?.derivationReasonCode === 'DIMENSIONS_EXPLAIN_QUANTITY');
    check('1c derivedQuantity ≈ 0,006', r?.derivedQuantity !== null && r?.derivedQuantity !== undefined && Math.abs(r.derivedQuantity - 0.006) < 1e-9);
  }

  console.log('=== Kasus 2: kecil dengan konteks tidak cukup → NEEDS_REVIEW ===');
  {
    // Kolom 0,005 m³ (5 liter) tanpa dimensi/formula sama sekali.
    // Pilihan aturan: NEEDS_REVIEW (bukan INSUFFICIENT_CONTEXT) karena
    // klaimnya sendiri — elemen struktural sebesar 5 liter — adalah
    // pemicu review-nya; konteks yang hilang justru memperkuatnya.
    const item = mkItem({ name: 'Kolom K1 300x300', quantity: 0.005, quantitySource: 'AI_INFERENCE' });
    const r = evaluateQuantityReasonableness(item);
    check('2a outcome NEEDS_REVIEW', r?.outcome === 'NEEDS_REVIEW', JSON.stringify(r));
    check('2b kode MICRO_QUANTITY_CONTEXT', r?.reasonCode === 'MICRO_QUANTITY_CONTEXT');
  }

  console.log('=== Kasus 3: besar dengan dukungan pengulangan → REASONABLE ===');
  {
    // Balok satuan 0,72 m³ × 24 balok = 17,28 m³ — formula menyatakan
    // jumlahnya, jadi skala besar ini terdekomposisi dengan sah.
    const item = mkItem({
      name: 'Balok B1',
      quantity: 17.28,
      quantitySource: 'DED_GEOMETRIC',
      rawDimensions: '300 x 600 x 4000 mm',
      quantityFormula: '0,3 x 0,6 x 4,0 x 24 balok (= 17,28)',
    });
    const r = evaluateQuantityReasonableness(item);
    check('3a outcome REASONABLE', r?.outcome === 'REASONABLE', JSON.stringify(r));
    check('3b basis REPEATED_OBJECTS', r?.reasonCode === 'REPEATED_OBJECTS');
  }

  console.log('=== Kasus 4: besar tidak konsisten dengan dimensi → NEEDS_REVIEW mismatch ===');
  {
    // Dimensi yang sama dengan kasus 3, kuantitas 720 m³ = 1000×
    // hitung-ulang — pola selip mm↔m, BUKAN "1000 balok" (jumlah
    // implisit sebesar itu tidak diterima tanpa dokumentasi).
    const item = mkItem({
      name: 'Balok B1',
      quantity: 720,
      quantitySource: 'DED_GEOMETRIC',
      rawDimensions: '300 x 600 x 4000 mm',
    });
    const r = evaluateQuantityReasonableness(item);
    check('4a outcome NEEDS_REVIEW', r?.outcome === 'NEEDS_REVIEW', JSON.stringify(r));
    check('4b kode DIMENSION_RESULT_MISMATCH', r?.reasonCode === 'DIMENSION_RESULT_MISMATCH');
    check('4c derivedQuantity ≈ 0,72', r?.derivedQuantity !== null && r?.derivedQuantity !== undefined && Math.abs(r.derivedQuantity - 0.72) < 1e-9);
    check('4d severity HIGH', r?.severity === 'HIGH');
  }

  console.log('=== Kasus 5: residu gedung Sprint 3 — Balok 0,000245 m³ → NEEDS_REVIEW ===');
  {
    // Dimensi bergaya sumber 150×300×5450 mm terhitung-ulang 0,24525 m³;
    // kuantitas tercatat tepat 1000× lebih kecil (selip skala), lolos
    // CALCULATED pada matriks Sprint 3. Evaluator harus menandainya.
    const item = mkItem({
      name: 'Balok B1 150x300',
      quantity: 0.000245,
      quantitySource: 'DED_GEOMETRIC',
      rawDimensions: '150 x 300 x 5450 mm',
    });
    const r = evaluateQuantityReasonableness(item);
    check('5a outcome NEEDS_REVIEW', r?.outcome === 'NEEDS_REVIEW', JSON.stringify(r));
    check('5b kode DIMENSION_RESULT_MISMATCH', r?.reasonCode === 'DIMENSION_RESULT_MISMATCH');
    check('5c derivedQuantity ≈ 0,24525', r?.derivedQuantity !== null && r?.derivedQuantity !== undefined && Math.abs(r.derivedQuantity - 0.24525) < 1e-6, String(r?.derivedQuantity));
    check('5d originalQuantity tidak diubah evaluator', r?.originalQuantity === 0.000245 && item.quantity === 0.000245);
  }

  console.log('=== Kasus 6: satuan hilang/ambigu → INSUFFICIENT_CONTEXT ===');
  {
    const item = mkItem({ name: 'Pekerjaan Persiapan', units: 'satuan', quantity: 25, quantitySource: 'AI_INFERENCE' });
    const r = evaluateQuantityReasonableness(item);
    check('6a outcome INSUFFICIENT_CONTEXT', r?.outcome === 'INSUFFICIENT_CONTEXT', JSON.stringify(r));
    check('6b kode AMBIGUOUS_UNIT', r?.reasonCode === 'AMBIGUOUS_UNIT');
  }

  console.log('=== Kasus 7: dimensi diameter saja → INSUFFICIENT_CONTEXT ===');
  {
    const linier = mkItem({
      name: 'Pipa PVC AW',
      units: "m'",
      quantity: 0.8,
      quantitySource: 'AI_INFERENCE',
      rawDimensions: 'ø800 mm',
    });
    const r1 = evaluateQuantityReasonableness(linier);
    check('7a linear: INSUFFICIENT_CONTEXT', r1?.outcome === 'INSUFFICIENT_CONTEXT', JSON.stringify(r1));
    check('7b linear: kode DIAMETER_ONLY_DIMENSION', r1?.reasonCode === 'DIAMETER_ONLY_DIMENSION');
    const volum = mkItem({
      name: 'Pondasi Telapak',
      units: 'm3',
      quantity: 1.1,
      quantitySource: 'AI_INFERENCE',
      rawDimensions: 'D110',
    });
    const r2 = evaluateQuantityReasonableness(volum);
    check('7c volumetrik: INSUFFICIENT_CONTEXT', r2?.outcome === 'INSUFFICIENT_CONTEXT' && r2?.reasonCode === 'DIAMETER_ONLY_DIMENSION', JSON.stringify(r2));
  }

  console.log('=== Kasus 8: formula matematis tidak sah ===');
  {
    // (a) Evaluator: faktor nol pada dimensi → hitung-ulang 0 melawan
    // kuantitas tercatat > 0 → mismatch.
    const item = mkItem({
      name: 'Balok B2',
      quantity: 12,
      quantitySource: 'DED_GEOMETRIC',
      rawDimensions: '6000 x 0 x 200 mm',
    });
    const r = evaluateQuantityReasonableness(item);
    check('8a NEEDS_REVIEW mismatch faktor nol', r?.outcome === 'NEEDS_REVIEW' && r?.reasonCode === 'DIMENSION_RESULT_MISMATCH', JSON.stringify(r));
    check('8b derivedQuantity 0', r?.derivedQuantity === 0);
    // (b) Perilaku hulu yang sebenarnya: mesin kuantitas menghitung 0
    // untuk string itu, dan convertAiItem (service.ts) men-null-kan
    // kuantitas ≤ 0 menjadi UNRESOLVED — item semacam ini tidak pernah
    // mencapai evaluator dengan kuantitas hidup dari jalur dimensi.
    const upstream = attemptQuantityFromDimensionString('m3', '6000 x 0 x 200 mm');
    check('8c mesin kuantitas menghasilkan 0 (ditolak hulu sebagai ≤ 0)', upstream.quantity === 0, String(upstream.quantity));
  }

  console.log('=== Kasus 9: bukti sah + peringatan teknik hidup berdampingan ===');
  {
    // Lima sumbu terpisah: label bukti B2 tetap DED_GEOMETRIC (tidak
    // ditimpa evaluator), sementara sumbu kewajaran berkata NEEDS_REVIEW.
    const item = mkItem({
      name: 'Balok B1 150x300',
      quantity: 0.000245,
      quantitySource: 'DED_GEOMETRIC',
      rawDimensions: '150 x 300 x 5450 mm',
    });
    applyQuantityReasonablenessReview([item]);
    check('9a quantityReview NEEDS_REVIEW', item.quantityReview?.outcome === 'NEEDS_REVIEW');
    check('9b label bukti TIDAK berubah (tetap DED_GEOMETRIC)', item.quantitySource === 'DED_GEOMETRIC');
    check('9c kuantitas TIDAK berubah', item.quantity === 0.000245);
    check('9d penanda tertempel di quantityNote', (item.quantityNote || '').includes('Tinjauan kewajaran kuantitas'));
  }

  console.log('=== Kasus 10: ASSUMPTION 150 m³ — ditandai, TETAP masuk Total Estimasi ===');
  {
    // Pola run rumah Sprint 2: balok ASSUMPTION 150 m³. Di bawah G2
    // Opsi A ia tetap masuk total tunggal — tetapi sekarang membawa
    // tanda review IMPLAUSIBLE_ELEMENT_SCALE yang terlihat.
    const item = mkItem({
      name: 'Balok Induk',
      quantity: 150,
      quantitySource: 'ASSUMPTION',
      unitPrice: 5000000,
      priceSource: 'AI_ESTIMATE',
    });
    const r = evaluateQuantityReasonableness(item);
    check('10a NEEDS_REVIEW IMPLAUSIBLE_ELEMENT_SCALE', r?.outcome === 'NEEDS_REVIEW' && r?.reasonCode === 'IMPLAUSIBLE_ELEMENT_SCALE', JSON.stringify(r));
    applyQuantityReasonablenessReview([item]);
    const out = DedAiCalculator.buildOutput({
      jobId: 'uji-31',
      projectType: 'BANGUNAN',
      mode: 'FAST',
      policy: 'FULL_AI',
      projectName: 'Uji Sprint 3.1',
      pageCount: 1,
      items: [item],
    });
    const fin = out.items[0];
    check('10b item tetap CALCULATED', fin.stage === 'CALCULATED', fin.stage);
    check('10c subtotal utuh 150 × Rp5.000.000', fin.subtotal === 750000000, String(fin.subtotal));
    check('10d grandTotal memuat asumsi (total tunggal)', out.grandTotal === 750000000, String(out.grandTotal));
    check('10e coverage.itemsWithAssumption = 1', out.coverage.itemsWithAssumption === 1);
    check('10f quantityReview bertahan melewati kalkulator', fin.quantityReview?.outcome === 'NEEDS_REVIEW');
    check('10g kuantitas asli tidak diubah', fin.quantity === 150);
  }

  console.log('=== Determinisme evaluator ===');
  {
    const a = mkItem({ name: 'Balok B1', quantity: 720, quantitySource: 'DED_GEOMETRIC', rawDimensions: '300 x 600 x 4000 mm' });
    const b = mkItem({ name: 'Balok B1', quantity: 720, quantitySource: 'DED_GEOMETRIC', rawDimensions: '300 x 600 x 4000 mm' });
    const ra = evaluateQuantityReasonableness(a);
    const rb = evaluateQuantityReasonableness(b);
    check('D1 input identik → hasil identik', JSON.stringify(ra) === JSON.stringify(rb));
    const noQty = mkItem({ name: 'Tanpa Kuantitas', quantity: null });
    check('D2 kuantitas null → evaluator null (tanpa anotasi)', evaluateQuantityReasonableness(noQty) === null);
  }

  console.log('=== Tugas 2: MALFORMED_RESPONSE — jalur respons & retry terbatas ===');
  {
    const prose = {
      success: true,
      content: '# Ringkasan Pekerjaan\nBerikut uraian pekerjaan yang ditemukan pada dokumen ini dalam bentuk narasi panjang tanpa struktur data apa pun.',
      structured: null,
      requestId: 'uji-prosa',
    } as any;
    const validJson = JSON.stringify({ workItems: [{ name: 'Pekerjaan A', units: 'm2', quantity: 10 }] });
    const valid = { success: true, content: validJson, structured: null, requestId: 'uji-json' } as any;
    const fenced = { success: true, content: '```json\n' + validJson + '\n```', structured: null, requestId: 'uji-pagar' } as any;

    // Prosa murni: tidak pernah menjadi sukses/EMPTY palsu.
    const parsedProse = parseDedAiModelResponse(prose.content);
    check('M1 prosa murni → parseFailed', parsedProse.parseFailed === true);
    const clsProse = classifyPassOutcome(parsedProse.parsed, parsedProse.parseFailed);
    check('M2 prosa murni → MALFORMED_RESPONSE berkode', clsProse.status === 'MALFORMED_RESPONSE' && !!clsProse.errorCode, clsProse.status);
    check('M3 prosa murni → 0 item (tanpa fabrikasi)', clsProse.items.length === 0);
    const envErr = decideNoItemsError(['MALFORMED_RESPONSE'], null);
    check('M4 kode MALFORMED_RESPONSE utuh sampai envelope akhir', envErr.errorCode === 'MALFORMED_RESPONSE' && envErr.retryable === true);
    check('M5 kontras: tanpa pass malformed → NO_DATA (bukan tertukar)', decideNoItemsError(['EMPTY_RESPONSE'], null).errorCode === 'NO_DATA');

    // JSON berpagar markdown ter-parse normal.
    let calls = 0;
    const rFenced = await executeDedPassAttempt(async () => { calls++; return fenced; });
    check('M6 JSON berpagar → OK tanpa retry', rFenced.kind === 'OUTCOME' && rFenced.outcome.status === 'OK' && rFenced.retries === 0 && calls === 1, JSON.stringify(rFenced.kind));
    check('M7 JSON berpagar → 1 item', rFenced.kind === 'OUTCOME' && rFenced.outcome.items.length === 1);

    // Prosa lalu JSON sah: retry SATU kali menyelamatkan pass, tercatat.
    calls = 0;
    const rRetry = await executeDedPassAttempt(async () => { calls++; return calls === 1 ? prose : valid; });
    check('M8 prosa→JSON: sukses pada percobaan ulang', rRetry.kind === 'OUTCOME' && rRetry.outcome.status === 'OK', JSON.stringify(rRetry.kind));
    check('M9 prosa→JSON: retries = 1 dan tepat 2 panggilan', rRetry.retries === 1 && calls === 2, `retries=${rRetry.retries} calls=${calls}`);
    check('M10 prosa→JSON: item hanya dari outcome final (1, bukan ganda)', rRetry.kind === 'OUTCOME' && rRetry.outcome.items.length === 1);

    // Prosa dua kali: tetap MALFORMED — retry terbatas, tanpa sukses palsu.
    calls = 0;
    const rTwice = await executeDedPassAttempt(async () => { calls++; return prose; });
    check('M11 prosa×2: tetap MALFORMED_RESPONSE', rTwice.kind === 'OUTCOME' && rTwice.outcome.status === 'MALFORMED_RESPONSE');
    check('M12 prosa×2: retry berhenti di batas (2 panggilan)', calls === 1 + DED_PASS_MAX_MALFORMED_RETRIES && rTwice.retries === DED_PASS_MAX_MALFORMED_RETRIES, `calls=${calls}`);
    check('M13 prosa×2: 0 item', rTwice.kind === 'OUTCOME' && rTwice.outcome.items.length === 0);

    // Kegagalan provider TIDAK dicoba ulang (auth/kuota/batas biaya).
    calls = 0;
    const rErr = await executeDedPassAttempt(async () => {
      calls++;
      return { success: false, errorCode: 'AUTH_ERROR', stage: 'gateway', message: 'ditolak', retryable: false } as any;
    });
    check('M14 provider error → PROVIDER_ERROR tanpa retry', rErr.kind === 'PROVIDER_ERROR' && rErr.retries === 0 && calls === 1, JSON.stringify(rErr.kind));
  }

  console.log(`\n=== HASIL SPRINT 3.1 REASONABLENESS: ${pass} PASS, ${fail} FAIL ===`);
  if (fail > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error('SUITE ERROR', err);
  process.exitCode = 1;
});
