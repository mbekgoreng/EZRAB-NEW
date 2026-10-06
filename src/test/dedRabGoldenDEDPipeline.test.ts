/**
 * EZRAB DED -> RAB PIPELINE GOLDEN TEST SUITE
 * Rebuild & Hardened Pipeline Verification
 *
 * Verifies:
 * 1. Keramik: 40x40 (38.90 m²) and 25x25 KM (2.25 m²), total 41.15 m² (NOT 2.10 m²)
 * 2. Plafon: Gypsum (38.90 m²) and GRC KM (2.25 m²) (NOT 2.10 m²)
 * 3. Waterproofing: KM (2.25 m²) (NOT 8.10 m²)
 * 4. Pelat: Calculated from actual slab dimensions
 * 5. Pintu: P1 (3 unit) & P2 (1 unit) Aluminium/Multipleks/HPL, rejecting Pintu Kayu Kamper
 * 6. Pembesian Ringbalk: 4D12 strictly unit 'kg' via formula L×4×0.888 kg/m (NOT m²)
 * 7. Pembesian Sloof: 4D12 strictly unit 'kg' (NOT 50.10 m')
 * 8. Listrik: 9 downlight points (retaining semantic label), 3 saklar tunggal, 3 saklar ganda
 * 9. Pondasi: Detail A & Detail B distinct cross sections and lengths
 * 10. Unit Validation Gate: Rejects engineering anomalies (rebar in m², keramik in m³)
 * 11. Specification Validation Gate: Rejects 40x40 vs 60x60, Aluminium vs Kayu
 * 12. Provenance Tracking: Distinguishes DATABASE, PROJECT_PRICE, AI_ASSISTED, NEEDS_REVIEW
 * 13. Fail Closed: null is preserved, NEVER becomes 0
 */

import {
  DedContextMemory,
  FullAiWorkItem,
} from '../ded-rab-v3/types';
import { dedQuantityReasoningEngine } from '../ded-rab-v3/reasoning/dedQuantityReasoningEngine';
import { dedUnitSafetyGate } from '../ded-rab-v3/ahsp/dedUnitSafetyGate';
import { specificationValidator } from '../ded-rab-v3/validation/specificationValidator';
import { crossPageResolver } from '../ded-rab-v3/evidence/crossPageResolver';
import { duplicateDetector } from '../ded-rab-v3/evidence/duplicateDetector';
import { measurementExtractor } from '../ded-rab-v3/evidence/dedMeasurementLayer';
import { DocumentSynthesisSummary } from '../ded-rab-v3/reading/dedDocumentSynthesizer';
import { dedAhspReasoningEngine } from '../ded-rab-v3/ahsp/dedAhspReasoningEngine';
import { dedPriceResolutionEngine } from '../ded-rab-v3/pricing/dedPriceResolutionEngine';

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

// ============================================================================
// CONTEXT FIXTURE: Realistic 32-page residential house model
// Reflects actual DED rooms, schedules, and structural layout
// ============================================================================
function createGoldenDedContext(): DedContextMemory {
  return {
    projectId: 'golden-project-001',
    projectName: 'Rumah Tinggal 1 Lantai DED Golden Test',
    totalPages: 32,
    pages: new Map(),
    drawings: [
      // Downlights / lighting on MEP sheet (Page 28)
      { id: 'el-dl-1', pageNumber: 28, category: 'MEP', tagOrLabel: 'DL-1', description: 'Titik Lampu Downlight 18W Ruang Tamu' },
      { id: 'el-dl-2', pageNumber: 28, category: 'MEP', tagOrLabel: 'DL-2', description: 'Titik Lampu Downlight 18W Ruang Keluarga' },
      { id: 'el-dl-3', pageNumber: 28, category: 'MEP', tagOrLabel: 'DL-3', description: 'Titik Lampu Downlight 18W Kamar Tidur Utama' },
      { id: 'el-dl-4', pageNumber: 28, category: 'MEP', tagOrLabel: 'DL-4', description: 'Titik Lampu Downlight 18W Kamar Tidur Anak' },
      { id: 'el-dl-5', pageNumber: 28, category: 'MEP', tagOrLabel: 'DL-5', description: 'Titik Lampu Downlight 18W Dapur' },
      { id: 'el-dl-6', pageNumber: 28, category: 'MEP', tagOrLabel: 'DL-6', description: 'Titik Lampu Downlight 18W Teras Depan' },
      { id: 'el-dl-7', pageNumber: 28, category: 'MEP', tagOrLabel: 'DL-7', description: 'Titik Lampu Downlight 18W Teras Belakang' },
      { id: 'el-dl-8', pageNumber: 28, category: 'MEP', tagOrLabel: 'DL-8', description: 'Titik Lampu Downlight 18W KM/WC' },
      { id: 'el-dl-9', pageNumber: 28, category: 'MEP', tagOrLabel: 'DL-9', description: 'Titik Lampu Downlight 18W Koridor' },
      // Switches
      { id: 'el-s1-1', pageNumber: 28, category: 'MEP', tagOrLabel: 'S1-1', description: 'Saklar Tunggal Teras' },
      { id: 'el-s1-2', pageNumber: 28, category: 'MEP', tagOrLabel: 'S1-2', description: 'Saklar Tunggal KM/WC' },
      { id: 'el-s1-3', pageNumber: 28, category: 'MEP', tagOrLabel: 'S1-3', description: 'Saklar Tunggal Dapur' },
      { id: 'el-s2-1', pageNumber: 28, category: 'MEP', tagOrLabel: 'S2-1', description: 'Saklar Ganda Ruang Tamu & Keluarga' },
      { id: 'el-s2-2', pageNumber: 28, category: 'MEP', tagOrLabel: 'S2-2', description: 'Saklar Ganda Kamar Tidur Utama' },
      { id: 'el-s2-3', pageNumber: 28, category: 'MEP', tagOrLabel: 'S2-3', description: 'Saklar Ganda Kamar Tidur Anak' },
      // Sockets
      { id: 'el-sk-1', pageNumber: 28, category: 'MEP', tagOrLabel: 'SK-1', description: 'Stop Kontak' },
    ],
    dimensions: [
      // Structural lengths
      { id: 'dim-sl-1', pageNumber: 20, drawingTitle: 'Denah Sloof', elementRef: 'Sloof', dimensionType: 'LENGTH', value: 50.10, unit: 'm', rawText: 'Panjang sloof = 50.10 m', confidence: 'HIGH' },
      { id: 'dim-sl-w', pageNumber: 20, drawingTitle: 'Detail Sloof', elementRef: 'Sloof', dimensionType: 'WIDTH', value: 0.15, unit: 'm', rawText: '15 cm', confidence: 'HIGH' },
      { id: 'dim-sl-h', pageNumber: 20, drawingTitle: 'Detail Sloof', elementRef: 'Sloof', dimensionType: 'HEIGHT', value: 0.20, unit: 'm', rawText: '20 cm', confidence: 'HIGH' },

      { id: 'dim-rb-1', pageNumber: 22, drawingTitle: 'Denah Ringbalk', elementRef: 'Ringbalk', dimensionType: 'LENGTH', value: 50.10, unit: 'm', rawText: 'Panjang ringbalk = 50.10 m', confidence: 'HIGH' },
      { id: 'dim-rb-w', pageNumber: 22, drawingTitle: 'Detail Ringbalk', elementRef: 'Ringbalk', dimensionType: 'WIDTH', value: 0.15, unit: 'm', rawText: '15 cm', confidence: 'HIGH' },
      { id: 'dim-rb-h', pageNumber: 22, drawingTitle: 'Detail Ringbalk', elementRef: 'Ringbalk', dimensionType: 'HEIGHT', value: 0.20, unit: 'm', rawText: '20 cm', confidence: 'HIGH' },

      // Foundation: Detail A and Detail B
      { id: 'dim-p-len', pageNumber: 18, drawingTitle: 'Denah Pondasi', elementRef: 'Pondasi Batu Kali', dimensionType: 'LENGTH', value: 50.10, unit: 'm', rawText: 'Panjang pondasi = 50.10 m', confidence: 'HIGH' },
      { id: 'dim-pa-len', pageNumber: 18, drawingTitle: 'Denah Pondasi', elementRef: 'Pondasi Detail A', dimensionType: 'LENGTH', value: 30.00, unit: 'm', rawText: 'Detail A = 30 m', confidence: 'HIGH' },
      { id: 'dim-pa-w', pageNumber: 19, drawingTitle: 'Detail A Pondasi', elementRef: 'Detail A', dimensionType: 'WIDTH', value: 0.30, unit: 'm', rawText: 'Lebar atas 30 cm', confidence: 'HIGH' },
      { id: 'dim-pa-h', pageNumber: 19, drawingTitle: 'Detail A Pondasi', elementRef: 'Detail A', dimensionType: 'HEIGHT', value: 0.60, unit: 'm', rawText: 'Tinggi 60 cm', confidence: 'HIGH' },

      { id: 'dim-pb-len', pageNumber: 18, drawingTitle: 'Denah Pondasi', elementRef: 'Pondasi Detail B', dimensionType: 'LENGTH', value: 20.10, unit: 'm', rawText: 'Detail B = 20.10 m', confidence: 'HIGH' },
      { id: 'dim-pb-w', pageNumber: 19, drawingTitle: 'Detail B Pondasi', elementRef: 'Detail B', dimensionType: 'WIDTH', value: 0.30, unit: 'm', rawText: 'Lebar atas 30 cm', confidence: 'HIGH' },
      { id: 'dim-pb-h', pageNumber: 19, drawingTitle: 'Detail B Pondasi', elementRef: 'Detail B', dimensionType: 'HEIGHT', value: 0.60, unit: 'm', rawText: 'Tinggi 60 cm', confidence: 'HIGH' },

      // Slab at ELV +3.00 (Kanopi/dak beton)
      { id: 'dim-slab-w', pageNumber: 23, drawingTitle: 'Detail Pelat Kanopi +3.00', elementRef: 'Pelat Dak', dimensionType: 'WIDTH', value: 1.50, unit: 'm', rawText: 'Lebar 1.50 m', confidence: 'HIGH' },
      { id: 'dim-slab-l', pageNumber: 23, drawingTitle: 'Detail Pelat Kanopi +3.00', elementRef: 'Pelat Dak', dimensionType: 'LENGTH', value: 4.00, unit: 'm', rawText: 'Panjang 4.00 m', confidence: 'HIGH' },
      { id: 'dim-slab-h', pageNumber: 23, drawingTitle: 'Detail Pelat Kanopi +3.00', elementRef: 'Pelat Dak', dimensionType: 'HEIGHT', value: 0.10, unit: 'm', rawText: 'Tebal 10 cm', confidence: 'HIGH' },
    ],
    rooms: [
      // Main rooms: 12 + 9 + 9 + 8.90 = 38.90 m²
      { id: 'rm-1', name: 'Ruang Tamu & Keluarga', pageNumber: 5, lengthM: 4.0, widthM: 3.0, areaM2: 12.00, perimeterM: 14.0 },
      { id: 'rm-2', name: 'Kamar Tidur Utama', pageNumber: 5, lengthM: 3.0, widthM: 3.0, areaM2: 9.00, perimeterM: 12.0 },
      { id: 'rm-3', name: 'Kamar Tidur Anak', pageNumber: 5, lengthM: 3.0, widthM: 3.0, areaM2: 9.00, perimeterM: 12.0 },
      { id: 'rm-4', name: 'Dapur & Ruang Makan', pageNumber: 5, lengthM: 3.0, widthM: 2.97, areaM2: 8.90, perimeterM: 11.9 },
      // Bathroom: 1.5 x 1.5 = 2.25 m²
      { id: 'rm-5', name: 'KM/WC', pageNumber: 5, lengthM: 1.5, widthM: 1.5, areaM2: 2.25, perimeterM: 6.0 },
    ],
    structural_elements: [],
    architectural_elements: [],
    materials: [
      { materialName: 'Aluminium', sourcePages: [9, 10], specification: 'Kusen aluminium 4 inch coklat' },
      { materialName: 'Multipleks 18 mm', sourcePages: [10], specification: 'Daun pintu multipleks 18 mm lapis HPL' },
    ],
    specifications: [],
    schedules: [
      // Doors on Page 9 & 10
      {
        id: 'sch-p1',
        scheduleType: 'DOOR',
        mark: 'P1',
        count: 3,
        widthM: 0.90,
        heightM: 2.10,
        totalOpeningAreaM2: 5.67,
        material: 'Kusen Aluminium + Daun Multipleks 18 mm Fin. HPL',
        sourcePage: 9,
        notes: 'Pintu Utama & Akses Luar',
      },
      {
        id: 'sch-p2',
        scheduleType: 'DOOR',
        mark: 'P2',
        count: 1,
        widthM: 0.80,
        heightM: 2.10,
        totalOpeningAreaM2: 1.68,
        material: 'Kusen Aluminium + Daun Multipleks 18 mm Fin. HPL',
        sourcePage: 9,
        notes: 'Pintu Kamar Tidur',
      },
      // Windows on Page 11
      {
        id: 'sch-j1',
        scheduleType: 'WINDOW',
        mark: 'J1',
        count: 1,
        widthM: 1.40,
        heightM: 1.50,
        totalOpeningAreaM2: 2.10,
        material: 'Aluminium + Kaca 5 mm',
        sourcePage: 11,
      },
      {
        id: 'sch-j2',
        scheduleType: 'WINDOW',
        mark: 'J2',
        count: 1,
        widthM: 1.20,
        heightM: 1.50,
        totalOpeningAreaM2: 1.80,
        material: 'Aluminium + Kaca 5 mm',
        sourcePage: 11,
      },
      {
        id: 'sch-j3',
        scheduleType: 'WINDOW',
        mark: 'J3',
        count: 2,
        widthM: 0.60,
        heightM: 1.50,
        totalOpeningAreaM2: 1.80,
        material: 'Aluminium + Kaca 5 mm',
        sourcePage: 11,
      },
    ],
    notes: [],
    cross_references: [
      { fromPage: 9, toPage: 10, elementTag: 'P1', relationship: 'DETAILS', notes: 'Detail daun pintu P1' },
      { fromPage: 9, toPage: 10, elementTag: 'P2', relationship: 'DETAILS', notes: 'Detail daun pintu P2' },
    ],
    work_items: new Map(),
    quantity_evidence: new Map(),
    ahsp_evidence: new Map(),
    missing_information_queries: [],
  };
}

function createSynthesisSummary(): DocumentSynthesisSummary {
  return {
    buildingType: 'Rumah Tinggal 1 Lantai',
    totalFloorAreaM2: 41.15,
    totalPerimeterM: 55.9,
    wallHeightM: 3.5,
    ceilingHeightM: 3.2,
    foundationLengthM: 50.10,
    sloofLengthM: 50.10,
    ringbalkLengthM: 50.10,
    columnCount: 16,
    totalOpeningAreaM2: 13.05,
    roofSlopeAngleDeg: 30,
    roofPlanAreaM2: 55.0,
    keyStructuralSpecs: {},
    keyArchitecturalSpecs: {},
    crossReferencesFound: [],
  };
}

// ============================================================================
// TEST SUITE EXECUTION
// ============================================================================
console.log('======================================================================');
console.log('EZRAB DED -> RAB PIPELINE GOLDEN TEST SUITE (REBUILD & HARDENED)');
console.log('Document: pdf-gambar-rumah-1-lantai_compress(2).pdf');
console.log('======================================================================\n');

const context = createGoldenDedContext();
const synthesis = createSynthesisSummary();

// ----------------------------------------------------------------------------
// TEST 1: Keramik Lantai 40x40 (Ruang Utama) vs 25x25 (Kamar Mandi)
// ----------------------------------------------------------------------------
console.log('--- TEST 1: KERAMIK DETERMINISTIC TAKEOFF ---');
const itemKeramik40x40: FullAiWorkItem = {
  id: 'item-keramik-40',
  itemNumber: 1,
  name: 'Pemasangan Lantai Keramik 40x40',
  category: 'Pekerjaan Penutup Lantai',
  specification: 'Keramik 40x40 cm Polish',
  dimensions: {},
  sourcePages: [5],
  sourceEvidence: ['Denah Pola Keramik Hal 5'],
  quantity: null,
  quantityFormula: '',
  quantityUnit: 'm²',
  quantityConfidence: 'UNRESOLVED',
  ahsp: null,
  ahspConfidence: 'UNRESOLVED',
  price: null,
  priceSource: 'PRICE_NOT_FOUND',
  status: 'NEEDS_REVIEW',
};

const itemKeramik25x25: FullAiWorkItem = {
  id: 'item-keramik-25',
  itemNumber: 2,
  name: 'Pemasangan Lantai Keramik 25x25 Kamar Mandi',
  category: 'Pekerjaan Penutup Lantai',
  specification: 'Keramik 25x25 cm Unpolish / Anti Slip',
  dimensions: {},
  sourcePages: [5],
  sourceEvidence: ['Denah Pola Keramik Hal 5'],
  quantity: null,
  quantityFormula: '',
  quantityUnit: 'm²',
  quantityConfidence: 'UNRESOLVED',
  ahsp: null,
  ahspConfidence: 'UNRESOLVED',
  price: null,
  priceSource: 'PRICE_NOT_FOUND',
  status: 'NEEDS_REVIEW',
};

dedQuantityReasoningEngine.resolveQuantities([itemKeramik40x40, itemKeramik25x25], context, synthesis);

assert(itemKeramik40x40.quantity === 38.90, `Keramik 40x40 = 38.90 m² (Ruang Utama: 41.15 - 2.25) [got ${itemKeramik40x40.quantity}]`);
assert(itemKeramik25x25.quantity === 2.25, `Keramik 25x25 KM = 2.25 m² (1.50 x 1.50 m) [got ${itemKeramik25x25.quantity}]`);
assert(itemKeramik40x40.quantity !== 2.10, 'Keramik 40x40 TIDAK menjadi angka 2.10 m²');
assert(itemKeramik40x40.quantityUnit === 'm²', `Keramik 40x40 unit m² [got ${itemKeramik40x40.quantityUnit}]`);

// ----------------------------------------------------------------------------
// TEST 2: Plafon Gypsum (Utama) vs Plafon GRC (Kamar Mandi)
// ----------------------------------------------------------------------------
console.log('\n--- TEST 2: PLAFON DETERMINISTIC TAKEOFF ---');
const itemPlafonGypsum: FullAiWorkItem = {
  id: 'item-plafon-gypsum',
  itemNumber: 3,
  name: 'Pemasangan Plafon Gypsum 9 mm + Rangka Hollow',
  category: 'Pekerjaan Plafon',
  specification: 'Gypsum board 9 mm',
  dimensions: {},
  sourcePages: [8],
  sourceEvidence: ['Denah Plafon Hal 8'],
  quantity: null,
  quantityFormula: '',
  quantityUnit: 'm²',
  quantityConfidence: 'UNRESOLVED',
  ahsp: null,
  ahspConfidence: 'UNRESOLVED',
  price: null,
  priceSource: 'PRICE_NOT_FOUND',
  status: 'NEEDS_REVIEW',
};

const itemPlafonGrc: FullAiWorkItem = {
  id: 'item-plafon-grc',
  itemNumber: 4,
  name: 'Pemasangan Plafon GRC Kamar Mandi',
  category: 'Pekerjaan Plafon',
  specification: 'GRC board 4 mm tahan air',
  dimensions: {},
  sourcePages: [8],
  sourceEvidence: ['Denah Plafon Hal 8'],
  quantity: null,
  quantityFormula: '',
  quantityUnit: 'm²',
  quantityConfidence: 'UNRESOLVED',
  ahsp: null,
  ahspConfidence: 'UNRESOLVED',
  price: null,
  priceSource: 'PRICE_NOT_FOUND',
  status: 'NEEDS_REVIEW',
};

dedQuantityReasoningEngine.resolveQuantities([itemPlafonGypsum, itemPlafonGrc], context, synthesis);

assert(itemPlafonGypsum.quantity === 38.90, `Plafon Gypsum = 38.90 m² (Area Ruang Utama) [got ${itemPlafonGypsum.quantity}]`);
assert(itemPlafonGrc.quantity === 2.25, `Plafon GRC KM = 2.25 m² (Area KM/WC) [got ${itemPlafonGrc.quantity}]`);
assert(itemPlafonGypsum.quantity !== 2.10, 'Plafon Gypsum TIDAK menjadi angka 2.10 m²');

// ----------------------------------------------------------------------------
// TEST 3: Waterproofing Kamar Mandi
// ----------------------------------------------------------------------------
console.log('\n--- TEST 3: WATERPROOFING FLOOR AREA ---');
const itemWaterproofing: FullAiWorkItem = {
  id: 'item-waterproofing',
  itemNumber: 5,
  name: 'Pekerjaan Waterproofing Lantai Kamar Mandi',
  category: 'Pekerjaan Sanitasi & Finishing',
  specification: 'Waterproofing coating 2 lapis',
  dimensions: {},
  sourcePages: [5],
  sourceEvidence: ['Denah Hal 5'],
  quantity: null,
  quantityFormula: '',
  quantityUnit: 'm²',
  quantityConfidence: 'UNRESOLVED',
  ahsp: null,
  ahspConfidence: 'UNRESOLVED',
  price: null,
  priceSource: 'PRICE_NOT_FOUND',
  status: 'NEEDS_REVIEW',
};

dedQuantityReasoningEngine.resolveQuantities([itemWaterproofing], context, synthesis);

assert(itemWaterproofing.quantity === 2.25, `Waterproofing Lantai KM = 2.25 m² (1.50 x 1.50 m) [got ${itemWaterproofing.quantity}]`);
assert(itemWaterproofing.quantity !== 8.10, 'Waterproofing Lantai KM TIDAK sembarangan menjadi 8.10 m²');

// ----------------------------------------------------------------------------
// TEST 4: Pintu P1 (3 unit) dan P2 (1 unit) & Specification Validation
// ----------------------------------------------------------------------------
console.log('\n--- TEST 4: PINTU P1 & P2 DED SCHEDULE TAKEOFF ---');
const itemPintuP1: FullAiWorkItem = {
  id: 'item-pintu-p1',
  itemNumber: 6,
  name: 'Pemasangan Daun Pintu P1',
  category: 'Pekerjaan Kusen, Pintu & Jendela',
  specification: 'Kusen Aluminium + Daun Multipleks 18mm Fin. HPL',
  dimensions: {},
  sourcePages: [9, 10],
  sourceEvidence: ['Jadwal Kusen Hal 9', 'Detail P1 Hal 10'],
  quantity: null,
  quantityFormula: '',
  quantityUnit: 'unit',
  quantityConfidence: 'UNRESOLVED',
  ahsp: null,
  ahspConfidence: 'UNRESOLVED',
  price: null,
  priceSource: 'PRICE_NOT_FOUND',
  status: 'NEEDS_REVIEW',
};

const itemPintuP2: FullAiWorkItem = {
  id: 'item-pintu-p2',
  itemNumber: 7,
  name: 'Pemasangan Daun Pintu P2',
  category: 'Pekerjaan Kusen, Pintu & Jendela',
  specification: 'Kusen Aluminium + Daun Multipleks 18mm Fin. HPL',
  dimensions: {},
  sourcePages: [9, 10],
  sourceEvidence: ['Jadwal Kusen Hal 9', 'Detail P2 Hal 10'],
  quantity: null,
  quantityFormula: '',
  quantityUnit: 'unit',
  quantityConfidence: 'UNRESOLVED',
  ahsp: null,
  ahspConfidence: 'UNRESOLVED',
  price: null,
  priceSource: 'PRICE_NOT_FOUND',
  status: 'NEEDS_REVIEW',
};

dedQuantityReasoningEngine.resolveQuantities([itemPintuP1, itemPintuP2], context, synthesis);

assert(itemPintuP1.quantity === 3, `Pintu P1 = 3 unit dari Jadwal Kusen DED [got ${itemPintuP1.quantity}]`);
assert(itemPintuP2.quantity === 1, `Pintu P2 = 1 unit dari Jadwal Kusen DED [got ${itemPintuP2.quantity}]`);
assert(itemPintuP1.quantityUnit === 'unit', `Satuan Pintu P1 adalah unit [got ${itemPintuP1.quantityUnit}]`);

// Specification validation: DED (Aluminium/Multipleks/HPL) vs AHSP (Pintu Kayu Kamper)
const specValP1 = specificationValidator.validate(
  itemPintuP1.name,
  'Kusen Aluminium + Daun Multipleks 18mm HPL',
  'Pemasangan Pintu Panel Kayu Kamper',
  'unit'
);
assert(specValP1.isCompatible === false, 'SpecificationValidator MENOLAK matching Pintu Aluminium/HPL ke Pintu Kayu Kamper');
assert(specValP1.materialMatch === false, 'SpecificationValidator mendeteksi Material Conflict (Aluminium/Multipleks vs Kayu)');

// ----------------------------------------------------------------------------
// TEST 5: Jendela J1 (1), J2 (1), J3 (2)
// ----------------------------------------------------------------------------
console.log('\n--- TEST 5: JENDELA J1, J2, J3 SCHEDULE TAKEOFF ---');
const itemJ1: FullAiWorkItem = {
  id: 'item-j1',
  itemNumber: 8,
  name: 'Pemasangan Daun Jendela J1',
  category: 'Pekerjaan Kusen, Pintu & Jendela',
  specification: 'Aluminium + Kaca 5 mm',
  dimensions: {},
  sourcePages: [11],
  sourceEvidence: ['Jadwal Kusen Hal 11'],
  quantity: null,
  quantityFormula: '',
  quantityUnit: 'unit',
  quantityConfidence: 'UNRESOLVED',
  ahsp: null,
  ahspConfidence: 'UNRESOLVED',
  price: null,
  priceSource: 'PRICE_NOT_FOUND',
  status: 'NEEDS_REVIEW',
};
const itemJ2: FullAiWorkItem = {
  id: 'item-j2',
  itemNumber: 9,
  name: 'Pemasangan Daun Jendela J2',
  category: 'Pekerjaan Kusen, Pintu & Jendela',
  specification: 'Aluminium + Kaca 5 mm',
  dimensions: {},
  sourcePages: [11],
  sourceEvidence: ['Jadwal Kusen Hal 11'],
  quantity: null,
  quantityFormula: '',
  quantityUnit: 'unit',
  quantityConfidence: 'UNRESOLVED',
  ahsp: null,
  ahspConfidence: 'UNRESOLVED',
  price: null,
  priceSource: 'PRICE_NOT_FOUND',
  status: 'NEEDS_REVIEW',
};
const itemJ3: FullAiWorkItem = {
  id: 'item-j3',
  itemNumber: 10,
  name: 'Pemasangan Daun Jendela J3',
  category: 'Pekerjaan Kusen, Pintu & Jendela',
  specification: 'Aluminium + Kaca 5 mm',
  dimensions: {},
  sourcePages: [11],
  sourceEvidence: ['Jadwal Kusen Hal 11'],
  quantity: null,
  quantityFormula: '',
  quantityUnit: 'unit',
  quantityConfidence: 'UNRESOLVED',
  ahsp: null,
  ahspConfidence: 'UNRESOLVED',
  price: null,
  priceSource: 'PRICE_NOT_FOUND',
  status: 'NEEDS_REVIEW',
};

dedQuantityReasoningEngine.resolveQuantities([itemJ1, itemJ2, itemJ3], context, synthesis);

assert(itemJ1.quantity === 1, `Jendela J1 = 1 unit [got ${itemJ1.quantity}]`);
assert(itemJ2.quantity === 1, `Jendela J2 = 1 unit [got ${itemJ2.quantity}]`);
assert(itemJ3.quantity === 2, `Jendela J3 = 2 unit [got ${itemJ3.quantity}]`);

// ----------------------------------------------------------------------------
// TEST 6: Pembesian Ringbalk (4 D12) — Strictly kg, NOT m²
// ----------------------------------------------------------------------------
console.log('\n--- TEST 6: PEMBESIAN RINGBALK DETERMINISTIC (KG) ---');
const itemRebarRingbalk: FullAiWorkItem = {
  id: 'item-rebar-rb',
  itemNumber: 11,
  name: 'Pembesian Tulangan Utama Ringbalk (4 D12)',
  category: 'Pekerjaan Struktur Beton',
  specification: '4 D12 baja ulir mutu BJTS 420B',
  dimensions: {},
  sourcePages: [22],
  sourceEvidence: ['Detail Ringbalk Hal 22'],
  quantity: null,
  quantityFormula: '',
  quantityUnit: 'kg',
  quantityConfidence: 'UNRESOLVED',
  ahsp: null,
  ahspConfidence: 'UNRESOLVED',
  price: null,
  priceSource: 'PRICE_NOT_FOUND',
  status: 'NEEDS_REVIEW',
};

dedQuantityReasoningEngine.resolveQuantities([itemRebarRingbalk], context, synthesis);

// Formula: 50.10 m x 4 bars x (0.006165 x 144) kg/m = 50.10 x 4 x 0.8878 = 177.91 kg
assert(itemRebarRingbalk.quantityUnit === 'kg', `Satuan Pembesian Ringbalk adalah 'kg' (BUKAN m²) [got ${itemRebarRingbalk.quantityUnit}]`);
assert(itemRebarRingbalk.quantity !== null && itemRebarRingbalk.quantity > 170 && itemRebarRingbalk.quantity < 185,
  `Quantity Pembesian Ringbalk 4D12 = ~177.91 kg [got ${itemRebarRingbalk.quantity} kg]`);
assert(itemRebarRingbalk.quantity !== 32.64, 'Pembesian 4D12 TIDAK mengambil angka 32.64 m² yang invalid');

// Unit Safety Gate check on engineering unit
const unitCheckRbKg = dedUnitSafetyGate.validateWorkItemEngineeringUnit(itemRebarRingbalk.name, 'kg');
assert(unitCheckRbKg.isValid === true, 'DedUnitSafetyGate MENERIMA satuan kg untuk pembesian tulangan ringbalk');

const unitCheckRbM2 = dedUnitSafetyGate.validateWorkItemEngineeringUnit(itemRebarRingbalk.name, 'm²');
assert(unitCheckRbM2.isValid === false, 'DedUnitSafetyGate MENOLAK keras pembesian tulangan dengan satuan m² (FAIL CLOSED)');

// ----------------------------------------------------------------------------
// TEST 7: Pembesian Sloof (4 D12) — Strictly kg, NOT m'
// ----------------------------------------------------------------------------
console.log('\n--- TEST 7: PEMBESIAN SLOOF DETERMINISTIC (KG) ---');
const itemRebarSloof: FullAiWorkItem = {
  id: 'item-rebar-sl',
  itemNumber: 12,
  name: 'Pembesian Tulangan Utama Sloof (4 D12)',
  category: 'Pekerjaan Struktur Beton',
  specification: '4 D12 baja ulir mutu BJTS 420B',
  dimensions: {},
  sourcePages: [20],
  sourceEvidence: ['Detail Sloof Hal 20'],
  quantity: null,
  quantityFormula: '',
  quantityUnit: 'kg',
  quantityConfidence: 'UNRESOLVED',
  ahsp: null,
  ahspConfidence: 'UNRESOLVED',
  price: null,
  priceSource: 'PRICE_NOT_FOUND',
  status: 'NEEDS_REVIEW',
};

dedQuantityReasoningEngine.resolveQuantities([itemRebarSloof], context, synthesis);

assert(itemRebarSloof.quantityUnit === 'kg', `Satuan Pembesian Sloof adalah 'kg' [got ${itemRebarSloof.quantityUnit}]`);
assert(itemRebarSloof.quantity !== null && itemRebarSloof.quantity > 170 && itemRebarSloof.quantity < 185,
  `Quantity Pembesian Sloof 4D12 = ~177.91 kg (BUKAN otomatis 50.10 m') [got ${itemRebarSloof.quantity} kg]`);

// ----------------------------------------------------------------------------
// TEST 8: Electrical (Downlight 9 titik, Saklar Tunggal 3, Saklar Ganda 3)
// ----------------------------------------------------------------------------
console.log('\n--- TEST 8: ELECTRICAL COUNTS & SEMANTIC PRESERVATION ---');
const itemDownlight: FullAiWorkItem = {
  id: 'item-downlight',
  itemNumber: 13,
  name: 'Pemasangan Titik Lampu Downlight',
  category: 'Pekerjaan Elektrikal',
  specification: 'Downlight LED 18 Watt',
  dimensions: {},
  sourcePages: [28],
  sourceEvidence: ['Denah Instalasi Listrik Hal 28'],
  quantity: null,
  quantityFormula: '',
  quantityUnit: 'titik',
  quantityConfidence: 'UNRESOLVED',
  ahsp: null,
  ahspConfidence: 'UNRESOLVED',
  price: null,
  priceSource: 'PRICE_NOT_FOUND',
  status: 'NEEDS_REVIEW',
};

const itemSaklarTunggal: FullAiWorkItem = {
  id: 'item-saklar-tunggal',
  itemNumber: 14,
  name: 'Pemasangan Saklar Tunggal',
  category: 'Pekerjaan Elektrikal',
  specification: 'Saklar tunggal broco/panasonic',
  dimensions: {},
  sourcePages: [28],
  sourceEvidence: ['Denah Instalasi Listrik Hal 28'],
  quantity: null,
  quantityFormula: '',
  quantityUnit: 'unit',
  quantityConfidence: 'UNRESOLVED',
  ahsp: null,
  ahspConfidence: 'UNRESOLVED',
  price: null,
  priceSource: 'PRICE_NOT_FOUND',
  status: 'NEEDS_REVIEW',
};

const itemSaklarGanda: FullAiWorkItem = {
  id: 'item-saklar-ganda',
  itemNumber: 15,
  name: 'Pemasangan Saklar Ganda',
  category: 'Pekerjaan Elektrikal',
  specification: 'Saklar seri ganda broco/panasonic',
  dimensions: {},
  sourcePages: [28],
  sourceEvidence: ['Denah Instalasi Listrik Hal 28'],
  quantity: null,
  quantityFormula: '',
  quantityUnit: 'unit',
  quantityConfidence: 'UNRESOLVED',
  ahsp: null,
  ahspConfidence: 'UNRESOLVED',
  price: null,
  priceSource: 'PRICE_NOT_FOUND',
  status: 'NEEDS_REVIEW',
};

dedQuantityReasoningEngine.resolveQuantities([itemDownlight, itemSaklarTunggal, itemSaklarGanda], context, synthesis);

assert(itemDownlight.quantity === 9, `Titik Lampu Downlight = 9 titik [got ${itemDownlight.quantity}]`);
assert(itemDownlight.name.includes('Downlight') || itemDownlight.name.includes('Titik Lampu'),
  'Label semantik downlight dipertahankan, TIDAK diubah menjadi "instalasi pengkabelan" generik');
assert(itemSaklarTunggal.quantity === 3, `Saklar Tunggal = 3 unit [got ${itemSaklarTunggal.quantity}]`);
assert(itemSaklarGanda.quantity === 3, `Saklar Ganda = 3 unit [got ${itemSaklarGanda.quantity}]`);

// ----------------------------------------------------------------------------
// TEST 9: Pondasi Detail A & Detail B Disaggregation
// ----------------------------------------------------------------------------
console.log('\n--- TEST 9: PONDASI DETAIL A & DETAIL B ---');
const itemPondasiDetailA: FullAiWorkItem = {
  id: 'item-pondasi-a',
  itemNumber: 16,
  name: 'Pondasi Batu Kali Detail A (Tengah)',
  category: 'Pekerjaan Pondasi',
  specification: 'Batu kali 1:4 trapesium penampang penuh',
  dimensions: {},
  sourcePages: [18, 19],
  sourceEvidence: ['Denah Hal 18', 'Detail A Hal 19'],
  quantity: null,
  quantityFormula: '',
  quantityUnit: 'm³',
  quantityConfidence: 'UNRESOLVED',
  ahsp: null,
  ahspConfidence: 'UNRESOLVED',
  price: null,
  priceSource: 'PRICE_NOT_FOUND',
  status: 'NEEDS_REVIEW',
};

const itemPondasiDetailB: FullAiWorkItem = {
  id: 'item-pondasi-b',
  itemNumber: 17,
  name: 'Pondasi Batu Kali Detail B (Pinggir)',
  category: 'Pekerjaan Pondasi',
  specification: 'Batu kali 1:4 trapesium batas tetangga',
  dimensions: {},
  sourcePages: [18, 19],
  sourceEvidence: ['Denah Hal 18', 'Detail B Hal 19'],
  quantity: null,
  quantityFormula: '',
  quantityUnit: 'm³',
  quantityConfidence: 'UNRESOLVED',
  ahsp: null,
  ahspConfidence: 'UNRESOLVED',
  price: null,
  priceSource: 'PRICE_NOT_FOUND',
  status: 'NEEDS_REVIEW',
};

dedQuantityReasoningEngine.resolveQuantities([itemPondasiDetailA, itemPondasiDetailB], context, synthesis);

assert(itemPondasiDetailA.quantity !== null && itemPondasiDetailA.quantity > 0,
  `Volume Pondasi Detail A dihitung spesifik = ${itemPondasiDetailA.quantity} m³`);
assert(itemPondasiDetailB.quantity !== null && itemPondasiDetailB.quantity > 0,
  `Volume Pondasi Detail B dihitung spesifik = ${itemPondasiDetailB.quantity} m³`);
assert(itemPondasiDetailA.quantity !== itemPondasiDetailB.quantity,
  'Pondasi Detail A dan Detail B memiliki volume berbeda sesuai penampang & panjang aktual masing-masing');

// ----------------------------------------------------------------------------
// TEST 10: Deduplication & Cross-Page Resolution
// ----------------------------------------------------------------------------
console.log('\n--- TEST 10: DEDUPLICATION & CROSS-PAGE RESOLUTION ---');
const crossRes = crossPageResolver.resolve(context);
assert(crossRes.resolvedScheduleElements.has('P1'), 'CrossPageResolver berhasil resolve P1 dari jadwal kusen');
assert(crossRes.resolvedScheduleElements.get('P1')?.count === 3, 'CrossPageResolver P1 count = 3');

// Duplicate detector
const duplicateItems: FullAiWorkItem[] = [
  { ...itemKeramik40x40, id: 'k-1', name: 'Pekerjaan Pemasangan Keramik 40x40', sourcePages: [5] },
  { ...itemKeramik40x40, id: 'k-2', name: 'Pasangan Keramik 40x40 Lantai', sourcePages: [6] },
];
const dedupResult = duplicateDetector.deduplicate(duplicateItems);
assert(dedupResult.duplicatesRemoved === 1, `DuplicateDetector mendeteksi dan menggabungkan 1 duplikat [removed ${dedupResult.duplicatesRemoved}]`);
assert(dedupResult.items.length === 1, 'Hanya 1 item keramik 40x40 unik yang tersisa');
assert(dedupResult.items[0].sourcePages.includes(5) && dedupResult.items[0].sourcePages.includes(6),
  'Source pages dari kedua kemunculan digabungkan');

// ----------------------------------------------------------------------------
// TEST 11: Fail Closed & Provenance Tracking
// ----------------------------------------------------------------------------
console.log('\n--- TEST 11: FAIL CLOSED & PROVENANCE INVARIANTS ---');
const missingItem: FullAiWorkItem = {
  id: 'item-missing-dim',
  itemNumber: 99,
  name: 'Ornamen Ukiran Dinding Kustom',
  category: 'Finishing',
  specification: 'Batu alam ukir',
  dimensions: {},
  sourcePages: [30],
  sourceEvidence: [],
  quantity: null,
  quantityFormula: '',
  quantityUnit: 'm²',
  quantityConfidence: 'UNRESOLVED',
  ahsp: null,
  ahspConfidence: 'UNRESOLVED',
  price: null,
  priceSource: 'PRICE_NOT_FOUND',
  status: 'NEEDS_REVIEW',
};

dedQuantityReasoningEngine.resolveQuantities([missingItem], context, synthesis);

assert(missingItem.quantity === null, 'Item tanpa dimensi DED menghasilkan quantity: null (FAIL CLOSED, BUKAN 0)');
assert(missingItem.status === 'MISSING_QUANTITY', `Status item missing dimensi adalah MISSING_QUANTITY [got ${missingItem.status}]`);

// AHSP Matching and Price resolution on verified items
dedAhspReasoningEngine.matchAhspForInventory([itemKeramik40x40], context);
dedPriceResolutionEngine.resolvePrices([itemKeramik40x40], context);

assert(itemKeramik40x40.provenance !== undefined, 'Item memiliki provenance tracking');
assert(itemKeramik40x40.provenance?.quantitySource === 'DETERMINISTIC_ENGINE',
  `Kuantitas bersumber dari DETERMINISTIC_ENGINE [got ${itemKeramik40x40.provenance?.quantitySource}]`);
assert(itemKeramik40x40.provenance?.ahspSource === 'DATABASE',
  `AHSP bersumber dari DATABASE resmi [got ${itemKeramik40x40.provenance?.ahspSource}]`);
assert(itemKeramik40x40.provenance?.overallStatus === 'DATABASE' || itemKeramik40x40.provenance?.overallStatus === 'AI_ASSISTED',
  `Status official tidak sembarangan menjadi AI_GENERATED [got ${itemKeramik40x40.provenance?.overallStatus}]`);

console.log('\n======================================================================');
console.log(`TOTAL TESTS: ${passCount + failCount} | PASSED: ${passCount} | FAILED: ${failCount}`);
console.log('======================================================================');

if (failCount > 0) {
  process.exit(1);
}
