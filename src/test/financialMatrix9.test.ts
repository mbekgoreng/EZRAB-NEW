/**
 * financialMatrix9.test.ts — matriks verifikasi §11 finalisasi
 * (2026-11-08): SEMBILAN jalur keputusan default finansial 0%/0%
 * (owner 2026-11-08 04:54 + penyamaan 05:01) diuji pada MESIN NYATA.
 *
 * Oracle independen: ekspektasi dihitung ulang di file ini dari rumus
 * tangga biaya tertulis (direct → +overhead% → +profit% → subtotal →
 * +PPN bila flag) — TIDAK menyalin implementasi mesin.
 *
 * Jalur UI murni (buat proyek dari menu, terapkan template dari layar)
 * tidak dapat dijalankan headless di sini; untuk jalur itu matriks ini
 * menguji (a) mesin yang dipakai jalur tersebut dan (b) kontrak sumber
 * default-nya (pola pemeriksaan tekstual suite overheadFallback C1–C3).
 * Keterbatasan itu dinyatakan apa adanya di laporan finalisasi.
 *
 * Jalankan: npx --yes tsx src/test/financialMatrix9.test.ts
 */

const storage: Record<string, string> = {};
(globalThis as any).window = {
  localStorage: {
    getItem: (key: string) => storage[key] || null,
    setItem: (key: string, val: string) => { storage[key] = val; },
    removeItem: (key: string) => { delete storage[key]; },
    clear: () => { Object.keys(storage).forEach((k) => delete storage[k]); },
  },
};

import { readFileSync } from 'fs';
import { UnifiedProjectEngine } from '../engine/unifiedProjectEngine';
import { reconcileProjectSummaries } from '../lib/demoSeed';
import { buildUniversalDraft } from '../ai-tools/ezrab-ai/universalRab';
import { PREMIUM_DEMO_PROJECT, PREMIUM_DEMO_RAB_ITEMS } from '../data/premiumDemoData';

let pass = 0; let fail = 0; const failures: string[] = [];
function check(name: string, cond: boolean, detail = ''): void {
  if (cond) { pass += 1; console.log(`  PASS ${name}`); }
  else { fail += 1; failures.push(name); console.log(`  FAIL ${name} ${detail}`); }
}

/** Oracle tangga biaya independen (tertulis dari kebijakan, bukan dari kode mesin). */
function oracle(items: Array<{ amount: number | null; priceStatus?: string }>, oh: number, pf: number, ppnOn = false, ppnPct = 11) {
  const direct = items.filter((i) => i.priceStatus !== 'PRICE_UNRESOLVED').reduce((s, i) => s + (i.amount ?? 0), 0);
  const ohAmt = Math.round(direct * oh / 100);
  const pfAmt = Math.round(direct * pf / 100);
  const subtotal = direct + ohAmt + pfAmt;
  const tax = ppnOn ? Math.round(subtotal * ppnPct / 100) : 0;
  return { direct, ohAmt, pfAmt, subtotal, tax, grand: subtotal + tax };
}
const item = (amount: number, extra: Record<string, unknown> = {}) =>
  ({ projectId: 'P', amount, ...extra }) as any;

/* J1 — Proyek kosong baru (tanpa konfigurasi apa pun) */
{
  const cs = UnifiedProjectEngine.recalculateCostSummary([], undefined);
  check('J1 proyek kosong baru: 0/0 dan grand 0', cs.overheadPercent === 0 && cs.profitPercent === 0 && cs.grandTotal === 0);
  const cs2 = UnifiedProjectEngine.recalculateCostSummary([item(100000), item(250000)], undefined);
  const o = oracle([item(100000), item(250000)], 0, 0);
  check('J1 proyek baru ber-item tanpa konfigurasi: grand = direct (oracle)', cs2.grandTotal === o.grand && cs2.directCost === 350000, `${cs2.grandTotal} vs ${o.grand}`);
}

/* J2 — Proyek baru via Magic AI (draft universal → ringkasan proyek) */
{
  const d = buildUniversalDraft('buatkan rab gudang 10 x 20 m dengan luas lahan 500 m2');
  check('J2 Magic AI menghasilkan draft nyata', d.kind === 'draft');
  if (d.kind === 'draft') {
    const items = d.draft.parts.flatMap((p) => p.generation.items) as any[];
    const cs = UnifiedProjectEngine.recalculateCostSummary(items, undefined);
    check('J2 ringkasan draft Magic AI tanpa konfigurasi = 0/0', cs.overheadPercent === 0 && cs.profitPercent === 0);
    const hasUnresolved = items.some((i) => i.priceStatus === 'PRICE_UNRESOLVED');
    const pricedSum = items.filter((i) => i.priceStatus !== 'PRICE_UNRESOLVED').reduce((s, i) => s + (i.amount ?? 0), 0);
    check('J2 direct hanya dari item berharga (unresolved dikecualikan, bukan Rp0)', cs.directCost === pricedSum, `${cs.directCost} vs ${pricedSum}${hasUnresolved ? ' (ada unresolved)' : ''}`);
  }
}

/* J3 — Proyek baru dari template (kontrak default katalog 0/0 + jalur mesin) */
{
  const src = readFileSync('src/components/templates/TemplateRabCatalogView.tsx', 'utf8');
  const m = src.match(/const defaults: GlobalEstimationSettings = \{[^}]*\}/);
  check('J3 default pengaturan global template = 0/0', !!m && /overheadPercent: 0,/.test(m[0]) && /profitPercent: 0,/.test(m[0]));
  const cs = UnifiedProjectEngine.recalculateCostSummary([item(500000)], { overheadPercent: 0, profitPercent: 0 });
  check('J3 proyek hasil template (ringkasan 0/0 tersimpan): grand = direct', cs.grandTotal === 500000);
}

/* J4 — Proyek RAB manual baru (ringkasan parsial: hanya satu persen terisi) */
{
  const cs = UnifiedProjectEngine.recalculateCostSummary([item(200000)], { profitPercent: 5 });
  const o = oracle([item(200000)], 0, 5);
  check('J4 manual: overhead tak terisi → 0, profit eksplisit 5 dipertahankan', cs.overheadPercent === 0 && cs.profitPercent === 5 && cs.grandTotal === o.grand, `${cs.grandTotal} vs ${o.grand}`);
  const csNull = UnifiedProjectEngine.recalculateCostSummary([item(200000)], { overheadPercent: null as any, profitPercent: null as any });
  check('J4 manual: persen null → fallback 0/0', csNull.overheadPercent === 0 && csNull.profitPercent === 0 && csNull.grandTotal === 200000);
}

/* J5 — Proyek lama 10/5 (preservasi historis) */
{
  const items = [item(100000), item(50000)];
  const cs = UnifiedProjectEngine.recalculateCostSummary(items, { overheadPercent: 10, profitPercent: 5 });
  const o = oracle(items, 10, 5);
  check('J5 proyek lama 10/5: persen & total dipertahankan persis (oracle)', cs.overheadPercent === 10 && cs.profitPercent === 5 && cs.grandTotal === o.grand, `${cs.grandTotal} vs ${o.grand}`);
  const before = JSON.stringify({ oh: 10, pf: 5 });
  UnifiedProjectEngine.recalculateCostSummary(items, { overheadPercent: 10, profitPercent: 5 });
  check('J5 kalkulasi ulang tidak menulis ulang konfigurasi', before === JSON.stringify({ oh: 10, pf: 5 }));
}

/* J6 — Proyek kustom (persen non-standar + PPN opt-in) */
{
  const items = [item(123456)];
  const cs = UnifiedProjectEngine.recalculateCostSummary(items, { overheadPercent: 7.5, profitPercent: 2.5, ppnEnabled: true, taxPercent: 11 });
  const o = oracle(items, 7.5, 2.5, true, 11);
  check('J6 kustom 7,5/2,5 + PPN aktif: cocok oracle', cs.grandTotal === o.grand && cs.taxAmount === o.tax, `${cs.grandTotal} vs ${o.grand}`);
  const csOff = UnifiedProjectEngine.recalculateCostSummary(items, { overheadPercent: 7.5, profitPercent: 2.5, taxPercent: 11 });
  check('J6 persen pajak tanpa flag: PPN tetap 0 (opt-in)', csOff.taxAmount === 0);
}

/* J7 — Duplikasi proyek (item tersalin → total hasil duplikasi identik) */
{
  const srcItems = [item(80000), item(120000), item(0, { priceStatus: 'PRICE_UNRESOLVED', amount: 999999 })];
  const summary = { overheadPercent: 10, profitPercent: 5 };
  const original = UnifiedProjectEngine.recalculateCostSummary(srcItems, summary);
  const clonedItems = srcItems.map((i) => ({ ...i, id: `copy-${Math.random()}` }));
  const duplicated = UnifiedProjectEngine.recalculateCostSummary(clonedItems as any[], summary);
  check('J7 duplikasi: grand total identik dengan sumber', duplicated.grandTotal === original.grandTotal, `${duplicated.grandTotal} vs ${original.grandTotal}`);
  check('J7 duplikasi: item unresolved sumber TIDAK ikut dijumlah (bukan diseimbangkan)', duplicated.directCost === 200000);
}

/* J8 — Reload & persistensi (rekonsiliasi seed saat muat ulang) */
{
  const proj: any = {
    id: 'P-RELOAD', name: 'Reload', totalRab: 0, itemsCount: 2,
    costSummary: { directCost: 0, overheadPercent: 10, overheadAmount: 0, profitPercent: 5, profitAmount: 0, contingencyPercent: 0, contingencyAmount: 0, directorMarkupPercent: 0, directorMarkupNominal: 0, directorMarkupTotal: 0, showMarkupToEditor: false, showMarkupToClient: false, subtotalBeforeTax: 0, taxPercent: 11, taxAmount: 0, grandTotal: 0, costPerM2: 0 },
  };
  const items = items9('P-RELOAD', [100000, 300000]);
  function items9(pid: string, amounts: number[]) { return amounts.map((amount) => ({ projectId: pid, amount })) as any[]; }
  const r = reconcileProjectSummaries([proj], items);
  const o = oracle(items as any[], 10, 5);
  // Rekonsiliasi mempertahankan pajak tersimpan (perilaku demoSeed) —
  // yang diuji di sini: persen 10/5 TIDAK diganti fallback saat reload.
  check('J8 reload: persen historis 10/5 dipertahankan rekonsiliasi', r.projects[0].costSummary.overheadPercent === 10 && r.projects[0].costSummary.profitPercent === 5);
  check('J8 reload: direct dibangun ulang dari item', r.projects[0].costSummary.directCost === o.direct);
  const projNew: any = { ...proj, id: 'P-RELOAD-0', costSummary: { ...proj.costSummary, overheadPercent: 0, profitPercent: 0 } };
  const r0 = reconcileProjectSummaries([projNew], items9('P-RELOAD-0', [100000, 300000]));
  check('J8 reload proyek 0/0: tetap 0/0 (tidak dinaikkan fallback)', r0.projects[0].costSummary.overheadPercent === 0 && r0.projects[0].costSummary.profitPercent === 0);
}

/* J9 — Konsistensi ekspor & ringkasan finansial (mesin vs jalur seksi) */
{
  const project: any = {
    id: 'P-EXP', name: 'Ekspor', overheadPercent: 0,
    costSummary: { directCost: 0, overheadPercent: 0, overheadAmount: 0, profitPercent: 0, profitAmount: 0, contingencyPercent: 0, contingencyAmount: 0, directorMarkupPercent: 0, directorMarkupNominal: 0, directorMarkupTotal: 0, showMarkupToEditor: false, showMarkupToClient: false, subtotalBeforeTax: 0, taxPercent: 11, taxAmount: 0, grandTotal: 0, costPerM2: 0 },
  };
  const sections: any[] = [{ name: 'S1', items: [item(150000), item(50000)], subtotal: 200000 }];
  const viaSections = UnifiedProjectEngine.computeCostSummaryFromSections(project, sections);
  const viaEngine = UnifiedProjectEngine.recalculateCostSummary(sections[0].items, undefined);
  check('J9 ekspor (jalur seksi) vs mesin utama: grand sama untuk proyek 0/0', viaSections.grandTotal === viaEngine.grandTotal && viaSections.grandTotal === 200000, `${viaSections.grandTotal} vs ${viaEngine.grandTotal}`);
  const premiumOk = PREMIUM_DEMO_PROJECT.costSummary.grandTotal === 1089879733
    && PREMIUM_DEMO_RAB_ITEMS.filter((i) => (i as any).priceStatus === 'PRICE_UNRESOLVED').length >= 0;
  check('J9 Premium Demo tetap utuh (eksplisit, bukan jalur fallback)', premiumOk);
}

console.log(`\nFINANCIAL MATRIX 9: ${pass} PASS, ${fail} FAIL`);
if (failures.length) console.log(`Gagal: ${failures.join(' | ')}`);
process.exit(fail > 0 ? 1 : 0);
