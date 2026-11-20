/**
 * dedFullAiQuantityAssumptions.src.ts — FULL AI ISI KUANTITAS KOSONG
 * DENGAN ASUMSI AI (keputusan owner 2026-11-20 23:18, tap 23:22).
 *
 * Keputusan produk: di mode Full AI, AI BOLEH mengarang harga maupun
 * kuantitas, asal konsisten dengan asumsinya sendiri dan tetap berlabel
 * asumsi; AI mengerjakan semuanya. CAKUPAN: mode Full AI SAJA — mode
 * EZRAB AI (Database) tetap fail-closed, tanpa karangan.
 *
 * Bukti live (screenshot owner 23:18, Preview hmvp6ihqm, aa42c38, PDF
 * gambar rumah 1 lantai): 37 item, 15 ada volume, 22 DIKECUALIKAN dari
 * total (MISSING_QUANTITY) — item punya harga Estimasi AI tapi tanpa
 * kuantitas. Aturan estimasi konteks-denah (estimateMissingQuantity)
 * hanya mencakup jenis item tertentu dan butuh konteks denah; tanpa
 * dimensi sama sekali, aturannya tidak jalan.
 *
 * Perbaikan (src/ai-tools/ded-full-ai/service.ts + prompts.ts):
 *  1. completeFullAiQuantitiesWithAi — SATU panggilan AI tambahan sesudah
 *     pass konteks, meminta model mengisi kuantitas asumsi + rumus +
 *     dasar per item yang masih kosong; isian berlabel ASSUMPTION +
 *     blok audit bersama (ESTIMATED_FROM_CONTEXT, PENDING) dan ikut
 *     dihitung di total. Tanpa item kosong → tanpa panggilan.
 *  2. recomputeQuantityFromFormula + reconcileFullAiQuantityFormulas —
 *     cek konsistensi deterministik: angka harus mengikuti rumus yang
 *     dinyatakan; bila tidak cocok, dipakai hasil hitung ulang dan
 *     koreksinya dicatat terbuka di catatan item.
 *  3. dropStaleExclusionWarnings — warning "tidak masuk total" dari loop
 *     mapping dibersihkan bila itemnya kini masuk total sesudah pass
 *     penyelesaian (sebelum ini basi — item 22 live membawa warning
 *     MISSING_QUANTITY padahal sudah masuk total).
 *
 * PERLUASAN 2026-11-21 00:48 ("biarin AI yang mengatur", keputusan
 * owner sesudah run live 00:45): 54 item, 32 ada volume, 22 MASIH
 * dikecualikan — pass asumsi mengisi 0 dari 22 (filled=0, failed=false;
 * model memakai jalan keluar null di prompt) dan QC melaporkan "22 item
 * berumus tetapi kuantitasnya kosong". Tiga perubahan:
 *  4. Prompt asumsi: jalan keluar null DIHAPUS (wajib isi SEMUA item;
 *     tanpa dimensi → asumsikan dari rumah tinggal tipikal dengan dasar
 *     dinyatakan) + rumus yang sudah dimiliki tiap item DISERTAKAN di
 *     baris item prompt (skenario J mengunci teksnya).
 *  5. fillFullAiQuantitiesFromFormulas — jaring pengaman deterministik
 *     sesudah pass AI: item yang nilainya masih kosong tetapi rumusnya
 *     dapat dihitung diisi dari rumus itu (ASSUMPTION + catatan
 *     "dihitung dari rumus yang dinyatakan item" + audit PENDING).
 *     Skenario I mereplikasi keadaan live: model mengembalikan null
 *     semua, jaring tetap mengisi yang berumus.
 *  6. Warning gagal pass kini menghitung sisa kosong SESUDAH jaring
 *     pengaman agar angkanya jujur.
 *
 * CATATAN KOREKSI — contoh "tidak konsisten" dari diagnosis induk
 * (item 22: "Luas lantai 19,45 m² ÷ 19 m² per titik = 3 titik")
 * ternyata KONSISTEN: rumus aturan konteks adalah "÷ ±9 m² per titik"
 * dan "19" di screenshot adalah glyph '±' yang ter-render kecil
 * (baris "Dasar" audit di screenshot yang sama menampilkan "±9" dengan
 * jelas); 19,45/9 ≈ 2,16 → ceil = 3. Skenario B3 mengunci fakta ini:
 * rumus itu TIDAK BOLEH dikoreksi.
 *
 * Suite ini skrip asersi tsx polos (pola dedEmptyPlanRetry.src.ts):
 * PDF sintetis minimal dibangun di dalam tes, aiToolsProviderClient
 * di-stub per skenario — TANPA panggilan AI berbayar, tanpa jaringan.
 * Jalankan dari ROOT repo: npx --yes tsx src/test/dedFullAiQuantityAssumptions.src.ts
 * (setiap execute() Full AI memakai minimum 3 detik.)
 */
import { fullAiDedService, recomputeQuantityFromFormula } from '../ai-tools/ded-full-ai/service';
import { buildFullAiQuantityAssumptionPrompt } from '../ai-tools/ded-full-ai/prompts';
import { aiToolsProviderClient } from '../ai-tools/providerClient';

let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}

// ---------------------------------------------------------------------------
// PDF sintetis minimal (generator yang sama dengan dedEmptyPlanRetry)
// ---------------------------------------------------------------------------
function escapePdfText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function buildPdf(pageTexts: string[]): Buffer {
  const objects: string[] = [];
  const n = pageTexts.length;
  const fontObj = 3 + n;
  const contentStart = fontObj + 1;
  const kids = pageTexts.map((_, i) => `${3 + i} 0 R`).join(' ');
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] = `<< /Type /Pages /Kids [${kids}] /Count ${n} >>`;
  for (let i = 0; i < n; i++) {
    objects[3 + i] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontObj} 0 R >> >> /Contents ${contentStart + i} 0 R >>`;
  }
  objects[fontObj] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
  for (let i = 0; i < n; i++) {
    const stream = `BT /F1 12 Tf 72 720 Td (${escapePdfText(pageTexts[i])}) Tj ET`;
    objects[contentStart + i] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  }
  const total = contentStart + n;
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];
  for (let i = 1; i < total; i++) {
    offsets[i] = Buffer.byteLength(pdf, 'latin1');
    pdf += `${i} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xrefPos = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${total}\n0000000000 65535 f \n`;
  for (let i = 1; i < total; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;
  return Buffer.from(pdf, 'latin1');
}

// ---------------------------------------------------------------------------
// Mock client: execute di-stub per skenario; panggilan rencana vs panggilan
// asumsi dibedakan lewat penanda "ISI KUANTITAS KOSONG" di prompt.
// Harga mock = nilai CONTOH skema di prompts.ts (85000 dst.) — fixture tes
// semata, bukan harga pasar, bukan harga AHSP.
// ---------------------------------------------------------------------------
const M1 = 'MARKER-HALAMAN-SATU';

const itemTanpaQty1 = {
  no: 1, name: 'Galian tanah pondasi', category: 'Tanah', wbsGroup: 'Pekerjaan Tanah dan Pondasi',
  qty: null, unit: 'm3', formula: undefined, provenance: 'UNRESOLVED',
  assumptions: '', price: 85000, priceUnit: 'm3', priceSource: 'AI_ESTIMATE',
};
const itemTanpaQty2 = {
  no: 2, name: 'Dinding bata merah', category: 'Dinding', wbsGroup: 'Pekerjaan Dinding',
  qty: null, unit: 'm2', formula: undefined, provenance: 'UNRESOLVED',
  assumptions: '', price: 95000, priceUnit: 'm2', priceSource: 'AI_ESTIMATE',
};
const itemBerqty = {
  no: 3, name: 'Lantai keramik', category: 'Lantai', wbsGroup: 'Pekerjaan Lantai',
  qty: 80, unit: 'm2', formula: '80', provenance: 'DERIVED',
  assumptions: 'luas lantai 80 m2', price: 75000, priceUnit: 'm2', priceSource: 'AI_ESTIMATE',
};

type PlanBehavior = (prompt: string) => unknown;
type FillBehavior = (prompt: string) => unknown;
let planBehavior: PlanBehavior = () => ({ items: [] });
let fillBehavior: FillBehavior = () => ({ fills: [] });
let fillShouldFail = false;
let callCount = 0;
let callPrompts: string[] = [];

const origExecute = aiToolsProviderClient.execute.bind(aiToolsProviderClient);
(aiToolsProviderClient as any).execute = async (request: any) => {
  callCount++;
  const prompt = String(request?.prompt || '');
  callPrompts.push(prompt);
  if (prompt.includes('ISI KUANTITAS KOSONG')) {
    if (fillShouldFail) {
      return { success: false, errorCode: 'MODEL_ERROR', message: 'Layanan AI sedang tidak tersedia', requestId: `mock-fail-${callCount}` };
    }
    const payload = fillBehavior(prompt);
    return {
      success: true,
      content: typeof payload === 'string' ? payload : JSON.stringify(payload),
      structured: null,
      requestId: `mock-fill-${callCount}`,
      provider: 'mock',
      model: 'mock-model',
      usage: { inputTokens: 10, outputTokens: 20, cachedTokens: null },
    };
  }
  const payload = planBehavior(prompt);
  return {
    success: true,
    content: typeof payload === 'string' ? payload : JSON.stringify(payload),
    structured: null,
    requestId: `mock-req-${callCount}`,
    provider: 'mock',
    model: 'mock-model',
    usage: { inputTokens: 10, outputTokens: 20, cachedTokens: null },
  };
};

function resetMock(plan: PlanBehavior, fill: FillBehavior = () => ({ fills: [] }), fail = false) {
  planBehavior = plan;
  fillBehavior = fill;
  fillShouldFail = fail;
  callCount = 0;
  callPrompts = [];
}

async function runDed(buffer: Buffer, fileName: string, policy: 'FULL_AI' | 'DATABASE' = 'FULL_AI'): Promise<any> {
  return fullAiDedService.execute({
    fileName,
    buffer,
    projectType: 'Rumah Tinggal',
    mode: 'FAST',
    policy,
    rabMode: policy === 'FULL_AI' ? 'FULL_AI' : 'EZRAB_AI',
  });
}

const hasWarning = (out: any, needle: string) =>
  (out.warnings || []).some((w: string) => w.includes(needle));
const itemByName = (out: any, name: string) =>
  (out.items || []).find((i: any) => i.name === name);

async function main() {
  try {
    // =======================================================================
    // A. Item tanpa kuantitas → diisi asumsi AI, berlabel, ikut total.
    // =======================================================================
    console.log('== A. Kuantitas kosong -> asumsi AI -> masuk total ==');
    resetMock(
      () => ({ items: [itemTanpaQty1, itemTanpaQty2, itemBerqty], projectInfo: { scopeSummary: 'rumah 1 lantai' } }),
      () => ({
        fills: [
          { no: 1, qty: 9.6, formula: '30 x 0.32', basis: 'panjang pondasi 30 m dari keliling denah, penampang 0,32 m²' },
          { no: 2, qty: 42, formula: '60 x 0.7', basis: 'keliling dinding 60 m, tinggi 0,7 m (dinding penahan tanah)' },
        ],
      }),
    );
    const pdfA = buildPdf([`${M1} Pekerjaan pondasi batu kali galian tanah dinding bata merah.`]);
    const outA: any = await runDed(pdfA, 'a-asumsi-ai.pdf');
    const galian = itemByName(outA, 'Galian tanah pondasi');
    const dinding = itemByName(outA, 'Dinding bata merah');
    check('A1 sukses dengan 3 item', outA.success === true && outA.items.length === 3,
      `success=${outA.success} items=${outA.items.length}`);
    check('A2 kuantitas terisi asumsi (9.6 m3 + 42 m2)',
      galian?.quantity?.value === 9.6 && dinding?.quantity?.value === 42,
      `galian=${galian?.quantity?.value} dinding=${dinding?.quantity?.value}`);
    check('A3 provenance ASSUMPTION + dasar tercatat',
      galian?.quantity?.provenance === 'ASSUMPTION' &&
      (galian?.quantity?.assumptions || []).some((a: string) => a.includes('keliling denah')) &&
      galian?.quantity?.formula === '30 x 0.32',
      JSON.stringify(galian?.quantity));
    check('A4 catatan nilai asli tercatat ("nilai asli: kosong")',
      (galian?.quantity?.notes || '').includes('nilai asli: kosong') &&
      (galian?.quantity?.notes || '').includes('asumsi AI'));
    check('A5 item ikut total (subtotal terhitung, grandTotal = 9.6*85000 + 42*95000 + 80*75000)',
      galian?.subtotal === 816000 && dinding?.subtotal === 3990000 &&
      outA.grandTotal === 816000 + 3990000 + 6000000,
      `galian=${galian?.subtotal} dinding=${dinding?.subtotal} total=${outA.grandTotal}`);
    check('A6 tanpa item dikecualikan', outA.summary?.excludedFromTotal === 0,
      `excluded=${outA.summary?.excludedFromTotal}`);
    check('A7 warning jujur "asumsi AI" tercatat', hasWarning(outA, 'asumsi AI'),
      JSON.stringify(outA.warnings));
    check('A8 execute 2x (1 rencana + 1 asumsi)', callCount === 2, `calls=${callCount}`);
    check('A9 blok audit: ESTIMATED_FROM_CONTEXT + PENDING',
      galian?.quantityAudit?.classification === 'ESTIMATED_FROM_CONTEXT' &&
      galian?.quantityAudit?.userApprovalStatus === 'PENDING' &&
      galian?.quantityAudit?.method === 'ai-inference-or-assumption',
      JSON.stringify(galian?.quantityAudit));

    // =======================================================================
    // B. Konsistensi: angka harus mengikuti rumus; koreksi dicatat.
    // =======================================================================
    console.log('== B. Rekonsiliasi rumus (koreksi + kasus item 22 live) ==');
    resetMock(() => ({
      items: [
        { no: 1, name: 'Instalasi listrik dan titik lampu', category: 'MEP', wbsGroup: 'Pekerjaan Mekanikal Elektrikal',
          qty: 5, unit: 'titik', formula: '19,45 ÷ 9', provenance: 'DERIVED',
          assumptions: 'satu titik per ±9 m2', price: 285000, priceUnit: 'titik', priceSource: 'AI_ESTIMATE' },
        { no: 2, name: 'Galian tanah pondasi', category: 'Tanah', wbsGroup: 'Pekerjaan Tanah dan Pondasi',
          qty: 10, unit: 'm3', formula: '30 x 0.32', provenance: 'DERIVED',
          assumptions: 'panjang pondasi 30m', price: 85000, priceUnit: 'm3', priceSource: 'AI_ESTIMATE' },
        { no: 3, name: 'Titik lampu teras', category: 'MEP', wbsGroup: 'Pekerjaan Mekanikal Elektrikal',
          qty: 3, unit: 'titik', formula: 'Luas lantai 19,45 m² ÷ ±9 m² per titik = 3 titik', provenance: 'ASSUMPTION',
          assumptions: 'satu titik penerangan per ±9 m²', price: 285000, priceUnit: 'titik', priceSource: 'AI_ESTIMATE' },
      ],
      projectInfo: { scopeSummary: 'rumah 1 lantai' },
    }));
    const pdfB = buildPdf([`${M1} Pekerjaan instalasi listrik galian tanah pondasi.`]);
    const outB: any = await runDed(pdfB, 'b-rekonsiliasi.pdf');
    const listrik = itemByName(outB, 'Instalasi listrik dan titik lampu');
    const galianB = itemByName(outB, 'Galian tanah pondasi');
    const teras = itemByName(outB, 'Titik lampu teras');
    check('B1 satuan hitung: 5 -> ceil(19,45/9) = 3 + koreksi tercatat',
      listrik?.quantity?.value === 3 &&
      (listrik?.quantity?.notes || '').includes('dikoreksi dari 5 ke 3'),
      `value=${listrik?.quantity?.value} notes=${listrik?.quantity?.notes}`);
    check('B2 satuan kontinu: 10 -> 30 x 0.32 = 9.6 + koreksi tercatat',
      galianB?.quantity?.value === 9.6 &&
      (galianB?.quantity?.notes || '').includes('dikoreksi dari 10 ke 9.6'),
      `value=${galianB?.quantity?.value} notes=${galianB?.quantity?.notes}`);
    check('B3 kasus item 22 live TIDAK dikoreksi (19,45/9 -> ceil 3, konsisten)',
      teras?.quantity?.value === 3 &&
      !(teras?.quantity?.notes || '').includes('dikoreksi'),
      `value=${teras?.quantity?.value} notes=${teras?.quantity?.notes}`);
    check('B4 subtotal ikut terkoreksi (3*285000 + 9.6*85000 + 3*285000)',
      listrik?.subtotal === 855000 && galianB?.subtotal === 816000 &&
      outB.grandTotal === 855000 + 816000 + 855000,
      `total=${outB.grandTotal}`);
    check('B5 warning "dikoreksi" tercatat', hasWarning(outB, 'dikoreksi agar sesuai rumus'),
      JSON.stringify(outB.warnings));

    // =======================================================================
    // C. Item berkuantitas nyata tidak berubah; tanpa panggilan asumsi.
    // =======================================================================
    console.log('== C. Item berisi -> tanpa pass asumsi, tanpa koreksi ==');
    resetMock(() => ({ items: [itemBerqty], projectInfo: { scopeSummary: 'lengkap' } }));
    const pdfC = buildPdf([`${M1} Pekerjaan lantai keramik.`]);
    const outC: any = await runDed(pdfC, 'c-berisi.pdf');
    check('C1 sukses, kuantitas utuh (80)', outC.success === true && outC.items[0]?.quantity?.value === 80);
    check('C2 execute 1x (tanpa panggilan asumsi)', callCount === 1, `calls=${callCount}`);
    check('C3 tanpa warning asumsi/koreksi',
      !hasWarning(outC, 'asumsi AI') && !hasWarning(outC, 'dikoreksi'));

    // =======================================================================
    // D. Pass asumsi gagal transport -> run tetap sukses, warning jujur.
    // =======================================================================
    console.log('== D. Pass asumsi gagal -> item tetap dikecualikan, run sukses ==');
    resetMock(
      () => ({ items: [itemTanpaQty1], projectInfo: { scopeSummary: 'rumah 1 lantai' } }),
      () => ({ fills: [] }),
      true, // fillShouldFail
    );
    const pdfD = buildPdf([`${M1} Pekerjaan pondasi batu kali galian tanah.`]);
    const outD: any = await runDed(pdfD, 'd-gagal.pdf');
    check('D1 run tetap sukses (kegagalan pass tidak menggagalkan run)', outD.success === true);
    check('D2 item tetap tanpa kuantitas + dikecualikan',
      outD.items[0]?.quantity?.value == null && outD.items[0]?.subtotal == null &&
      outD.items[0]?.exclusionReason === 'MISSING_QUANTITY',
      JSON.stringify(outD.items[0]?.quantity));
    check('D3 warning jujur "Pass asumsi kuantitas AI gagal"',
      hasWarning(outD, 'Pass asumsi kuantitas AI gagal'), JSON.stringify(outD.warnings));

    // =======================================================================
    // E. Model kembalikan qty null untuk satu item -> item itu tetap kosong.
    // =======================================================================
    console.log('== E. qty null dari model -> parsial, sisanya terisi ==');
    resetMock(
      () => ({ items: [itemTanpaQty1, itemTanpaQty2], projectInfo: { scopeSummary: 'rumah 1 lantai' } }),
      () => ({ fills: [
        { no: 1, qty: 9.6, formula: '30 x 0.32', basis: 'panjang pondasi 30 m dari keliling denah' },
        { no: 2, qty: null, formula: '', basis: '' },
      ] }),
    );
    const pdfE = buildPdf([`${M1} Pekerjaan pondasi dinding.`]);
    const outE: any = await runDed(pdfE, 'e-parsial.pdf');
    check('E1 item 1 terisi, item 2 tetap kosong',
      itemByName(outE, 'Galian tanah pondasi')?.quantity?.value === 9.6 &&
      itemByName(outE, 'Dinding bata merah')?.quantity?.value == null);
    check('E2 tepat 1 item dikecualikan', outE.summary?.excludedFromTotal === 1,
      `excluded=${outE.summary?.excludedFromTotal}`);
    check('E3 warning basi item terisi hilang, warning item kosong ada',
      !hasWarning(outE, 'Item "Galian tanah pondasi" tidak masuk total') &&
      hasWarning(outE, 'Item "Dinding bata merah" tidak masuk total'),
      JSON.stringify(outE.warnings));

    // =======================================================================
    // F. Item tanpa satuan tidak dimintakan asumsi (tak bisa masuk total).
    // =======================================================================
    console.log('== F. Item tanpa satuan -> tidak masuk prompt asumsi ==');
    resetMock(
      () => ({
        items: [
          { no: 1, name: 'Pekerjaan tanpa satuan', category: 'Lain-lain', wbsGroup: 'Lain-lain',
            qty: null, unit: '', formula: undefined, provenance: 'UNRESOLVED',
            assumptions: '', price: 100000, priceUnit: '', priceSource: 'AI_ESTIMATE' },
          { ...itemTanpaQty1, no: 2 },
        ],
        projectInfo: { scopeSummary: 'rumah 1 lantai' },
      }),
      () => ({ fills: [
        { no: 2, qty: 9.6, formula: '30 x 0.32', basis: 'panjang pondasi 30 m' },
      ] }),
    );
    const pdfF = buildPdf([`${M1} Pekerjaan tanpa satuan dan pondasi.`]);
    const outF: any = await runDed(pdfF, 'f-tanpa-satuan.pdf');
    const fillPrompt = callPrompts.find((p) => p.includes('ISI KUANTITAS KOSONG')) || '';
    check('F1 prompt asumsi tidak mencantumkan item tanpa satuan',
      !fillPrompt.includes('Pekerjaan tanpa satuan') && fillPrompt.includes('Galian tanah pondasi'));
    check('F2 item tanpa satuan tetap dikecualikan',
      itemByName(outF, 'Pekerjaan tanpa satuan')?.subtotal == null);

    // =======================================================================
    // G. Mode EZRAB AI (DATABASE): TIDAK ADA pass asumsi sama sekali.
    // =======================================================================
    console.log('== G. Mode DATABASE -> tanpa pass asumsi, tetap fail-closed ==');
    resetMock(
      () => ({ items: [itemTanpaQty1], projectInfo: { scopeSummary: 'rumah 1 lantai' } }),
      () => ({ fills: [{ no: 1, qty: 99, formula: '99', basis: 'harus diabaikan' }] }),
    );
    const pdfG = buildPdf([`${M1} Pekerjaan pondasi batu kali galian tanah.`]);
    const outG: any = await runDed(pdfG, 'g-database.pdf', 'DATABASE');
    check('G1 execute 1x (tanpa panggilan asumsi)', callCount === 1, `calls=${callCount}`);
    check('G2 item tetap tanpa kuantitas + dikecualikan (fail-closed)',
      outG.items[0]?.quantity?.value == null && outG.items[0]?.subtotal == null &&
      outG.items[0]?.exclusionReason === 'MISSING_QUANTITY');
    check('G3 tanpa warning asumsi/koreksi/rumus',
      !hasWarning(outG, 'asumsi AI') && !hasWarning(outG, 'dikoreksi') &&
      !hasWarning(outG, 'dihitung dari rumus'));

    // =======================================================================
    // H. Unit test parser rumus (murni, tanpa run DED).
    // =======================================================================
    console.log('== H. Parser rumus: konservatif, hanya aritmetika runtut ==');
    const approx = (a: number | null, b: number) => a != null && Math.abs(a - b) < 0.001;
    check('H1 "30 x 0.32" -> 9.6', approx(recomputeQuantityFromFormula('30 x 0.32'), 9.6));
    check('H2 "60 x 0.7" -> 42', approx(recomputeQuantityFromFormula('60 x 0.7'), 42));
    check('H3 "Luas lantai 19,45 m² ÷ ±9 m² per titik = 3 titik" -> 19,45/9',
      approx(recomputeQuantityFromFormula('Luas lantai 19,45 m² ÷ ±9 m² per titik = 3 titik'), 19.45 / 9));
    check('H4 "86" -> 86', recomputeQuantityFromFormula('86') === 86);
    check('H5 "(10 + 12) x 3" -> 66', approx(recomputeQuantityFromFormula('(10 + 12) x 3'), 66));
    check('H6 prosa septik -> null (tidak dievaluasi)',
      recomputeQuantityFromFormula('1 unit septic tank + resapan untuk satu rumah tinggal 1 lantai') === null);
    check('H7 "150-200 kg/m³" -> null (rentang, hasil negatif)',
      recomputeQuantityFromFormula('150-200 kg/m³ beton') === null);
    check('H8 "panjang pondasi 30m dari keliling" -> null (tanpa operator)',
      recomputeQuantityFromFormula('panjang pondasi 30m dari keliling') === null);
    check('H9 "2 x 3 dan 4 x 5" -> null (ambigu, dua run berbeda)',
      recomputeQuantityFromFormula('2 x 3 dan 4 x 5') === null);
    check('H10 rumus kosong/null -> null',
      recomputeQuantityFromFormula('') === null && recomputeQuantityFromFormula(null) === null);

    // =======================================================================
    // I. Jaring pengaman rumus (replikasi live 00:45): model mengembalikan
    // null SEMUA, tetapi item berumus tetap terisi deterministik.
    // =======================================================================
    console.log('== I. Model null semua -> jaring rumus isi yang berumus ==');
    resetMock(
      () => ({
        items: [
          { no: 1, name: 'Galian tanah pondasi', category: 'Tanah', wbsGroup: 'Pekerjaan Tanah dan Pondasi',
            qty: null, unit: 'm3', formula: '30 x 0.32', provenance: 'UNRESOLVED',
            assumptions: '', price: 85000, priceUnit: 'm3', priceSource: 'AI_ESTIMATE' },
          { no: 2, name: 'Cerucuk ulin 80x80x2000 mm', category: 'Pondasi', wbsGroup: 'Pekerjaan Pondasi',
            qty: null, unit: 'batang', formula: '19,45 ÷ 9', provenance: 'UNRESOLVED',
            assumptions: '', price: 120000, priceUnit: 'batang', priceSource: 'AI_ESTIMATE' },
          { no: 3, name: 'Dinding bata merah', category: 'Dinding', wbsGroup: 'Pekerjaan Dinding',
            qty: null, unit: 'm2', formula: 'luas dinding dari denah, perlu konfirmasi dimensi', provenance: 'UNRESOLVED',
            assumptions: '', price: 95000, priceUnit: 'm2', priceSource: 'AI_ESTIMATE' },
        ],
        projectInfo: { scopeSummary: 'rumah 1 lantai' },
      }),
      () => ({ fills: [
        { no: 1, qty: null, formula: '', basis: '' },
        { no: 2, qty: null, formula: '', basis: '' },
        { no: 3, qty: null, formula: '', basis: '' },
      ] }),
    );
    const pdfI = buildPdf([`${M1} Pekerjaan pondasi batu kali galian tanah cerucuk dinding bata merah.`]);
    const outI: any = await runDed(pdfI, 'i-jaring-rumus.pdf');
    const galianI = itemByName(outI, 'Galian tanah pondasi');
    const cerucukI = itemByName(outI, 'Cerucuk ulin 80x80x2000 mm');
    const dindingI = itemByName(outI, 'Dinding bata merah');
    check('I1 jaring isi dari rumus: galian 30 x 0.32 = 9.6; cerucuk ceil(19,45/9) = 3 batang',
      galianI?.quantity?.value === 9.6 && cerucukI?.quantity?.value === 3,
      `galian=${galianI?.quantity?.value} cerucuk=${cerucukI?.quantity?.value}`);
    check('I2 isian jaring berlabel ASSUMPTION + catatan "dihitung dari rumus"',
      galianI?.quantity?.provenance === 'ASSUMPTION' &&
      (galianI?.quantity?.notes || '').includes('dihitung dari rumus yang dinyatakan item') &&
      (galianI?.quantity?.assumptions || []).some((a: string) => a.includes('dihitung dari rumus')),
      JSON.stringify(galianI?.quantity));
    check('I3 subtotal ikut terhitung (9.6*85000 + 3*120000)',
      galianI?.subtotal === 816000 && cerucukI?.subtotal === 360000 &&
      outI.grandTotal === 816000 + 360000,
      `galian=${galianI?.subtotal} cerucuk=${cerucukI?.subtotal} total=${outI.grandTotal}`);
    check('I4 tepat 1 item dikecualikan (rumus prosa tidak bisa dihitung)',
      outI.summary?.excludedFromTotal === 1,
      `excluded=${outI.summary?.excludedFromTotal}`);
    check('I5 warning jujur "dihitung dari rumus" tercatat; tanpa warning "asumsi AI"',
      hasWarning(outI, 'dihitung dari rumus yang dinyatakan item') &&
      !hasWarning(outI, 'asumsi AI'),
      JSON.stringify(outI.warnings));
    const fillPromptI = callPrompts.find((p) => p.includes('ISI KUANTITAS KOSONG')) || '';
    check('I6 prompt asumsi menyertakan rumus tiap item ("30 x 0.32", "19,45 ÷ 9")',
      fillPromptI.includes('rumus dari rencana: "30 x 0.32"') &&
      fillPromptI.includes('rumus dari rencana: "19,45 ÷ 9"'),
      fillPromptI);
    check('I7 blok audit isian jaring: ESTIMATED_FROM_CONTEXT + PENDING',
      galianI?.quantityAudit?.classification === 'ESTIMATED_FROM_CONTEXT' &&
      galianI?.quantityAudit?.userApprovalStatus === 'PENDING',
      JSON.stringify(galianI?.quantityAudit));
    check('I8 item rumus prosa tetap MISSING_QUANTITY + warning eksklusi ada',
      dindingI?.quantity?.value == null &&
      dindingI?.exclusionReason === 'MISSING_QUANTITY' &&
      hasWarning(outI, 'Item "Dinding bata merah" tidak masuk total'));

    // =======================================================================
    // J. Teks prompt asumsi: tanpa jalan keluar null + rumus disertakan.
    // =======================================================================
    console.log('== J. Teks prompt asumsi (langsung, tanpa run DED) ==');
    const builtJ = buildFullAiQuantityAssumptionPrompt({
      projectType: 'Rumah Tinggal',
      contextLines: ['Luas lantai diketahui ±19,45 m²'],
      items: [
        { no: 6, name: 'Galian tanah pondasi', unit: 'm3', category: 'Tanah', formula: '30 x 0.32' },
        { no: 7, name: 'Dinding bata merah', unit: 'm2', category: 'Dinding' },
      ],
    });
    check('J1 system mewajibkan isi SEMUA item, tanpa kalimat jalan keluar null',
      builtJ.system.includes('WAJIB isi SEMUA item') &&
      !builtJ.system.includes('tidak bisa diasumsikan'),
      builtJ.system);
    check('J2 prompt menyertakan rumus item yang punya rumus',
      builtJ.prompt.includes('rumus dari rencana: "30 x 0.32"'), builtJ.prompt);
    check('J3 item tanpa rumus tidak membawa label rumus (tepat 1 kemunculan)',
      (builtJ.prompt.match(/rumus dari rencana/g) || []).length === 1, builtJ.prompt);
    check('J4 aturan JSON murni + jangan ubah nomor tetap ada',
      builtJ.system.includes('JSON MURNI') && builtJ.system.includes('JANGAN ubah nomor'));
    check('J5 instruksi hitung dari rumus tercantum disertakan',
      builtJ.system.includes('hitung qty dari rumus itu'));
  } finally {
    // Pulihkan client asli — jangan biarkan stub bocor ke proses lain.
    (aiToolsProviderClient as any).execute = origExecute;
  }

  console.log(`\nHASIL: ${pass} lulus, ${fail} gagal (total ${pass + fail})`);
  if (fail > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error('SUITE ERROR:', err);
  process.exitCode = 1;
});
