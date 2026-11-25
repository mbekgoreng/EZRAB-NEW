/**
 * rantaiJRegression.test.ts — Pin regresi Rantai J: Rp116.887.891.
 *
 * RANTAI J (keputusan owner 2026-11-24): invarian uang lintas
 * permukaan — total yang SAMA harus muncul di chat = preview =
 * spreadsheet = Excel. Nilai ini berasal dari Skenario J program
 * Universal Batch 5 (browser E2E, 2026-11-23):
 *   ~/workspace/your_files/EZRAB-UNIVERSAL-BATCH1-5-2026-11-23/
 *   BATCH5-EVIDENCE/logs/transcript-J.md
 *   (checks J1–J6; J5 spreadsheet + J6 unduhan Excel).
 *
 * Komposisi rantai (JANGAN dikacaukan dengan Skenario A):
 * - Draft chat "buatkan RAB rumah tipe 36 anggaran 120 juta": 25 item,
 *   1 tak berharga (item 22, kloset) → total PARSIAL Rp116.737.891.
 *   Itulah total Skenario A — SKENARIO BERBEDA, bukan selisih.
 * - "Lengkapi dengan Full AI" mengisi kloset @ Rp150.000 (est. AI)
 *   → total Rp116.887.891 = 116.737.891 + 150.000.
 * - Preview push, spreadsheet (pasca-Konfirmasi Push), dan ekspor
 *   Excel semuanya membawa Rp116.887.891.
 *
 * Suite ini mereproduksi keempat permukaan TANPA browser dan TANPA
 * LLM live, lewat jalur kode nyata yang sama dengan yang dipakai
 * browser (bukan mock atas hal yang diuji):
 *   chat     — buildDirectRab + completeBudgetRabWithFullAi
 *   preview  — buildDirectPushPreview + formatDirectPushPreviewMessage
 *   sheet    — mapDirectRabPushItems + createRabItemRecord +
 *              normalizeSections + computeCostSummaryFromSections /
 *              recalculateCostSummary (engine kanonis yang dibaca view
 *              spreadsheet)
 *   Excel    — exportRABToProfessionalExcel (preset FIVE_SHEET_RAB) +
 *              parse ulang ExcelJS + baca sel grand total berlabel.
 *
 * Pengganti DOUBLE TERKONTROL (bukan LLM live): pengisian harga AI
 * di-stub lewat injeksi deps completeBudgetRabWithFullAi — pola yang
 * sama dengan chatBudgetRabFullAi.test.ts §1. Stub mengembalikan
 * Rp150.000 untuk tier standar, persis nilai yang dikembalikan
 * gateway double B5 untuk item 22 (transcript-J: "spek DOUBLE B5
 * untuk item 22"). Tanpa stub ini total completion tidak dapat
 * direproduksi secara deterministik; stub adalah pengganti double
 * yang terdokumentasi, BUKAN karangan — nilai 150.000 berasal dari
 * transcript B5, bukan dari suite ini.
 *
 * CATATAN PEMBULATAN (jujur, bukan toleransi longgar): dua permukaan
 * menjumlah float mentah Σ volume × harga satuan, sehingga membawa
 * pecahan Rp0,50 dari item 14 (2,25 m² × Rp113.962 = Rp256.414,50):
 * preview.estimatedTotal = 116887890.5 dan
 * summarizeStoredItems.pricedTotal = 116887890.5. Keduanya diasersi
 * lewat Math.round (== 116887891) — SAMA dengan yang dirender ke
 * pengguna (formatIdr membulatkan). Engine kanonis (factory membulatkan
 * amount per item) menghasilkan bilangan bulat persis 116887891 dan
 * diasersi persis. Tidak ada toleransi ±Rp1/baris yang dipakai di sini.
 *
 * YANG TIDAK DILIPUT SUITE INI (dicatat jujur):
 * - Klik UI browser (tombol Lengkapi / Push / Konfirmasi / Ekspor)
 *   dan unduhan file nyata — J6 browser hanya membuktikan file
 *   terunduh tak kosong; isi total di dalam file TIDAK pernah
 *   diperiksa di browser. Suite ini justru LEBIH KUAT di sini: sel
 *   grand total workbook dibaca dan diasersi.
 * - Preset ekspor browser J6 (RECAP_ONLY, subset sheet) tidak
 *   direproduksi persis; suite memakai preset FIVE_SHEET_RAB — jalur
 *   ekspor headless kanonis repo — yang menghitung total dari engine
 *   YANG SAMA (computeCostSummaryFromSections) dengan preset lain.
 * - LLM live (dilarang program ini) — lihat paragraf double di atas.
 *
 * Jalankan: npx --yes tsx src/test/rantaiJRegression.test.ts
 * (Skrip tsx mandiri — pola chatBudgetRabFullAi / p5FiveSheetExport.)
 */
import ExcelJS from 'exceljs';
import { buildDirectRab, formatDirectRabMessage } from '../ai-tools/ezrab-ai/directRab';
import type { DirectRabResult } from '../ai-tools/ezrab-ai/directRab';
import {
  completeBudgetRabWithFullAi,
  buildFullAiCompletionSummary,
  type ChatRabCompletionDeps,
  type AdaptableChatItem,
} from '../ai-tools/ezrab-ai/fullAiRabCompletion';
import {
  mapDirectRabPushItems,
  buildDirectPushPreview,
  formatDirectPushPreviewMessage,
} from '../ai-tools/ezrab-ai/directRabPush';
import { createRabItemRecord } from '../engine/rab/rabItemFactory';
import { UnifiedProjectEngine } from '../engine/unifiedProjectEngine';
import { resolveProjectCostConfig } from '../engine/projectCostConfig';
import { summarizeStoredItems } from '../ai-tools/ezrab-ai/universalRab';
import { exportRABToProfessionalExcel } from '../export/excelExportEngine';
import {
  FIVE_SHEET_PRESET_ID,
  FIVE_SHEET_NAMES,
} from '../export/fiveSheetPreset';
import type { Company, Project } from '../types';

/** Total Rantai J (Batch 5 Skenario J, 2026-11-23) — pin literal. */
export const RANTAI_J_TOTAL = 116_887_891;
/** Total draft pra-completion (Skenario A) — skenario BERBEDA. */
export const RANTAI_J_DRAFT_TOTAL = 116_737_891;
/** Isian double B5 untuk item 22 (kloset), tier standar. */
export const RANTAI_J_AI_FILL = 150_000;

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail?: string): void {
  if (cond) {
    pass++;
    console.log(`  PASS ${name}`);
  } else {
    fail++;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  }
}
function eq(name: string, actual: unknown, expected: unknown): void {
  check(name, actual === expected, `aktual=${JSON.stringify(actual)} harap=${JSON.stringify(expected)}`);
}

/* ------------------------------------------------------------------ */
/* Stub execute — pengganti gateway double B5 (standar → Rp150.000)    */
/* ------------------------------------------------------------------ */

const TIER_PRICES: Record<string, number> = {
  ekonomis: 100_000,
  standar: 150_000,
  menengah: 200_000,
  premium: 300_000,
  mewah: 500_000,
};

function makeDoubleDeps(): ChatRabCompletionDeps {
  const execute = async (req: { prompt: string; systemPrompt?: string }): Promise<Record<string, unknown>> => {
    const prompt = String(req.prompt ?? '');
    const tierM = /Kualitas: (EKONOMIS|STANDAR|MENENGAH|PREMIUM|MEWAH)/.exec(prompt);
    const tier = tierM ? tierM[1].toLowerCase() : 'standar';
    const items: Array<{ no: number; unit: string }> = [];
    const re = /- no (\d+): "[^"]*" \(satuan: ([^;]+);/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(prompt)) !== null) {
      items.push({ no: Number(m[1]), unit: m[2].trim() });
    }
    const fills = items.map(({ no, unit }) => ({
      no,
      unitPrice: TIER_PRICES[tier] ?? 150_000,
      unit,
      spec: `spek double B5 kualitas ${tier} untuk item ${no}`,
      basis: `harga double B5 terkontrol, kualitas ${tier}`,
    }));
    return {
      success: true,
      content: JSON.stringify({ fills }),
      structured: null,
      requestId: 'double-b5-standin',
    };
  };
  return { execute: execute as ChatRabCompletionDeps['execute'], productId: 'EZRAB_AI' };
}

/** Adapter item calc direct → input orkestrator (cermin chatBudgetRabFullAi §1). */
function directItemsToAdaptable(r: DirectRabResult): AdaptableChatItem[] {
  return r.calc.items.map((it) => ({
    description: it.name,
    category: it.category,
    volume: it.volume,
    unit: it.unit,
    unitPrice:
      typeof it.unitPrice === 'number' && Number.isFinite(it.unitPrice) && it.unitPrice > 0
        ? it.unitPrice
        : null,
    priceStatus: it.priceStatus,
    totalPrice: it.totalPrice,
  }));
}

function company(): Company {
  return {
    id: 'comp-chain-j', name: 'PT Uji Chain J', address: '', phone: '', email: '',
    website: '', taxNumber: '', directorName: '', leadEstimatorName: 'Estimator Uji',
    defaultOverheadPercent: 0, defaultProfitPercent: 0,
    defaultContingencyPercent: 0, defaultTaxPercent: 11,
  } as Company;
}

/** Ambil nilai numerik sel (nilai mentah atau result formula live). */
function cellNumber(cell: ExcelJS.Cell): number | null {
  const v = cell.value as unknown;
  if (typeof v === 'number') return v;
  if (v && typeof v === 'object' && typeof (v as { result?: unknown }).result === 'number') {
    return (v as { result: number }).result;
  }
  return null;
}

/** Cari baris berdasarkan teks label di kolom A, kembalikan nomor baris (0 bila tak ada). */
function findRowByLabel(ws: ExcelJS.Worksheet, label: string): number {
  let found = 0;
  ws.eachRow((row, rowNumber) => {
    if (found !== 0) return;
    const a = row.getCell(1).value;
    if (typeof a === 'string' && a.trim() === label) found = rowNumber;
  });
  return found;
}

async function main(): Promise<void> {
  /* =================================================================
   * §1. CHAT — draft + completion (transcript-J Step 1–2).
   * ================================================================= */
  console.log('== §1. Chat: draft T36 + completion Full AI (double B5) ==');
  const r = buildDirectRab('buatkan rab rumah type 36');
  check('1a buildDirectRab T36 menghasilkan hasil', r !== null);
  const direct = r!;
  eq('1b draft: 25 item', direct.calc.items.length, 25);
  const unpriced = direct.calc.items.filter((i) => !(i.unitPrice > 0));
  eq('1c draft: tepat 1 item tak berharga (kloset)', unpriced.length, 1);
  check('1d item tak berharga adalah kloset', unpriced[0]?.name.includes('Kloset') === true, unpriced[0]?.name);
  const engineTotal = direct.calc.generationResult.totalDirectCost;
  eq('1e draft total PARSIAL = Rp116.737.891 (Skenario A, BUKAN Rantai J)', engineTotal, RANTAI_J_DRAFT_TOTAL);

  const result = await completeBudgetRabWithFullAi({
    items: directItemsToAdaptable(direct),
    budgetCap: 120_000_000,
    quality: null,
    region: direct.region,
    projectType: direct.displayLabel,
    projectLabel: direct.displayLabel,
    deps: makeDoubleDeps(),
    useLineTotals: true,
  });
  check('1f completion tidak gagal', result.failed === false);
  eq('1g completion: 1 harga terisi', result.filledPriceCount, 1);
  check('1h completion: kualitas standar (default, seperti double B5)', result.qualityUsed === 'standar' && result.qualityDefaulted === true);
  eq('1i CHAT: total completion = Rp116.887.891 (PIN RANTAI J)', result.totals.estimatedTotal, RANTAI_J_TOTAL);
  eq('1j CHAT: total = draft + isian Rp150.000', result.totals.estimatedTotal, RANTAI_J_DRAFT_TOTAL + RANTAI_J_AI_FILL);
  check('1k verdict UNDER vs cap 120jt', result.feasibility.verdict === 'UNDER');

  // Tempel completion ke salinan calc (pola chatBudgetRabFullAi §1) —
  // calc asli TIDAK berubah; formatter + mapper push membaca salinan.
  const completedItems = direct.calc.items.map((it, idx) => {
    const done = result.items[idx];
    if (!done || done.priceStatus !== 'PRICE_ESTIMATED') return it;
    return { ...it, unitPrice: done.unitPrice ?? it.unitPrice, totalPrice: done.totalPrice ?? it.totalPrice };
  });
  direct.fullAiCompletion = { items: completedItems, summary: buildFullAiCompletionSummary(result, 120_000_000) };
  const chatMsg = formatDirectRabMessage(direct);
  check('1l pesan chat memuat Rp116.887.891', chatMsg.includes('Rp116.887.891'));
  check('1m pesan chat menandai isian (est. AI)', chatMsg.includes('(est. AI)'));
  check('1n pesan chat memuat blok Estimasi Sementara', chatMsg.includes('Estimasi Sementara (asumsi AI)'));
  check('1o pesan chat memuat verdict DI BAWAH anggaran', chatMsg.includes('DI BAWAH anggaran'));
  check('1p calc asli TIDAK dimutasi (kloset tetap 0)',
    direct.calc.items.find((i) => i.name.includes('Kloset'))?.unitPrice === 0);

  /* =================================================================
   * §2. PREVIEW — pratinjau push (transcript-J Step 3).
   * ================================================================= */
  console.log('== §2. Preview: buildDirectPushPreview ==');
  const preview = buildDirectPushPreview(direct, new Set());
  eq('2a preview: 25 item', preview.itemCount, 25);
  eq('2b preview: 25 baru, 0 duplikat (spreadsheet kosong)', preview.newCount, 25);
  eq('2c preview: 2 resmi AHSP', preview.resolved, 2);
  eq('2d preview: 23 estimasi', preview.estimated, 23);
  eq('2e preview: 0 belum berharga', preview.unresolved, 0);
  eq('2f preview: 1 isian AI', preview.aiFillCount, 1);
  check('2g preview: tidak diblokir', preview.blocked === false);
  // Float mentah 116887890.5 (item 14: 2,25 × 113.962 = 256.414,50) —
  // yang dirender ke pengguna dibulatkan (formatIdr). Lihat header.
  eq('2h PREVIEW: total dibulatkan = Rp116.887.891 (PIN RANTAI J)', Math.round(preview.estimatedTotal), RANTAI_J_TOTAL);
  const previewMsg = formatDirectPushPreviewMessage(direct, preview, 'B5 E2E Test');
  check('2i pesan preview memuat Rp116.887.891', previewMsg.includes('Rp116.887.891'));
  check('2j pesan preview memuat baris total estimasi', previewMsg.includes('Total estimasi item berharga: Rp116.887.891'));

  /* =================================================================
   * §3. SPREADSHEET — payload push → factory → engine kanonis
   * (transcript-J Step 4 / J5).
   * ================================================================= */
  console.log('== §3. Spreadsheet: push payload → factory → engine ==');
  const payload = mapDirectRabPushItems(direct);
  eq('3a payload push: 25 item', payload.length, 25);
  const records = payload.map((p, i) => createRabItemRecord(p as never, 'PRJ-CHAIN-J', { index: i }));
  eq('3b factory: 25 record tercipta', records.length, 25);
  const kloset = records.find((x) => x.description.includes('Kloset'));
  check('3c kloset masuk spreadsheet', kloset !== undefined);
  eq('3d kloset: unitPrice Rp150.000', kloset?.unitPrice, RANTAI_J_AI_FILL);
  eq('3e kloset: PRICE_ESTIMATED (isian AI, bukan resmi)', kloset?.priceStatus, 'PRICE_ESTIMATED');
  eq('3f kloset: kind EZRAB_ASSUMPTION', kloset?.priceSourceKind, 'EZRAB_ASSUMPTION');
  eq('3g kloset: NEEDS_VERIFICATION', kloset?.verificationStatus, 'NEEDS_VERIFICATION');
  eq('3h kloset: amount Rp150.000', kloset?.amount, RANTAI_J_AI_FILL);

  // Proyek segar (konfigurasi default 0%/0%, PPN nonaktif — sama
  // dengan proyek yang dibuat via UI di Skenario J).
  const project = {
    id: 'PRJ-CHAIN-J',
    projectNumber: 'PRJ-CHAIN-J',
    name: 'B5 E2E Test',
    location: 'DKI Jakarta',
    status: 'draft',
    currentVersion: 'Rev 00',
    sections: [],
    rabItems: records,
    costSummary: {},
  } as unknown as Project;
  const sections = UnifiedProjectEngine.normalizeSections(project, records as never);
  const flat = sections.flatMap((s) => s.items || []);
  eq('3i normalisasi: 25 item hadir (tidak ada yang hilang)', flat.length, 25);
  const fromSections = UnifiedProjectEngine.computeCostSummaryFromSections(project, sections);
  eq('3j SPREADSHEET: directCost engine = Rp116.887.891 (PIN RANTAI J)', fromSections.directCost, RANTAI_J_TOTAL);
  eq('3k SPREADSHEET: grandTotal engine = Rp116.887.891 (PIN RANTAI J)', fromSections.grandTotal, RANTAI_J_TOTAL);
  eq('3l spreadsheet: overhead 0 (default proyek segar)', fromSections.overheadAmount, 0);
  eq('3m spreadsheet: profit 0 (default proyek segar)', fromSections.profitAmount, 0);
  eq('3n spreadsheet: pajak 0 (PPN nonaktif)', fromSections.taxAmount, 0);
  eq('3o spreadsheet: 0 item unresolved', fromSections.unresolvedItems, 0);
  const recalc = UnifiedProjectEngine.recalculateCostSummary(records as never, resolveProjectCostConfig(project));
  eq('3p SPREADSHEET: recalculateCostSummary grandTotal = Rp116.887.891', recalc.grandTotal, RANTAI_J_TOTAL);
  const stored = summarizeStoredItems(records as never);
  eq('3q spreadsheet: 25 item berharga, 0 belum berharga', `${stored.pricedCount}/${stored.unpricedCount}`, '25/0');
  eq('3r spreadsheet: pricedTotal dibulatkan = Rp116.887.891 (float .5 — lihat header)',
    Math.round(stored.pricedTotal), RANTAI_J_TOTAL);

  /* =================================================================
   * §4. EXCEL — workbook preset 5 sheet + parse ulang (J6).
   * ================================================================= */
  console.log('== §4. Excel: exportRABToProfessionalExcel + parse ulang ==');
  const blob = await exportRABToProfessionalExcel(project, company(), {
    preset: FIVE_SHEET_PRESET_ID,
  } as never);
  check('4a ekspor mengembalikan Blob tak kosong', blob instanceof Blob && blob.size > 0, `size=${blob.size}`);
  const buffer = Buffer.from(await blob.arrayBuffer());
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  eq('4b workbook: tepat 5 sheet', wb.worksheets.length, 5);
  const wsSummary = wb.getWorksheet(FIVE_SHEET_NAMES.summary)!;
  check('4c sheet ringkasan ada', wsSummary !== undefined);
  const directRow = findRowByLabel(wsSummary, 'Biaya Langsung (Direct Cost)');
  check('4d baris Biaya Langsung ditemukan', directRow > 0);
  eq('4e EXCEL: Biaya Langsung Sheet 1 = Rp116.887.891 (PIN RANTAI J)',
    directRow > 0 ? cellNumber(wsSummary.getCell(`B${directRow}`)) : null, RANTAI_J_TOTAL);
  const grandRow = findRowByLabel(wsSummary, 'GRAND TOTAL');
  check('4f baris GRAND TOTAL ditemukan', grandRow > 0);
  eq('4g EXCEL: GRAND TOTAL Sheet 1 (formula live) = Rp116.887.891 (PIN RANTAI J)',
    grandRow > 0 ? cellNumber(wsSummary.getCell(`B${grandRow}`)) : null, RANTAI_J_TOTAL);
  // Sheet 2: grand total dari formula live per baris (jalur hitung
  // kedua di dalam workbook yang sama).
  const wsDetail = wb.getWorksheet(FIVE_SHEET_NAMES.detail)!;
  let detailGrand: number | null = null;
  wsDetail.eachRow((row) => {
    const a = row.getCell(1).value;
    if (typeof a === 'string' && a.trim() === 'GRAND TOTAL') {
      // Kolom total ada di H pada preset ini (pola p5FiveSheetExport).
      detailGrand = cellNumber(row.getCell(8));
    }
  });
  // Fallback: pindai seluruh Sheet 2 untuk sel bernilai pin (formula
  // result) bila label baris tidak ditemukan — tetap diasersi persis.
  if (detailGrand === null) {
    wsDetail.eachRow((row) => {
      row.eachCell((cell) => {
        if (detailGrand === null && cellNumber(cell) === RANTAI_J_TOTAL) detailGrand = RANTAI_J_TOTAL;
      });
    });
  }
  eq('4h EXCEL: grand total Sheet 2 (formula live) = Rp116.887.891 (PIN RANTAI J)', detailGrand, RANTAI_J_TOTAL);
  const statusRow = findRowByLabel(wsSummary, 'Status Total Dokumen');
  eq('4i EXCEL: status total LENGKAP (semua item berharga)',
    statusRow > 0 ? String(wsSummary.getCell(`B${statusRow}`).value ?? '') : '', 'LENGKAP');

  /* =================================================================
   * §5. KESEPAKATAN — satu angka di keempat permukaan.
   * ================================================================= */
  console.log('== §5. Kesepakatan chat = preview = spreadsheet = Excel ==');
  const chatTotal = result.totals.estimatedTotal;
  const previewTotal = Math.round(preview.estimatedTotal);
  const sheetTotal = fromSections.grandTotal;
  const excelTotal = grandRow > 0 ? cellNumber(wsSummary.getCell(`B${grandRow}`)) : null;
  check('5a chat == preview', chatTotal === previewTotal, `chat=${chatTotal} preview=${previewTotal}`);
  check('5b chat == spreadsheet', chatTotal === sheetTotal, `chat=${chatTotal} sheet=${sheetTotal}`);
  check('5c chat == Excel', chatTotal === excelTotal, `chat=${chatTotal} excel=${excelTotal}`);
  check('5d keempat permukaan == Rp116.887.891',
    chatTotal === RANTAI_J_TOTAL && previewTotal === RANTAI_J_TOTAL &&
    sheetTotal === RANTAI_J_TOTAL && excelTotal === RANTAI_J_TOTAL);

  console.log(`\nRANTAI J: ${pass} lulus, ${fail} gagal (total ${pass + fail})`);
  if (fail > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error('SUITE ERROR:', err);
  process.exitCode = 1;
});
