import { officialAhspRepository } from '../src/data/nationalCostDatabase/officialAhspRepository';
import { ahspMatcher } from '../src/ded-rab-v2/ahsp/ahspMatcher';
import { ahspPriceResolver } from '../src/ded-rab-v2/ahsp/ahspPriceResolver';
import { dedRabValidationGate } from '../src/ded-rab-v2/validation/dedRabValidationGate';
import { ezrabCoreQto } from '../src/ded-rab-v2/qto/ezrabCoreQto';

const items = [
  { name: 'Pondasi Batu Kali', category: 'FOUNDATION', materialSpec: 'Batu kali belah mortar 1:4', unit: 'm³', dimensions: { length: { value: 32.5, unit: 'm' }, width: { value: 0.4, unit: 'm' }, height: { value: 0.8, unit: 'm' } }, calculationInputs: { length: 32.5, width: 0.4, height: 0.8 } },
  { name: 'Balok Sloof 15/20 cm', category: 'STRUCTURE_BEAM', materialSpec: 'Beton bertulang K-225', unit: 'm³', dimensions: { length: { value: 32.5, unit: 'm' } }, calculationInputs: { length: 32.5 } },
  { name: 'Kolom Praktis 15x15 cm', category: 'STRUCTURE_COLUMN', materialSpec: 'Beton bertulang 15x15 cm', unit: "m'", dimensions: { count: { value: 14, unit: 'titik' }, height: { value: 3.8, unit: 'm' } }, calculationInputs: { count: 14, height: 3.8 } },
  { name: 'Dinding Pasangan Bata Merah', category: 'WALL', materialSpec: 'Bata merah tebal 1/2 batu mortar 1:4', unit: 'm²', dimensions: { length: { value: 42.0, unit: 'm' }, height: { value: 3.8, unit: 'm' } }, calculationInputs: { length: 42.0, height: 3.8 } },
  { name: 'Plesteran Dinding 1:4', category: 'PLASTER', materialSpec: 'Plesteran tebal 15 mm mortar 1:4', unit: 'm²', dimensions: { area: { value: 319.2, unit: 'm²' } }, calculationInputs: { area: 319.2 } },
  { name: 'Acian Dinding', category: 'PLASTER', materialSpec: 'Acian semen PC', unit: 'm²', dimensions: { area: { value: 319.2, unit: 'm²' } }, calculationInputs: { area: 319.2 } },
  { name: 'Lantai Keramik Homogeneous Tile 60x60', category: 'FLOOR_FINISH', materialSpec: 'Homogeneous tile 60x60 cm unpolished', unit: 'm²', dimensions: { length: { value: 8.0, unit: 'm' }, width: { value: 6.0, unit: 'm' } }, calculationInputs: { length: 8.0, width: 6.0 } },
  { name: 'Plafon Gypsum Board 9 mm Rangka Hollow', category: 'CEILING', materialSpec: 'Gypsum board 9 mm rangka hollow 40x40', unit: 'm²', dimensions: { length: { value: 8.0, unit: 'm' }, width: { value: 6.0, unit: 'm' } }, calculationInputs: { length: 8.0, width: 6.0 } },
  { name: 'Pintu Panel Kayu Kamper D-02', category: 'DOOR_WINDOW', materialSpec: 'Kayu Kamper finishing melamik', unit: 'unit', dimensions: { count: { value: 4, unit: 'unit' } }, calculationInputs: { count: 4 } },
  { name: 'Kloset Duduk Monoblock', category: 'SANITARY', materialSpec: 'Kloset duduk monoblock keramik putih', unit: 'unit', dimensions: { count: { value: 2, unit: 'unit' } }, calculationInputs: { count: 2 } },
];

console.log('| # | ITEM NAME | QTO | AHSP CODE | AHSP NAME | UNIT PRICE | TOTAL PRICE | 13 GATES | READY? |');
console.log('|---|---|---|---|---|---|---|---|---|');
items.forEach((raw, i) => {
  const it = raw as any;
  it.id = 'WRK-' + i;
  it.sourcePages = [1];
  it.evidenceIds = ['EV-' + i];
  it.qto = ezrabCoreQto.calculateQuantity(it);
  it.quantity = it.qto.quantity;
  it.ahspMatch = ahspMatcher.matchWorkItem(it);
  it.ahspStatus = it.ahspMatch ? (it.ahspMatch.matchType === 'AMBIGUOUS' ? 'AMBIGUOUS' : 'MATCHED') : 'NOT_FOUND';
  it.price = ahspPriceResolver.resolvePrice(it, [], []);
  it.priceStatus = it.price.priceSource !== 'PRICE_NOT_FOUND' ? 'RESOLVED' : 'NOT_FOUND';
  const val = dedRabValidationGate.validateItem(it, 'PRJ-RUMAH-2LT-01');
  
  const passedGates = val.gates ? val.gates.filter(g => g.status === 'PASS').length : 0;
  const unitPriceStr = it.price.unitPrice ? 'Rp ' + Number(it.price.unitPrice).toLocaleString('id-ID') : 'null';
  const totalPriceStr = it.price.totalPrice ? 'Rp ' + Number(it.price.totalPrice).toLocaleString('id-ID') : 'null';
  const qtoStr = it.quantity !== null ? it.quantity + ' ' + it.unit : 'MISSING';
  const codeStr = it.ahspMatch?.code || (it.ahspMatch?.matchType === 'AMBIGUOUS' ? 'AMBIGUOUS (' + it.ahspMatch.candidates?.length + ')' : 'NO_MATCH');
  const nameStr = (it.ahspMatch?.name || '-').slice(0, 35);
  
  console.log('| ' + (i+1) + ' | ' + it.name + ' | ' + qtoStr + ' | ' + codeStr + ' | ' + nameStr + ' | ' + unitPriceStr + ' | ' + totalPriceStr + ' | ' + passedGates + '/13 | ' + (val.isValid && val.status === 'READY' ? 'READY (PASS)' : val.status) + ' |');
});
