/**
 * EZRAB — PHASE 2 CONSTRUCTION TEMPLATE LIBRARY
 * Verification & Test Suite (Comprehensive 14-Template & Engine Test Matrix)
 */

import { TemplateEngine } from '../../src/engine/templateEngine/TemplateEngine';
import { TemplateRegistry } from '../../src/engine/templateEngine/TemplateRegistry';
import { QuantityEngine } from '../../src/engine/templateEngine/QuantityEngine';
import { AhspPriceBridge } from '../../src/engine/templateEngine/AhspPriceBridge';

interface TestResult {
  scenario: string;
  passed: boolean;
  details?: string;
  error?: string;
}

const results: TestResult[] = [];

function assert(condition: boolean, scenario: string, details?: string) {
  if (condition) {
    results.push({ scenario, passed: true, details });
    console.log(`  ✓ PASSED: ${scenario}`);
  } else {
    results.push({ scenario, passed: false, error: details || 'Assertion failed' });
    console.error(`  ✗ FAILED: ${scenario} - ${details}`);
  }
}

console.log('================================================================');
console.log('STARTING PHASE 2: CONSTRUCTION TEMPLATE LIBRARY VERIFICATION');
console.log('================================================================\n');

const engine = TemplateEngine.getInstance();
const registry = TemplateRegistry.getInstance();

// ----------------------------------------------------------------
// Test Group 1: 14 Templates Registered
// ----------------------------------------------------------------
console.log('--- Test Group 1: Template Registry Audit ---');
const allTemplates = registry.getAll();
const expectedTypes = [
  'residential',
  'hotel',
  'hospital',
  'multipurpose-building',
  'office-building',
  'school',
  'mosque',
  'warehouse',
  'market',
  'parking-building',
  'road',
  'paving',
  'bridge',
  'water-structure'
];

const allPresent = expectedTypes.every(t => registry.getByType(t) !== undefined);
assert(allPresent && allTemplates.length >= 14, 'Scenario 1: All 14 construction project templates are formally registered in TemplateRegistry');

// ----------------------------------------------------------------
// Test Group 2: Natural Language Classification Matrix (All 14 Types)
// ----------------------------------------------------------------
console.log('\n--- Test Group 2: Natural Language Classification Matrix ---');

const testCases = [
  { prompt: 'Bangun rumah tinggal tipe 45 1 lantai di Surabaya', expectedType: 'residential' },
  { prompt: 'Pembangunan hotel bintang empat 6 lantai 80 kamar di Denpasar', expectedType: 'hotel' },
  { prompt: 'Pembangunan gedung rumah sakit umum 4 lantai ada IGD dan ruang operasi di Malang', expectedType: 'hospital' },
  { prompt: 'Pembangunan gedung serbaguna convention hall kapasitas 1000 orang di Bandung', expectedType: 'multipurpose-building' },
  { prompt: 'Pembangunan gedung perkantoran 4 lantai dengan curtain wall di Jakarta', expectedType: 'office-building' },
  { prompt: 'Pembangunan gedung sekolah ruang kelas belajar dan laboratorium di Sidoarjo', expectedType: 'school' },
  { prompt: 'Pembangunan masjid jami dengan kubah enamel dan menara adzan di Gresik', expectedType: 'mosque' },
  { prompt: 'Pembangunan gudang logistik rangka baja WF bentang 24m di Cikarang', expectedType: 'warehouse' },
  { prompt: 'Pembangunan pasar rakyat dengan meja los basah keramik di Solo', expectedType: 'market' },
  { prompt: 'Pembangunan gedung parkir 4 lantai struktur WF dengan ramp di Semarang', expectedType: 'parking-building' },
  { prompt: 'Pekerjaan konstruksi jalan aspal hotmix sepanjang 2 km di Pasuruan', expectedType: 'road' },
  { prompt: 'Pemasangan paving block k-300 tebal 8 cm area trotoar pejalan kaki di Madiun', expectedType: 'paving' },
  { prompt: 'Pembangunan jembatan gelagar beton prategang bentang 30 meter di Kediri', expectedType: 'bridge' },
  { prompt: 'Pekerjaan saluran irigasi pasangan batu kali dan pintu air di Banyuwangi', expectedType: 'water-structure' }
];

testCases.forEach((tc, idx) => {
  const res = engine.classifyPrompt(tc.prompt);
  assert(
    res.projectType === tc.expectedType && res.topMatch !== null && res.topMatch.confidence >= 0.65,
    `Scenario 2.${idx + 1}: Classification correctly matches "${tc.expectedType}" from prompt`
  );
});

// ----------------------------------------------------------------
// Test Group 3: WBS Hierarchy & Categories
// ----------------------------------------------------------------
console.log('\n--- Test Group 3: WBS Hierarchy & Categories ---');

// 3.1 Residential 15 WBS
const resWbs = engine.generateWbs('tmpl-building-residential', {
  num_floors: { value: 1, source: 'user_input', validationStatus: 'verified' },
  has_carport: { value: true, source: 'user_input', validationStatus: 'verified' }
});
const has15Cats = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12', '13', '14', '15'].every(c =>
  resWbs.flatItems.some(item => item.code === c && item.level === 1)
);
assert(has15Cats, 'Scenario 3.1: Residential Template has all 15 PUPR WBS categories (01 Persiapan s.d. 15 Serah Terima)');

// 3.2 Road 20 WBS
const roadWbs = engine.generateWbs('tmpl-infra-road', {
  pavement_type: { value: 'asphalt', source: 'user_input', validationStatus: 'verified' },
  has_drainage: { value: true, source: 'user_input', validationStatus: 'verified' },
  has_kerb: { value: true, source: 'user_input', validationStatus: 'verified' },
  has_markings: { value: true, source: 'user_input', validationStatus: 'verified' },
  has_signs: { value: true, source: 'user_input', validationStatus: 'verified' }
});
const has20RoadCats = Array.from({ length: 20 }, (_, i) => String(i + 1).padStart(2, '0')).every(c =>
  roadWbs.flatItems.some(item => item.code === c && item.level === 1)
);
assert(has20RoadCats, 'Scenario 3.2: Road Template has all 20 WBS categories (01 Persiapan s.d. 20 Testing/Serah Terima)');

// 3.3 Paving 11 WBS
const pavingWbs = engine.generateWbs('tmpl-infra-paving', {
  has_kanstin: { value: true, source: 'user_input', validationStatus: 'verified' },
  has_drainage: { value: true, source: 'user_input', validationStatus: 'verified' }
});
const has11PavingCats = Array.from({ length: 11 }, (_, i) => String(i + 1).padStart(2, '0')).every(c =>
  pavingWbs.flatItems.some(item => item.code === c && item.level === 1)
);
assert(has11PavingCats, 'Scenario 3.3: Paving Template has all 11 WBS categories (01 Persiapan s.d. 11 Finishing)');

// 3.4 Bridge 22 WBS
const bridgeWbs = engine.generateWbs('tmpl-infra-bridge', {
  has_pier: { value: true, source: 'user_input', validationStatus: 'verified' },
  has_approach_slab: { value: true, source: 'user_input', validationStatus: 'verified' }
});
const has22BridgeCats = Array.from({ length: 22 }, (_, i) => String(i + 1).padStart(2, '0')).every(c =>
  bridgeWbs.flatItems.some(item => item.code === c && item.level === 1)
);
assert(has22BridgeCats, 'Scenario 3.4: Bridge Template has all 22 WBS categories (01 Persiapan s.d. 22 Serah Terima)');

// ----------------------------------------------------------------
// Test Group 4: Conditional Work Items
// ----------------------------------------------------------------
console.log('\n--- Test Group 4: Conditional Work Items ---');

// 4.1 Hotel: Pool, Lift, Ballroom, Basement conditionals
const hotelWithAll = engine.generateWbs('tmpl-building-hotel', {
  has_pool: { value: true, source: 'user_input', validationStatus: 'verified' },
  has_lift: { value: true, source: 'user_input', validationStatus: 'verified' },
  has_ballroom: { value: true, source: 'user_input', validationStatus: 'verified' },
  has_basement: { value: true, source: 'user_input', validationStatus: 'verified' }
});
const hotelWithout = engine.generateWbs('tmpl-building-hotel', {
  has_pool: { value: false, source: 'user_input', validationStatus: 'verified' },
  has_lift: { value: false, source: 'user_input', validationStatus: 'verified' },
  has_ballroom: { value: false, source: 'user_input', validationStatus: 'verified' },
  has_basement: { value: false, source: 'user_input', validationStatus: 'verified' }
});

const hotelHasPool = hotelWithAll.flatItems.some(i => i.code === '09');
const hotelNoPool = !hotelWithout.flatItems.some(i => i.code === '09');
const hotelHasBallroom = hotelWithAll.flatItems.some(i => i.code === '08');
const hotelNoBallroom = !hotelWithout.flatItems.some(i => i.code === '08');

assert(hotelHasPool && hotelNoPool && hotelHasBallroom && hotelNoBallroom, 'Scenario 4.1: Hotel conditional facilities (pool, ballroom, basement) filter out cleanly');

// 4.2 Mosque: Minaret and Dome conditionals
const mosqueFull = engine.generateWbs('tmpl-building-mosque', {
  has_dome: { value: true, source: 'user_input', validationStatus: 'verified' },
  has_minaret: { value: true, source: 'user_input', validationStatus: 'verified' }
});
const mosqueSimple = engine.generateWbs('tmpl-building-mosque', {
  has_dome: { value: false, source: 'user_input', validationStatus: 'verified' },
  has_minaret: { value: false, source: 'user_input', validationStatus: 'verified' }
});
assert(
  mosqueFull.flatItems.some(i => i.code === '02') &&
  mosqueFull.flatItems.some(i => i.code === '03') &&
  !mosqueSimple.flatItems.some(i => i.code === '02') &&
  !mosqueSimple.flatItems.some(i => i.code === '03'),
  'Scenario 4.2: Mosque dome and minaret are strictly optional/conditional'
);

// 4.3 Road: Concrete vs Asphalt
const roadAsphalt = engine.generateWbs('tmpl-infra-road', {
  pavement_type: { value: 'asphalt', source: 'user_input', validationStatus: 'verified' }
});
const roadConcrete = engine.generateWbs('tmpl-infra-road', {
  pavement_type: { value: 'concrete', source: 'user_input', validationStatus: 'verified' }
});
assert(
  roadAsphalt.flatItems.some(i => i.code === '12.01') &&
  !roadAsphalt.flatItems.some(i => i.code === '12.02') &&
  roadConcrete.flatItems.some(i => i.code === '12.02') &&
  !roadConcrete.flatItems.some(i => i.code === '12.01'),
  'Scenario 4.3: Road pavement types (asphalt vs concrete) conditionally toggle'
);

// 4.4 Water Structure Variants
const waterDrainage = engine.generateWbs('tmpl-infra-water', {
  water_variant: { value: 'drainage', source: 'user_input', validationStatus: 'verified' }
});
const waterIrrigation = engine.generateWbs('tmpl-infra-water', {
  water_variant: { value: 'irrigation-channel', source: 'user_input', validationStatus: 'verified' }
});
const waterBox = engine.generateWbs('tmpl-infra-water', {
  water_variant: { value: 'box-culvert', source: 'user_input', validationStatus: 'verified' }
});
assert(
  waterDrainage.flatItems.some(i => i.code === '03.02') &&
  !waterDrainage.flatItems.some(i => i.code === '03.01') &&
  waterIrrigation.flatItems.some(i => i.code === '03.01') &&
  !waterIrrigation.flatItems.some(i => i.code === '03.02') &&
  waterBox.flatItems.some(i => i.code === '03.03'),
  'Scenario 4.4: Water Structure variants dynamically change WBS structure'
);

// ----------------------------------------------------------------
// Test Group 5: Quantity Engine & Source Tracking
// ----------------------------------------------------------------
console.log('\n--- Test Group 5: Quantity Engine & Source Tracking ---');

const quantities = QuantityEngine.calculateQuantities(
  registry.getById('tmpl-building-residential')!,
  { building_area: { value: 100, source: 'user_input', validationStatus: 'verified' }, num_floors: { value: 1, source: 'user_input', validationStatus: 'verified' } },
  false
);

// Check source is 'calculated', NOT 'ded_extracted'
const qCleaning = quantities['01.01.01'];
const qWalls = quantities['04.01.01'];

assert(
  qCleaning !== undefined &&
  qCleaning.quantity === 120 && // 100 * 1.2
  qCleaning.source === 'calculated' &&
  qWalls !== undefined &&
  qWalls.quantity === 280, // 100 * 2.8
  'Scenario 5.1: Parametric quantities calculated accurately with honest source: "calculated"'
);

// If DED is available, verify it marks 'ded_extracted'
const quantitiesDed = QuantityEngine.calculateQuantities(
  registry.getById('tmpl-building-residential')!,
  { building_area: { value: 100, source: 'user_input', validationStatus: 'verified' } },
  true
);
assert(
  quantitiesDed['01.01.01'].source === 'ded_extracted',
  'Scenario 5.2: DED extracted quantities are strictly marked only when DED is available'
);

// ----------------------------------------------------------------
// Test Group 6: AHSP Bridge & Regional Pricing
// ----------------------------------------------------------------
console.log('\n--- Test Group 6: AHSP Bridge & Regional Pricing ---');

const flatItems = resWbs.flatItems;
const rabSurabaya = AhspPriceBridge.mapToRabItems(flatItems, quantities, 'Surabaya', 'Jawa Timur');
const rabPapua = AhspPriceBridge.mapToRabItems(flatItems, quantities, 'Jayapura', 'Papua');

const bowplankSby = rabSurabaya.find(r => r.code === '01.02.02');
const bowplankPapua = rabPapua.find(r => r.code === '01.02.02');

assert(
  bowplankSby !== undefined &&
  bowplankSby.ahspStatus === 'verified' &&
  bowplankSby.priceSource === 'verified_database' &&
  bowplankPapua !== undefined &&
  bowplankPapua.unitPrice > bowplankSby.unitPrice,
  'Scenario 6.1: AHSP Bridge verifies PUPR codes and applies regional price multiplier'
);

// Check unmapped item marks needs_verification
const unmappedItem = rabSurabaya.find(r => r.code === '14.01.01'); // Mailbox / bel pintu
assert(
  unmappedItem !== undefined &&
  unmappedItem.ahspStatus === 'needs_verification' &&
  unmappedItem.priceSource === 'ai_estimate',
  'Scenario 6.2: Unmapped items are marked "needs_verification" with "ai_estimate" price label without fake AHSP'
);

// ----------------------------------------------------------------
// Test Group 7: End-to-End Generation & Spreadsheet Readiness
// ----------------------------------------------------------------
console.log('\n--- Test Group 7: End-to-End Generation & Spreadsheet Readiness ---');

const processed = engine.processPrompt('Bangun rumah tipe 70 2 lantai di Malang dengan carport');
assert(
  processed.rabItems.length > 0 &&
  processed.totalRabEstimate > 0 &&
  processed.rabItems.every(item => item.id && item.name && typeof item.unitPrice === 'number' && typeof item.totalPrice === 'number'),
  'Scenario 7.1: Full processPrompt produces valid RAB items and non-zero total estimate'
);

// Deduplication test: Running prompt twice does not duplicate rows
const run1 = engine.processPrompt('Bangun rumah tipe 36 di Surabaya');
const run2 = engine.processPrompt('Bangun rumah tipe 36 di Surabaya');
assert(
  run1.rabItems.length === run2.rabItems.length &&
  run1.totalRabEstimate === run2.totalRabEstimate,
  'Scenario 7.2: Idempotent generation prevents double-generation item duplication'
);

// ----------------------------------------------------------------
// Summary
// ----------------------------------------------------------------
console.log('\n================================================================');
const passedCount = results.filter(r => r.passed).length;
const failedCount = results.filter(r => !r.passed).length;
console.log(`TOTAL SCENARIOS RUN: ${results.length} | PASSED: ${passedCount} | FAILED: ${failedCount}`);
console.log('================================================================\n');

if (failedCount > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
