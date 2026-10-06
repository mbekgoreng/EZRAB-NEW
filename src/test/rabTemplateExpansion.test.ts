/**
 * EZRAB — Universal Construction Template & Estimation Engine Test Suite
 * 
 * Verifies:
 * 1. Existing House Types (Type 36 to Type 300) Regression (All 14 models)
 * 2. 3-Tier Detail Level Engine (STANDARD ⊂ PROFESSIONAL ⊂ COMPREHENSIVE)
 * 3. Conditional Rules & Optional Works Execution (e.g. num_floors >= 2, AC, Canopy, Water heater)
 * 4. Material Ecosystem (Material !== Price, Coverage Calculation, Packaging Recommendations)
 * 5. Multi-Sector Official Library (Rigid Road, Asphalt, Paving, U-Ditch, Irigasi, Gedung, Hotel, RS, Gudang, Utilitas)
 * 6. Concrete Road Acceptance Test (1000m x 6m x 0.20m = 1200 m³ plat, 300 m³ lean concrete)
 * 7. Dedicated Paving (Perkerasan) Acceptance Test (Paving K-300 t=6cm & Heavy Duty K-350 t=8cm)
 * 8. Custom House Parametric Scaling (104.5 m², 3 bedrooms -> 4 bedrooms)
 * 9. Custom Template Lifecycle (Create, Persist, Duplicate, Delete, Official Protection)
 * 10. Traceability & Transparency Audit (Trace formulas & verified AHSP mappings)
 */

import { strict as assert } from 'assert';
import { RabTemplateService } from '../services/rabTemplateService';
import { MaterialLibraryService } from '../services/materialLibraryService';
import { RabTemplate } from '../types/rabTemplate';

// Mock localStorage for Node test environment
const storage: Record<string, string> = {};
(global as any).window = {
  localStorage: {
    getItem: (key: string) => storage[key] || null,
    setItem: (key: string, val: string) => { storage[key] = val; },
    removeItem: (key: string) => { delete storage[key]; },
    clear: () => { Object.keys(storage).forEach(k => delete storage[k]); }
  }
};
(global as any).localStorage = (global as any).window.localStorage;

async function runUniversalTemplateRabTests() {
  console.log('================================================================');
  console.log('🚀 EZRAB — UNIVERSAL TEMPLATE RAB ENGINE TEST SUITE');
  console.log('================================================================\n');

  const tplService = RabTemplateService.getInstance();
  const matService = MaterialLibraryService.getInstance();

  // -------------------------------------------------------------------------
  // TEST GROUP 1: EXISTING HOUSE TYPES REGRESSION (Type 36 s/d Type 300)
  // -------------------------------------------------------------------------
  console.log('--- TEST GROUP 1: Existing House Types Regression (Type 36 - 300) ---');
  const houseTypes = [
    { id: 'HOUSE-T36-1FL', area: 36, floors: 1, expectedTotal: 122988600, expectedItems: 26 },
    { id: 'HOUSE-T36-2FL', area: 36, floors: 2, expectedTotal: 152311600, expectedItems: 28 },
    { id: 'HOUSE-T45-1FL', area: 45, floors: 1, expectedTotal: 150664360, expectedItems: 26 },
    { id: 'HOUSE-T54-1FL', area: 54, floors: 1, expectedTotal: 179058780, expectedItems: 26 },
    { id: 'HOUSE-T60-1FL', area: 60, floors: 1, expectedTotal: 200680160, expectedItems: 26 },
    { id: 'HOUSE-T70-1FL', area: 70, floors: 1, expectedTotal: 231220740, expectedItems: 26 },
    { id: 'HOUSE-T90-2FL', area: 90, floors: 2, expectedTotal: 339429900, expectedItems: 28 },
    { id: 'HOUSE-T100-2FL', area: 100, floors: 2, expectedTotal: 377028000, expectedItems: 28 },
    { id: 'HOUSE-T120-2FL', area: 120, floors: 2, expectedTotal: 445242440, expectedItems: 28 },
    { id: 'HOUSE-T150-2FL', area: 150, floors: 2, expectedTotal: 552460580, expectedItems: 28 },
    { id: 'HOUSE-T180-2FL', area: 180, floors: 2, expectedTotal: 654743140, expectedItems: 28 },
    { id: 'HOUSE-T200-2FL', area: 200, floors: 2, expectedTotal: 726593940, expectedItems: 28 },
    { id: 'HOUSE-T250-2FL', area: 250, floors: 2, expectedTotal: 898449500, expectedItems: 28 },
    { id: 'HOUSE-T300-2FL', area: 300, floors: 2, expectedTotal: 1072322760, expectedItems: 28 }
  ];

  for (const ht of houseTypes) {
    const tpl = tplService.getTemplateById(ht.id);
    assert.ok(tpl, `Template ${ht.id} must exist in registry`);
    assert.strictEqual(tpl.category, 'RUMAH_TINGGAL');

    // Generate with default PROFESSIONAL level & no optional additions (matches original baseline)
    const result = tplService.generateRabFromTemplate(tpl, { building_area: ht.area, num_floors: ht.floors });
    assert.strictEqual(result.items.length, ht.expectedItems,
      `${ht.id} item count must match regression expectation (${ht.expectedItems}, got ${result.items.length})`);
    assert.strictEqual(result.totalEstimate, ht.expectedTotal,
      `${ht.id} total must match regression baseline (Rp ${ht.expectedTotal}, got Rp ${result.totalEstimate})`);

    // Verify floor finishing tiles are m2 and never confused with m3
    const tileItems = result.items.filter(i =>
      i.description.toLowerCase().includes('keramik') ||
      i.description.toLowerCase().includes('granit') ||
      i.description.toLowerCase().includes('tile')
    );
    for (const item of tileItems) {
      assert.notStrictEqual(item.unit, 'm3',
        `Penutup lantai / tiles must never have unit m3 (got ${item.unit} for "${item.description}")`);
    }

    console.log(`  ✓ PASSED: ${ht.id} (Luas: ${ht.area} m², Lantai: ${ht.floors}) -> ${result.items.length} items, Total: Rp ${result.totalEstimate.toLocaleString('id-ID')}`);
  }

  // -------------------------------------------------------------------------
  // TEST GROUP 2: 3-TIER DETAIL LEVEL ENGINE (STANDARD ⊂ PROFESSIONAL ⊂ COMPREHENSIVE)
  // -------------------------------------------------------------------------
  console.log('\n--- TEST GROUP 2: 3-Tier Detail Level Engine ---');
  const t70 = tplService.getTemplateById('HOUSE-T70-1FL')!;

  const stdRes = tplService.generateRabFromTemplate(t70, {}, undefined, 'STANDARD');
  const proRes = tplService.generateRabFromTemplate(t70, {}, undefined, 'PROFESSIONAL');
  const compRes = tplService.generateRabFromTemplate(t70, {}, undefined, 'COMPREHENSIVE');

  // Verify item count hierarchy
  assert.ok(stdRes.items.length < proRes.items.length,
    `STANDARD (${stdRes.items.length}) must have fewer items than PROFESSIONAL (${proRes.items.length})`);
  assert.ok(proRes.items.length < compRes.items.length,
    `PROFESSIONAL (${proRes.items.length}) must have fewer items than COMPREHENSIVE (${compRes.items.length})`);

  // Verify STANDARD is a strict subset of PROFESSIONAL
  const stdDescriptions = new Set(stdRes.items.map(i => i.description));
  const proDescriptions = new Set(proRes.items.map(i => i.description));
  const compDescriptions = new Set(compRes.items.map(i => i.description));

  for (const desc of stdDescriptions) {
    assert.ok(proDescriptions.has(desc), `Item "${desc}" in STANDARD must also be in PROFESSIONAL`);
    assert.ok(compDescriptions.has(desc), `Item "${desc}" in STANDARD must also be in COMPREHENSIVE`);
  }
  for (const desc of proDescriptions) {
    assert.ok(compDescriptions.has(desc), `Item "${desc}" in PROFESSIONAL must also be in COMPREHENSIVE`);
  }

  console.log(`  ✓ PASSED: STANDARD: ${stdRes.items.length} items (Rp ${stdRes.totalEstimate.toLocaleString('id-ID')})`);
  console.log(`  ✓ PASSED: PROFESSIONAL: ${proRes.items.length} items (Rp ${proRes.totalEstimate.toLocaleString('id-ID')})`);
  console.log(`  ✓ PASSED: COMPREHENSIVE: ${compRes.items.length} items (Rp ${compRes.totalEstimate.toLocaleString('id-ID')})`);
  console.log(`  ✓ PASSED: Mathematically verified: STANDARD ⊂ PROFESSIONAL ⊂ COMPREHENSIVE (House Type 70)`);

  // Verify multi-sector detail level hierarchy (Road, Paving, Building)
  const roadTpl = tplService.getTemplateById('INFRA-ROAD-RIGID')!;
  const roadStd = tplService.generateRabFromTemplate(roadTpl, {}, undefined, 'STANDARD');
  const roadPro = tplService.generateRabFromTemplate(roadTpl, {}, undefined, 'PROFESSIONAL');
  const roadComp = tplService.generateRabFromTemplate(roadTpl, {}, undefined, 'COMPREHENSIVE');
  assert.ok(roadStd.items.length < roadPro.items.length && roadPro.items.length < roadComp.items.length,
    `Jalan Beton: STANDARD (${roadStd.items.length}) < PRO (${roadPro.items.length}) < COMP (${roadComp.items.length})`);
  console.log(`  ✓ PASSED: Jalan Beton: ${roadStd.items.length} items < ${roadPro.items.length} items < ${roadComp.items.length} items`);

  const asphTpl = tplService.getTemplateById('INFRA-ROAD-ASPHALT')!;
  const asphStd = tplService.generateRabFromTemplate(asphTpl, {}, undefined, 'STANDARD');
  const asphPro = tplService.generateRabFromTemplate(asphTpl, {}, undefined, 'PROFESSIONAL');
  const asphComp = tplService.generateRabFromTemplate(asphTpl, {}, undefined, 'COMPREHENSIVE');
  assert.ok(asphStd.items.length < asphPro.items.length && asphPro.items.length < asphComp.items.length,
    `Jalan Aspal: STANDARD (${asphStd.items.length}) < PRO (${asphPro.items.length}) < COMP (${asphComp.items.length})`);
  console.log(`  ✓ PASSED: Jalan Aspal: ${asphStd.items.length} items < ${asphPro.items.length} items < ${asphComp.items.length} items`);

  const pavDetailTpl = tplService.getTemplateById('PAV-KOMPLEK-6CM')!;
  const pavStd = tplService.generateRabFromTemplate(pavDetailTpl, {}, undefined, 'STANDARD');
  const pavPro = tplService.generateRabFromTemplate(pavDetailTpl, {}, undefined, 'PROFESSIONAL');
  const pavComp = tplService.generateRabFromTemplate(pavDetailTpl, {}, undefined, 'COMPREHENSIVE');
  assert.ok(pavStd.items.length < pavPro.items.length && pavPro.items.length < pavComp.items.length,
    `Paving: STANDARD (${pavStd.items.length}) < PRO (${pavPro.items.length}) < COMP (${pavComp.items.length})`);
  console.log(`  ✓ PASSED: Paving Kompleks: ${pavStd.items.length} items < ${pavPro.items.length} items < ${pavComp.items.length} items`);

  const bldTpl = tplService.getTemplateById('BLD-OFFICE-MULTI')!;
  const bldStd = tplService.generateRabFromTemplate(bldTpl, {}, undefined, 'STANDARD');
  const bldPro = tplService.generateRabFromTemplate(bldTpl, {}, undefined, 'PROFESSIONAL');
  const bldComp = tplService.generateRabFromTemplate(bldTpl, {}, undefined, 'COMPREHENSIVE');
  assert.ok(bldStd.items.length < bldPro.items.length && bldPro.items.length < bldComp.items.length,
    `Gedung: STANDARD (${bldStd.items.length}) < PRO (${bldPro.items.length}) < COMP (${bldComp.items.length})`);
  console.log(`  ✓ PASSED: Gedung Kantor: ${bldStd.items.length} items < ${bldPro.items.length} items < ${bldComp.items.length} items`);

  // -------------------------------------------------------------------------
  // TEST GROUP 3: CONDITIONAL RULES & OPTIONAL WORKS
  // -------------------------------------------------------------------------
  console.log('\n--- TEST GROUP 3: Conditional Rules & Optional Works ---');
  // 1-floor vs 2-floor condition (num_floors >= 2 activates stairs & 2nd floor bondek)
  const t36_1 = tplService.getTemplateById('HOUSE-T36-1FL')!;
  const res1Fl = tplService.generateRabFromTemplate(t36_1, { building_area: 36, num_floors: 1 });
  const hasStairs1Fl = res1Fl.items.some(i => i.description.toLowerCase().includes('tangga'));
  assert.strictEqual(hasStairs1Fl, false, '1-Floor house must NOT have stairs');

  const res2Fl = tplService.generateRabFromTemplate(t36_1, { building_area: 72, num_floors: 2 });
  const hasStairs2Fl = res2Fl.items.some(i => i.description.toLowerCase().includes('tangga'));
  assert.strictEqual(hasStairs2Fl, true, '2-Floor house MUST activate conditional stairs');

  // Optional works toggle in PROFESSIONAL mode
  const withoutOpt = tplService.generateRabFromTemplate(t70, {}, undefined, 'PROFESSIONAL', []);
  const withOpt = tplService.generateRabFromTemplate(t70, {}, undefined, 'PROFESSIONAL', ['c-opt-water-heater', 'c-opt-canopy']);

  assert.strictEqual(withOpt.items.length, withoutOpt.items.length + 2, 'Toggling 2 optional items must add exactly 2 items');
  assert.ok(withOpt.totalEstimate > withoutOpt.totalEstimate, 'Estimate with optional works must be greater');
  console.log(`  ✓ PASSED: Conditional stairs activated on 2 floors; suppressed on 1 floor`);
  console.log(`  ✓ PASSED: Optional works (Water Heater + Canopy) added +2 items (+Rp ${(withOpt.totalEstimate - withoutOpt.totalEstimate).toLocaleString('id-ID')})`);

  // -------------------------------------------------------------------------
  // TEST GROUP 4: MATERIAL ECOSYSTEM (MATERIAL !== PRICE)
  // -------------------------------------------------------------------------
  console.log('\n--- TEST GROUP 4: Material Ecosystem & Coverage Calculation ---');
  // 1. Verify decoupled material catalog
  const materials = matService.getAllMaterials();
  assert.ok(materials.length >= 15, `Material library must have >= 15 materials (got ${materials.length})`);

  const tileRoman = matService.getMaterialById('MAT-KER-ROM-60');
  assert.ok(tileRoman, 'Roman tile material must exist');
  assert.strictEqual(tileRoman.brand, 'Roman');
  assert.strictEqual(tileRoman.size, '60x60 cm');

  // 2. Verify decoupled price resolution
  const priceRes = matService.getMaterialPrice('MAT-KER-ROM-60');
  assert.ok(priceRes.unitPrice > 0, 'Price must resolve from price references');
  assert.strictEqual(priceRes.source, 'OFFICIAL_PRICE_REFERENCE');
  console.log(`  ✓ PASSED: Material "${tileRoman.name}" decoupled from Price (Rp ${priceRes.unitPrice.toLocaleString('id-ID')} from ${priceRes.supplier})`);

  // 3. Verify coverage & packaging calculation for paint
  // Area 286.2 m², coverage 10 m²/L, 10% waste:
  // Base = 286.2 / 10 = 28.62 L
  // Waste = 28.62 * 0.10 = 2.86 L
  // Total = 31.48 L
  const paintCoverage = matService.calculateMaterialCoverage('MAT-CAT-DULUX-EXT', 286.2, 10);
  assert.strictEqual(paintCoverage.baseQuantity, 28.62);
  assert.strictEqual(paintCoverage.wasteQuantity, 2.86);
  assert.strictEqual(paintCoverage.totalRequired, 31.48);
  assert.ok(paintCoverage.packagingAdvice.includes('1x Pail 20 L'), 'Packaging advice must include 1x 20L Pail');
  console.log(`  ✓ PASSED: Coverage calculation: 286.2 m² paint -> Total ${paintCoverage.totalRequired} L (${paintCoverage.packagingAdvice})`);

  // 4. Project specification override test
  matService.setItemMaterialOverride('PROJ-TEST-1', 'comp-tile-1', 'MAT-GRA-GRN-60', 5, 'User requested Granite 60x60');
  const projSpec = matService.getProjectSpec('PROJ-TEST-1');
  assert.strictEqual(projSpec.itemOverrides['comp-tile-1'].materialId, 'MAT-GRA-GRN-60');
  console.log(`  ✓ PASSED: Project Material Specification override persisted successfully`);

  // -------------------------------------------------------------------------
  // TEST GROUP 5: CONCRETE ROAD ACCEPTANCE TEST (1000m x 6m x 0.20m)
  // -------------------------------------------------------------------------
  console.log('\n--- TEST GROUP 5: Concrete Road Acceptance Test ---');
  const rigidRoad = tplService.getTemplateById('INFRA-ROAD-RIGID')!;
  const roadResult = tplService.generateRabFromTemplate(rigidRoad, {
    road_length: 1000,
    road_width: 6,
    concrete_thickness_m: 0.20,
    shoulder_width: 1.0
  });

  const rigidItem = roadResult.items.find(i => i.description.includes('Perkerasan Beton Semen FS-45'));
  assert.ok(rigidItem, 'Rigid concrete item must exist');
  // 1000 m * 6 m * 0.20 m = 1200 m3
  assert.strictEqual(rigidItem.volume, 1200, `Rigid concrete volume must be exactly 1200 m3 (got ${rigidItem.volume})`);
  assert.strictEqual(rigidItem.unit, 'm3', 'Rigid concrete unit must be m3');

  const lcItem = roadResult.items.find(i => i.description.includes('Lean Concrete'));
  assert.ok(lcItem, 'Lean concrete item must exist');
  // 1000 m * 6 m * 0.05 m = 300 m3
  assert.strictEqual(lcItem.volume, 300, `Lean concrete volume must be exactly 300 m3 (got ${lcItem.volume})`);
  console.log(`  ✓ PASSED: Road 1000m x 6m -> Plat Beton: ${rigidItem.volume} m³, Lean Concrete: ${lcItem.volume} m³, Total: Rp ${roadResult.totalEstimate.toLocaleString('id-ID')}`);

  // -------------------------------------------------------------------------
  // TEST GROUP 6: DEDICATED PAVING (PERKERASAN) ACCEPTANCE TEST
  // -------------------------------------------------------------------------
  console.log('\n--- TEST GROUP 6: Dedicated Paving (Perkerasan) Acceptance Test ---');
  const pavTpl = tplService.getTemplateById('PAV-KOMPLEK-6CM');
  assert.ok(pavTpl, 'PAV-KOMPLEK-6CM must exist in PERKERASAN category');
  assert.strictEqual(pavTpl.category, 'PERKERASAN');

  const pavRes = tplService.generateRabFromTemplate(pavTpl, {
    paving_area: 500,
    curb_length: 120
  });

  const pavBlockItem = pavRes.items.find(i => i.description.includes('Paving Block K-300'));
  assert.ok(pavBlockItem, 'Paving block item must exist');
  assert.strictEqual(pavBlockItem.volume, 500, 'Paving block volume must be 500 m2');
  assert.strictEqual(pavBlockItem.unit, 'm2');

  const sandBedding = pavRes.items.find(i => i.description.includes('Pasir Alas'));
  assert.ok(sandBedding, 'Sand bedding item must exist');
  // 500 m2 * 0.05 m = 25 m3
  assert.strictEqual(sandBedding.volume, 25, 'Sand bedding volume must be 25 m3');
  assert.strictEqual(sandBedding.unit, 'm3');

  const kanstin = pavRes.items.find(i => i.description.includes('Kanstin Beton'));
  assert.ok(kanstin, 'Kanstin item must exist');
  assert.strictEqual(kanstin.volume, 120, 'Kanstin volume must be 120 m1');

  console.log(`  ✓ PASSED: Paving Kompleks: 500 m² Paving (Rp ${pavBlockItem.amount.toLocaleString('id-ID')}), 25 m³ Pasir, 120 m Kanstin -> Total Rp ${pavRes.totalEstimate.toLocaleString('id-ID')}`);

  // -------------------------------------------------------------------------
  // TEST GROUP 7: CUSTOM HOUSE PARAMETRIC SCALING (3 KT -> 4 KT)
  // -------------------------------------------------------------------------
  console.log('\n--- TEST GROUP 7: Custom House Parametric Scaling ---');
  const customHouse = tplService.getTemplateById('HOUSE-CUSTOM')!;
  const house3Kt = tplService.generateRabFromTemplate(customHouse, {
    building_area: 104.5,
    num_floors: 1,
    num_bedrooms: 3,
    num_bathrooms: 2
  });
  const house4Kt = tplService.generateRabFromTemplate(customHouse, {
    building_area: 104.5,
    num_floors: 1,
    num_bedrooms: 4,
    num_bathrooms: 2
  });

  const door3Kt = house3Kt.items.find(i => i.description.includes('Pintu Panel HPL Kamar Tidur'))!;
  const door4Kt = house4Kt.items.find(i => i.description.includes('Pintu Panel HPL Kamar Tidur'))!;
  assert.strictEqual(door3Kt.volume, 3, 'Doors for 3 KT must be 3');
  assert.strictEqual(door4Kt.volume, 4, 'Doors for 4 KT must be 4');
  assert.ok(house4Kt.totalEstimate > house3Kt.totalEstimate, '4 KT house total must scale with additional bedroom door');
  console.log(`  ✓ PASSED: 3 KT door volume = ${door3Kt.volume} -> 4 KT door volume = ${door4Kt.volume} (Deterministic scaling)`);

  // -------------------------------------------------------------------------
  // TEST GROUP 8: CUSTOM TEMPLATE LIFECYCLE (CRUD, PERSISTENCE, IMMUTABILITY)
  // -------------------------------------------------------------------------
  console.log('\n--- TEST GROUP 8: Custom Template Lifecycle ---');
  const savedCustom = tplService.saveCustomTemplate({
    name: 'Gudang Baja WF 1500 m²',
    category: 'INDUSTRI',
    subcategory: 'Gudang Logistik',
    description: 'Custom warehouse template',
    parameters: [
      { id: 'p_area', key: 'warehouse_area', label: 'Luas', type: 'NUMBER', unit: 'm²', required: true, defaultValue: 1500 }
    ],
    components: [
      {
        id: 'c-baja',
        name: 'Fabrikasi Baja WF 250',
        category: '02. STRUKTUR BAJA',
        unit: 'kg',
        calculationRule: 'warehouse_area * 28',
        variables: ['warehouse_area'],
        ahspCode: 'STR.WF.1',
        unitPrice: 36000
      }
    ]
  });

  assert.ok(savedCustom.id.startsWith('USER-TMPL-'));
  assert.strictEqual(savedCustom.metadata.source, 'USER_TEMPLATE');

  // Verify persistence
  const allCustoms = tplService.getCustomTemplates();
  assert.ok(allCustoms.some(c => c.id === savedCustom.id));

  // Duplication
  const dup = tplService.duplicateTemplate(savedCustom.id);
  assert.ok(dup.id !== savedCustom.id);

  // Immutability protection
  assert.throws(
    () => tplService.deleteCustomTemplate('HOUSE-T36-1FL'),
    /read-only/i,
    'Official template must be read-only'
  );

  // Deletion
  tplService.deleteCustomTemplate(dup.id);
  assert.strictEqual(tplService.getTemplateById(dup.id), undefined);
  console.log(`  ✓ PASSED: Create, Persist, Duplicate, Delete, and Official Immutability Protection validated`);

  // -------------------------------------------------------------------------
  // TEST GROUP 9: TRACEABILITY & TRANSPARENCY AUDIT
  // -------------------------------------------------------------------------
  console.log('\n--- TEST GROUP 9: Traceability & Transparency Audit ---');
  assert.ok(roadResult.traceability && roadResult.traceability.length > 0, 'Traceability records must be generated');
  const traceRigid = roadResult.traceability.find(t => t.description.includes('Perkerasan Beton Semen'));
  assert.ok(traceRigid, 'Trace for rigid concrete must exist');
  assert.strictEqual(traceRigid.volume, 1200);
  assert.strictEqual(traceRigid.ahspCode, 'BM.7.1.1');
  assert.strictEqual(traceRigid.priceSource, 'OFFICIAL_AHSP');
  console.log(`  ✓ PASSED: Traceability verified: Item "${traceRigid.description}" -> ${traceRigid.volume} ${traceRigid.unit} | AHSP ${traceRigid.ahspCode} | Price Source: ${traceRigid.priceSource}`);

  // -------------------------------------------------------------------------
  // TEST GROUP 10: MULTI-SECTOR EXPANSION & SUBCATEGORY VERIFICATION
  // -------------------------------------------------------------------------
  console.log('\n--- TEST GROUP 10: Multi-Sector Expansion & Subcategory Verification ---');
  const requiredCategories = [
    'RUMAH_TINGGAL',
    'JALAN_TRANSPORTASI',
    'PERKERASAN',
    'SDA_IRIGASI',
    'GEDUNG',
    'BANGUNAN_TINGGI',
    'HOTEL_HOSPITALITY',
    'KESEHATAN',
    'PENDIDIKAN',
    'INDUSTRI',
    'UTILITAS',
    'LANDSCAPE_SITE',
    'MEP_SYSTEM',
    'RENOVASI_MAINTENANCE'
  ];

  const allTemplates = tplService.getAllTemplates();
  for (const cat of requiredCategories) {
    const templatesInCat = allTemplates.filter(t => t.category === cat);
    assert.ok(templatesInCat.length > 0, `Category ${cat} must have at least 1 official template (found ${templatesInCat.length})`);
    for (const t of templatesInCat) {
      assert.ok(t.subcategory, `Template ${t.id} in ${cat} must have a defined subcategory`);
      assert.ok(t.components && t.components.length > 0, `Template ${t.id} must have components`);
    }
    console.log(`  ✓ PASSED: Category "${cat}" contains ${templatesInCat.length} templates (Subcategories: ${Array.from(new Set(templatesInCat.map(t => t.subcategory))).join(', ')})`);
  }

  // Acceptance Test on Newly Expanded Sectors
  const landscapeTpl = tplService.getTemplateById('LAND-PARK-RESIDENCE')!;
  const landscapeRes = tplService.generateRabFromTemplate(landscapeTpl, { park_area: 1000 }, undefined, 'PROFESSIONAL');
  assert.ok(landscapeRes.items.length >= 5, `Landscape template must generate >= 5 items (got ${landscapeRes.items.length})`);
  assert.ok(landscapeRes.totalEstimate > 0, `Landscape total estimate must be > 0 (got Rp ${landscapeRes.totalEstimate})`);
  console.log(`  ✓ PASSED: Landscape & Kawasan (1000 m² taman) -> ${landscapeRes.items.length} items, Total: Rp ${landscapeRes.totalEstimate.toLocaleString('id-ID')}`);

  const mepPvTpl = tplService.getTemplateById('MEP-SOLAR-PV')!;
  const mepPvRes = tplService.generateRabFromTemplate(mepPvTpl, { installed_capacity_kwp: 10 }, undefined, 'PROFESSIONAL');
  assert.ok(mepPvRes.items.some(i => i.description.includes('Modul Surya') || i.description.includes('Solar')), 'MEP PV must have solar panel item');
  console.log(`  ✓ PASSED: MEP System (PLTS Solar PV 10 kWp) -> ${mepPvRes.items.length} items, Total: Rp ${mepPvRes.totalEstimate.toLocaleString('id-ID')}`);

  const renovTpl = tplService.getTemplateById('RENOV-HOUSE-FULL')!;
  const renovRes = tplService.generateRabFromTemplate(renovTpl, { renov_area: 120 }, undefined, 'PROFESSIONAL');
  assert.ok(renovRes.items.some(i => i.description.toLowerCase().includes('pembongkaran') || i.category.toLowerCase().includes('pembongkaran')),
    'Renovasi template must include demolition / pembongkaran items');
  console.log(`  ✓ PASSED: Renovasi & Maintenance (120 m² renovasi) -> ${renovRes.items.length} items, Total: Rp ${renovRes.totalEstimate.toLocaleString('id-ID')}`);

  const boxCulvertTpl = tplService.getTemplateById('SDA-BOX-CULVERT')!;
  const boxRes = tplService.generateRabFromTemplate(boxCulvertTpl, { culvert_length: 50 }, undefined, 'PROFESSIONAL');
  assert.ok(boxRes.items.some(i => i.description.toLowerCase().includes('box culvert')), 'SDA must have box culvert item');
  console.log(`  ✓ PASSED: SDA Box Culvert (50 m) -> ${boxRes.items.length} items, Total: Rp ${boxRes.totalEstimate.toLocaleString('id-ID')}`);

  // -------------------------------------------------------------------------
  // TEST GROUP 11: MULTI-FIELD SEARCH & SUBCATEGORY FILTER AUDIT
  // -------------------------------------------------------------------------
  console.log('\n--- TEST GROUP 11: Multi-Field Search & Subcategory Filter Audit ---');

  // Search by keyword "aspal"
  const searchAspal = allTemplates.filter(t =>
    t.name.toLowerCase().includes('aspal') ||
    (t.subcategory && t.subcategory.toLowerCase().includes('aspal')) ||
    (t.components && t.components.some(c => c.name.toLowerCase().includes('aspal')))
  );
  assert.ok(searchAspal.length >= 2, `Keyword "aspal" must find at least 2 templates (found ${searchAspal.length})`);
  console.log(`  ✓ PASSED: Search "aspal" matched ${searchAspal.length} templates: ${searchAspal.map(t => t.name).join(' | ')}`);

  // Search by keyword "hotel"
  const searchHotel = allTemplates.filter(t =>
    t.name.toLowerCase().includes('hotel') ||
    t.category === 'HOTEL_HOSPITALITY' ||
    (t.subcategory && t.subcategory.toLowerCase().includes('hotel'))
  );
  assert.ok(searchHotel.length >= 2, `Keyword "hotel" must find at least 2 templates (found ${searchHotel.length})`);
  console.log(`  ✓ PASSED: Search "hotel" matched ${searchHotel.length} templates: ${searchHotel.map(t => t.name).join(' | ')}`);

  // Subcategory Isolation: JALAN_TRANSPORTASI -> "Pedestrian & Trotoar"
  const pedestrianTemplates = allTemplates.filter(t =>
    t.category === 'JALAN_TRANSPORTASI' && t.subcategory === 'Pedestrian & Trotoar'
  );
  assert.ok(pedestrianTemplates.length >= 1, 'Must find pedestrian template under JALAN_TRANSPORTASI subcategory');
  assert.strictEqual(pedestrianTemplates[0].id, 'INFRA-ROAD-PEDESTRIAN');
  console.log(`  ✓ PASSED: Subcategory isolation "Pedestrian & Trotoar" matched template "${pedestrianTemplates[0].name}"`);

  console.log('\n================================================================');
  console.log('🎉 ALL UNIVERSAL TEMPLATE RAB TESTS PASSED SUCCESSFULLY (11/11 GROUPS)');
  console.log('================================================================\n');
}

runUniversalTemplateRabTests().catch(err => {
  console.error('❌ TEST SUITE FAILED:', err);
  process.exit(1);
});

