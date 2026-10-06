/**
 * EZRAB PRICING ENGINE — DATA CENSUS (PHASE 0 AUDIT, READ-ONLY)
 * Menghitung populasi data AHSP dan harga secara pasti.
 */

import { ALL_OFFICIAL_AHSP_ITEMS } from '../src/data/nationalCostDatabase/masterRegistry';
import { SDA_AHSP_2026_DATASET } from '../src/data/nationalCostDatabase/sdaAHSPDataset';
import { BINA_MARGA_AHSP_2026_DATASET } from '../src/data/nationalCostDatabase/binaMargaAHSPDataset';
import { CIPTA_KARYA_AHSP_2026_DATASET } from '../src/data/nationalCostDatabase/ciptaKaryaAHSPDataset';
import { SMKK_AHSP_ITEMS } from '../src/data/nationalCostDatabase/smkkDataset';
import { MASTER_AHSP_DATABASE } from '../src/data/indonesianAHSP';
import { MASTER_PRICE_ITEMS, getPriceDatabase } from '../src/data/indonesianPrices';
import { AHSPRepository } from '../src/engine/ahsp/repository/ahspRepository';

const pct = (a: number, b: number) => (b === 0 ? '0.0' : ((a / b) * 100).toFixed(1)) + '%';

console.log('='.repeat(78));
console.log('EZRAB DATA CENSUS');
console.log('='.repeat(78));

console.log('\n--- A. AHSP DATASETS ---');
for (const [name, d] of [
  ['SDA_AHSP_2026_DATASET', SDA_AHSP_2026_DATASET],
  ['BINA_MARGA_AHSP_2026_DATASET', BINA_MARGA_AHSP_2026_DATASET],
  ['CIPTA_KARYA_AHSP_2026_DATASET', CIPTA_KARYA_AHSP_2026_DATASET],
  ['SMKK_AHSP_ITEMS', SMKK_AHSP_ITEMS],
] as const) {
  console.log(`  ${name.padEnd(34)} : ${(d as any[]).length}`);
}
console.log(`  ${'ALL_OFFICIAL_AHSP_ITEMS'.padEnd(34)} : ${ALL_OFFICIAL_AHSP_ITEMS.length}`);
console.log(`  ${'MASTER_AHSP_DATABASE (legacy)'.padEnd(34)} : ${MASTER_AHSP_DATABASE.length}`);

console.log('\n--- B. AHSP PROVENANCE COVERAGE (ALL_OFFICIAL_AHSP_ITEMS) ---');
const fields = ['version', 'year', 'sourceDocument', 'sourcePage', 'unitPrice', 'lastUpdated', 'status'] as const;
for (const f of fields) {
  const n = ALL_OFFICIAL_AHSP_ITEMS.filter((i: any) => i[f] !== undefined && i[f] !== null && i[f] !== '').length;
  console.log(`  ${f.padEnd(18)} : ${String(n).padStart(5)} / ${ALL_OFFICIAL_AHSP_ITEMS.length}  (${pct(n, ALL_OFFICIAL_AHSP_ITEMS.length)})`);
}
const withPrice = ALL_OFFICIAL_AHSP_ITEMS.filter((i: any) => (i.unitPrice || 0) > 0).length;
const zeroPrice = ALL_OFFICIAL_AHSP_ITEMS.length - withPrice;
console.log(`  unitPrice > 0      : ${String(withPrice).padStart(5)}  (${pct(withPrice, ALL_OFFICIAL_AHSP_ITEMS.length)})`);
console.log(`  unitPrice == 0/null: ${String(zeroPrice).padStart(5)}  (${pct(zeroPrice, ALL_OFFICIAL_AHSP_ITEMS.length)})`);

console.log('\n--- C. DISTRIBUSI version & domain ---');
const byVersion: Record<string, number> = {};
const byDomain: Record<string, number> = {};
for (const i of ALL_OFFICIAL_AHSP_ITEMS as any[]) {
  byVersion[String(i.version ?? '(none)')] = (byVersion[String(i.version ?? '(none)')] || 0) + 1;
  byDomain[String(i.domain ?? '(none)')] = (byDomain[String(i.domain ?? '(none)')] || 0) + 1;
}
console.log('  version:', byVersion);
console.log('  domain :', byDomain);

console.log('\n--- D. KOMPONEN AHSP (labor/material/equipment terisi?) ---');
let noLabor = 0, noMat = 0, noEq = 0, noComp = 0;
for (const i of ALL_OFFICIAL_AHSP_ITEMS as any[]) {
  const l = (i.laborComponents || []).length;
  const m = (i.materialComponents || []).length;
  const e = (i.equipmentComponents || []).length;
  if (l === 0) noLabor++;
  if (m === 0) noMat++;
  if (e === 0) noEq++;
  if (l + m + e === 0) noComp++;
}
console.log(`  tanpa laborComponents     : ${noLabor}`);
console.log(`  tanpa materialComponents  : ${noMat}`);
console.log(`  tanpa equipmentComponents : ${noEq}`);
console.log(`  TANPA KOMPONEN SAMA SEKALI: ${noComp}`);
console.log(`  komponen dengan unitPrice>0 : ${ALL_OFFICIAL_AHSP_ITEMS.flatMap((i: any) => [...(i.laborComponents||[]), ...(i.materialComponents||[]), ...(i.equipmentComponents||[])]).filter((c: any) => (c.unitPrice||0) > 0).length}`);

console.log('\n--- E. PRICE DATA ---');
console.log(`  MASTER_PRICE_ITEMS        : ${MASTER_PRICE_ITEMS.length}`);
const pd = getPriceDatabase();
console.log(`  getPriceDatabase()        : ${pd.length}`);
for (const f of ['source', 'priceSource', 'effectiveDate', 'location', 'province', 'city', 'confidence', 'provenance', 'code', 'category', 'supplier'] as const) {
  const n = (pd as any[]).filter((p) => p[f] !== undefined && p[f] !== null && p[f] !== '').length;
  console.log(`  ${('price.' + f).padEnd(24)} : ${String(n).padStart(5)} / ${pd.length}  (${pct(n, pd.length)})`);
}
const locs: Record<string, number> = {};
for (const p of pd as any[]) locs[String(p.location ?? '(none)')] = (locs[String(p.location ?? '(none)')] || 0) + 1;
console.log('  DISTINCT location values  :', Object.keys(locs).length, '->', locs);

console.log('\n--- F. AHSP REPOSITORY (yang benar-benar dipakai engine) ---');
const repo = AHSPRepository.getInstance();
console.log(`  total definitions : ${repo.count()}`);
const defs = repo.getAllMasterDefinitions();
const byV: Record<string, number> = {};
for (const d of defs as any[]) byV[String(d.version)] = (byV[String(d.version)] || 0) + 1;
console.log('  by version        :', byV);
const bySrc: Record<string, number> = {};
for (const d of defs as any[]) bySrc[String(d.provenance?.sourceDocument).slice(0, 46)] = (bySrc[String(d.provenance?.sourceDocument).slice(0, 46)] || 0) + 1;
console.log('  by sourceDocument :');
for (const [k, v] of Object.entries(bySrc).sort((a, b) => b[1] - a[1])) console.log(`      ${String(v).padStart(5)}  ${k}`);
const byVerif: Record<string, number> = {};
for (const d of defs as any[]) byVerif[String(d.provenance?.verificationStatus)] = (byVerif[String(d.provenance?.verificationStatus)] || 0) + 1;
console.log('  by verificationStatus :', byVerif);

console.log('\n--- G. VERSION-AWARE LOOKUP TEST ---');
const probe = defs[0] as any;
if (probe) {
  console.log(`  sample code="${probe.code}" version="${probe.version}"`);
  console.log(`  getByCode("${probe.code}")            -> version ${(repo.getByCode(probe.code) as any)?.version}`);
  console.log(`  AHSPRepository.getByCode signature     : (code, projectId?) — TIDAK ADA parameter version.`);
}
