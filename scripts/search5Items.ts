import { ALL_OFFICIAL_AHSP_ITEMS } from '../src/data/nationalCostDatabase/officialAhspRepository';

function searchCatalog(keyword: string) {
  const kw = keyword.toLowerCase();
  return ALL_OFFICIAL_AHSP_ITEMS.filter(a => {
    const title = ((a as any).title || a.name || '').toLowerCase();
    return title.includes(kw);
  });
}

console.log('=== 1. SLOOF / BALOK BETON ===');
searchCatalog('sloof').forEach(a => console.log(' -', a.code, '|', a.unit, '|', (a as any).title || a.name));
searchCatalog('balok').filter(a => ((a as any).title || a.name || '').toLowerCase().includes('beton')).slice(0, 10).forEach(a => console.log(' -', a.code, '|', a.unit, '|', (a as any).title || a.name));

console.log('\n=== 2. ACIAN ===');
searchCatalog('acian').forEach(a => console.log(' -', a.code, '|', a.unit, '|', (a as any).title || a.name));

console.log('\n=== 3. HOMOGENEOUS / KERAMIK 60X60 ===');
searchCatalog('homogeneous').forEach(a => console.log(' -', a.code, '|', a.unit, '|', (a as any).title || a.name));
searchCatalog('ubin').filter(a => ((a as any).title || a.name || '').includes('60')).forEach(a => console.log(' -', a.code, '|', a.unit, '|', (a as any).title || a.name));
searchCatalog('keramik').filter(a => ((a as any).title || a.name || '').includes('60')).forEach(a => console.log(' -', a.code, '|', a.unit, '|', (a as any).title || a.name));

console.log('\n=== 4. PINTU PANEL KAYU / KAMPER ===');
searchCatalog('pintu panel').forEach(a => console.log(' -', a.code, '|', a.unit, '|', (a as any).title || a.name));
searchCatalog('kamper').forEach(a => console.log(' -', a.code, '|', a.unit, '|', (a as any).title || a.name));
searchCatalog('daun pintu').slice(0, 10).forEach(a => console.log(' -', a.code, '|', a.unit, '|', (a as any).title || a.name));
searchCatalog('pintu').filter(a => ((a as any).title || a.name || '').toLowerCase().includes('pasang')).slice(0, 10).forEach(a => console.log(' -', a.code, '|', a.unit, '|', (a as any).title || a.name));

console.log('\n=== 5. KLOSET DUDUK ===');
searchCatalog('kloset').forEach(a => console.log(' -', a.code, '|', a.unit, '|', (a as any).title || a.name));
