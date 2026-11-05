/**
 * Batch 4.1 — BOQ narrative partial-total label.
 *
 * The BOQ document body prints "Total Nilai BOQ : {{boq.total}}". The summed
 * total only includes priced items, so when any item lacks a usable price the
 * label ({{boq.totalLabel}}) must disclose the partial status; when the
 * project is fully priced the historical wording must stay byte-identical.
 */
import { buildTemplateContext } from '../document-engine/templateEngine';

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) { passed++; console.log(`  [PASS] ${name}`); }
  else { failed++; console.log(`  [FAIL] ${name}`, extra ?? ''); }
}

const priced = { unitPrice: 85000, totalPrice: 3400000, amount: 3400000, priceStatus: 'PRICE_RESOLVED', volume: 40 };
const unresolved = { unitPrice: null, totalPrice: null, amount: null, priceStatus: 'PRICE_UNRESOLVED', volume: 10 };
const unresolvedNoStatus = { unitPrice: null, totalPrice: null, amount: null, volume: 3 };
const explicitZero = { unitPrice: 0, totalPrice: 0, amount: 0, priceStatus: 'PRICE_RESOLVED', volume: 5 };
const lumpSum = { unitPrice: null, totalPrice: 777000, amount: 777000, volume: 1 };

const ctx = (items: any[]) => buildTemplateContext({ master: {} as any, rabItems: items } as any, {});

check('fully priced keeps the historical label', ctx([priced]).boq.totalLabel === 'Total Nilai BOQ');
check('fully priced total is the priced sum', ctx([priced]).boq.total === 'Rp 3.400.000');
check(
  'unresolved item switches the label to the partial wording',
  ctx([priced, unresolved]).boq.totalLabel ===
    'Total Nilai BOQ Sementara (Parsial — Belum Termasuk Item dengan Harga Belum Tersedia)',
  ctx([priced, unresolved]).boq.totalLabel
);
check('partial label keeps the same priced-only total', ctx([priced, unresolved]).boq.total === 'Rp 3.400.000');
check(
  'unresolved without a status field is still detected (all price fields null)',
  ctx([unresolvedNoStatus]).boq.totalLabel.includes('Parsial')
);
check('explicit zero price is NOT unresolved', ctx([explicitZero]).boq.totalLabel === 'Total Nilai BOQ');
check('lump-sum total without unit price is NOT unresolved', ctx([lumpSum]).boq.totalLabel === 'Total Nilai BOQ');
check('empty item list keeps the historical label', ctx([]).boq.totalLabel === 'Total Nilai BOQ');

console.log(`\nbatch41BoqNarrative: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
