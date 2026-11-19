/**
 * D1 (2026-11-19) — Workstream D1: disclaimer forensik weir, pemetaan
 * divisi→WBS Magic AI, normalisasi prefix "[Chat AI]" di titik baca
 * ekspor + drawer.
 *
 * Skrip asersi tsx polos (gaya magicAiFinalizeIntegrity.test.ts):
 *   npx --yes tsx src/test/d1Workstream.test.ts
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  magicAiCategoryToWbs,
  mapMagicAiItemToRabInput,
} from '../ai-tools/ded-ai-estimate/finalizeMapping';
import { isValidatedWbsCode } from '../ai-tools/ezrab-ai/wbsArtifact';
import { stripChatAiPrefix } from '../ai-tools/ezrab-ai/workItemTitle';
import type { AiEstimateWorkItem } from '../ai-estimate/types';

let total = 0;
let failed = 0;
function ok(cond: boolean, label: string) {
  total += 1;
  if (cond) {
    console.log(`ok ${total} - ${label}`);
  } else {
    failed += 1;
    console.log(`not ok ${total} - ${label}`);
  }
}

const HERE = dirname(fileURLToPath(import.meta.url));
function readSrc(rel: string): string {
  return readFileSync(join(HERE, '..', rel), 'utf8');
}

/* ── A. Pemetaan 12 kategori kanonis Magic AI ─────────────────────── */
const EXPECTED: Array<[string, string, string | null, string]> = [
  // [kategori, wbsCode, divisionCode, sectionName]
  ['Persiapan', 'BGN-01', 'DIV-01', 'Pekerjaan Persiapan'],
  ['Pekerjaan Tanah', 'BGN-02', 'DIV-02', 'Pekerjaan Tanah dan Pondasi'],
  ['Pondasi', 'BGN-03', 'DIV-02', 'Pekerjaan Tanah dan Pondasi'],
  ['Struktur', 'BGN-04', 'DIV-03', 'Pekerjaan Struktur Beton'],
  ['Dinding', 'BGN-05', 'DIV-04', 'Pekerjaan Dinding dan Plesteran'],
  ['Atap', 'BGN-06', 'DIV-05', 'Pekerjaan Atap'],
  ['Plafon', 'BGN-06-C', 'DIV-06', 'Pekerjaan Plafond'],
  ['Lantai', 'BGN-07', 'DIV-07', 'Pekerjaan Lantai dan Dinding Keramik'],
  ['Pintu & Jendela', 'BGN-08', 'DIV-08', 'Pekerjaan Kusen, Pintu dan Jendela'],
  ['Pengecatan & Finishing', 'BGN-09', 'DIV-09', 'Pekerjaan Pengecatan'],
  // MEP + Pekerjaan Luar: TIDAK punya divisi menurut kontrak divisions.ts.
  ['MEP', 'BGN-10', null, 'Pekerjaan MEP'],
  ['Pekerjaan Luar', 'BGN-11', null, 'Pekerjaan Luar'],
];
for (const [cat, wbsCode, divCode, sectionName] of EXPECTED) {
  const m = magicAiCategoryToWbs(cat);
  ok(
    m !== null && m.wbsCode === wbsCode && m.divisionCode === divCode && m.sectionName === sectionName,
    `A ${cat} -> ${wbsCode} / ${divCode ?? '-'} / "${sectionName}"`,
  );
}

/* ── B. Semua kode lolos gerbang factory (isValidatedWbsCode) ─────── */
{
  let allValid = true;
  for (const [, wbsCode] of EXPECTED) {
    if (!isValidatedWbsCode(wbsCode)) allValid = false;
  }
  ok(allValid, 'B1 semua wbsCode hasil pemetaan lolos isValidatedWbsCode (factory tidak membuangnya)');
  ok(!isValidatedWbsCode('DIV-01'), 'B2 kontrol: kode divisi DIV-01 BUKAN wbsCode valid (tidak pernah dipakai sebagai wbsCode)');
}

/* ── C. Normalisasi + fail-closed ─────────────────────────────────── */
ok(magicAiCategoryToWbs('Pekerjaan Struktur')?.wbsCode === 'BGN-04', 'C1 alias "Pekerjaan Struktur" -> BGN-04');
ok(magicAiCategoryToWbs('  struktur  ')?.wbsCode === 'BGN-04', 'C2 spasi + huruf kecil dinormalisasi');
ok(magicAiCategoryToWbs('Plafond')?.wbsCode === 'BGN-06-C', 'C3 alias "Plafond" -> BGN-06-C');
ok(magicAiCategoryToWbs('Pengecatan')?.wbsCode === 'BGN-09', 'C4 alias "Pengecatan" -> BGN-09');
ok(magicAiCategoryToWbs('Kategori Aneh XYZ') === null, 'C5 kategori tak dikenal -> null (fail-closed)');
ok(magicAiCategoryToWbs('Lain-lain') === null, 'C6 "Lain-lain" pipeline -> null (tanpa kode karangan)');
ok(magicAiCategoryToWbs('') === null, 'C7 string kosong -> null');
ok(magicAiCategoryToWbs(null) === null, 'C8 null -> null');
ok(magicAiCategoryToWbs(undefined) === null, 'C9 undefined -> null');

/* ── D. Mapper Magic AI membawa divisi ────────────────────────────── */
function fixture(overrides: Partial<AiEstimateWorkItem>): AiEstimateWorkItem {
  return {
    id: 'w1',
    category: 'Struktur',
    workName: 'Kolom beton 30x30',
    quantity: 10,
    unit: 'm3',
    quantitySource: 'DED_GEOMETRIC',
    priceSource: 'AI_ESTIMATE',
    confidence: 'HIGH',
    sourcePages: [1],
    assumptions: [],
    warnings: [],
    unitPrice: 150000,
    estimatedUnitPrice: 150000,
    priceStatus: 'PRICE_ESTIMATED',
    ...overrides,
  };
}
{
  const m = mapMagicAiItemToRabInput(fixture({}));
  ok(m !== null, 'D1 item sah tetap lolos');
  ok(m?.category === 'Pekerjaan Struktur Beton', 'D2 category menjadi nama divisi (bukan "Struktur" telanjang)');
  ok(m?.wbsCode === 'BGN-04', 'D3 wbsCode BGN-04 dibawa');
  ok(m?.wbsMappingStatus === 'PROVISIONAL', 'D4 status PROVISIONAL (turunan kategori AI, bukan CONFIRMED)');
  ok(m?.priceSourceKind === 'EZRAB_ASSUMPTION' && m?.verificationStatus === 'NEEDS_VERIFICATION', 'D5 provenance Estimasi AI tidak berubah');
  const mep = mapMagicAiItemToRabInput(fixture({ category: 'MEP' }));
  ok(mep?.category === 'Pekerjaan MEP' && mep?.wbsCode === 'BGN-10', 'D6 MEP -> "Pekerjaan MEP" + BGN-10 (tanpa klaim divisi)');
  const unknown = mapMagicAiItemToRabInput(fixture({ category: 'Kategori Aneh XYZ' }));
  ok(unknown?.category === 'Kategori Aneh XYZ' && !('wbsCode' in (unknown ?? {})), 'D7 kategori tak dikenal: kategori asli dipertahankan, tanpa wbsCode');
  const held = mapMagicAiItemToRabInput(fixture({ unitPrice: null, estimatedUnitPrice: null, priceSource: 'UNRESOLVED' }));
  ok(held === null, 'D8 item tanpa harga tetap ditahan (null)');
}

/* ── E. Prefix "[Chat AI]" di-strip di titik baca ekspor + drawer ── */
ok(stripChatAiPrefix('[Chat AI] Pekerjaan galian tanah') === 'Pekerjaan galian tanah', 'E0 helper: satu prefix dibuang');
ok(stripChatAiPrefix('[Chat AI] [Chat AI] Urugan pasir') === 'Urugan pasir', 'E0b helper: prefix berulang dibuang');
ok(stripChatAiPrefix('Pekerjaan tanpa prefix') === 'Pekerjaan tanpa prefix', 'E0c helper: teks bersih tidak berubah');
{
  const engine = readSrc('export/excelExportEngine.ts');
  ok(engine.includes("import { stripChatAiPrefix } from '../ai-tools/ezrab-ai/workItemTitle'"), 'E1 engine mengimpor stripChatAiPrefix');
  const engineWrapped = (engine.match(/stripChatAiPrefix\(itm\.description/g) || []).length;
  ok(engineWrapped === 4, `E2 engine: 4 situs deskripsi ter-wrap (ditemukan ${engineWrapped})`);
  ok(!/getCell\(3\)\.value = itm\.description \|\| \(itm as any\)\.name;/.test(engine), 'E3 engine: tidak ada lagi penulisan deskripsi mentah');
}
{
  const pdf = readSrc('export/pdfExporter.ts');
  ok(pdf.includes('stripChatAiPrefix(item.description)'), 'E4 pdf: deskripsi item di-strip');
}
{
  const five = readSrc('export/fiveSheetPreset.ts');
  ok(five.includes("import { stripChatAiPrefix } from '../ai-tools/ezrab-ai/workItemTitle'"), 'E5a fiveSheetPreset mengimpor stripChatAiPrefix');
  const fiveWrapped = (five.match(/stripChatAiPrefix\(/g) || []).length;
  // 8 situs (3 sel + 2 peringatan + 3 header kartu AHSP).
  ok(fiveWrapped === 8, `E5b fiveSheetPreset: 8 situs ter-wrap (ditemukan ${fiveWrapped} pemanggilan)`);
  ok(five.includes("${r.description || ''}"), 'E6 fiveSheetPreset: baris breakdown takeoff (r.description) sengaja tidak disentuh');
}
{
  const drawer = readSrc('components/inspector/WorkItemInspectorDrawer.tsx');
  ok(drawer.includes('{stripChatAiPrefix(initialData.description)}'), 'E7 drawer: judul tampil di-strip');
  ok(drawer.includes('${stripChatAiPrefix(initialData.description)}'), 'E8 drawer: prompt AI di-strip');
  ok(drawer.includes("description: rabItem.description || 'Pekerjaan Konstruksi'"), 'E9 drawer: initialData (jalur tulis) TIDAK disentuh — cabang rabItem mentah');
  ok(drawer.includes("description: workItem.name || workItem.ahspDescription || 'Pekerjaan Konstruksi'"), 'E10 drawer: initialData (jalur tulis) TIDAK disentuh — cabang workItem mentah');
}

/* ── F. Disclaimer panel forensik weir ────────────────────────────── */
{
  const audit = readSrc('components/weir/WeirAuditTrailPanel.tsx');
  const disclaimer =
    'Jejak ini hanya menelusuri rantai hitung biaya tubuh bendung dari dimensi masukan (geometri → kuantitas → AHSP → harga → biaya akhir); bukan verifikasi desain hidrolik/struktural maupun pengukuran lapangan.';
  ok(audit.includes(disclaimer), 'F1 panel Audit Trail memuat disclaimer cakupan 1 baris');
  const summary = readSrc('components/weir/WeirCostSummaryPanel.tsx');
  ok(!summary.includes(disclaimer), 'F2 Cost Summary Panel sengaja tidak memuat disclaimer (bukan panel audit)');
}

console.log(`# ${total - failed}/${total} lulus`);
if (failed > 0) process.exit(1);
