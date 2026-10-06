import { ALL_OFFICIAL_AHSP_ITEMS } from '../src/data/nationalCostDatabase/officialAhspRepository';
import { priceResolver2026 } from '../src/data/priceDatabase2026/resolver';

function search(predicate: (a: any) => boolean) {
  return ALL_OFFICIAL_AHSP_ITEMS.filter(predicate).map(a => {
    const price = priceResolver2026.resolveAhspUnitPrice(a);
    return {
      code: a.code,
      unit: a.unit,
      name: (a as any).title || a.name,
      category: a.category,
      unitPrice: price.unitPrice,
      hasPrice: price.unitPrice !== null,
    };
  });
}

console.log('=== CONCRETE CASTING (PENGECORAN BETON K-225 / FC 19.3) ===');
search(a => {
  const n = ((a as any).title || a.name || '').toLowerCase();
  return n.includes('beton') && (n.includes('k-225') || n.includes('k 225') || n.includes('fc') || n.includes('19,3') || n.includes('cor') || n.includes('pembuatan 1 m3'));
}).slice(0, 15).forEach(a => console.log(`[${a.code}] (${a.unit}) Rp ${a.unitPrice?.toLocaleString('id-ID')} | ${a.name}`));

console.log('\n=== ACIAN ===');
search(a => {
  const n = ((a as any).title || a.name || '').toLowerCase();
  return n.includes('acian');
}).forEach(a => console.log(`[${a.code}] (${a.unit}) Rp ${a.unitPrice?.toLocaleString('id-ID')} | ${a.name}`));

console.log('\n=== FLOOR TILE (LANTAI KERAMIK / GRANIT / HOMOGENEOUS 60x60) ===');
search(a => {
  const n = ((a as any).title || a.name || '').toLowerCase();
  return (n.includes('lantai') || n.includes('ubin') || n.includes('keramik') || n.includes('homogeneous')) && (n.includes('60') || n.includes('granit'));
}).slice(0, 15).forEach(a => console.log(`[${a.code}] (${a.unit}) Rp ${a.unitPrice?.toLocaleString('id-ID')} | ${a.name}`));

console.log('\n=== DOOR (PINTU PANEL / PEMASANGAN PINTU) ===');
search(a => {
  const n = ((a as any).title || a.name || '').toLowerCase();
  return n.includes('pintu') && !n.includes('pembongkaran') && !n.includes('bongkar');
}).slice(0, 15).forEach(a => console.log(`[${a.code}] (${a.unit}) Rp ${a.unitPrice?.toLocaleString('id-ID')} | ${a.name}`));

console.log('\n=== SANITARY / KLOSET / WATER CLOSET ===');
search(a => {
  const n = ((a as any).title || a.name || '').toLowerCase();
  return (n.includes('kloset') || n.includes('closet') || n.includes('saniter') || n.includes('sanitary') || n.includes('wastafel') || n.includes('urinoir')) && !n.includes('pembongkaran') && !n.includes('bongkar');
}).forEach(a => console.log(`[${a.code}] (${a.unit}) Rp ${a.unitPrice?.toLocaleString('id-ID')} | ${a.name}`));
