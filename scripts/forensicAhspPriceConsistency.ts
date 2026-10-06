/**
 * EZRAB PRICING ENGINE — AHSP PRICE CONSISTENCY PROBE (PHASE 0 AUDIT, READ-ONLY)
 *
 * Menguji apakah `unitPrice` yang tertanam di setiap item AHSP konsisten dengan
 * jumlah (koefisien x harga satuan) dari komponen labor/material/equipment-nya.
 *
 * Jika TIDAK konsisten, maka satu kode AHSP dapat menghasilkan DUA harga berbeda
 * tergantung engine mana yang dipanggil — dan tidak ada satu pun yang dapat
 * dibuktikan benar terhadap dokumen sumber.
 */

import { ALL_OFFICIAL_AHSP_ITEMS } from '../src/data/nationalCostDatabase/masterRegistry';
import { AuthoritativeAhspPriceBridge } from '../server/services/authoritativeAhspPriceBridge';

const bridge = AuthoritativeAhspPriceBridge.getInstance();
const rp = (n: number) => 'Rp ' + Math.round(n).toLocaleString('id-ID');

type Row = {
  code: string; name: string; unit: string; domain: string;
  embedded: number; componentSum: number; compWithPrice: number; compTotal: number;
  delta: number; deltaPct: number;
};

const rows: Row[] = [];
for (const i of ALL_OFFICIAL_AHSP_ITEMS as any[]) {
  const comps = [...(i.laborComponents || []), ...(i.materialComponents || []), ...(i.equipmentComponents || [])];
  const componentSum = comps.reduce((s: number, c: any) => s + (c.coefficient || 0) * (c.unitPrice || 0), 0);
  const compWithPrice = comps.filter((c: any) => (c.unitPrice || 0) > 0).length;
  const embedded = i.unitPrice || 0;
  const delta = embedded - componentSum;
  rows.push({
    code: i.code, name: i.name, unit: i.unit, domain: i.domain,
    embedded, componentSum, compWithPrice, compTotal: comps.length,
    delta, deltaPct: componentSum > 0 ? (delta / componentSum) * 100 : 0,
  });
}

const tol = 0.5;
const consistent = rows.filter(r => Math.abs(r.delta) <= tol).length;
const inconsistent = rows.length - consistent;

console.log('='.repeat(90));
console.log('AHSP PRICE CONSISTENCY PROBE');
console.log('='.repeat(90));
console.log(`  total item AHSP                  : ${rows.length}`);
console.log(`  unitPrice == componentSum (±${tol})  : ${consistent}  (${((consistent / rows.length) * 100).toFixed(1)}%)`);
console.log(`  unitPrice != componentSum         : ${inconsistent}  (${((inconsistent / rows.length) * 100).toFixed(1)}%)`);

const zeroComp = rows.filter(r => r.compWithPrice === 0).length;
console.log(`  item dengan 0 komponen berharga   : ${zeroComp}`);
const noCompAtAll = rows.filter(r => r.compTotal === 0).length;
console.log(`  item dengan 0 komponen sama sekali: ${noCompAtAll}`);

const suspicious = rows.filter(r => r.compWithPrice > 0 && Math.abs(r.delta) > tol);
console.log(`\n  -> item dengan komponen berharga TAPI unitPrice berbeda: ${suspicious.length}`);
const ratios = suspicious.map(r => r.componentSum > 0 ? r.embedded / r.componentSum : Infinity).filter(Number.isFinite);
ratios.sort((a, b) => a - b);
if (ratios.length) {
  const q = (p: number) => ratios[Math.floor(p * (ratios.length - 1))];
  console.log(`  rasio embedded/componentSum: min=${ratios[0].toFixed(2)}  p25=${q(0.25).toFixed(2)}  median=${q(0.5).toFixed(2)}  p75=${q(0.75).toFixed(2)}  max=${ratios[ratios.length - 1].toFixed(2)}`);
  console.log(`  item dengan embedded < 50% componentSum : ${suspicious.filter(r => r.componentSum > 0 && r.embedded / r.componentSum < 0.5).length}`);
  console.log(`  item dengan embedded > 200% componentSum: ${suspicious.filter(r => r.componentSum > 0 && r.embedded / r.componentSum > 2).length}`);
}

console.log('\n--- 12 contoh terburuk (|delta| terbesar) ---');
suspicious.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 12).forEach(r => {
  console.log(`  [${r.code}] ${r.name.slice(0, 46)}`);
  console.log(`      unit=${r.unit}  embedded=${rp(r.embedded)}  componentSum=${rp(r.componentSum)}  delta=${rp(r.delta)}`);
});

console.log('\n--- SIMULASI: satu kode AHSP, dua engine ---');
for (const probe of suspicious.slice(0, 3)) {
  const item = (ALL_OFFICIAL_AHSP_ITEMS as any[]).find(i => i.code === probe.code);
  if (!item) continue;
  const ahspResult = bridge.searchAhsp(item.name, item.code, item.category);
  const priceResult = bridge.lookupPrice(ahspResult, false);
  console.log(`  code ${probe.code}:`);
  console.log(`      ENGINE A (AuthoritativeAhspPriceBridge) -> ${rp(priceResult.unitPrice || 0)}  status=${priceResult.priceStatus} source=${priceResult.source} confidence=${priceResult.confidence}`);
  console.log(`      ENGINE B (sum koefisien x unitPrice komponen) -> ${rp(probe.componentSum)}`);
  console.log(`      selisih -> ${rp((priceResult.unitPrice || 0) - probe.componentSum)}   status dilaporkan: ${priceResult.priceStatus}`);
}

console.log('\n--- SIMULASI: cari item tanpa harga yang memicu fallback Rp1.150.000 ---');
const noPriceItems = (ALL_OFFICIAL_AHSP_ITEMS as any[]).filter(i => !(i.unitPrice > 0) || i.unitPrice === undefined);
console.log(`  item dengan unitPrice hilang/nol: ${noPriceItems.length}`);
console.log('  -> karena 100% item punya unitPrice, fallback || 1150000 praktis hanya aktif bila field diubah/dihapus.');
