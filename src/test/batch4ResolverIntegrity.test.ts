/**
 * Batch 4 — resolver numerical integrity probe (Phase B/C/D).
 *
 * Verifies the AHSP composition arithmetic against INDEPENDENT recomputation
 * from the composition's own published component snapshots:
 *   component subtotal == coefficient x unit price        (within Rp1)
 *   category subtotal  == sum of its component subtotals  (within Rp1)
 *   item unit price    == sum of the three category sums  (within Rp2)
 * and the unit gate: a component whose price only exists in an incompatible
 * unit (the known "Batu split" kg vs Rp/m3 case) must stay UNPRICED, be
 * listed in `missing`, and be excluded from the total — never converted with
 * an undocumented density and never silently priced.
 *
 * Run: bundle with esbuild and execute with node (house pattern).
 */
import { officialAhspRepository } from '../data/nationalCostDatabase/officialAhspRepository';
import { priceResolver2026 } from '../data/priceDatabase2026/resolver';

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
const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;

function verifyArithmetic(label: string, comp: any) {
  let catSum = 0;
  for (const kind of ['labor', 'material', 'equipment'] as const) {
    const cat = comp[kind];
    let sum = 0;
    for (const c of cat.components) {
      if (c.unitPrice != null) {
        const expected = c.coefficient * c.unitPrice;
        check(
          `${label}/${kind}: subtotal "${c.itemName}" = koef x harga`,
          c.subtotalPerUnit != null && near(c.subtotalPerUnit, expected, 1),
          `subtotal=${c.subtotalPerUnit} vs koef ${c.coefficient} x ${c.unitPrice} = ${expected}`
        );
        sum += c.subtotalPerUnit;
      } else {
        check(
          `${label}/${kind}: komponen tak berharga "${c.itemName}" subtotal null`,
          c.subtotalPerUnit == null,
          `subtotal=${c.subtotalPerUnit}`
        );
      }
    }
    check(
      `${label}/${kind}: subtotal kategori = jumlah komponen`,
      near(cat.subtotalPerUnit, sum, 1),
      `kategori=${cat.subtotalPerUnit} vs jumlah=${sum}`
    );
    catSum += cat.subtotalPerUnit;
  }
  if (comp.unitPrice != null) {
    check(
      `${label}: harga satuan item = jumlah 3 kategori`,
      near(comp.unitPrice, catSum, 2),
      `item=${comp.unitPrice} vs kategori=${catSum}`
    );
  }
}

const all = officialAhspRepository.getAllOfficialAhsp();
console.log(`Katalog resmi: ${all.length} analisa`);

// --- Case 1: a fully priced analysis (arithmetic, end to end) ---------------
{
  let target: any = null;
  let targetComp: any = null;
  for (const item of all.slice(0, 800)) {
    const comp: any = priceResolver2026.resolveAhspUnitPrice(item as never);
    if (comp && comp.unitPrice != null && comp.missingComponents === 0 && comp.totalComponents >= 4) {
      target = item;
      targetComp = comp;
      break;
    }
  }
  check('ditemukan analisa berharga penuh untuk uji aritmetika', !!target, 'tidak ada dalam 800 pertama');
  if (target) {
    console.log(`Case 1: ${target.code} — ${target.name} (${targetComp.totalComponents} komponen)`);
    verifyArithmetic('case1', targetComp);
    const again: any = priceResolver2026.resolveAhspUnitPrice(target as never);
    check('deterministik: resolusi ulang identik', again.unitPrice === targetComp.unitPrice, `${again.unitPrice} vs ${targetComp.unitPrice}`);
  }
}

// --- Case 2: the kg-vs-m3 unit gate (Batu split) -----------------------------
{
  let gateItem: any = null;
  for (const item of all) {
    const mats: any[] = (item as any).materialComponents || [];
    if (mats.some((c: any) => /batu split/i.test(String(c?.name || c?.itemName || '')) && String(c?.unit || '').toLowerCase() === 'kg')) {
      gateItem = item;
      break;
    }
  }
  check('ditemukan analisa dengan komponen Batu split satuan kg', !!gateItem, 'tidak ada di katalog');
  if (gateItem) {
    const comp: any = priceResolver2026.resolveAhspUnitPrice(gateItem as never);
    console.log(`Case 2: ${gateItem.code} — ${gateItem.name}; status=${comp.pricingStatus}, missing=${comp.missingComponents}`);
    const batu = comp.material.components.find((c: any) => /batu split/i.test(String(c.itemName || '')));
    check('komponen Batu split (kg) TIDAK diberi harga paksa', !!batu && batu.unitPrice == null, `unitPrice=${batu?.unitPrice}`);
    check(
      'komponen tercatat di daftar missing',
      comp.missing.some((m: any) => /batu split/i.test(String(m.name || ''))),
      `missing=${JSON.stringify(comp.missing).slice(0, 200)}`
    );
    check(
      'alasan UNIT_MISMATCH tercatat pada komponen/missing (Batch 4: reason tidak lagi dibuang)',
      /UNIT_MISMATCH/.test(String(batu?.unresolvedReason || '')) ||
        comp.missing.some((m: any) => /UNIT_MISMATCH/.test(String(m.reason || ''))),
      `unresolvedReason=${String(batu?.unresolvedReason || '').slice(0, 200)}`
    );
    // The excluded component must not leak into the total.
    let pricedSum = 0;
    for (const kind of ['labor', 'material', 'equipment'] as const) {
      for (const c of comp[kind].components) if (c.subtotalPerUnit != null) pricedSum += c.subtotalPerUnit;
    }
    check(
      'total hanya menjumlah komponen berharga',
      comp.unitPrice == null || near(comp.unitPrice, pricedSum, 2),
      `total=${comp.unitPrice} vs jumlah berharga=${pricedSum}`
    );
  }
}

// --- Case 3: fractional-coefficient precision (no premature rounding) --------
{
  let frac: { comp: any; c: any } | null = null;
  for (const item of all.slice(0, 800)) {
    const comp: any = priceResolver2026.resolveAhspUnitPrice(item as never);
    if (!comp) continue;
    for (const kind of ['labor', 'material', 'equipment'] as const) {
      const c = comp[kind].components.find(
        (x: any) => x.unitPrice != null && x.coefficient > 0 && x.coefficient < 0.01
      );
      if (c) {
        frac = { comp, c };
        break;
      }
    }
    if (frac) break;
  }
  check('ditemukan komponen koefisien pecahan kecil (<0,01) berharga', !!frac, 'tidak ada dalam 800 pertama');
  if (frac) {
    const expected = frac.c.coefficient * frac.c.unitPrice;
    check(
      `subtotal pecahan presisi ("${frac.c.itemName}" koef ${frac.c.coefficient})`,
      near(frac.c.subtotalPerUnit, expected, 1),
      `subtotal=${frac.c.subtotalPerUnit} vs ekspektasi=${expected}`
    );
  }
}

console.log(`\nbatch4ResolverIntegrity: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
