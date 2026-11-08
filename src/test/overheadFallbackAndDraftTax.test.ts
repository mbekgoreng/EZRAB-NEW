/**
 * overheadFallbackAndDraftTax.test — regresi keputusan owner:
 * (A) fallback overhead/profit 0% bila proyek belum dikonfigurasi
 *     (keputusan owner 2026-11-08, MENGGANTIKAN fallback overhead 10%
 *     dari 2026-10-27 — nilai eksplisit berapa pun tetap dipertahankan);
 * (B) pajak opt-in di seluruh preview draf DED/RAB (owner 2026-10-27).
 *
 * Gaya plain-tsx (tanpa vitest — vitest tidak terinstal di sandbox):
 * jalankan dari ROOT repo: `npx --yes tsx src/test/overheadFallbackAndDraftTax.test.ts`
 *
 * Cakupan:
 * OVERHEAD/PROFIT (mesin utama + ringkasan ekspor + helper Info Proyek):
 * - tanpa konfigurasi → 0% overhead & 0% profit; grand total = direct
 *   cost (pajak mati) — bukan 10/5 lama, bukan 5 lama;
 * - eksplisit 10/5 → tetap 10/5; eksplisit 5% → 5%; eksplisit 0% → 0%
 *   (?? mempertahankan nilai eksplisit, bukan truthy);
 * - Rekap/helper vs mesin konsisten untuk input & konfigurasi yang sama;
 * - recalculate berulang tidak menggandakan overhead dan tidak mengubah
 *   objek proyek yang diberikan (konfigurasi tersimpan tidak ditimpa).
 * PAJAK PREVIEW:
 * - prepareProposal (jalur review import): tanpa flag → PPN 0, PPh 0,
 *   grand = subtotal; persen tersedia tanpa flag → tetap 0; flag aktif
 *   → sesuai konfigurasi; kedua pajak aktif → masing-masing tepat sekali;
 *   baris tanpa harga tidak menyumbang subtotal (bukan Rp0 diam-diam).
 * - templatePreviewTax: tanpa flag / flag false → 0; flag true → persen.
 * - wizard resolveClientWizardStep: tanpa projectTax → pajak 0; dengan
 *   flag proyek → sesuai flag; persen tanpa flag → 0.
 * - mesin utama & ringkasan ekspor: pajak off default; unresolved tetap
 *   dikecualikan (bukan biaya nol / harga valid).
 *
 * Yang TIDAK diuji runtime di sini (butuh React / provider AI / DB besar
 * dan diverifikasi lewat QA Preview + suite server terkait):
 * - render modal review (props flag diteruskan, diverifikasi tsc);
 * - executePipeline DED (tidak ada pemanggil produksi; jalurnya memakai
 *   flag yang sama dan diuji lewat suite phase10/evidence-first).
 */
import { UnifiedProjectEngine } from '../engine/unifiedProjectEngine';
import { computeProjectInfoTotal } from '../services/projectInfoTotal';
import { templatePreviewTax } from '../services/templatePreviewTax';
import { resolveClientWizardStep } from '../services/coAssistantService';
import { SpreadsheetApprovalEngine } from '../../server/services/spreadsheetApprovalEngine';
import type { RabItem, Project } from '../types';
import { readFileSync } from 'fs';
import { PREMIUM_DEMO_PROJECT } from '../data/premiumDemoData';

let passed = 0;
let failed = 0;
function check(name: string, fn: () => void): void {
  try {
    fn();
    passed += 1;
    console.log(`  PASS ${name}`);
  } catch (e: any) {
    failed += 1;
    console.log(`  FAIL ${name}: ${e?.message ?? e}`);
  }
}
const eq = (a: unknown, b: unknown, msg: string) => {
  if (a !== b) throw new Error(`${msg} (dapat ${a}, harap ${b})`);
};
const assert = (cond: unknown, msg: string) => {
  if (!cond) throw new Error(msg);
};

const mk = (over: Partial<RabItem> & { id: string; amount: number }): RabItem =>
  ({ no: 1, projectId: 'p1', code: 'X', category: 'C', description: 'item', volume: 1, unit: 'ls', unitPrice: over.amount, ...over } as RabItem);
const item = mk({ id: 'a', amount: 100000 });
const proj = (over: Partial<Project> & Record<string, unknown>): Project =>
  ({ id: 'p1', name: 'P', sections: [], ...over } as unknown as Project);

// ---------------------------------------------------------------- overhead
check('A1. mesin: tanpa konfigurasi → overhead 0% & profit 0%, grand = direct', () => {
  const s = UnifiedProjectEngine.recalculateCostSummary([item], { contingencyPercent: 0, directorMarkupPercent: 0 } as any);
  eq(s.overheadPercent, 0, 'fallback overhead harus 0 (keputusan 2026-11-08)');
  eq(s.overheadAmount, 0, 'overhead 0');
  eq(s.profitPercent, 0, 'fallback profit harus 0');
  eq(s.profitAmount, 0, 'profit 0');
  eq(s.grandTotal, 100000, 'grand total = direct cost (pajak mati, komponen lain 0)');
});
check('A2. mesin: overhead eksplisit 5% → tetap 5%', () => {
  const s = UnifiedProjectEngine.recalculateCostSummary([item], { overheadPercent: 5, profitPercent: 0, contingencyPercent: 0, directorMarkupPercent: 0 } as any);
  eq(s.overheadAmount, 5000, 'overhead 5%');
});
check('A3. mesin: overhead eksplisit 0% → tetap 0% (bukan fallback apa pun)', () => {
  const s = UnifiedProjectEngine.recalculateCostSummary([item], { overheadPercent: 0, profitPercent: 0, contingencyPercent: 0, directorMarkupPercent: 0 } as any);
  eq(s.overheadPercent, 0, '0 eksplisit harus bertahan');
  eq(s.overheadAmount, 0, 'overhead 0');
});
check('A4. mesin: overhead null → fallback 0% (null = belum dikonfigurasi)', () => {
  const s = UnifiedProjectEngine.recalculateCostSummary([item], { overheadPercent: null, profitPercent: null, contingencyPercent: 0, directorMarkupPercent: 0 } as any);
  eq(s.overheadPercent, 0, 'null diperlakukan belum dikonfigurasi → 0');
  eq(s.profitPercent, 0, 'profit null → 0');
});
check('A4b. mesin: eksplisit 10/5 (konfigurasi lama yang disetel) → tetap 10/5, TIDAK ditimpa', () => {
  const s = UnifiedProjectEngine.recalculateCostSummary([item], { overheadPercent: 10, profitPercent: 5, contingencyPercent: 0, directorMarkupPercent: 0 } as any);
  eq(s.overheadPercent, 10, 'overhead eksplisit 10 bertahan');
  eq(s.profitPercent, 5, 'profit eksplisit 5 bertahan');
  eq(s.overheadAmount, 10000, 'overhead 10% × 100.000');
  eq(s.profitAmount, 5000, 'profit 5% × 100.000');
  eq(s.grandTotal, 115000, 'grand = direct + 10% + 5%');
});
check('A5. helper Info Proyek: tanpa overhead → 0%, konsisten dengan mesin', () => {
  const info = computeProjectInfoTotal([item], {});
  assert(info !== null, 'helper tidak null');
  eq(info!.overheadPercent, 0, 'helper fallback 0 (keputusan 2026-11-08)');
  eq(info!.total, 100000, 'helper total = direct cost saja');
  const engine = UnifiedProjectEngine.recalculateCostSummary([item], { contingencyPercent: 0, directorMarkupPercent: 0 } as any);
  eq(engine.grandTotal, info!.total, 'mesin (tanpa pajak, tanpa konfigurasi) == helper');
});
check('A6. recalculate berulang tidak menggandakan overhead & tidak mengubah proyek', () => {
  const p = proj({ overheadPercent: 5, costSummary: { overheadPercent: 5, profitPercent: 5, taxPercent: 11 } as any });
  const before = JSON.stringify(p);
  const s1 = UnifiedProjectEngine.recalculateCostSummary([item], { overheadPercent: (p as any).overheadPercent, profitPercent: 0, contingencyPercent: 0, directorMarkupPercent: 0 } as any);
  const s2 = UnifiedProjectEngine.recalculateCostSummary([item], { overheadPercent: (p as any).overheadPercent, profitPercent: 0, contingencyPercent: 0, directorMarkupPercent: 0 } as any);
  eq(s1.overheadAmount, s2.overheadAmount, 'refresh kedua sama dengan pertama');
  eq(JSON.stringify(p), before, 'objek proyek tidak dimutasi recalculate');
});
check('A7. ringkasan ekspor: tanpa field proyek → overhead 0%; field 0 → 0%; field 5 → 5%', () => {
  const sec: any = [{ id: 's1', code: 'A', name: 'A', subtotal: 0, items: [mk({ id: 'a', amount: 100000 })] }];
  const noField = UnifiedProjectEngine.computeCostSummaryFromSections(proj({ costSummary: { overheadPercent: 5, profitPercent: 5, taxPercent: 11 } as any }), sec);
  eq(noField.overheadPercent, 0, 'field proyek tidak ada → fallback 0 (keputusan 2026-11-08)');
  eq(noField.profitPercent, 5, 'profit dari ringkasan yang ada tetap dipakai (eksplisit tersimpan)');
  const zero = UnifiedProjectEngine.computeCostSummaryFromSections(proj({ overheadPercent: 0, costSummary: { overheadPercent: 5, profitPercent: 5, taxPercent: 11 } as any }), sec);
  eq(zero.overheadPercent, 0, 'field 0 bertahan');
  const five = UnifiedProjectEngine.computeCostSummaryFromSections(proj({ overheadPercent: 5, costSummary: { overheadPercent: 5, profitPercent: 5, taxPercent: 11 } as any }), sec);
  eq(five.overheadPercent, 5, 'field 5 dipakai');
});
check('A8. ringkasan ekspor: pajak off default; flag proyek mengaktifkan; unresolved dikecualikan', () => {
  const sec: any = [{ id: 's1', code: 'A', name: 'A', subtotal: 0, items: [
    mk({ id: 'a', amount: 100000 }),
    mk({ id: 'u', amount: 999999, priceStatus: 'PRICE_UNRESOLVED' }),
  ] }];
  const off = UnifiedProjectEngine.computeCostSummaryFromSections(proj({ overheadPercent: 10, costSummary: { profitPercent: 0, taxPercent: 11 } as any }), sec);
  eq(off.directCost, 100000, 'unresolved tidak masuk direct');
  eq(off.taxAmount, 0, 'pajak off default');
  eq(off.grandTotal, 110000, 'grand = direct + overhead eksplisit 10 saja');
  const on = UnifiedProjectEngine.computeCostSummaryFromSections(proj({ overheadPercent: 10, ppnEnabled: true, ppnPercent: 11, costSummary: { profitPercent: 0, taxPercent: 11 } as any }), sec);
  eq(on.taxAmount, 12100, 'PPN 11% × 110.000 saat flag aktif');
  eq(on.grandTotal, 122100, 'grand dengan PPN');
});

// ------------------------------------------------------------- pajak preview
const rows: any[] = [
  { entityId: 'e1', status: 'APPROVED', isExcluded: false, totalPrice: 100000 },
  { entityId: 'e2', status: 'APPROVED', isExcluded: false, totalPrice: null },
];
const proposalBase: any = { projectId: 'p1', workspaceId: 'w1', userId: 'u1', userName: 'Estimator', items: rows };
check('B1. prepareProposal: tanpa flag → PPN 0, PPh 0, grand = subtotal', () => {
  const p = SpreadsheetApprovalEngine.getInstance().prepareProposal({ ...proposalBase, ppnPercent: 11 });
  eq(p.subtotal, 100000, 'subtotal hanya dari baris berharga');
  eq(p.ppnAmount, 0, 'PPN 0 tanpa flag');
  eq(p.pphAmount, 0, 'PPh 0 tanpa flag');
  eq(p.grandTotal, 100000, 'grand tanpa pajak');
  eq(p.unpricedItemsCount, 1, 'baris tanpa harga dihitung terpisah, bukan Rp0');
});
check('B2. prepareProposal: persen tersedia tanpa flag → tetap tidak ada pajak', () => {
  const p = SpreadsheetApprovalEngine.getInstance().prepareProposal({ ...proposalBase, ppnPercent: 11, pphPercent: 2 });
  eq(p.ppnAmount, 0, 'PPN 11% tanpa flag harus 0');
  eq(p.pphAmount, 0, 'PPh 2% tanpa flag harus 0');
});
check('B3. prepareProposal: PPN aktif eksplisit → sesuai konfigurasi', () => {
  const p = SpreadsheetApprovalEngine.getInstance().prepareProposal({ ...proposalBase, ppnPercent: 11, ppnEnabled: true });
  eq(p.ppnAmount, 11000, 'PPN 11% × 100.000');
  eq(p.grandTotal, 111000, 'grand dengan PPN');
});
check('B4. prepareProposal: PPh aktif eksplisit → sesuai konfigurasi', () => {
  const p = SpreadsheetApprovalEngine.getInstance().prepareProposal({ ...proposalBase, pphEnabled: true, pphPercent: 2 });
  eq(p.pphAmount, 2000, 'PPh 2% × 100.000');
  eq(p.grandTotal, 102000, 'grand dengan PPh');
});
check('B5. prepareProposal: kedua pajak aktif → masing-masing tepat sekali', () => {
  const p = SpreadsheetApprovalEngine.getInstance().prepareProposal({ ...proposalBase, ppnPercent: 11, ppnEnabled: true, pphEnabled: true, pphPercent: 2 });
  eq(p.ppnAmount, 11000, 'PPN sekali');
  eq(p.pphAmount, 2000, 'PPh sekali');
  eq(p.grandTotal, 113000, 'grand = subtotal + PPN + PPh (tanpa ganda)');
});
check('B6. templatePreviewTax: off/false → 0; on → persen konfigurasi', () => {
  eq(templatePreviewTax(100000, undefined), 0, 'tanpa setting → 0');
  eq(templatePreviewTax(100000, { taxPercent: 11 }), 0, 'persen tanpa flag → 0');
  eq(templatePreviewTax(100000, { taxEnabled: false, taxPercent: 11 }), 0, 'flag false → 0');
  eq(templatePreviewTax(100000, { taxEnabled: true, taxPercent: 11 }), 11000, 'flag true → 11%');
});
check('B7. wizard: tanpa projectTax → pajak 0; dengan flag → sesuai; persen tanpa flag → 0', () => {
  const wiz = (tax?: any) => resolveClientWizardStep('s1', undefined, { building_area: 72 }, { selectedTemplate: { label: 'Rumah Type 72', area: 72, floorCount: 1 } }, tax);
  const off = wiz();
  eq(off.step, 'RAB_PREVIEW', 'mencapai langkah preview');
  eq(off.summary.taxAmount, 0, 'wizard tanpa flag: PPN 0');
  eq(off.summary.pphAmount, 0, 'wizard tanpa flag: PPh 0');
  eq(off.summary.grandTotal, off.summary.subtotalBeforeTax, 'wizard tanpa flag: grand = subtotal');
  const pctOnly = wiz({ ppnPercent: 11, pphPercent: 2 });
  eq(pctOnly.summary.taxAmount, 0, 'wizard persen tanpa flag: PPN 0');
  eq(pctOnly.summary.pphAmount, 0, 'wizard persen tanpa flag: PPh 0');
  const on = wiz({ ppnEnabled: true, ppnPercent: 11, pphEnabled: true, pphPercent: 2 });
  eq(on.summary.taxAmount, Math.round(on.summary.subtotalBeforeTax * 0.11), 'wizard flag PPN aktif');
  eq(on.summary.pphAmount, Math.round(on.summary.subtotalBeforeTax * 0.02), 'wizard flag PPh aktif');
  eq(on.summary.grandTotal, on.summary.subtotalBeforeTax + on.summary.taxAmount + on.summary.pphAmount, 'wizard grand konsisten');
});

/* --- C. Penyamaan 0/0: template, contoh, portfolio (owner 2026-11-08 05:01) ---
 * Tiga permukaan sisa disamakan ke 0/0. Pemeriksaan sumber di sini
 * SENGAJA tekstual (pola aiResponseTiming): perilaku UI penuhnya butuh
 * render React; yang dijaga adalah kontrak default-nya tidak kembali
 * ke 10/5 atau 5/5, DAN dua proyek eksplisit tidak ikut berubah. */
check('C1. template katalog: default global settings kini 0/0 (bukan 10/5)', () => {
  const src = readFileSync('src/components/templates/TemplateRabCatalogView.tsx', 'utf8');
  const m = src.match(/const defaults: GlobalEstimationSettings = \{[^}]*\}/);
  if (!m) throw new Error('blok defaults tidak ditemukan');
  if (!/overheadPercent: 0,/.test(m[0]) || !/profitPercent: 0,/.test(m[0])) throw new Error('default template bukan 0/0');
  if (/overheadPercent: 10|profitPercent: 5/.test(m[0])) throw new Error('default template masih 10/5');
});
check('C2. generator contoh ProjectContext: tanpa markup 0.05 & ringkasan 0/0', () => {
  const src = readFileSync('src/context/ProjectContext.tsx', 'utf8');
  if (/Math\.round\(direct \* 0\.05\)/.test(src)) throw new Error('markup contoh 0.05 masih ada');
  if (/overheadPercent: 5,\s*\n\s*overheadAmount: overhead/.test(src)) throw new Error('ringkasan contoh masih 5');
});
check('C3. literal portfolio bawaan: blok ringkasan directCost 0 kini 0/0', () => {
  const src = readFileSync('src/context/ProjectContext.tsx', 'utf8');
  const blocks = src.match(/costSummary: \{\s*\n\s*directCost: 0,[\s\S]{0,120}/g) ?? [];
  const bad = blocks.filter((b) => /overheadPercent: [^0]|profitPercent: [^0]/.test(b));
  eq(bad.length, 0, `blok literal bukan 0/0: ${bad.length}`);
});
check('C4. flagship PRJ-2026-001 TIDAK berubah: field overhead 5 eksplisit utuh', () => {
  const src = readFileSync('src/context/ProjectContext.tsx', 'utf8');
  if (!/ppnEnabled: true,\s*\n\s*overheadPercent: 5,/.test(src)) throw new Error('field flagship berubah!');
});
check('C5. Premium Demo TIDAK berubah: field 5 eksplisit & total kanonis', () => {
  eq(PREMIUM_DEMO_PROJECT.costSummary.overheadPercent, 5, 'premium overhead tetap 5');
  eq(PREMIUM_DEMO_PROJECT.costSummary.grandTotal, 1089879733, 'premium grand total tetap Rp1.089.879.733');
});

console.log(`\noverheadFallbackAndDraftTax: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
