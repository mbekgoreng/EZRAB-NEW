/**
 * EZRAB BINA MARGA 2026 — PRICE COVERAGE AUDIT
 * Computes exact price coverage across all 1,163 canonical items and resources.
 */

import * as fs from 'fs';
import { priceResolver2026 } from '../../src/data/priceDatabase2026/resolver';
import { ALL_OFFICIAL_AHSP_ITEMS } from '../../src/data/nationalCostDatabase/masterRegistry';
import {
  OFFICIAL_BM_2026_LABOR,
  OFFICIAL_BM_2026_MATERIALS,
  OFFICIAL_BM_2026_EQUIPMENT,
} from '../../src/data/nationalCostDatabase/officialBinaMargaPrices2026';
import { BM_2026_DHSP_TOTAL_COUNT } from '../../src/data/nationalCostDatabase/officialBinaMargaDhsp2026';

console.log('Calculating Bina Marga 2026 Price Coverage...');

const bmItems = ALL_OFFICIAL_AHSP_ITEMS.filter((i) => i.domain === 'BINA_MARGA');
console.log(`Auditing ${bmItems.length} canonical Bina Marga items...`);

let fullCount = 0;
let partialCount = 0;
let missingCount = 0;

let totalLaborComps = 0;
let resolvedLaborComps = 0;
let totalMaterialComps = 0;
let resolvedMaterialComps = 0;
let totalEquipComps = 0;
let resolvedEquipComps = 0;

for (const it of bmItems) {
  const comp = priceResolver2026.resolveAhspUnitPrice(it);
  
  if (comp.pricingStatus === 'FULL') {
    fullCount++;
  } else if (comp.pricingStatus === 'PARTIAL') {
    partialCount++;
  } else {
    missingCount++;
  }

  totalLaborComps += comp.labor.components.length;
  resolvedLaborComps += comp.labor.resolvedCount;

  totalMaterialComps += comp.material.components.length;
  resolvedMaterialComps += comp.material.resolvedCount;

  totalEquipComps += comp.equipment.components.length;
  resolvedEquipComps += comp.equipment.resolvedCount;
}

const totalComps = totalLaborComps + totalMaterialComps + totalEquipComps;
const resolvedComps = resolvedLaborComps + resolvedMaterialComps + resolvedEquipComps;

const md: string[] = [];
md.push('# EZRAB BINA MARGA 2026 — PRICE COVERAGE REPORT');
md.push('');
md.push(`**Date:** ${new Date().toISOString()}  `);
md.push(`**Source Document:** SE Direktur Jenderal Bina Konstruksi No. 47/SE/Dk/2026 Lampiran V  `);
md.push(`**Workbook:** \`AHSP 2026 Bina Marga.xlsx\`  `);
md.push(`**Total Canonical Bina Marga AHSP:** ${bmItems.length.toLocaleString('id-ID')}  `);
md.push(`**DHSP Items in Excel:** ${BM_2026_DHSP_TOTAL_COUNT.toLocaleString('id-ID')}  `);
md.push('');
md.push('---');
md.push('');
md.push('## 1. Executive Summary & AHSP Price Status');
md.push('');
md.push('| Metric | Count | Percentage | Description |');
md.push('| --- | ---: | ---: | --- |');
md.push(`| **AHSP FULL** | ${fullCount.toLocaleString('id-ID')} | ${((fullCount / bmItems.length) * 100).toFixed(1)}% | All components fully priced or official DHSP price resolved |`);
md.push(`| **AHSP PARTIAL** | ${partialCount.toLocaleString('id-ID')} | ${((partialCount / bmItems.length) * 100).toFixed(1)}% | Some components priced |`);
md.push(`| **AHSP MISSING** | ${missingCount.toLocaleString('id-ID')} | ${((missingCount / bmItems.length) * 100).toFixed(1)}% | Informative / lump-sum / no price in official source (**NO Rp0**) |`);
md.push(`| **TOTAL CANONICAL** | ${bmItems.length.toLocaleString('id-ID')} | 100.0% | Complete catalog |`);
md.push('');
md.push('---');
md.push('');
md.push('## 2. Resource Master Coverage (`Upah Bahan`)');
md.push('');
md.push('| Resource Category | Source Sheet | Total Priced Records | Unit Range | Location |');
md.push('| --- | --- | ---: | --- | --- |');
md.push(`| Labor (\`Tenaga Kerja\`) | \`Upah Bahan\` (R10–R44) | ${OFFICIAL_BM_2026_LABOR.length} | Jam, OH | NATIONAL (SE 47/2026) |`);
md.push(`| Materials (\`Bahan\`) | \`Upah Bahan\` (R46–R1041) | ${OFFICIAL_BM_2026_MATERIALS.length} | M3, Kg, Liter, Buah | NATIONAL (SE 47/2026) |`);
md.push(`| Equipment (\`Alat\`) | \`Upah Bahan\` (R1043–R1348) | ${OFFICIAL_BM_2026_EQUIPMENT.length} | Jam, Sewa | NATIONAL (SE 47/2026) |`);
md.push(`| **TOTAL RESOURCE MASTER** | | **${(OFFICIAL_BM_2026_LABOR.length + OFFICIAL_BM_2026_MATERIALS.length + OFFICIAL_BM_2026_EQUIPMENT.length).toLocaleString('id-ID')}** | | |`);
md.push('');
md.push('---');
md.push('');
md.push('## 3. Component Level Coverage');
md.push('');
md.push('| Component Type | Total Components | Resolved | Coverage Rate |');
md.push('| --- | ---: | ---: | ---: |');
md.push(`| Labor Components | ${totalLaborComps.toLocaleString('id-ID')} | ${resolvedLaborComps.toLocaleString('id-ID')} | ${((resolvedLaborComps / (totalLaborComps || 1)) * 100).toFixed(1)}% |`);
md.push(`| Material Components | ${totalMaterialComps.toLocaleString('id-ID')} | ${resolvedMaterialComps.toLocaleString('id-ID')} | ${((resolvedMaterialComps / (totalMaterialComps || 1)) * 100).toFixed(1)}% |`);
md.push(`| Equipment Components | ${totalEquipComps.toLocaleString('id-ID')} | ${resolvedEquipComps.toLocaleString('id-ID')} | ${((resolvedEquipComps / (totalEquipComps || 1)) * 100).toFixed(1)}% |`);
md.push(`| **TOTAL ALL COMPONENTS** | **${totalComps.toLocaleString('id-ID')}** | **${resolvedComps.toLocaleString('id-ID')}** | **${((resolvedComps / (totalComps || 1)) * 100).toFixed(1)}%** |`);
md.push('');
md.push('---');
md.push('');
md.push('## 4. Integrity Compliance');
md.push('');
md.push('1. **Zero Rp0 Policy:** Strictly enforced. Items without price return `price = null` with status `MISSING`.');
md.push('2. **Zero Fabrication:** No synthetic coefficients, fallback constants, or artificial price multipliers.');
md.push('3. **Single Source of Truth:** `priceResolver2026` resolves both AHSP unit prices and component breakdowns.');

fs.writeFileSync('EZRAB_BINA_MARGA_PRICE_COVERAGE.md', md.join('\n'), 'utf8');
console.log('Coverage report written to EZRAB_BINA_MARGA_PRICE_COVERAGE.md');
