import { BINA_MARGA_AHSP_2026_DATASET as R } from '../src/data/nationalCostDatabase/binaMargaAHSPDataset';
const freq = new Map<number, number>();
for (const r of R as any[]) freq.set(r.unitPrice, (freq.get(r.unitPrice) || 0) + 1);
const sorted = [...freq.entries()].sort((a, b) => b[1] - a[1]);
console.log('item repo            :', R.length);
console.log('harga satuan DISTINCT:', freq.size);
console.log('');
console.log('=== 20 harga paling sering dipakai ulang ===');
console.log('  frekuensi | harga      | % item');
for (const [p, n] of sorted.slice(0, 20)) {
  console.log('  ' + String(n).padStart(9) + ' | ' + String(p).padStart(10) + ' | ' + ((n / R.length) * 100).toFixed(1) + '%');
}
const reused = sorted.filter(([, n]) => n > 1);
const reusedItems = reused.reduce((a, [, n]) => a + n, 0);
console.log('');
console.log('harga dipakai >1 item :', reused.length, 'nilai');
console.log('item terdampak        :', reusedItems, '/', R.length, '=', ((reusedItems / R.length) * 100).toFixed(1) + '%');
console.log('harga unik 1 item     :', sorted.filter(([, n]) => n === 1).length);
