/**
 * EZRAB AI ESTIMATOR AGENT — VERIFICATION SUITE
 * Master Architecture: DED -> RAB 2.0
 */

import { aiEstimatorToolRegistry } from '../ded-rab-v3/agent/aiEstimatorToolRegistry';
import { dedCoverageEngine } from '../ded-rab-v3/agent/dedCoverageEngine';
import { atomicAccCommitService } from '../ded-rab-v3/agent/atomicAccCommitService';
import { AiRabItem } from '../ded-rab-v3/agent/types';
import { SafeDecimalEngine } from '../engine/safeDecimalEngine';
import { officialAhspRepository } from '../data/nationalCostDatabase/officialAhspRepository';

console.log('======================================================================');
console.log('EZRAB AI ESTIMATOR AGENT — DED -> RAB 2.0 CONTRACT VERIFICATION');
console.log('======================================================================\n');

let passCount = 0;
let failCount = 0;

function assert(condition: boolean, msg: string): void {
  if (condition) {
    console.log(`  [PASS] ${msg}`);
    passCount++;
  } else {
    console.error(`  [FAIL] ${msg}`);
    failCount++;
  }
}

// ----------------------------------------------------------------------------
// TEST GROUP 1: TOOL REGISTRY & DETERMINISTIC CALCULATIONS
// ----------------------------------------------------------------------------
console.log('--- TEST GROUP 1: TOOL REGISTRY & SAFE DECIMAL ARITHMETIC ---');

const tools = aiEstimatorToolRegistry;

// 1. Area calculation
const areaRes = tools.calculateQuantity({
  method: 'AREA',
  inputs: { length: 5.5, width: 3.2 },
});
assert(areaRes.value === 17.6, `Area 5.5m x 3.2m = 17.6 m² [got ${areaRes.value}]`);

// 2. Volume calculation
const volRes = tools.calculateQuantity({
  method: 'VOLUME',
  inputs: { length: 10, width: 0.15, height: 0.20 },
});
assert(volRes.value === 0.3, `Volume 10m x 0.15m x 0.20m = 0.3 m³ [got ${volRes.value}]`);

// 3. SNI Rebar Weight calculation
const rebarRes = tools.calculateQuantity({
  method: 'WEIGHT',
  inputs: { length: 50.10, numBars: 4, diameter: 12 },
});
// 50.10 * 4 * (0.006165 * 144) = 50.10 * 4 * 0.88776 = 177.907008 -> 177.91 kg
assert(rebarRes.value > 177 && rebarRes.value < 178, `Rebar 4D12 (50.10m) = ~177.91 kg [got ${rebarRes.value}]`);
assert(rebarRes.formula.includes('kg/m'), `Formula specifies unit weight per meter`);

// 4. Subtotal calculation via SafeDecimalEngine
const subtotal = tools.calculateItemSubtotal(177.91, 18500);
assert(subtotal === 3291335, `Subtotal 177.91 kg x Rp 18.500 = Rp 3.291.335 [got ${subtotal}]`);

// ----------------------------------------------------------------------------
// TEST GROUP 2: AHSP RESOLUTION & SPECIFICATION INTEGRITY
// ----------------------------------------------------------------------------
console.log('\n--- TEST GROUP 2: AHSP RESOLUTION & SPECIFICATION INTEGRITY ---');

// Official catalog size check
const allOfficial = officialAhspRepository.getAllOfficialAhsp();
assert(allOfficial.length === 5768, `Official AHSP repository contains 5,768 records [got ${allOfficial.length}]`);

// Pondasi lookup
const pondasiAhsp = tools.findAhsp('Pemasangan Pondasi Batu Belah 1:4', 'Batu Belah Campuran 1SP:4PP', 'm³');
assert(pondasiAhsp !== null, `Official AHSP found for Pondasi Batu Belah`);
assert(pondasiAhsp?.source === 'OFFICIAL_AHSP', `Source is OFFICIAL_AHSP`);

// Rejection of incompatible materials (Aluminium vs Kayu)
const pintuKayuMatch = tools.findAhsp('Pintu Aluminium Kaca', 'Bahan Aluminium & Multipleks HPL', 'unit');
if (pintuKayuMatch) {
  assert(!pintuKayuMatch.name.toLowerCase().includes('kamper'), `Aluminium doors are NOT matched to Pintu Kayu Kamper`);
} else {
  assert(true, `No spurious kayu match for aluminium doors`);
}

// ----------------------------------------------------------------------------
// TEST GROUP 3: PRICE RESOLUTION & ESTIMATION FALLBACK
// ----------------------------------------------------------------------------
console.log('\n--- TEST GROUP 3: PRICE RESOLUTION & NON-BLOCKING FALLBACK ---');

// Official price lookup
const priceRes = tools.findPrice({
  itemName: 'Semen Portland',
  unit: 'kg',
  allowAiEstimate: true,
});
assert(priceRes.unitPrice !== null && priceRes.unitPrice > 0, `Price found for standard material [got ${priceRes.unitPrice}]`);

// AI Estimation fallback for uncataloged items (non-blocking)
const customPrice = tools.findPrice({
  itemName: 'Ornamen Panel Akustik Kustom 3D',
  specification: 'Panel serat akustik dekoratif interior',
  unit: 'm²',
  allowAiEstimate: true,
});
assert(customPrice.unitPrice !== null && customPrice.unitPrice > 0, `AI Price Estimation resolves uncataloged item`);
assert(customPrice.source === 'AI_ESTIMATED', `Source is AI_ESTIMATED`);
assert(typeof customPrice.assumption === 'string', `Explicit assumption recorded for AI estimate`);

// ----------------------------------------------------------------------------
// TEST GROUP 4: DED COVERAGE ENGINE
// ----------------------------------------------------------------------------
console.log('\n--- TEST GROUP 4: DED COVERAGE AUDIT ---');

const mockItems: AiRabItem[] = [
  {
    id: '1',
    workItem: 'Pemasangan Lantai Keramik 40x40',
    category: 'Lantai',
    discipline: 'ARCHITECTURAL',
    description: 'Lantai Keramik',
    specification: '40x40 cm',
    quantity: 38.9,
    unit: 'm²',
    quantityFormula: '38.9 m²',
    quantitySource: 'OFFICIAL_AHSP',
    quantityEvidence: [{ pageNumber: 5, text: 'Denah Hal 5' }],
    ahspCode: 'A.4.4.3.35',
    ahspName: 'Pasang Lantai Keramik',
    ahspSource: 'OFFICIAL_AHSP',
    ahspConfidence: 'HIGH',
    materials: [],
    labor: [],
    equipment: [],
    materialSource: 'OFFICIAL_AHSP',
    laborSource: 'OFFICIAL_AHSP',
    equipmentSource: 'OFFICIAL_AHSP',
    unitPrice: 165000,
    priceSource: 'OFFICIAL_AHSP',
    priceConfidence: 'HIGH',
    subtotal: 6418500,
    standardReferences: [],
    assumptions: [],
    evidence: [{ pageNumber: 5, description: 'Denah Hal 5' }],
    confidence: 'HIGH',
    provenance: 'OFFICIAL_AHSP',
    status: 'READY',
  },
  {
    id: '2',
    workItem: 'Pondasi Batu Kali 1:4',
    category: 'Pondasi',
    discipline: 'STRUCTURAL',
    description: 'Pondasi Batu Kali',
    specification: '1:4',
    quantity: 18.5,
    unit: 'm³',
    quantityFormula: '18.5 m³',
    quantitySource: 'OFFICIAL_AHSP',
    quantityEvidence: [{ pageNumber: 18, text: 'Detail Pondasi Hal 18' }],
    ahspCode: 'A.3.2.1.2',
    ahspName: 'Pasang Pondasi Batu Kali',
    ahspSource: 'OFFICIAL_AHSP',
    ahspConfidence: 'HIGH',
    materials: [],
    labor: [],
    equipment: [],
    materialSource: 'OFFICIAL_AHSP',
    laborSource: 'OFFICIAL_AHSP',
    equipmentSource: 'OFFICIAL_AHSP',
    unitPrice: 850000,
    priceSource: 'OFFICIAL_AHSP',
    priceConfidence: 'HIGH',
    subtotal: 15725000,
    standardReferences: [],
    assumptions: [],
    evidence: [{ pageNumber: 18, description: 'Detail Pondasi Hal 18' }],
    confidence: 'HIGH',
    provenance: 'OFFICIAL_AHSP',
    status: 'READY',
  },
  {
    id: '3',
    workItem: 'Titik Lampu Downlight 18W',
    category: 'Elektrikal',
    discipline: 'MEP',
    description: 'Titik Lampu',
    specification: 'Downlight 18W',
    quantity: 9,
    unit: 'titik',
    quantityFormula: '9 titik',
    quantitySource: 'OFFICIAL_AHSP',
    quantityEvidence: [{ pageNumber: 16, text: 'Denah Elektrikal Hal 16' }],
    ahspCode: 'E.1.1.1',
    ahspName: 'Pasang Titik Lampu',
    ahspSource: 'OFFICIAL_AHSP',
    ahspConfidence: 'HIGH',
    materials: [],
    labor: [],
    equipment: [],
    materialSource: 'OFFICIAL_AHSP',
    laborSource: 'OFFICIAL_AHSP',
    equipmentSource: 'OFFICIAL_AHSP',
    unitPrice: 225000,
    priceSource: 'OFFICIAL_AHSP',
    priceConfidence: 'HIGH',
    subtotal: 2025000,
    standardReferences: [],
    assumptions: [],
    evidence: [{ pageNumber: 16, description: 'Denah Elektrikal Hal 16' }],
    confidence: 'HIGH',
    provenance: 'OFFICIAL_AHSP',
    status: 'READY',
  },
];

const mockContext: any = { pages: new Map() };
const coverage = dedCoverageEngine.evaluateCoverage(mockItems, mockContext);
assert(coverage.architectural.floor.covered === true, `Architectural floor covered`);
assert(coverage.structural.foundation.covered === true, `Structural foundation covered`);
assert(coverage.mep.electrical.covered === true, `MEP electrical covered`);
assert(coverage.overallCoveragePercent > 0, `Coverage percentage calculated [${coverage.overallCoveragePercent}%]`);

// ----------------------------------------------------------------------------
// TEST GROUP 5: ATOMIC ACC COMMIT SERVICE
// ----------------------------------------------------------------------------
console.log('\n--- TEST GROUP 5: ATOMIC ACC COMMIT SERVICE ---');

async function testCommit() {
  const commitResult = await atomicAccCommitService.commit({
    projectId: 'PRJ-TEST-ACC-01',
    projectName: 'Rumah Uji 1 Lantai',
    items: mockItems,
    userApprovedItemsOnly: true,
  });

  assert(commitResult.success === true, `Commit transaction succeeded`);
  assert(commitResult.committedItemCount === 3, `Committed 3 approved items`);
  assert(commitResult.sections.length >= 1, `Generated WBS hierarchical sections`);
  assert(commitResult.grandTotal === (6418500 + 15725000 + 2025000), `Grand total is exact sum [Rp ${commitResult.grandTotal.toLocaleString('id-ID')}]`);
  assert(commitResult.spreadsheetSyncStatus === 'SYNCED', `Spreadsheet workspace status is SYNCED`);
}

testCommit().then(() => {
  console.log('\n======================================================================');
  console.log(`TOTAL TESTS: ${passCount + failCount} | PASSED: ${passCount} | FAILED: ${failCount}`);
  console.log('======================================================================');
  if (failCount > 0) process.exit(1);
});
