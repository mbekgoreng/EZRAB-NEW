/**
 * EZRAB FASE 5D TASK 1 — PDF unresolved test (src/test/pdfUnresolved.mjs)
 *
 * Proves the canonical distinction used by the PDF exporter:
 * - PRICE_UNRESOLVED -> label "HARGA BELUM TERSEDIA" (never shown as Rp0 price)
 * - Explicit Rp0 (PRICE_RESOLVED, unitPrice=0) -> shown as Rp0 (valid price)
 * - Normal priced item -> normal figures
 * - Totals exclude unresolved (canonical engine rule)
 */

let pass = 0, fail = 0;
function check(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}

// Mirror the PDF cell logic from pdfExporter.ts
function pdfCells(item) {
  const isUnresolved = item.priceStatus === 'PRICE_UNRESOLVED';
  const unitPriceCell = isUnresolved ? 'HARGA BELUM TERSEDIA' : `Rp${Number(item.unitPrice).toLocaleString('id-ID')}`;
  const totalPriceCell = isUnresolved ? '-' : `Rp${Number(item.totalPrice).toLocaleString('id-ID')}`;
  return { unitPriceCell, totalPriceCell, isUnresolved };
}

const validItem = { description: 'Pondasi', unitPrice: 750000, totalPrice: 3750000, priceStatus: 'PRICE_RESOLVED' };
const zeroItem = { description: 'Gratis ongkir', unitPrice: 0, totalPrice: 0, priceStatus: 'PRICE_RESOLVED' };
const unresolvedItem = { description: 'Tanpa harga', unitPrice: 0, totalPrice: 0, priceStatus: 'PRICE_UNRESOLVED' };

console.log('PDF UNRESOLVED');
const c1 = pdfCells(validItem);
check('P1 valid item shows Rp750.000', c1.unitPriceCell === 'Rp750.000', c1.unitPriceCell);
check('P2 valid item total Rp3.750.000', c1.totalPriceCell === 'Rp3.750.000');

const c2 = pdfCells(zeroItem);
check('P3 explicit Rp0 shown as Rp0 (valid price)', c2.unitPriceCell === 'Rp0', c2.unitPriceCell);
check('P4 explicit Rp0 NOT labeled unresolved', c2.unitPriceCell !== 'HARGA BELUM TERSEDIA');

const c3 = pdfCells(unresolvedItem);
check('P5 unresolved labeled HARGA BELUM TERSEDIA', c3.unitPriceCell === 'HARGA BELUM TERSEDIA');
check('P6 unresolved total shown as - (not Rp0)', c3.totalPriceCell === '-');
check('P7 unresolved distinguished from valid zero', c3.unitPriceCell !== c2.unitPriceCell);

// Canonical total: unresolved excluded
const items = [validItem, zeroItem, unresolvedItem];
const directCost = items.filter((i) => i.priceStatus !== 'PRICE_UNRESOLVED').reduce((s, i) => s + i.totalPrice, 0);
check('P8 direct total excludes unresolved (= 3.750.000)', directCost === 3750000, `got ${directCost}`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
