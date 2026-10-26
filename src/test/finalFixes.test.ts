/**
 * EZRAB — FINAL FIX REGRESSION SUITE (2026-10-26)
 * Menutup 8 perbaikan final (R1, transient, ded/doc, estimator, consumer
 * gating, grandTotal Excel, metadata pasar, kode mati) dengan tes yang
 * dapat dijalankan di sini (tsx; bukan vitest — paket vitest tidak ada
 * di repo). Gaya mengikuti suite lain: assert + hitung lulus/gagal,
 * exit 1 bila ada yang gagal.
 *
 * Jalankan: npx --yes tsx src/test/finalFixes.test.ts
 */
import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import {
  openEzrabAI,
  requestAiEntry,
  consumePendingAiEntry,
  peekPendingAiEntry,
  peekPendingEzrabAiEntry,
  clearPendingAiEntry,
  clearPendingEzrabAiEntry,
  ezrabAiEntryRemainingMs,
  aiRouteFor,
} from '../ai-tools/aiNavigation';
import {
  exportItemAmount,
  summarizeExportSections,
} from '../export/priceIntegrity';
import { evaluateSpreadsheetFormula } from '../engine/spreadsheetFormulaEngine';
import { VersionAndScenarioEngine } from '../engine/versionAndScenarioEngine';
import { buildExcelSourceText } from '../export/excelExportEngine';
import { MaterialLibraryService } from '../services/materialLibraryService';
import { RabTemplateService } from '../services/rabTemplateService';
import {
  mapAiGeneratedItems,
  missingVolumeIndexes,
} from '../components/magic-ai/rabGeneratorMapping';

let passed = 0;
let failed = 0;
function check(cond: boolean, name: string): void {
  if (cond) { passed++; }
  else { failed++; console.error('FAIL:', name); }
}
function readSrc(rel: string): string {
  return fs.readFileSync(path.join(srcRoot, rel), 'utf8');
}
const srcRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

// Mock window untuk navigasi resolver (pola aiUnification.test.ts).
let lastUrl = '';
(global as any).window = {
  history: {
    pushState: (_s: unknown, _t: string, url: string) => { lastUrl = url; },
    replaceState: (_s: unknown, _t: string, url: string) => { lastUrl = url; },
  },
  dispatchEvent: () => true,
  addEventListener: () => {},
  removeEventListener: () => {},
};
function resetEntries(): void {
  clearPendingAiEntry();
  clearPendingEzrabAiEntry();
  lastUrl = '';
}

// ---------------------------------------------------------------- R1
const createModal = readSrc('components/projects/CreateProjectModal.tsx');
check(
  createModal.includes('onOpenMagicAiWithPrompt(aiPrompt, newProj.id, newProj.name)'),
  'R1a: modal meneruskan newProj.id + newProj.name ke handler kartu AI',
);
check(
  createModal.includes('(prompt: string, projectId: string, projectName: string)'),
  'R1b: signature prop modal membawa projectId + projectName',
);
const workspace = readSrc('components/dashboard/WorkspaceView.tsx');
const withPromptAt = workspace.indexOf('onOpenMagicAiWithPrompt={');
const withPromptBlock = withPromptAt >= 0 ? workspace.slice(withPromptAt, withPromptAt + 600) : '';
check(
  withPromptBlock.includes('projectId: projectId ?? null'),
  'R1c: handler WorkspaceView memakai ID terusan (projectId ?? null)',
);
check(
  !withPromptBlock.includes('currentProject?.id'),
  'R1d: handler WorkspaceView TIDAK memakai currentProject?.id dari closure lama',
);
check(
  aiRouteFor('chat_agent', 'proj-NEW').includes('proj-NEW'),
  'R1e: rute chat per-proyek memuat ID proyek baru',
);
resetEntries();
openEzrabAI({ mode: 'rab-generator', prompt: 'paving', projectId: 'proj-NEW', projectName: 'Proyek Baru', source: 'create-project' });
check(lastUrl.includes('proj-NEW'), 'R1f: openEzrabAI rab-generator menavigasi ke URL proyek baru');

// ------------------------------------------------------- Transient (2)
resetEntries();
requestAiEntry('ded_rab_ai', { dedRef: 'DED-001', projectId: 'p1' });
check(consumePendingAiEntry('chat_agent') === null, 'T2a: consume tujuan lain mengembalikan null');
check(peekPendingAiEntry()?.ctx.dedRef === 'DED-001', 'T2b: default (event) TIDAK membersihkan entry tujuan lain');
check(consumePendingAiEntry('chat_agent', { clearOnMismatch: true }) === null, 'T2c: consume mismatch tetap null');
check(peekPendingAiEntry() === null, 'T2d: consume mismatch jalur MOUNT membersihkan entry klasik');
resetEntries();
openEzrabAI({ mode: 'chat', projectId: 'p1', source: 'dashboard' });
check(peekPendingAiEntry() !== null && peekPendingEzrabAiEntry() !== null, 'T2e: openEzrabAI chat menitipkan entry klasik + entry mode');
check(consumePendingAiEntry('ded_rab_ai', { clearOnMismatch: true }) === null, 'T2f: consume mismatch mount null');
check(peekPendingAiEntry() === null && peekPendingEzrabAiEntry() === null, 'T2g: mismatch mount membersihkan KEDUA entry pasangan');
check(ezrabAiEntryRemainingMs(Date.now() - 61_000) === 0, 'T2h: TTL habis → sisa 0 ms');
check(ezrabAiEntryRemainingMs(10_000, 60_000) === 10_000, 'T2i: TTL sisa dihitung dari createdAt (60.000 - 50.000)');
const chatView = readSrc('ai-tools/ezrab-ai/view.tsx');
const switcherAt = chatView.indexOf('const switcherModes');
const switcherBlock = switcherAt >= 0 ? chatView.slice(switcherAt, switcherAt + 2200) : '';
for (const key of ['prompt:', 'rabItemId:', 'documentId:', 'dedRef:']) {
  check(switcherBlock.includes(key), `T2j: switcher meneruskan konteks penuh (${key})`);
}
check(chatView.includes('ezrabAiEntryRemainingMs'), 'T2k: banner chat memakai helper TTL (dibersihkan saat kedaluwarsa)');

// ------------------------------------------------------- Ded / Doc (3)
const dedView = readSrc('ai-tools/ded-ai-estimate/view.tsx');
check(dedView.includes('consumePendingAiEntry'), 'D3a: DedAiEstimateView mengonsumsi entry klasik');
check(dedView.includes('dedEntryBanner'), 'D3b: DedAiEstimateView punya banner konteks DED');
const docView = readSrc('ai-tools/document-ai/view.tsx');
check(docView.includes('consumePendingAiEntry'), 'D3c: DokumenAiView mengonsumsi entry klasik');
check(docView.includes('docEntryBanner'), 'D3d: DokumenAiView punya banner konteks dokumen');
const dedInput = readSrc('ai-tools/ded-ai-estimate/DedAiInputView.tsx');
check(
  dedInput.includes('initialSession.description') && dedInput.includes('setDescription(initialSession.description)'),
  'D3e: DedAiInputView mengisi deskripsi dari sesi awal bila kolom masih kosong',
);

// ------------------------------------------------------- Estimator (4)
const rabView = readSrc('components/rab/RabEstimasiView.tsx');
const sheetTable = readSrc('components/estimator/EstimatorSpreadsheetTable.tsx');
check(!rabView.includes('onOpenMagicAi'), 'E4a: RabEstimasiView bersih dari prop onOpenMagicAi mati');
check(!sheetTable.includes('onOpenMagicAi'), 'E4b: EstimatorSpreadsheetTable bersih dari prop onOpenMagicAi mati');

// ------------------------------------------------------- Consumer (5)
check(exportItemAmount({ priceStatus: 'PRICE_UNRESOLVED', amount: 5_000_000, totalPrice: 5_000_000 } as any) === null, 'C5a: unresolved + total basi → null');
check(exportItemAmount({ priceStatus: 'PRICE_RESOLVED', amount: 0, totalPrice: 0 } as any) === 0, 'C5b: nol valid → 0 (bukan null)');
check(exportItemAmount({ amount: 250_000 } as any) === 250_000, 'C5c: legacy tanpa status tetap dihitung');
check(exportItemAmount({ amount: 100_000, totalPrice: 90_000 } as any) === 100_000, 'C5d: amount tersimpan menang atas totalPrice');
check(exportItemAmount({ volume: 10, unitPrice: 50_000 } as any) === 500_000, 'C5e: volume × unitPrice bila tak ada total tersimpan');
check(exportItemAmount({ priceStatus: 'PRICE_UNRESOLVED', volume: 10, unitPrice: 50_000 } as any) === null, 'C5f: unresolved tanpa total tersimpan → null (bukan volume × harga basi)');
const rowMap = {
  1: { totalPrice: 100_000, priceStatus: 'PRICE_RESOLVED' },
  2: { totalPrice: 999_000, priceStatus: 'PRICE_UNRESOLVED' },
} as any;
const sumL = evaluateSpreadsheetFormula('=SUM(L1:L2)', rowMap);
check(sumL.value === 100_000 && sumL.hasIncomplete === true, 'C5g: SUM kolom L mengecualikan unresolved + menandai incomplete');
const avgL = evaluateSpreadsheetFormula('=AVERAGE(L1:L2)', rowMap);
check(avgL.value === 100_000 && avgL.hasIncomplete === true, 'C5h: AVERAGE kolom L mengecualikan unresolved dari pembilang DAN penyebut');
check(evaluateSpreadsheetFormula('=L1+L2', rowMap).value === 100_000, 'C5i: substitusi sel kolom L unresolved → 0');
const baseItem = { id: 'i1', code: 'C1', volume: 10, unit: 'm2', amount: 999_999, totalPrice: 999_999, unitPrice: 99_999, priceStatus: 'PRICE_UNRESOLVED' } as any;
const targetItem = { id: 'i1', code: 'C1', volume: 1, unit: 'm2', amount: 100, totalPrice: 100, unitPrice: 100, priceStatus: 'PRICE_RESOLVED' } as any;
const cmp = VersionAndScenarioEngine.compareVersions([baseItem], [targetItem]);
check(cmp.baseTotal === 0 && cmp.targetTotal === 100 && cmp.totalDelta === 100, 'C5j: compareVersions menggating total basis unresolved');
check(
  readSrc('ded-rab-v2/spreadsheet/dedSpreadsheetSync.ts').includes('i.price?.priceStatus ?? i.priceStatus'),
  'C5k: dedSpreadsheetSync menggating dari status price maupun item',
);
check(exportItemAmount({ totalPrice: 999, priceStatus: 'PRICE_UNRESOLVED' } as any) === null, 'C5l: bentuk harga DED unresolved → null');
check(exportItemAmount({ totalPrice: 999, priceStatus: 'PRICE_INTERNAL' } as any) === 999, 'C5m: bentuk harga DED teresolusi → dihitung');
const tmplEngine = readSrc('engine/templateEngine/TemplateEngine.ts');
check(
  tmplEngine.includes('totalPrice || 0') && !tmplEngine.includes('exportItemAmount'),
  'C5n: TemplateEngine TIDAK digating (total dihitung segar, tak ada jalur basi — didokumentasikan, bukan dilewati diam-diam)',
);

// ------------------------------------------------------- GrandTotal (6)
const excel = readSrc('export/excelExportEngine.ts');
check(excel.includes('const grandTotal = costSummary.grandTotal ?? 0;'), 'G6a: fabrikasi Rp1 dihapus (?? 0)');
check(!excel.includes('costSummary.grandTotal || 1'), 'G6b: tidak ada lagi fallback grandTotal || 1');
check(excel.includes('noPricedTotal') && excel.includes('HARGA BELUM TERSEDIA'), 'G6c: sel display memakai teks HARGA BELUM TERSEDIA bila nol item berharga');
const allUnpriced = summarizeExportSections([{
  code: 'A', name: 'Pekerjaan',
  items: [
    { priceStatus: 'PRICE_UNRESOLVED', amount: 5_000_000, totalPrice: 5_000_000 },
    { priceStatus: 'PRICE_UNRESOLVED', volume: 10, unitPrice: 50_000 },
  ] as any,
}]);
check(allUnpriced.pricedCount === 0 && allUnpriced.isPartial === true, 'G6d: seluruh item tanpa harga → pricedCount 0 + PARSIAL (pemicu label belum tersedia)');

// ------------------------------------------------------- Metadata pasar (7)
const matService = MaterialLibraryService.getInstance();
const betonPrice = matService.getMaterialPrice('MAT-BETON-K350');
check(betonPrice.unitPrice > 0, 'M7a: harga material beton K350 teresolusi dari referensi');
check(betonPrice.supplier !== '' && betonPrice.supplier !== 'PRICE_NOT_FOUND', 'M7b: pemasok material tercatat (bukan PRICE_NOT_FOUND)');
check(betonPrice.location !== '', 'M7c: wilayah material tercatat (field location baru di API)');
check(/^\d{4}-\d{2}-\d{2}$/.test(betonPrice.effectiveDate), 'M7d: tanggal berlaku material tercatat format tanggal');
const tplService = new RabTemplateService();
const matItems = (tplService as any).generateDefaultItemsFromComponents(
  {
    components: [{
      id: 'c-mat', name: 'Beton K350 cor', category: 'STRUKTUR', unit: 'm3',
      calculationRule: '10', defaultMaterialId: 'MAT-BETON-K350', detailLevel: 'STANDARD',
    }],
  },
  {}, 'STANDARD', [], undefined,
);
check(matItems.length === 1, 'M7e: satu item dari komponen material-linked');
check(matItems[0].priceSourceKind === 'MARKET_REFERENCE', 'M7f: item material-linked ber-kind MARKET_REFERENCE');
check(matItems[0].priceSourceName === betonPrice.supplier, 'M7g: priceSourceName = pemasok (bukan null lagi)');
check(matItems[0].priceSourceSupplier === betonPrice.supplier, 'M7h: priceSourceSupplier diplumbing');
check(matItems[0].priceSourceDate === betonPrice.effectiveDate, 'M7i: priceSourceDate diplumbing');
check(matItems[0].priceSourceRegion === betonPrice.location, 'M7j: priceSourceRegion diplumbing');
const seedItems = (tplService as any).generateDefaultItemsFromComponents(
  {
    components: [{
      id: 'c-seed', name: 'Item seed template', category: 'LAINNYA', unit: 'ls',
      calculationRule: '1', unitPrice: 123_456, detailLevel: 'STANDARD',
    }],
  },
  {}, 'STANDARD', [], undefined,
);
check(seedItems[0].priceSourceKind === 'MARKET_REFERENCE', 'M7k: item seed tetap MARKET_REFERENCE');
check(seedItems[0].priceSourceName === null && seedItems[0].priceSourceSupplier === null && seedItems[0].priceSourceDate === null && seedItems[0].priceSourceRegion === null, 'M7l: item seed tetap null (tidak dikarang metadata)');
const excelSrcMeta = buildExcelSourceText({
  priceSourceKind: 'MARKET_REFERENCE', priceSourceName: 'Adhimix Precast Batching Plant',
  priceSourceSupplier: 'Adhimix Precast Batching Plant', priceSourceDate: '2026-03-01', priceSourceRegion: 'Jabodetabek',
});
check(
  excelSrcMeta.includes('Adhimix Precast Batching Plant') && excelSrcMeta.includes('2026-03-01') && excelSrcMeta.includes('Jabodetabek'),
  'M7m: kolom Sumber Excel memuat pemasok/tanggal/wilayah bila tercatat',
);
check(
  buildExcelSourceText({ priceSourceKind: 'MARKET_REFERENCE' }) === 'REFERENSI PASAR',
  'M7n: kolom Sumber Excel tanpa metadata tetap polos (tidak dikarang)',
);

// ------------------------------------------------------- Kode mati (8)
for (const dead of [
  'components/magic-ai/RabGeneratorModal.tsx',
  'components/estimator/MagicAICopilotModal.tsx',
  'components/estimator/MagicAILauncher.tsx',
  'components/estimator/MagicAIQuickRail.tsx',
]) {
  check(!fs.existsSync(path.join(srcRoot, dead)), `K8a: file mati terhapus (${dead})`);
}
check(!workspace.includes("from '../magic-ai/RabGeneratorModal'") && !workspace.includes('<RabGeneratorModal'), 'K8b: WorkspaceView bersih dari impor + JSX RabGeneratorModal');
check(fs.existsSync(path.join(srcRoot, 'components/magic-ai/rabGeneratorMapping.ts')), 'K8c: helper murni dipertahankan di rabGeneratorMapping.ts');
const mapped = mapAiGeneratedItems([
  { description: 'A', volume: 12.5, unit: 'm2', unitPrice: 1000 },
  { description: 'B', unit: 'm3', unitPrice: 2000 },
  { description: 'C', volume: '30', unit: 'm2', unitPrice: 3000 },
  { description: 'D', volume: 0, unit: 'ls', unitPrice: null },
]);
check(mapped[0].volume === 12.5 && mapped[1].volume === null && mapped[2].volume === null && mapped[3].volume === null, 'K8d: helper mapping tetap jujur (volume hilang/string/nol → null)');
check(JSON.stringify(missingVolumeIndexes(mapped)) === JSON.stringify([1, 2, 3]), 'K8e: helper gate volume tetap menandai indeks belum ditentukan');
check(mapAiGeneratedItems('bukan array').length === 0, 'K8f: helper mapping menolak input non-array');

console.log(`\nfinalFixes: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
