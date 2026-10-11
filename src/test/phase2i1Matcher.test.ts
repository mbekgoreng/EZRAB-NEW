/**
 * Phase 2I.1: Matcher P1 fixes — galian vs pondasi gates, kolom candidate fallback.
 * Run: npx tsx src/test/phase2i1Matcher.test.ts
 */
import { ahspMatcher } from '../ded-rab-v2/ahsp/ahspMatcher';

let pass = 0, fail = 0;
const check = (label: string, cond: boolean, detail: string) => {
  if (cond) { pass++; console.log(`  [PASS] ${label}`); }
  else { fail++; console.log(`  [FAIL] ${label} — ${detail}`); }
};
const match = (name: string, unit: string, category: string) =>
  ahspMatcher.matchWorkItem({ id: 'x', name, unit, category } as any);

console.log('2I-1: Galian vs Pondasi gates');
{
  let m = match('Galian tanah biasa untuk pondasi', 'm3', 'SITEWORK');
  check('galian untuk pondasi → 1.2.1.1.1', m.code === '1.2.1.1.1', `dapat ${m.code} ${m.matchType}`);
  m = match('Galian tanah pondasi', 'm3', 'SITEWORK');
  check('galian tanah pondasi → 1.2.1.1.1', m.code === '1.2.1.1.1', `dapat ${m.code} ${m.matchType}`);
  m = match('Pondasi batu kali', 'm3', 'FOUNDATION');
  check('pondasi batu kali → 2.2.2.1.6', m.code === '2.2.2.1.6', `dapat ${m.code} ${m.matchType}`);
  m = match('Pekerjaan pondasi batu kali', 'm3', 'FOUNDATION');
  check('pekerjaan pondasi → 2.2.2.1.6 (bukan galian)', m.code === '2.2.2.1.6', `dapat ${m.code} ${m.matchType}`);
  m = match('Galian tanah biasa', 'm3', 'SITEWORK');
  check('galian biasa → 1.2.1.1.1', m.code === '1.2.1.1.1', `dapat ${m.code} ${m.matchType}`);
  m = match('Pekerjaan XYZ', 'm3', 'SITEWORK');
  check('nonsense → NOT_FOUND', m.matchType === 'NOT_FOUND', `dapat ${m.code} ${m.matchType}`);
}

console.log('2I-2: Kolom candidate fallback');
{
  let m = match('Kolom beton pracetak', 'm3', 'STRUCTURE_COLUMN');
  check('pracetak eksplisit → 2.4.3.3', m.code === '2.4.3.3', `dapat ${m.code} ${m.matchType}`);
  m = match('Beton kolom K-250', 'm3', 'STRUCTURE_COLUMN');
  check('K-250 tanpa pracetak → bukan 2.4.3.3', m.code !== '2.4.3.3', `dapat ${m.code} ${m.matchType}`);
  m = match('Bekisting kolom', 'm2', 'STRUCTURE_COLUMN');
  check('bekisting → item bekisting (bukan beton kolom)', (m.code || '').startsWith('A.1'), `dapat ${m.code} ${m.matchType}`);
  // DB tidak memiliki item kolom K-250 cor-setempat m3 yang relevan;
  // NOT_FOUND adalah hasil jujur (fail-closed), bukan bug mekanisme.
  m = match('Kolom beton K-250 cor setempat', 'm3', 'STRUCTURE_COLUMN');
  check('K-250 cor setempat → NOT_FOUND (tidak ada kandidat relevan di DB)', m.matchType === 'NOT_FOUND', `dapat ${m.code} ${m.matchType}`);
  m = match('Kolom beton cor di tempat', 'm3', 'STRUCTURE_COLUMN');
  check('cor di tempat → NOT_FOUND (tidak ada kandidat relevan di DB)', m.matchType === 'NOT_FOUND', `dapat ${m.code} ${m.matchType}`);
}

console.log('Regresi Phase 2G/2H bertahan');
{
  let m = match('Pekerjaan Tidak Dikenal XYZ', 'm3', 'SITEWORK');
  check('nonsense XYZ → NOT_FOUND', m.matchType === 'NOT_FOUND', `dapat ${m.code} ${m.matchType}`);
  m = match('Pengecatan dinding', 'm2', 'PAINTING');
  check('pengecatan → 3.8.x (bukan dinding)', (m.code || '').startsWith('3.8.'), `dapat ${m.code} ${m.matchType}`);
}

console.log(`\nTOTAL: ${pass} PASSED, ${fail} FAILED`);
if (fail > 0) process.exit(1);
