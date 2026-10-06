/**
 * EZRAB PRICING ENGINE — FORENSIC TRACE (PHASE 0 AUDIT, READ-ONLY)
 *
 * Tujuan: mereproduksi SECARA PERSIS jalur harga yang dipakai UI
 * (src/components/qto/QtoCalculatorView.tsx, priceBreakdown useMemo)
 * untuk membuktikan asal angka pada kasus Weir Body.
 *
 * Script ini TIDAK mengubah kode produksi. Ia hanya memanggil fungsi publik
 * yang sudah ada dan meniru logika resolusi harga UI baris per baris.
 */

import { CoreCalculatorRegistry } from '../src/engine/calculatorCore/registry/calculatorRegistry';
import { MASTER_PRICE_ITEMS } from '../src/data/indonesianPrices';

const rp = (n: number) => 'Rp ' + Math.round(n).toLocaleString('id-ID');

function findPriceItem(name: string, category: 'MATERIAL' | 'LABOR' | 'EQUIPMENT') {
  return MASTER_PRICE_ITEMS.find(
    (p: any) =>
      p.category === category &&
      (p.name.toLowerCase().includes(name.toLowerCase()) ||
        name.toLowerCase().includes(p.name.toLowerCase()))
  );
}

/** Replikasi persis QtoCalculatorView.tsx baris 882-899 */
function uiMaterialDefaultPrice(m: { name: string; unitPriceEstimate?: number }) {
  const match = findPriceItem(m.name, 'MATERIAL');
  if (match) return { price: (match as any).price, source: `MASTER_PRICE_ITEMS: "${(match as any).name}"` };

  let defaultPrice: number;
  let branch: string;

  if (m.name.includes('Besi')) { defaultPrice = 14500; branch = "includes('Besi')"; }
  else if (m.name.includes('Kawat')) { defaultPrice = 28000; branch = "includes('Kawat')"; }
  else if (m.name.includes('Kayu papan')) { defaultPrice = 3200000; branch = "includes('Kayu papan')"; }
  else if (m.name.includes('Paku')) { defaultPrice = 22000; branch = "includes('Paku')"; }
  else if (m.name.includes('Minyak')) { defaultPrice = 18000; branch = "includes('Minyak')"; }
  else if (m.name.includes('Semen')) { defaultPrice = 72000; branch = "includes('Semen')"; }
  else if (m.name.includes('Pasir beton') || m.name.includes('Pasir pasang')) { defaultPrice = 320000; branch = "includes('Pasir beton'|'Pasir pasang')"; }
  else if (m.name.includes('Batu split')) { defaultPrice = 360000; branch = "includes('Batu split')"; }
  else if (m.name.includes('Air')) { defaultPrice = 120; branch = "includes('Air')"; }
  else if (m.name.includes('Bata Ringan')) { defaultPrice = 750000; branch = "includes('Bata Ringan')"; }
  else if (m.name.includes('Batu Belah')) { defaultPrice = 295000; branch = "includes('Batu Belah')"; }
  else { defaultPrice = m.unitPriceEstimate || 50000; branch = `HARDCODED FALLBACK -> m.unitPriceEstimate || 50000`; }

  return { price: defaultPrice, source: branch };
}

function traceCase(label: string, calculatorId: string, inputs: Record<string, number>) {
  console.log('\n' + '='.repeat(78));
  console.log(`CASE: ${label}  (${calculatorId})`);
  console.log('='.repeat(78));

  const spec = CoreCalculatorRegistry.get(calculatorId);
  if (!spec) {
    console.log('  !! calculator not registered');
    return;
  }

  const t0 = Date.now();
  const out: any = spec.calculate(inputs);
  const ms = Date.now() - t0;

  console.log(`  primaryQuantity : ${out.primaryQuantity} ${out.primaryUnit}  (${ms} ms)`);
  console.log(`  materials       : ${(out.materials || []).length}`);
  console.log(`  labor           : ${(out.labor || []).length}`);
  console.log(`  equipment       : ${(out.equipment || []).length}`);
  console.log(`  ahspCode        : ${out.ahspCode ?? '(none)'}`);
  console.log(`  unitPrice       : ${out.unitPrice ?? '(none)'}`);

  // ---- replikasi priceBreakdown UI ----
  let subtotalLabor = 0;
  for (const l of out.labor || []) {
    const rate = l.rateEstimate || (l.role.includes('Pekerja') ? 100000 : l.role.includes('Tukang') ? 145000 : l.role.includes('Kepala') ? 175000 : 200000);
    subtotalLabor += l.hoursOrDays * rate;
  }

  let subtotalMaterials = 0;
  console.log('\n  --- MATERIAL ROWS (replikasi UI) ---');
  for (const m of out.materials || []) {
    const { price, source } = uiMaterialDefaultPrice(m);
    const total = m.quantity * price;
    subtotalMaterials += total;
    console.log(`   * ${m.name}`);
    console.log(`     qty=${m.quantity} ${m.unit}  unitPrice=${rp(price)}`);
    console.log(`     total=${rp(total)}   <-- ${source}`);
    if (total === 0) console.log(`     *** CONTRIBUTES Rp0 ***`);
  }

  // equipment: perhatikan `out.equipment || [default]` -> array kosong itu TRUTHY
  const equipList = out.equipment || [{ name: 'Alat Bantu Konstruksi & Pengadukan', quantity: 1, unit: 'ls', unitPriceEstimate: 45000 }];
  console.log(`\n  equipment list used by UI: ${equipList.length} item(s)  [${(out.equipment || []).length === 0 ? 'empty array => || default NOT applied' : 'from calculator'}]`);
  let subtotalEquipment = 0;
  for (const eq of equipList) {
    const match = findPriceItem(eq.name, 'EQUIPMENT');
    const price = match ? (match as any).price : (eq.unitPriceEstimate || 45000);
    subtotalEquipment += eq.quantity * price;
  }

  let grandTotal = subtotalLabor + subtotalMaterials + subtotalEquipment;
  let finalLabor = subtotalLabor;

  // fallback blok baris 945-978
  if (grandTotal === 0 && out.primaryQuantity > 0) {
    const calcName = (spec as any).title ? String((spec as any).title).toLowerCase() : '';
    let fallbackUnitPrice = 150000;
    if (calcName.includes('galian') || calcName.includes('cut')) fallbackUnitPrice = 85000;
    else if (calcName.includes('urugan') || calcName.includes('fill')) fallbackUnitPrice = 120000;
    else if (calcName.includes('beton') || calcName.includes('cor')) fallbackUnitPrice = 1200000;
    console.log(`\n  >>> FALLBACK BLOCK TRIGGERED (grandTotal===0): fallbackUnitPrice=${rp(fallbackUnitPrice)}`);
    finalLabor = out.primaryQuantity * fallbackUnitPrice;
    grandTotal = finalLabor;
  }

  console.log('\n  --- SUMMARY (as displayed in UI) ---');
  console.log(`  Subtotal Tenaga Kerja : ${rp(subtotalLabor)}`);
  console.log(`  Subtotal Bahan        : ${rp(subtotalMaterials)}`);
  console.log(`  Subtotal Peralatan    : ${rp(subtotalEquipment)}`);
  console.log(`  GRAND TOTAL           : ${rp(grandTotal)}`);
  console.log(`  Implied unit price    : ${rp(grandTotal / out.primaryQuantity)} / ${out.primaryUnit}`);
}

console.log('MASTER_PRICE_ITEMS total:', MASTER_PRICE_ITEMS.length);
const byCat: Record<string, number> = {};
for (const p of MASTER_PRICE_ITEMS as any[]) byCat[p.category] = (byCat[p.category] || 0) + 1;
console.log('by category:', byCat);

traceCase('WEIR BODY — master prompt scenario', 'weir.body', {
  weirLength: 25,
  weirHeight: 3.5,
  crestWidth: 2.0,
  baseWidth: 6.0,
});
