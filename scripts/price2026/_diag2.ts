/**
 * PHASE 1/2 DIAGNOSTIC — code-space comparison between canonical AHSP resources
 * and every price source. Read-only.
 */
import { AHSP_2026_CANONICAL_RESOURCES } from '../../src/data/nationalCostDatabase/ahsp2026CanonicalResources.generated';
import { OFFICIAL_HSD_2026_ITEMS } from '../../src/data/nationalCostDatabase/officialHSD2026';
import { MASTER_PRICE_ITEMS } from '../../src/data/indonesianPrices';
import { MASTER_AHSP_DATABASE } from '../../src/data/indonesianAHSP';
import { MaterialLibraryService } from '../../src/services/materialLibraryService';
import { MaterialDatabaseService } from '../../src/domain/material/materialDatabaseService';
import { LaborDatabaseService } from '../../src/domain/labor/laborDatabaseService';
import { EquipmentDatabaseService } from '../../src/domain/equipment/equipmentDatabaseService';

const resources = AHSP_2026_CANONICAL_RESOURCES as any[];

function sample(name: string, rows: any[], codeKey: string, nameKey: string, unitKey?: string, n = 10) {
  console.log(`\n--- ${name} (${rows.length}) ---`);
  for (const r of rows.slice(0, n)) {
    console.log('  ', String(r[codeKey] ?? '(none)').padEnd(14), '|', String(r[unitKey || 'unit'] ?? '').padEnd(6), '|', String(r[nameKey] ?? '').slice(0, 45));
  }
}

sample('OFFICIAL_HSD_2026_ITEMS', OFFICIAL_HSD_2026_ITEMS as any[], 'code', 'name', 'unit');
sample('MASTER_PRICE_ITEMS', MASTER_PRICE_ITEMS as any[], 'code', 'name', 'unit');
sample('MASTER_AHSP_DATABASE (legacy)', MASTER_AHSP_DATABASE as any[], 'code', 'name', 'unit');

const matLib = MaterialLibraryService.getInstance().getAllMaterials();
sample('MaterialLibraryService', matLib as any[], 'id', 'name', 'unit');

const matDb = MaterialDatabaseService.getInstance().getAllMaterials();
sample('MaterialDatabaseService', matDb as any[], 'materialCode', 'name', 'unit');

const laborDb = LaborDatabaseService.getInstance().getAllLabor();
sample('LaborDatabaseService', laborDb as any[], 'code', 'name', 'unit');

const equipDb = EquipmentDatabaseService.getInstance().getAllEquipment();
sample('EquipmentDatabaseService', equipDb as any[], 'code', 'name', 'unit');

console.log('\n=== CANONICAL RESOURCE: type distribution ===');
const byType = new Map<string, number>();
const noCode = new Map<string, number>();
for (const r of resources) {
  byType.set(r.type, (byType.get(r.type) || 0) + 1);
  if (!r.code) noCode.set(r.type, (noCode.get(r.type) || 0) + 1);
}
console.log('type counts  :', JSON.stringify(Object.fromEntries(byType)));
console.log('missing code :', JSON.stringify(Object.fromEntries(noCode)));

console.log('\n=== CANONICAL RESOURCE: distinct code prefixes per type ===');
for (const t of ['material', 'labor', 'equipment']) {
  const codes = resources.filter((r) => r.type === t && r.code).map((r) => String(r.code));
  const uniq = [...new Set(codes)];
  const pref = new Map<string, number>();
  for (const c of uniq) {
    const p = c.replace(/[0-9].*$/, '').replace(/[.\-_]$/, '') || '(num)';
    pref.set(p, (pref.get(p) || 0) + 1);
  }
  const top = [...pref.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
  console.log(`  ${t.padEnd(10)} uniq=${uniq.length.toString().padStart(5)}  prefixes: ${top.map(([k, v]) => `${k}=${v}`).join(' ')}`);
  console.log(`             examples: ${uniq.slice(0, 12).join(', ')}`);
}
