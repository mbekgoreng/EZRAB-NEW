import { ALL_OFFICIAL_AHSP_ITEMS, officialAhspRepository } from '../src/data/nationalCostDatabase/officialAhspRepository';

console.log('--- SEARCHING OFFICIAL ITEMS ---');
const sloof = ALL_OFFICIAL_AHSP_ITEMS.filter(a => {
  const n = ((a as any).title || a.name || '').toLowerCase();
  return n.includes('sloof');
});
console.log('Found sloof:', sloof.length);
sloof.forEach(s => console.log(' -', s.code, '|', s.unit, '|', (s as any).title || s.name));

const balok = ALL_OFFICIAL_AHSP_ITEMS.filter(a => {
  const n = ((a as any).title || a.name || '').toLowerCase();
  return n.includes('balok');
});
console.log('Found balok:', balok.length);
balok.slice(0, 5).forEach(s => console.log(' -', s.code, '|', s.unit, '|', (s as any).title || s.name));

const dinding = ALL_OFFICIAL_AHSP_ITEMS.filter(a => {
  const n = ((a as any).title || a.name || '').toLowerCase();
  return n.includes('dinding') && n.includes('merah');
});
console.log('Found dinding bata merah:', dinding.length);
dinding.forEach(s => console.log(' -', s.code, '|', s.unit, '|', (s as any).title || s.name));
