/**
 * projectTaxOptIn.test — kebijakan pajak opt-in proyek (owner 2026-10-27).
 *
 * Gaya plain-tsx (tanpa vitest — vitest tidak terinstal di sandbox):
 * jalankan dari ROOT repo: `npx --yes tsx src/test/projectTaxOptIn.test.ts`
 *
 * Yang dibuktikan:
 * 1. Pajak default MATI: tanpa flag, PPN dan PPh = 0, grand = subtotal.
 * 2. PPN aktif: pajak = basis kena pajak × persen proyek.
 * 3. PPh aktif dengan persen 0 → 0 (tidak ada tarif karangan); dengan
 *    persen yang diisi user (mis. 2,5) → dihitung dari basisnya.
 * 4. Item sudah-termasuk-pajak dikecualikan beserta overhead
 *    proporsionalnya (anti hitung ganda), per pajak secara terpisah.
 * 5. Overhead proyek dihormati (bukan default mesin) bila diberikan.
 * 6. Konsistensi antartampilan: mesin (profit/kontingensi/markup = 0)
 *    == helper kartu Informasi Proyek == rumus Rekapitulasi, untuk input
 *    dan flag yang sama.
 * 7. Proyek tanpa item: mesin memberi total 0 DAN helper memberi null —
 *    null inilah yang dirender UI sebagai "Belum ada item RAB"
 *    (bukan Rp0). Cabang render itu sendiri hidup di JSX
 *    UnifiedSettingsView dan diverifikasi lewat QA Preview, karena
 *    komponen React tidak bisa di-mount di sandbox.
 * 8. Nilai sumber item tidak diubah oleh perhitungan.
 * 9. Item PRICE_UNRESOLVED tetap dikecualikan dari total (aturan P0 lama
 *    tidak rusak oleh perubahan pajak).
 */
import { UnifiedProjectEngine } from '../engine/unifiedProjectEngine';
import { computeProjectInfoTotal } from '../services/projectInfoTotal';
import type { RabItem } from '../types';

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
const assert = (cond: unknown, msg: string) => {
  if (!cond) throw new Error(msg);
};
const eq = (a: unknown, b: unknown, msg: string) => {
  if (a !== b) throw new Error(`${msg} (dapat ${a}, harap ${b})`);
};

const mk = (over: Partial<RabItem> & { id: string; amount: number }): RabItem =>
  ({ no: 1, projectId: 'p1', code: 'X', category: 'C', description: 'item', volume: 1, unit: 'ls', unitPrice: over.amount, volumeSource: 'MANUAL', ...over } as RabItem);

// Direct 100.000: A 60.000 (kena pajak) + B 40.000 (sudah termasuk pajak).
const itemA = mk({ id: 'a', amount: 60000 });
const itemBppn = mk({ id: 'b', amount: 40000, taxIncludedPpn: true } as any);
const itemBpph = mk({ id: 'b', amount: 40000, taxIncludedPph: true } as any);
const itemBoth = mk({ id: 'b', amount: 40000, taxIncludedPpn: true, taxIncludedPph: true } as any);

check('1. default: pajak mati, grand = subtotal (overhead+profit mesin)', () => {
  const s = UnifiedProjectEngine.recalculateCostSummary([itemA, mk({ id: 'c', amount: 40000 })]);
  eq(s.taxAmount, 0, 'PPN harus 0 tanpa flag');
  eq(s.pphAmount, 0, 'PPh harus 0 tanpa flag');
  // Fallback overhead owner 2026-10-27: direct 100.000 + overhead 10%
  // + profit 5% = 115.000, tanpa pajak. (Sebelumnya 110.000 dengan
  // overhead default 5% — diubah oleh keputusan fallback 10%.)
  eq(s.overheadPercent, 10, 'fallback overhead 10%');
  eq(s.grandTotal, 115000, 'grand tanpa pajak');
  eq(s.ppnEnabled, false, 'flag PPN tercatat false');
  eq(s.pphEnabled, false, 'flag PPh tercatat false');
});

check('2. PPN aktif 11% atas subtotal penuh bila tidak ada pengecualian', () => {
  const s = UnifiedProjectEngine.recalculateCostSummary(
    [itemA, mk({ id: 'c', amount: 40000 })],
    { overheadPercent: 10, profitPercent: 0, contingencyPercent: 0, directorMarkupPercent: 0, taxPercent: 11, ppnEnabled: true }
  );
  eq(s.subtotalBeforeTax, 110000, 'subtotal direct+overhead');
  eq(s.taxAmount, 12100, 'PPN 11% × 110.000');
  eq(s.grandTotal, 122100, 'grand dengan PPN');
});

check('3a. PPh aktif tapi persen 0 → nominal 0 (tanpa tarif karangan)', () => {
  const s = UnifiedProjectEngine.recalculateCostSummary(
    [itemA],
    { overheadPercent: 0, profitPercent: 0, contingencyPercent: 0, directorMarkupPercent: 0, pphEnabled: true, pphPercent: 0 }
  );
  eq(s.pphAmount, 0, 'PPh 0% harus 0');
  eq(s.grandTotal, 60000, 'grand = direct saja');
});

check('3b. PPh aktif dengan persen isi user 2,5% → dihitung dari basisnya', () => {
  const s = UnifiedProjectEngine.recalculateCostSummary(
    [itemA, mk({ id: 'c', amount: 40000 })],
    { overheadPercent: 10, profitPercent: 0, contingencyPercent: 0, directorMarkupPercent: 0, pphEnabled: true, pphPercent: 2.5 }
  );
  eq(s.pphAmount, 2750, 'PPh 2,5% × 110.000');
  eq(s.grandTotal, 112750, 'grand dengan PPh');
});

check('4a. item sudah-termasuk-PPN dikecualikan + overhead proporsional', () => {
  // Basis PPN = 60.000 + overhead proporsional (10% × 60/100 × 100.000 = 6.000) = 66.000.
  const s = UnifiedProjectEngine.recalculateCostSummary(
    [itemA, itemBppn],
    { overheadPercent: 10, profitPercent: 0, contingencyPercent: 0, directorMarkupPercent: 0, taxPercent: 11, ppnEnabled: true }
  );
  eq(s.taxAmount, 7260, 'PPN 11% × 66.000 (bukan × 110.000)');
  eq(s.grandTotal, 117260, 'grand tanpa pajak ganda');
});

check('4b. pengecualian PPN dan PPh independen satu sama lain', () => {
  const s = UnifiedProjectEngine.recalculateCostSummary(
    [itemA, itemBoth],
    { overheadPercent: 10, profitPercent: 0, contingencyPercent: 0, directorMarkupPercent: 0, taxPercent: 11, ppnEnabled: true, pphEnabled: true, pphPercent: 2 }
  );
  eq(s.taxAmount, 7260, 'PPN hanya atas basis PPN');
  eq(s.pphAmount, 1320, 'PPh 2% × 66.000');
  eq(s.grandTotal, 118580, 'grand = 110.000 + 7.260 + 1.320');
});

check('4c. item hanya-termasuk-PPh tetap kena PPN penuh, dan sebaliknya', () => {
  const s = UnifiedProjectEngine.recalculateCostSummary(
    [itemA, itemBpph],
    { overheadPercent: 10, profitPercent: 0, contingencyPercent: 0, directorMarkupPercent: 0, taxPercent: 11, ppnEnabled: true, pphEnabled: true, pphPercent: 2 }
  );
  eq(s.taxAmount, 12100, 'PPN atas basis penuh karena item hanya termasuk PPh');
  eq(s.pphAmount, 1320, 'PPh atas basis PPh saja');
});

check('5. overhead proyek dihormati, bukan default mesin', () => {
  const s = UnifiedProjectEngine.recalculateCostSummary(
    [itemA, mk({ id: 'c', amount: 40000 })],
    { overheadPercent: 15, profitPercent: 0, contingencyPercent: 0, directorMarkupPercent: 0, taxPercent: 11, ppnEnabled: true }
  );
  eq(s.overheadAmount, 15000, 'overhead 15% proyek');
  eq(s.taxAmount, 12650, 'PPN 11% × 115.000');
});

check('6. konsistensi antartampilan: mesin == helper Info Proyek == rumus Rekap', () => {
  const flags = { overheadPercent: 10, ppnEnabled: true, ppnPercent: 11, pphEnabled: true, pphPercent: 2 };
  const engine = UnifiedProjectEngine.recalculateCostSummary(
    [itemA, itemBoth],
    { ...flags, profitPercent: 0, contingencyPercent: 0, directorMarkupPercent: 0, taxPercent: 11 }
  );
  const info = computeProjectInfoTotal([itemA, itemBoth], flags);
  assert(info !== null, 'helper tidak boleh null untuk proyek berisi');
  eq(engine.grandTotal, info!.total, 'mesin vs helper Info');
  eq(engine.taxAmount, info!.ppn, 'PPN mesin vs helper');
  eq(engine.pphAmount, info!.pph, 'PPh mesin vs helper');
  // Rumus Rekap ditulis ulang di sini sebagai pihak ketiga independen.
  const direct = 100000;
  const overhead = 10000;
  const basis = 60000 + 6000;
  eq(info!.total, direct + overhead + Math.round((basis * 11) / 100) + Math.round((basis * 2) / 100), 'helper vs rumus Rekap');
});

check('7. proyek tanpa item: mesin 0 dan helper null (UI → "Belum ada item RAB")', () => {
  const s = UnifiedProjectEngine.recalculateCostSummary([], { ppnEnabled: true, taxPercent: 11 });
  eq(s.directCost, 0, 'direct kosong');
  eq(s.grandTotal, 0, 'grand kosong');
  eq(computeProjectInfoTotal([], { overheadPercent: 10 }), null, 'helper null untuk proyek kosong');
});

check('8. nilai sumber item tidak diubah perhitungan', () => {
  const before = itemA.amount;
  UnifiedProjectEngine.recalculateCostSummary([itemA, itemBppn], { ppnEnabled: true, taxPercent: 11 });
  eq(itemA.amount, before, 'amount item utuh');
});

check('9. item PRICE_UNRESOLVED tetap dikecualikan (aturan P0 tidak rusak)', () => {
  const s = UnifiedProjectEngine.recalculateCostSummary(
    [itemA, mk({ id: 'u', amount: 999999, priceStatus: 'PRICE_UNRESOLVED' })],
    { overheadPercent: 0, profitPercent: 0, contingencyPercent: 0, directorMarkupPercent: 0, ppnEnabled: true, taxPercent: 11 }
  );
  eq(s.directCost, 60000, 'unresolved tidak masuk direct');
  eq(s.unresolvedItems, 1, 'unresolved dihitung terpisah');
  eq(s.grandTotal, 66600, 'grand hanya dari item berharga');
});

console.log(`\nprojectTaxOptIn: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
