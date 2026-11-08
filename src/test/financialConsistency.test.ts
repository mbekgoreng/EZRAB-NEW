/**
 * FINANCIAL CONSISTENCY REGRESSION — Audit Regresi Final 2026-11-03 (§6/§7).
 *
 * Mencakup:
 *  1. Matematika kanonis flagship: Σ item = directCost; tangga
 *     langsung → overhead → profit → subtotal → pajak → grand total.
 *  2. Konsistensi fixture Premium Demo terhadap ringkasannya sendiri.
 *  3. Kebijakan pajak opt-in mesin kanonis: tanpa flag ppnEnabled, edit
 *     item akan membuang PPN — karena itu seed bertanda pajak WAJIB
 *     membawa flag (kasus flagship & premium dibuktikan di sini).
 *  4. reconcileProjectSummaries: cache basi dibangun ulang dari item;
 *     proyek konsisten & proyek tanpa item tidak disentuh; perlakuan
 *     pajak dipertahankan; idempoten; item PRICE_UNRESOLVED terkecuali.
 *
 * Gaya: assertion mandiri (tanpa vitest) — jalankan via bundel esbuild.
 */

import { computeSeedCostSummary, reconcileProjectSummaries } from '../lib/demoSeed';
import { PREMIUM_DEMO_PROJECT, PREMIUM_DEMO_RAB_ITEMS } from '../data/premiumDemoData';
import { UnifiedProjectEngine } from '../engine/unifiedProjectEngine';

let passed = 0;
let failed = 0;
function ok(cond: boolean, label: string) {
  if (cond) { passed++; console.log(`  ✓ ${label}`); }
  else { failed++; console.log(`  ✗ GAGAL: ${label}`); }
}
function eq(actual: unknown, expected: unknown, label: string) {
  ok(Object.is(actual, expected), `${label} (=${String(expected)}, aktual=${String(actual)})`);
}

// ── 1. Flagship: fixture jumlah item (dari DEFAULT_FLAGSHIP_RAB_ITEMS) ──────
const flagshipAmounts = [6038250, 5878840, 230000000, 258552000, 68870000, 91200000, 99750];
const flagshipItems = flagshipAmounts.map((amount) => ({ amount }));
const fs = computeSeedCostSummary(flagshipItems);
eq(flagshipAmounts.reduce((a, b) => a + b, 0), 660638840, 'flagship Σ item = directCost');
eq(fs.directCost, 660638840, 'flagship directCost');
eq(fs.overheadAmount, 33031942, 'flagship overhead 5%');
eq(fs.profitAmount, 33031942, 'flagship profit 5%');
eq(fs.subtotalBeforeTax, 726702724, 'flagship subtotal sebelum pajak');
eq(fs.taxAmount, 79937300, 'flagship pajak 11% × subtotal');
eq(fs.grandTotal, 806640024, 'flagship grand total');

// ── 2. Premium Demo konsisten terhadap ringkasannya ─────────────────────────
const premiumSum = PREMIUM_DEMO_RAB_ITEMS.reduce((s, i) => s + (i.amount ?? 0), 0);
eq(premiumSum, PREMIUM_DEMO_PROJECT.costSummary.directCost, 'premium Σ item = directCost ringkasan');
eq(
  PREMIUM_DEMO_PROJECT.costSummary.directCost +
    PREMIUM_DEMO_PROJECT.costSummary.overheadAmount +
    PREMIUM_DEMO_PROJECT.costSummary.profitAmount,
  PREMIUM_DEMO_PROJECT.costSummary.subtotalBeforeTax,
  'premium subtotal = langsung + overhead + profit'
);
eq(
  PREMIUM_DEMO_PROJECT.costSummary.subtotalBeforeTax + PREMIUM_DEMO_PROJECT.costSummary.taxAmount,
  PREMIUM_DEMO_PROJECT.costSummary.grandTotal,
  'premium grand total = subtotal + pajak'
);
eq(PREMIUM_DEMO_PROJECT.totalRab, PREMIUM_DEMO_PROJECT.costSummary.grandTotal, 'premium totalRab = grandTotal');
eq(PREMIUM_DEMO_PROJECT.itemsCount, PREMIUM_DEMO_RAB_ITEMS.length, 'premium itemsCount = jumlah item');
// Seed bertanda pajak harus membawa flag opt-in agar kalkulasi ulang live
// tidak membuang PPN-nya (lihat kasus 3).
eq((PREMIUM_DEMO_PROJECT as any).ppnEnabled, true, 'premium ppnEnabled=true (ringkasannya memuat pajak)');

// ── 3. Mesin kanonis: pajak opt-in ──────────────────────────────────────────
const engineItems = flagshipAmounts.map((amount) => ({ amount })) as any;
const noFlag = UnifiedProjectEngine.recalculateCostSummary(engineItems, {
  overheadPercent: 5, profitPercent: 5, taxPercent: 11, ppnEnabled: false,
} as any);
eq(noFlag.taxAmount, 0, 'mesin: tanpa ppnEnabled pajak = 0 (opt-in)');
eq(noFlag.grandTotal, 726702724, 'mesin: tanpa flag grand total tanpa pajak');
const withFlag = UnifiedProjectEngine.recalculateCostSummary(engineItems, {
  overheadPercent: 5, profitPercent: 5, taxPercent: 11, ppnEnabled: true,
} as any);
eq(withFlag.taxAmount, 79937300, 'mesin: ppnEnabled=true pajak 11% × subtotal');
eq(withFlag.grandTotal, 806640024, 'mesin: ppnEnabled=true grand total flagship utuh');
const withUnresolved = UnifiedProjectEngine.recalculateCostSummary(
  [...engineItems, { amount: 500000000, priceStatus: 'PRICE_UNRESOLVED' }] as any,
  { overheadPercent: 5, profitPercent: 5, taxPercent: 11, ppnEnabled: true } as any
);
eq(withUnresolved.directCost, 660638840, 'mesin: item PRICE_UNRESOLVED tidak masuk directCost');

// ── 4. reconcileProjectSummaries ────────────────────────────────────────────
function mkProject(over: any): any {
  return {
    id: 'P-TEST', name: 'Uji', totalRab: 0, itemsCount: 0,
    costSummary: {
      directCost: 0, overheadPercent: 5, overheadAmount: 0, profitPercent: 5, profitAmount: 0,
      contingencyPercent: 0, contingencyAmount: 0, directorMarkupPercent: 0, directorMarkupNominal: 0,
      directorMarkupTotal: 0, showMarkupToEditor: false, showMarkupToClient: false,
      subtotalBeforeTax: 0, taxPercent: 11, taxAmount: 0, grandTotal: 0, costPerM2: 0,
    },
    ...over,
  };
}
const itemsOf = (pid: string, amounts: Array<number | null>, unresolved = false) =>
  amounts.map((amount, idx) => ({
    projectId: pid,
    amount,
    priceStatus: unresolved && idx === amounts.length - 1 ? 'PRICE_UNRESOLVED' : undefined,
  })) as any;

// 4a. Cache basi (directCost salah) dibangun ulang; pajak dipertahankan.
const stale = mkProject({
  totalRab: 999, itemsCount: 3,
  costSummary: { ...mkProject({}).costSummary, directCost: 12345, taxAmount: 111, grandTotal: 999 },
});
const r1 = reconcileProjectSummaries([stale], itemsOf('P-TEST', [100000, 200000, 300000]));
eq(r1.changedIds.length, 1, 'rekonsiliasi: proyek basi terdeteksi');
eq(r1.projects[0].costSummary.directCost, 600000, 'rekonsiliasi: directCost = Σ item');
eq(r1.projects[0].costSummary.subtotalBeforeTax, 660000, 'rekonsiliasi: subtotal + OH/profit 5/5');
eq(r1.projects[0].costSummary.taxAmount, 72600, 'rekonsiliasi: pajak dipertahankan (11% × subtotal)');
eq(r1.projects[0].totalRab, 732600, 'rekonsiliasi: totalRab = grand total baru');
eq(r1.projects[0].itemsCount, 3, 'rekonsiliasi: itemsCount diperbaiki');
// 4b. Idempoten: hasil rekonsiliasi tidak berubah pada putaran kedua.
const r2 = reconcileProjectSummaries(r1.projects, itemsOf('P-TEST', [100000, 200000, 300000]));
eq(r2.changedIds.length, 0, 'rekonsiliasi: idempoten');
// 4c. Proyek konsisten tidak disentuh.
const consistent = mkProject({
  totalRab: 732600, itemsCount: 3,
  costSummary: {
    ...mkProject({}).costSummary,
    directCost: 600000, overheadAmount: 30000, profitAmount: 30000,
    subtotalBeforeTax: 660000, taxAmount: 72600, grandTotal: 732600,
  },
});
eq(reconcileProjectSummaries([consistent], itemsOf('P-TEST', [100000, 200000, 300000])).changedIds.length, 0,
  'rekonsiliasi: proyek konsisten tidak diubah');
// 4d. Proyek TANPA item tidak pernah disentuh (cache yatim dipertahankan).
const orphan = mkProject({ totalRab: 5000000, itemsCount: 7, costSummary: { ...mkProject({}).costSummary, directCost: 4000000, grandTotal: 5000000 } });
const rOrphan = reconcileProjectSummaries([orphan], []);
eq(rOrphan.changedIds.length, 0, 'rekonsiliasi: proyek tanpa item tidak disentuh');
eq(rOrphan.projects[0].totalRab, 5000000, 'rekonsiliasi: cache proyek tanpa item utuh');
// 4e. Item PRICE_UNRESOLVED terkecuali dari directCost.
const rUnres = reconcileProjectSummaries(
  [mkProject({})],
  itemsOf('P-TEST', [100000, 900000], true)
);
eq(rUnres.projects[0].costSummary.directCost, 100000, 'rekonsiliasi: PRICE_UNRESOLVED terkecuali');
// 4f. Proyek tanpa pajak tetap tanpa pajak setelah dibangun ulang.
const noTax = mkProject({ totalRab: 1, costSummary: { ...mkProject({}).costSummary, directCost: 5, grandTotal: 1, taxAmount: 0 } });
const rNoTax = reconcileProjectSummaries([noTax], itemsOf('P-TEST', [100000]));
eq(rNoTax.projects[0].costSummary.taxAmount, 0, 'rekonsiliasi: proyek tanpa pajak tetap tanpa pajak');
eq(rNoTax.projects[0].totalRab, 110000, 'rekonsiliasi: grand total tanpa pajak = subtotal');

// ── 5. Mesin ekspor (computeCostSummaryFromSections): overhead dari FIELD ───
// Temuan PDF audit regresi final: ekspor PDF flagship mencetak overhead
// 10% (grand total 843.305.479) karena field proyek tidak terpasang —
// mesin ekspor membaca overhead HANYA dari field proyek (fallback 10,
// penyelarasan owner 2026-10-27), bukan dari costSummary.
// DIPERBARUI keputusan owner 2026-11-08: fallback tanpa field kini 0%
// (bukan 10), sehingga proyek tanpa field overhead mengekspor grand
// 769.974.568 (direct 660.638.840 + profit ringkasan 5% + PPN 11%).
// Kasus field terpasang di bawah TIDAK berubah (806.640.024).
const sectionsFixture = [{
  id: 'sec-1', code: 'A', name: 'Semua',
  subtotal: 660638840,
  items: flagshipAmounts.map((amount) => ({ amount, totalPrice: amount })),
}] as any;
const projNoField: any = {
  id: 'P-EXP', costSummary: { overheadPercent: 5, profitPercent: 5, taxPercent: 11 },
  ppnEnabled: true,
};
const expNoField = UnifiedProjectEngine.computeCostSummaryFromSections(projNoField, sectionsFixture);
eq(expNoField.overheadPercent, 0, 'ekspor: overhead tanpa field proyek = fallback 0 (2026-11-08)');
eq(expNoField.grandTotal, 769974568, 'ekspor: grand total tanpa field = 769.974.568 (fallback 0%)');
const expWithField = UnifiedProjectEngine.computeCostSummaryFromSections(
  { ...projNoField, overheadPercent: 5 }, sectionsFixture
);
eq(expWithField.overheadPercent, 5, 'ekspor: overhead field proyek 5 dipakai');
eq(expWithField.taxAmount, 79937300, 'ekspor: PPN 11% × subtotal dengan field terpasang');
eq(expWithField.grandTotal, 806640024, 'ekspor: grand total = 806.640.024 dengan field terpasang');
eq((PREMIUM_DEMO_PROJECT as any).overheadPercent, 5, 'premium overheadPercent field = 5');

// ── 6. normalizeSections: isolasi proyek (regresi kebocoran lintas proyek) ──
// Terbukti di browser: PDF proyek kosong PRJ-2026-002 berisi item flagship
// + premium (Rp1.148.979.504) karena fallback memakai seluruh store.
// Shim window/localStorage dipasang sebelum pemanggilan (mesin memeriksa
// `typeof window` saat runtime).
{
  const store = new Map<string, string>();
  (globalThis as any).window = globalThis;
  (globalThis as any).localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => { store.set(k, String(v)); },
    removeItem: (k: string) => { store.delete(k); },
    clear: () => { store.clear(); },
  };
  store.set('ezrab_prod_rab_items', JSON.stringify([
    { id: 'i-a', projectId: 'PRJ-A', category: 'Pondasi', amount: 1000 },
    { id: 'i-b', projectId: 'PRJ-B', category: 'Dinding', amount: 2000 },
  ]));
  const emptySections = UnifiedProjectEngine.normalizeSections({ id: 'PRJ-EMPTY', sections: [] } as any);
  eq(emptySections.length, 0, 'isolasi: proyek tanpa item → tanpa seksi (tidak meminjam proyek lain)');
  const aSections = UnifiedProjectEngine.normalizeSections({ id: 'PRJ-A', sections: [] } as any);
  eq(aSections.length, 1, 'isolasi: proyek A mendapat seksinya sendiri');
  eq(aSections[0]?.subtotal, 1000, 'isolasi: subtotal seksi A hanya item A');
  delete (globalThis as any).window;
  delete (globalThis as any).localStorage;
}

console.log(`\nfinancialConsistency: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
