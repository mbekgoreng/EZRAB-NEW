import { ALL_OFFICIAL_AHSP_ITEMS } from '../src/data/nationalCostDatabase/officialAhspRepository';
import { priceResolver2026 } from '../src/data/priceDatabase2026/resolver';

function searchByPrefix(prefix: string) {
  return ALL_OFFICIAL_AHSP_ITEMS.filter(a => a.code.startsWith(prefix)).map(a => {
    const p = priceResolver2026.resolveAhspUnitPrice(a);
    return {
      code: a.code,
      unit: a.unit,
      name: (a as any).title || a.name,
      unitPrice: p.unitPrice,
    };
  });
}

console.log('=== PINTU ITEMS (3.11) ===');
searchByPrefix('3.11').forEach(a => console.log(`[${a.code}] (${a.unit}) Rp ${a.unitPrice !== null ? a.unitPrice?.toLocaleString('id-ID') : 'null'} | ${a.name}`));

console.log('\n=== HOMOGENEOUS TILE (3.9.4 & 3.10.2) ===');
searchByPrefix('3.9.4').forEach(a => console.log(`[${a.code}] (${a.unit}) Rp ${a.unitPrice !== null ? a.unitPrice?.toLocaleString('id-ID') : 'null'} | ${a.name}`));
searchByPrefix('3.10.2').forEach(a => console.log(`[${a.code}] (${a.unit}) Rp ${a.unitPrice !== null ? a.unitPrice?.toLocaleString('id-ID') : 'null'} | ${a.name}`));

console.log('\n=== SANITARY (3.18) ===');
searchByPrefix('3.18').forEach(a => console.log(`[${a.code}] (${a.unit}) Rp ${a.unitPrice !== null ? a.unitPrice?.toLocaleString('id-ID') : 'null'} | ${a.name}`));

console.log('\n=== STRUCTURAL BETON (2.2.1) ===');
searchByPrefix('2.2.1').forEach(a => console.log(`[${a.code}] (${a.unit}) Rp ${a.unitPrice !== null ? a.unitPrice?.toLocaleString('id-ID') : 'null'} | ${a.name}`));
