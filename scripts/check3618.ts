import { ALL_OFFICIAL_AHSP_ITEMS, officialAhspRepository } from '../src/data/nationalCostDatabase/officialAhspRepository';
import { priceResolver2026 } from '../src/data/priceDatabase2026/resolver';

const item3618 = officialAhspRepository.getOfficialAhsp('3.6.1.8');
if (item3618) {
  console.log('Official Item 3.6.1.8:', (item3618 as any).name || (item3618 as any).title);
  const p = priceResolver2026.resolveAhspUnitPrice(item3618);
  console.log('Pricing status:', p.pricingStatus);
  console.log('Unit Price: Rp', p.unitPrice?.toLocaleString('id-ID'));
  console.log('Materials:', p.material.components.length, 'total: Rp', p.material.subtotalPerUnit?.toLocaleString('id-ID'));
  console.log('Labor:', p.labor.components.length, 'total: Rp', p.labor.subtotalPerUnit?.toLocaleString('id-ID'));
  console.log('Equipment:', p.equipment.components.length, 'total: Rp', p.equipment.subtotalPerUnit?.toLocaleString('id-ID'));
}
