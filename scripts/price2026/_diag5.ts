import { MaterialDatabaseService } from '../../src/domain/material/materialDatabaseService';
const db = MaterialDatabaseService.getInstance();
const all = db.getAllMaterials() as any[];
console.log('materials', all.length);
const withPrices = all.filter(m => { const p = db.getPricesByMaterialId(m.id); return p && p.length && p[0].price > 0; });
console.log('with price>0:', withPrices.length);
for (const m of withPrices.slice(0, 5)) {
  const p = db.getPricesByMaterialId(m.id)[0];
  console.log(' ', m.materialCode, '|', m.name, '|', m.unit, '|', p.price, '| src=', p.sourceName, '| conf=', p.confidence, '| region=', JSON.stringify(p.region), '| date=', p.priceDate);
}
const srcs = new Map<string, number>();
for (const m of withPrices) { const p = db.getPricesByMaterialId(m.id)[0]; srcs.set(p.sourceName||'(none)', (srcs.get(p.sourceName||'(none)')||0)+1); }
console.log('\nsource distribution:'); for (const [k,v] of [...srcs].sort((a,b)=>b[1]-a[1]).slice(0,15)) console.log('  ', v, k);
const conf = new Map<string, number>();
for (const m of withPrices) { const p = db.getPricesByMaterialId(m.id)[0]; conf.set(p.confidence||'(none)', (conf.get(p.confidence||'(none)')||0)+1); }
console.log('confidence:', JSON.stringify(Object.fromEntries(conf)));
