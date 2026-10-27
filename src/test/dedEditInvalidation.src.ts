/**
 * DED-to-RAB — Edit Invalidation Tests (perbaikan audit P1 2026-10-27)
 * Mengunci: bila dasar hitung berubah (satuan/kuantitas/harga/kecocokan
 * kanonis), usulan AI lama TIDAK BOLEH lagi dibandingkan dengan subtotal
 * baru. Menguji fungsi murni (applyUnitChange, clearStaleProposal,
 * clearAiProposal) + kalkulator — handler React sendiri tidak punya
 * infra UI test di repo ini (dilaporkan sebagai keterbatasan).
 */
import { applyUnitChange, clearStaleProposal, DedAiCalculator } from '../ai-tools/ded-ai-estimate/calculator';
import { clearAiProposal } from '../ai-tools/ded-full-ai/validator';
import type { DedAiItem } from '../ai-tools/ded-ai-estimate/types';

let pass = 0, fail = 0;
function check(name: string, cond: boolean) {
  if (cond) { pass++; } else { fail++; console.log(`  ✗ ${name}`); }
}

const mkStd = (over: Partial<DedAiItem> = {}): DedAiItem => ({
  id: 'dedai-1', name: 'Plesteran', category: 'Dinding', units: 'm2',
  quantity: 10, quantitySource: 'DED_GEOMETRIC', unitPrice: 850000,
  priceSource: 'AI_ESTIMATE', subtotal: null, aiProposedSubtotal: 8000000,
  sourcePages: [1], provenance: [], stage: 'PARSE', ...over,
} as DedAiItem);

console.log('=== Edit Invalidation (standard) ===');
const unitChanged = applyUnitChange(mkStd(), 'm3');
check('ganti satuan item estimasi: harga dipertahankan', unitChanged.unitPrice === 850000);
check('ganti satuan item estimasi: usulan dibersihkan', unitChanged.aiProposedSubtotal === undefined);
const canonItem = mkStd({ priceSource: 'AHSP_2026', ahspCode: '3.7.4', unitPrice: 51622, aiProposedSubtotal: 600000 });
const canonChanged = applyUnitChange(canonItem, 'm3');
check('ganti satuan item kanonis: harga dibatalkan', canonChanged.unitPrice === null && canonChanged.priceSource === 'UNRESOLVED');
check('ganti satuan item kanonis: usulan dibersihkan', canonChanged.aiProposedSubtotal === undefined);
const sameUnitBase = mkStd();
check('satuan sama: objek dikembalikan apa adanya', applyUnitChange(sameUnitBase, 'm2') === sameUnitBase);
check('clearStaleProposal: usulan hilang, field lain utuh', (() => {
  const c = clearStaleProposal(mkStd());
  return c.aiProposedSubtotal === undefined && c.unitPrice === 850000 && c.quantity === 10;
})());
check('clearStaleProposal: tanpa usulan = objek sama', (() => {
  const noProp = mkStd({ aiProposedSubtotal: undefined });
  return clearStaleProposal(noProp) === noProp;
})());
check('kalkulator sesudah dibersihkan: aiProposedGrandTotal null', (() => {
  const out = DedAiCalculator.buildOutput({
    jobId: 't', projectType: 'BANGUNAN', mode: 'FAST', policy: 'FULL_AI',
    projectName: 'Tes', pageCount: 1, items: [clearStaleProposal(mkStd())],
  });
  return out.aiProposedGrandTotal === null && out.totalDiscrepancyNote === undefined;
})());

console.log('=== Edit Invalidation (Full AI) ===');
const fullItem = {
  id: 'fullai-1', name: 'Kolom', aiProposedSubtotal: 500000,
  subtotalDiscrepancy: 'Usulan AI Rp600.000 berbeda dari nilai terverifikasi aplikasi Rp500.000',
  price: { unitPrice: 100000, source: 'AI_ESTIMATE' },
};
const cleared = clearAiProposal(fullItem);
check('clearAiProposal: kedua field usulan hilang', cleared.aiProposedSubtotal === undefined && cleared.subtotalDiscrepancy === undefined);
check('clearAiProposal: field lain utuh', (cleared as any).price.unitPrice === 100000 && (cleared as any).name === 'Kolom');
check('clearAiProposal: tanpa usulan = objek sama', (() => {
  const clean = { id: 'x', price: {} };
  return clearAiProposal(clean as never) === (clean as never);
})());

console.log(`\n=== HASIL: ${pass} PASS, ${fail} FAIL ===`);
if (fail > 0) process.exit(1);
