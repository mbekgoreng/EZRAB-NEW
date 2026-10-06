/**
 * Classify the arithmetic state of every component row in the officially
 * extracted Lampiran II dataset.
 *
 * Purpose: separate THREE very different things that a naive
 * "coefficient x price != total" check would lump together:
 *   1. ROUNDING     - the printed coefficient is truncated (0,010 for 0.010119),
 *                     so coefficient x price misses the printed total slightly.
 *                     The document is fine; the printed precision is limited.
 *   2. LOST_COEF    - the printed coefficient rounds to 0,0000, so the total can
 *                     never be reconstructed from the printed table.
 *   3. MALFORMED    - the text layer of that table is degraded ("0." / "29050."),
 *                     i.e. digits are missing from the PDF itself.
 *
 * Nothing is modified. This is a measurement script.
 */
import * as fs from 'fs';
import * as path from 'path';

const ITEMS_PATH = path.join(process.cwd(), 'docs', '_audit', 'lampiran2-official-items.json');
const OUT_PATH = path.join(process.cwd(), 'docs', '_audit', 'lampiran2-component-classification.json');

interface Comp {
  componentType: string;
  name: string;
  coefficient: number;
  unitPrice: number;
  total: number;
  raw: string;
}
interface Item {
  serial: string;
  code: string;
  name: string;
  numberFormat: string | null;
  analisaPage: number | null;
  components: Comp[];
  warnings: string[];
  hargaSatuan: number | null;
}

/** A token that lost its fractional digits, e.g. " 0." / " 29050." / " 140.".
 *  The row index ("2. Mandor") is excluded — it sits at the start of the line. */
const TRUNCATED_TOKEN_RE = /\s\d+\.(?=\s|$)/;

/** Above this relative error, rounding can no longer explain the gap. */
const SUSPECT_THRESHOLD = 0.15;

/**
 * Coefficients printed below this magnitude carry too few significant digits to
 * be recovered: 0,0001 spans 0.00005-0.00015, a 3x uncertainty. This is a
 * limitation of the printed document, not of the extraction, and it is reported
 * separately from "rounding" (which is bounded and harmless).
 */
const TINY_COEFFICIENT = 0.001;

function main() {
  const data = JSON.parse(fs.readFileSync(ITEMS_PATH, 'utf8')) as { items: Item[] };
  const rows: Array<{
    serial: string;
    category: string;
    relError: number | null;
    raw: string;
  }> = [];

  const perItem = new Map<string, { worse: string; relMax: number }>();

  for (const it of data.items) {
    for (const c of it.components) {
      const computed = c.coefficient * c.unitPrice;
      const denom = Math.max(Math.abs(c.total), 1);
      const rel = Math.abs(computed - c.total) / denom;

      let category: string;
      if (!c.unitPrice && c.total > 0) {
        category = 'LOST_COEF';
      } else if (c.coefficient === 0 && c.total > 0) {
        category = 'LOST_COEF';
      } else if (rel <= 0.005) {
        category = 'OK';
      } else if (TRUNCATED_TOKEN_RE.test(c.raw)) {
        category = 'MALFORMED_TEXT';
      } else if (c.coefficient < TINY_COEFFICIENT) {
        category = 'TINY_COEF';
      } else if (rel > SUSPECT_THRESHOLD) {
        // Neither rounding nor a degraded text layer explains this gap.
        // Needs manual review against the printed PDF page.
        category = 'SUSPECT';
      } else {
        category = 'ROUNDING';
      }

      rows.push({ serial: it.serial, category, relError: rel, raw: c.raw.slice(0, 110) });

      const prev = perItem.get(it.serial);
      if (!prev || rel > prev.relMax) {
        perItem.set(it.serial, { worse: category, relMax: rel });
      }
    }
  }

  const byCat: Record<string, number> = {};
  for (const r of rows) byCat[r.category] = (byCat[r.category] || 0) + 1;

  const roundingRels = rows.filter((r) => r.category === 'ROUNDING').map((r) => r.relError).sort((a, b) => a - b);
  const q = (p: number) => (roundingRels.length ? roundingRels[Math.floor((roundingRels.length - 1) * p)] : 0);

  const malformedItems = [...new Set(rows.filter((r) => r.category === 'MALFORMED_TEXT').map((r) => r.serial))];
  const lostItems = [...new Set(rows.filter((r) => r.category === 'LOST_COEF').map((r) => r.serial))];
  const roundingItems = [...new Set(rows.filter((r) => r.category === 'ROUNDING').map((r) => r.serial))];
  const tinyItems = [...new Set(rows.filter((r) => r.category === 'TINY_COEF').map((r) => r.serial))];
  const suspectRows = rows.filter((r) => r.category === 'SUSPECT');
  const suspectItems = [...new Set(suspectRows.map((r) => r.serial))];

  // Items whose section subtotal disagrees with the printed components.
  const sectionMismatch = data.items
    .filter((i) => i.analisaPage !== null && i.warnings.some((w) => w.includes('tidak cocok')))
    .map((i) => i.serial);

  fs.writeFileSync(
    OUT_PATH,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        componentCategories: byCat,
        roundingRelError: {
          count: roundingRels.length,
          median: q(0.5),
          p90: q(0.9),
          p99: q(0.99),
          max: roundingRels[roundingRels.length - 1] ?? 0,
        },
        itemsWithRounding: roundingItems.length,
        itemsWithMalformedText: malformedItems.length,
        itemsWithLostCoefficient: lostItems.length,
        itemsWithTinyCoefficient: tinyItems.length,
        itemsWithSuspectArithmetic: suspectItems.length,
        itemsWithSectionSubtotalMismatch: sectionMismatch.length,
        malformedItems,
        lostItems,
        tinyItems,
        suspectItems,
        suspectRows,
        roundingItems: roundingItems.slice(0, 100),
        sectionMismatchItems: sectionMismatch,
      },
      null,
      1,
    ),
  );

  console.log('='.repeat(78));
  console.log('COMPONENT CLASSIFICATION — LAMPIRAN II');
  console.log('='.repeat(78));
  console.log(`  total baris komponen        : ${rows.length}`);
  for (const [k, v] of Object.entries(byCat).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${k.padEnd(16)}: ${v}`);
  }
  console.log('');
  console.log('  ROUNDING (koefisien dibulatkan dokumen):');
  console.log(`    item terdampak : ${roundingItems.length}`);
  console.log(`    rel error      : median ${(q(0.5) * 100).toFixed(2)}% | p90 ${(q(0.9) * 100).toFixed(2)}% | p99 ${(q(0.99) * 100).toFixed(2)}% | max ${((roundingRels[roundingRels.length - 1] ?? 0) * 100).toFixed(2)}%`);
  console.log('');
  console.log(`  MALFORMED_TEXT  : ${malformedItems.length} item`);
  console.log(`  TINY_COEF       : ${tinyItems.length} item  (koefisien dicetak tanpa angka penting cukup)`);
  console.log(`  SUSPECT         : ${suspectItems.length} item / ${suspectRows.length} baris  (perlu tinjauan manual)`);
  console.log(`  LOST_COEF       : ${lostItems.length} item  (${lostItems.join(', ')})`);
  console.log(`  SUBTOTAL MISMATCH: ${sectionMismatch.length} item`);
  console.log('');
  console.log(`>> ${OUT_PATH}`);
}

main();
