/**
 * Batch 4 regression (P1): reconcileProjectSummaries must resolve percentages
 * canonically — project configuration FIELDS first, then the old summary,
 * then historical fallbacks.
 *
 * Root cause covered: the heal read percentages ONLY from the old costSummary
 * (?? 5), so a project whose summary was missing/stale but whose fields were
 * configured (e.g. overheadPercent 10) was rebuilt with an invented 5%
 * overhead; its stored totalRab then diverged from the canonical total every
 * other surface computes (verified live: scratch project healed to
 * Rp8.929.250 vs canonical Rp9.335.125). Expected values are independent.
 *
 * Run: bundle with esbuild and execute with node (house pattern).
 */
import { reconcileProjectSummaries } from '../lib/demoSeed';

let pass = 0,
  fail = 0;
const check = (label: string, cond: boolean, detail: string) => {
  if (cond) {
    pass++;
    console.log(`  [PASS] ${label}`);
  } else {
    fail++;
    console.log(`  [FAIL] ${label} — ${detail}`);
  }
};
const items = (pid: string, amounts: Array<number | null>, unresolvedLast = false) =>
  amounts.map((amount, i) => ({
    projectId: pid,
    amount,
    priceStatus: unresolvedLast && i === amounts.length - 1 ? 'PRICE_UNRESOLVED' : 'PRICE_RESOLVED',
  })) as never;

console.log('B4-REC-1: proyek terkonfigurasi via FIELD (tanpa costSummary) disembuhkan dengan persen field');
{
  const proj: any = {
    id: 'P-B4-1', name: 'Uji field', totalRab: 0, itemsCount: 0,
    overheadPercent: 10, ppnEnabled: false, costSummary: null,
  };
  const r = reconcileProjectSummaries([proj], items('P-B4-1', [3400000, 4717500, null], true));
  const healed = r.projects[0] as any;
  // Independent: direct = 3,400,000 + 4,717,500 = 8,117,500 (unresolved excluded)
  // overhead 10% = 811,750; profit (fallback historis) 5% = 405,875; tax 0.
  check('directCost 8.117.500', healed.costSummary.directCost === 8117500, `dapat ${healed.costSummary.directCost}`);
  check('overheadPercent dari field = 10', healed.costSummary.overheadPercent === 10, `dapat ${healed.costSummary.overheadPercent}`);
  check('overheadAmount 811.750', healed.costSummary.overheadAmount === 811750, `dapat ${healed.costSummary.overheadAmount}`);
  check('totalRab kanonis 9.335.125', healed.totalRab === 9335125, `dapat ${healed.totalRab}`);
}

console.log('B4-REC-2: tanpa field, persen ringkasan lama dipertahankan');
{
  const proj: any = {
    id: 'P-B4-2', name: 'Uji ringkasan', totalRab: 1, itemsCount: 0,
    costSummary: { directCost: 5, overheadPercent: 7, profitPercent: 3, taxPercent: 11, taxAmount: 0, grandTotal: 1 },
  };
  const r = reconcileProjectSummaries([proj], items('P-B4-2', [1000000]));
  const healed = r.projects[0] as any;
  // 1,000,000 + 7% (70,000) + 3% (30,000) = 1,100,000; tanpa pajak (taxAmount lama 0).
  check('overheadPercent ringkasan = 7', healed.costSummary.overheadPercent === 7, `dapat ${healed.costSummary.overheadPercent}`);
  check('profitPercent ringkasan = 3', healed.costSummary.profitPercent === 3, `dapat ${healed.costSummary.profitPercent}`);
  check('totalRab 1.100.000', healed.totalRab === 1100000, `dapat ${healed.totalRab}`);
}

console.log('B4-REC-3: field menang atas ringkasan bila keduanya ada');
{
  const proj: any = {
    id: 'P-B4-3', name: 'Uji prioritas', totalRab: 1, itemsCount: 0,
    overheadPercent: 10,
    costSummary: { directCost: 5, overheadPercent: 5, profitPercent: 5, taxPercent: 11, taxAmount: 0, grandTotal: 1 },
  };
  const r = reconcileProjectSummaries([proj], items('P-B4-3', [1000000]));
  const healed = r.projects[0] as any;
  check('overheadPercent field = 10 (bukan 5 ringkasan)', healed.costSummary.overheadPercent === 10, `dapat ${healed.costSummary.overheadPercent}`);
  check('totalRab 1.150.000', healed.totalRab === 1150000, `dapat ${healed.totalRab}`);
}

console.log(`\nbatch4ReconcileAlignment: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
