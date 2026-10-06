import { LaborDatabaseService } from '../../src/domain/labor/laborDatabaseService';
const all = LaborDatabaseService.getInstance().getAllLabor() as any[];
console.log('labor count', all.length);
console.log('codes:', all.map(l => l.code).join(', '));
const wanted = ['L.01','L.02','L.03','L.04','L.12','L.13'];
for (const w of wanted) {
  const hit = all.find(l => String(l.code).toUpperCase() === w);
  console.log(w, '->', hit ? `${hit.code} | ${hit.name} | OH=${hit.basePriceOH} OJ=${hit.basePriceOJ} | unit=${hit.unit}` : 'NOT FOUND');
}
console.log('\n-- names containing pekerja/tukang/mandor --');
for (const l of all.filter(l => /pekerja|tukang|mandor|kepala/i.test(l.name)).slice(0,15)) {
  console.log(' ', l.code, '|', l.name, '|', l.unit, '|', l.basePriceOH);
}
