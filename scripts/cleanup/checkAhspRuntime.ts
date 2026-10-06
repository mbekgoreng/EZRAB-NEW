import { officialAhspRepository, ALL_OFFICIAL_AHSP_ITEMS } from '../../src/data/nationalCostDatabase/officialAhspRepository';

console.log('AHSP runtime items loaded:', ALL_OFFICIAL_AHSP_ITEMS.length);
console.log('hasOfficialAhsp("2.2.2.1.2"):', officialAhspRepository.hasOfficialAhsp('2.2.2.1.2'));
console.log('hasOfficialAhsp("A.3.2.1.2"):', officialAhspRepository.hasOfficialAhsp('A.3.2.1.2'));
console.log('hasOfficialAhsp("7.9.(1)"):', officialAhspRepository.hasOfficialAhsp('7.9.(1)'));
