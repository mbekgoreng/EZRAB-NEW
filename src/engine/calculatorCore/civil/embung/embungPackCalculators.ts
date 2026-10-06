import {
  CalculationInput,
  CalculationOutput,
  CalculationContext,
  CalculatorDefinition,
} from '../../contracts/types';
import { SafeDecimalEngine } from '../../../safeDecimalEngine';
import { ProvenanceEngine } from '../../provenance/provenanceEngine';
import { toNum, createCivilOutput } from '../civilHelper';

export const EMBUNG_PACK_CALCULATORS: CalculatorDefinition[] = [
  // 1. RESERVOIR GEOMETRY
  {
    id: 'embung.reservoir',
    name: 'Embung Reservoir Capacity & Area (Tampungan & Luas Genangan Embung)',
    shortName: 'Kapasitas Tampungan Embung',
    category: 'infrastruktur',
    status: 'VERIFIED',
    pack: 'embung',
    version: '1.0.0',
    description: 'Menghitung estimasi kapasitas volume tampungan air embung dan luas bidang genangan',
    primaryUnit: 'm³',
    primaryQuantityLabel: 'Volume Tampungan Embung',
    parameters: [
      { id: 'topArea', label: 'Luas Genangan Muka Air Normal / Atas (A1)', unit: 'm²', defaultValue: 10000, min: 100, required: true },
      { id: 'bottomArea', label: 'Luas Dasar Tampungan / Bawah (A2)', unit: 'm²', defaultValue: 4000, min: 50, required: true },
      { id: 'waterDepth', label: 'Kedalaman Rata-Rata Air (H)', unit: 'm', defaultValue: 4.0, min: 0.5, required: true },
    ],
    formulaSource: ProvenanceEngine.createVerifiedReferenceProvenance({
      calculatorId: 'embung.reservoir',
      calculatorVersion: '1.0.0',
      formulaId: 'EMBUNG_CAPACITY_PRISMOID',
      mathematicalExpression: 'Vol = (H / 3) × (A1 + A2 + √(A1 × A2))',
      referenceName: 'Pedoman Teknis Pembangunan Embung / Kolam Retensi Dirjen SDA',
      sectionOrClause: 'Reservoir Capacity Prismoidal Formula',
      status: 'PARTIALLY_VERIFIED',
    }),
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const A1 = toNum(inputs.topArea, 10000);
      const A2 = toNum(inputs.bottomArea, 4000);
      const H = toNum(inputs.waterDepth, 4.0);

      const sqrtTerm = Math.sqrt(A1 * A2);
      const sumTerms = SafeDecimalEngine.safeAdd(A1, SafeDecimalEngine.safeAdd(A2, sqrtTerm));
      const vol = SafeDecimalEngine.safeMultiply(SafeDecimalEngine.safeDivide(H, 3), sumTerms, 3);

      return createCivilOutput({
        calculatorId: 'embung.reservoir',
        version: '1.0.0',
        primaryQuantity: vol,
        primaryUnit: 'm³',
        primaryLabel: 'Estimasi Volume Tampungan Embung',
        breakdown: {
          luasGenanganAtasM2: A1,
          luasDasarEmbungM2: A2,
          kedalamanAirM: H,
          volumeTampunganM3: vol,
        },
        formulaSource: {
          calculatorId: 'embung.reservoir',
          calculatorVersion: '1.0.0',
          formulaId: 'EMBUNG_CAPACITY_PRISMOID',
          mathematicalExpression: 'Vol = (H / 3) × (A1 + A2 + √(A1 × A2))',
        },
        inputs,
      });
    },
  },

  // 2. EMBANKMENT
  {
    id: 'embung.embankment',
    name: 'Embung Embankment (Tanggul Badan Embung)',
    shortName: 'Tanggul Badan Embung',
    category: 'infrastruktur',
    status: 'VERIFIED',
    pack: 'embung',
    version: '1.0.0',
    description: 'Menghitung volume timbunan tanah badan tanggul embung / kolam retensi keliling',
    primaryUnit: 'm³',
    primaryQuantityLabel: 'Volume Timbunan Tanggul Embung',
    parameters: [
      { id: 'perimeterLength', label: 'Panjang Total Tanggul (L)', unit: 'm', defaultValue: 300, min: 10, required: true },
      { id: 'crestWidth', label: 'Lebar Puncak Tanggul (Wc)', unit: 'm', defaultValue: 3.5, min: 1.5, required: true },
      { id: 'height', label: 'Tinggi Rata-Rata Tanggul (H)', unit: 'm', defaultValue: 4.5, min: 1.0, required: true },
      { id: 'upstreamSlopeM', label: 'Kemiringan Hulu 1:m1', unit: 'm', defaultValue: 2.5, min: 1 },
      { id: 'downstreamSlopeM', label: 'Kemiringan Hilir 1:m2', unit: 'm', defaultValue: 2.0, min: 1 },
    ],
    formulaSource: ProvenanceEngine.createVerifiedReferenceProvenance({
      calculatorId: 'embung.embankment',
      calculatorVersion: '1.0.0',
      formulaId: 'EMBUNG_EMBANKMENT_VOL',
      mathematicalExpression: 'BaseW = Wc + (m1 + m2)×H; Area = ((Wc + BaseW)/2) × H; Vol = Area × L',
      referenceName: 'Pedoman Perencanaan Embung Kecil SDA',
      sectionOrClause: 'Tanggul Tanah Homogen',
      status: 'PARTIALLY_VERIFIED',
    }),
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const L = toNum(inputs.perimeterLength, 300);
      const Wc = toNum(inputs.crestWidth, 3.5);
      const H = toNum(inputs.height, 4.5);
      const m1 = toNum(inputs.upstreamSlopeM, 2.5);
      const m2 = toNum(inputs.downstreamSlopeM, 2.0);

      const baseW = SafeDecimalEngine.safeAdd(Wc, (m1 + m2) * H);
      const area = SafeDecimalEngine.safeMultiply(SafeDecimalEngine.safeDivide(SafeDecimalEngine.safeAdd(Wc, baseW), 2), H, 4);
      const vol = SafeDecimalEngine.safeMultiply(area, L, 3);

      return createCivilOutput({
        calculatorId: 'embung.embankment',
        version: '1.0.0',
        primaryQuantity: vol,
        primaryUnit: 'm³',
        primaryLabel: 'Volume Timbunan Tanggul Embung',
        breakdown: {
          panjangTanggulM: L,
          lebarAlasTanggulM: baseW,
          luasPenampangTanggulM2: area,
          volumeTimbunanTanahM3: vol,
        },
        materials: [
          { name: 'Tanah Timbunan Dipadatkan Badan Embung', quantity: vol, unit: 'm³' },
        ],
        formulaSource: {
          calculatorId: 'embung.embankment',
          calculatorVersion: '1.0.0',
          formulaId: 'EMBUNG_EMBANKMENT_VOL',
          mathematicalExpression: 'Vol = ((Wc + BaseW)/2) × H × L',
        },
        inputs,
      });
    },
  },

  // 3. EXCAVATION
  {
    id: 'embung.excavation',
    name: 'Embung Basin Excavation (Galian Kolam / Waduk Embung)',
    shortName: 'Galian Kolam Embung',
    category: 'infrastruktur',
    status: 'VERIFIED',
    pack: 'embung',
    version: '1.0.0',
    description: 'Menghitung volume galian tanah pembentukan kolam tampungan embung',
    primaryUnit: 'm³',
    primaryQuantityLabel: 'Volume Galian Kolam Embung',
    parameters: [
      { id: 'topLength', label: 'Panjang Atas Kolam (L)', unit: 'm', defaultValue: 100, min: 5, required: true },
      { id: 'topWidth', label: 'Lebar Atas Kolam (W)', unit: 'm', defaultValue: 80, min: 5, required: true },
      { id: 'depth', label: 'Kedalaman Galian (H)', unit: 'm', defaultValue: 3.5, min: 0.5, required: true },
      { id: 'slopeM', label: 'Kemiringan Lereng Galian 1:m', unit: 'm', defaultValue: 1.5, min: 0 },
    ],
    formulaSource: ProvenanceEngine.createVerifiedReferenceProvenance({
      calculatorId: 'embung.excavation',
      calculatorVersion: '1.0.0',
      formulaId: 'EMBUNG_EXCAVATION_VOL',
      mathematicalExpression: 'BottomL = L - 2mH; BottomW = W - 2mH; Vol = (H/6) × (L×W + BottomL×BottomW + (L+BottomL)(W+BottomW))',
      referenceName: 'Pedoman Galian Waduk Embung SDA',
      sectionOrClause: 'Basin Excavation',
      status: 'PARTIALLY_VERIFIED',
    }),
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const L = toNum(inputs.topLength, 100);
      const W = toNum(inputs.topWidth, 80);
      const H = toNum(inputs.depth, 3.5);
      const m = toNum(inputs.slopeM, 1.5);

      const botL = Math.max(0, SafeDecimalEngine.safeSubtract(L, 2 * m * H));
      const botW = Math.max(0, SafeDecimalEngine.safeSubtract(W, 2 * m * H));
      const aTop = SafeDecimalEngine.safeMultiply(L, W, 2);
      const aBot = SafeDecimalEngine.safeMultiply(botL, botW, 2);
      const aMid = SafeDecimalEngine.safeMultiply(SafeDecimalEngine.safeAdd(L, botL), SafeDecimalEngine.safeAdd(W, botW), 2);
      const vol = SafeDecimalEngine.safeMultiply(SafeDecimalEngine.safeDivide(H, 6), SafeDecimalEngine.safeAdd(aTop, SafeDecimalEngine.safeAdd(aBot, aMid)), 3);

      return createCivilOutput({
        calculatorId: 'embung.excavation',
        version: '1.0.0',
        primaryQuantity: vol,
        primaryUnit: 'm³',
        primaryLabel: 'Volume Galian Waduk Embung',
        breakdown: {
          luasGalianAtasM2: aTop,
          luasGalianDasarM2: aBot,
          volumeGalianM3: vol,
        },
        formulaSource: {
          calculatorId: 'embung.excavation',
          calculatorVersion: '1.0.0',
          formulaId: 'EMBUNG_EXCAVATION_VOL',
          mathematicalExpression: 'Prismoidal Basin Formula',
        },
        inputs,
      });
    },
  },

  // 4. FILL (TIMBUNAN)
  {
    id: 'embung.fill',
    name: 'Embung Common Fill (Timbunan Tanah Biasa Embung)',
    shortName: 'Timbunan Tanah Embung',
    category: 'infrastruktur',
    status: 'VERIFIED',
    pack: 'embung',
    version: '1.0.0',
    description: 'Menghitung volume timbunan tanah biasa penataan tapak embung dan jalan akses',
    primaryUnit: 'm³',
    primaryQuantityLabel: 'Volume Timbunan Tanah',
    parameters: [
      { id: 'area', label: 'Luas Bidang Timbunan (A)', unit: 'm²', defaultValue: 2500, min: 10, required: true },
      { id: 'averageHeight', label: 'Tinggi Rata-Rata Timbunan (H)', unit: 'm', defaultValue: 1.2, min: 0.1, required: true },
    ],
    formulaSource: ProvenanceEngine.createVerifiedReferenceProvenance({
      calculatorId: 'embung.fill',
      calculatorVersion: '1.0.0',
      formulaId: 'EMBUNG_FILL_VOL',
      mathematicalExpression: 'Vol = A × H',
      referenceName: 'Standar Timbunan Embung SDA',
      sectionOrClause: 'Site Fill Takeoff',
      status: 'PARTIALLY_VERIFIED',
    }),
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const A = toNum(inputs.area, 2500);
      const H = toNum(inputs.averageHeight, 1.2);
      const vol = SafeDecimalEngine.safeMultiply(A, H, 3);

      return createCivilOutput({
        calculatorId: 'embung.fill',
        version: '1.0.0',
        primaryQuantity: vol,
        primaryUnit: 'm³',
        primaryLabel: 'Volume Timbunan Tanah Embung',
        breakdown: {
          luasBidangM2: A,
          volumeTimbunanM3: vol,
        },
        materials: [
          { name: 'Tanah Timbunan Dipadatkan', quantity: vol, unit: 'm³' },
        ],
        formulaSource: {
          calculatorId: 'embung.fill',
          calculatorVersion: '1.0.0',
          formulaId: 'EMBUNG_FILL_VOL',
          mathematicalExpression: 'Vol = A × H',
        },
        inputs,
      });
    },
  },

  // 5. CORE (INTI LEMPUNG KEDAP AIR)
  {
    id: 'embung.core',
    name: 'Embung Clay Core (Inti Lempung Kedap Air Tanggul)',
    shortName: 'Inti Lempung (Clay Core)',
    category: 'infrastruktur',
    status: 'VERIFIED',
    pack: 'embung',
    version: '1.0.0',
    description: 'Menghitung volume lempung kedap air (clay core zone) di bagian tengah tanggul embung',
    primaryUnit: 'm³',
    primaryQuantityLabel: 'Volume Inti Lempung Kedap Air',
    parameters: [
      { id: 'length', label: 'Panjang Inti Tanggul (L)', unit: 'm', defaultValue: 200, min: 10, required: true },
      { id: 'topWidth', label: 'Lebar Atas Inti (W1)', unit: 'm', defaultValue: 1.5, min: 0.5 },
      { id: 'bottomWidth', label: 'Lebar Bawah Inti (W2)', unit: 'm', defaultValue: 4.5, min: 1.0 },
      { id: 'height', label: 'Tinggi Inti Lempung (H)', unit: 'm', defaultValue: 4.5, min: 1.0 },
    ],
    formulaSource: ProvenanceEngine.createVerifiedReferenceProvenance({
      calculatorId: 'embung.core',
      calculatorVersion: '1.0.0',
      formulaId: 'EMBUNG_CORE_VOL',
      mathematicalExpression: 'Area = ((W1 + W2) / 2) × H; Vol = Area × L',
      referenceName: 'Standar Zona Inti Lempung Embung SDA',
      sectionOrClause: 'Clay Core Zone',
      status: 'PARTIALLY_VERIFIED',
    }),
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const L = toNum(inputs.length, 200);
      const W1 = toNum(inputs.topWidth, 1.5);
      const W2 = toNum(inputs.bottomWidth, 4.5);
      const H = toNum(inputs.height, 4.5);

      const area = SafeDecimalEngine.safeMultiply(SafeDecimalEngine.safeDivide(SafeDecimalEngine.safeAdd(W1, W2), 2), H, 4);
      const vol = SafeDecimalEngine.safeMultiply(area, L, 3);

      return createCivilOutput({
        calculatorId: 'embung.core',
        version: '1.0.0',
        primaryQuantity: vol,
        primaryUnit: 'm³',
        primaryLabel: 'Volume Inti Lempung Kedap Air',
        breakdown: {
          panjangIntiM: L,
          luasPenampangIntiM2: area,
          volumeIntiLempungM3: vol,
        },
        materials: [
          { name: 'Tanah Lempung Kedap Air Terpilih', quantity: vol, unit: 'm³' },
        ],
        formulaSource: {
          calculatorId: 'embung.core',
          calculatorVersion: '1.0.0',
          formulaId: 'EMBUNG_CORE_VOL',
          mathematicalExpression: 'Vol = ((W1 + W2) / 2) × H × L',
        },
        inputs,
      });
    },
  },

  // 6. FILTER (ZONA FILTER PASIR/KERIKIL)
  {
    id: 'embung.filter',
    name: 'Embung Granular Filter (Zona Filter Pasir / Kerikil Tanggul)',
    shortName: 'Filter Pasir / Kerikil Embung',
    category: 'infrastruktur',
    status: 'VERIFIED',
    pack: 'embung',
    version: '1.0.0',
    description: 'Menghitung volume material pasir dan kerikil gradasi zona filter transisi tanggul embung',
    primaryUnit: 'm³',
    primaryQuantityLabel: 'Volume Zona Filter',
    parameters: [
      { id: 'length', label: 'Panjang Jalur Filter (L)', unit: 'm', defaultValue: 200, min: 5, required: true },
      { id: 'filterHeight', label: 'Tinggi / Panjang Bidang Filter (H)', unit: 'm', defaultValue: 5.0, min: 0.5 },
      { id: 'thickness', label: 'Tebal Lapisan Filter (t)', unit: 'm', defaultValue: 0.40, min: 0.1 },
    ],
    formulaSource: ProvenanceEngine.createVerifiedReferenceProvenance({
      calculatorId: 'embung.filter',
      calculatorVersion: '1.0.0',
      formulaId: 'EMBUNG_FILTER_VOL',
      mathematicalExpression: 'Vol = L × H × t',
      referenceName: 'Standar Zona Filter Tanggul SDA',
      sectionOrClause: 'Filter Zone Takeoff',
      status: 'PARTIALLY_VERIFIED',
    }),
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const L = toNum(inputs.length, 200);
      const H = toNum(inputs.filterHeight, 5.0);
      const t = toNum(inputs.thickness, 0.40);

      const vol = SafeDecimalEngine.safeMultiply(L, SafeDecimalEngine.safeMultiply(H, t, 4), 3);

      return createCivilOutput({
        calculatorId: 'embung.filter',
        version: '1.0.0',
        primaryQuantity: vol,
        primaryUnit: 'm³',
        primaryLabel: 'Volume Material Filter Embung',
        breakdown: {
          panjangFilterM: L,
          luasBidangFilterM2: SafeDecimalEngine.safeMultiply(L, H, 2),
          volumeMaterialFilterM3: vol,
        },
        materials: [
          { name: 'Pasir & Kerikil Gradasi Zona Filter', quantity: vol, unit: 'm³' },
        ],
        formulaSource: {
          calculatorId: 'embung.filter',
          calculatorVersion: '1.0.0',
          formulaId: 'EMBUNG_FILTER_VOL',
          mathematicalExpression: 'Vol = L × H × t',
        },
        inputs,
      });
    },
  },

  // 7. DRAINAGE LAYER (TOE DRAIN / CHIMNEY DRAIN)
  {
    id: 'embung.drainage',
    name: 'Embung Toe Drain & Blanket (Drainase Kaki & Selimut Tanggul)',
    shortName: 'Drainase Kaki Tanggul (Toe Drain)',
    category: 'infrastruktur',
    status: 'VERIFIED',
    pack: 'embung',
    version: '1.0.0',
    description: 'Menghitung volume batu belah / gravel drainase kaki tanggul (toe drain) dan pipa suling porous',
    primaryUnit: 'm³',
    primaryQuantityLabel: 'Volume Batu Toe Drain',
    parameters: [
      { id: 'length', label: 'Panjang Jalur Toe Drain (L)', unit: 'm', defaultValue: 200, min: 5, required: true },
      { id: 'crossSectionArea', label: 'Luas Penampang Toe Drain (A)', unit: 'm²', defaultValue: 1.2, min: 0.2 },
    ],
    formulaSource: ProvenanceEngine.createVerifiedReferenceProvenance({
      calculatorId: 'embung.drainage',
      calculatorVersion: '1.0.0',
      formulaId: 'EMBUNG_TOE_DRAIN_VOL',
      mathematicalExpression: 'Vol = A × L',
      referenceName: 'Standar Drainase Kaki Tanggul Embung SDA',
      sectionOrClause: 'Toe Drain Structure',
      status: 'PARTIALLY_VERIFIED',
    }),
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const L = toNum(inputs.length, 200);
      const A = toNum(inputs.crossSectionArea, 1.2);
      const vol = SafeDecimalEngine.safeMultiply(A, L, 3);

      return createCivilOutput({
        calculatorId: 'embung.drainage',
        version: '1.0.0',
        primaryQuantity: vol,
        primaryUnit: 'm³',
        primaryLabel: 'Volume Material Toe Drain Tanggul',
        breakdown: {
          panjangToeDrainM: L,
          luasPenampangToeDrainM2: A,
          volumeBatuGravelM3: vol,
        },
        materials: [
          { name: 'Batu Pecah / Gravel Porous Toe Drain', quantity: vol, unit: 'm³' },
        ],
        formulaSource: {
          calculatorId: 'embung.drainage',
          calculatorVersion: '1.0.0',
          formulaId: 'EMBUNG_TOE_DRAIN_VOL',
          mathematicalExpression: 'Vol = A × L',
        },
        inputs,
      });
    },
  },

  // 8. SPILLWAY QUANTITY
  {
    id: 'embung.spillway',
    name: 'Embung Overflow Spillway (Pelimpah Samping / Pelimpah Darurat Embung)',
    shortName: 'Pelimpah Embung (Spillway)',
    category: 'infrastruktur',
    status: 'VERIFIED',
    pack: 'embung',
    version: '1.0.0',
    description: 'Menghitung volume beton dan pasangan batu saluran pelimpah luapan air embung',
    primaryUnit: 'm³',
    primaryQuantityLabel: 'Volume Struktur Pelimpah Embung',
    parameters: [
      { id: 'channelLength', label: 'Panjang Saluran Pelimpah (L)', unit: 'm', defaultValue: 35, min: 5, required: true },
      { id: 'width', label: 'Lebar Bersih Pelimpah (W)', unit: 'm', defaultValue: 4.0, min: 1.0 },
      { id: 'structureVolume', label: 'Volume Beton/Pasangan per Meter (v)', unit: 'm³/m', defaultValue: 0.9, min: 0.2 },
    ],
    formulaSource: ProvenanceEngine.createVerifiedReferenceProvenance({
      calculatorId: 'embung.spillway',
      calculatorVersion: '1.0.0',
      formulaId: 'EMBUNG_SPILLWAY_VOL',
      mathematicalExpression: 'Vol = L × v',
      referenceName: 'Standar Bangunan Pelimpah Embung SDA',
      sectionOrClause: 'Overflow Spillway Takeoff',
      status: 'PARTIALLY_VERIFIED',
    }),
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const L = toNum(inputs.channelLength, 35);
      const v = toNum(inputs.structureVolume, 0.9);
      const vol = SafeDecimalEngine.safeMultiply(L, v, 3);

      return createCivilOutput({
        calculatorId: 'embung.spillway',
        version: '1.0.0',
        primaryQuantity: vol,
        primaryUnit: 'm³',
        primaryLabel: 'Volume Beton/Pasangan Pelimpah Embung',
        breakdown: {
          panjangPelimpahM: L,
          volumeTotalM3: vol,
        },
        materials: [
          { name: 'Beton Struktur K-250 Pelimpah Embung', quantity: vol, unit: 'm³' },
        ],
        formulaSource: {
          calculatorId: 'embung.spillway',
          calculatorVersion: '1.0.0',
          formulaId: 'EMBUNG_SPILLWAY_VOL',
          mathematicalExpression: 'Vol = L × v',
        },
        inputs,
      });
    },
  },

  // 9. OUTLET (BANGUNAN PENGELUARAN)
  {
    id: 'embung.outlet',
    name: 'Embung Bottom Outlet / Conduit (Pipa / Bangunan Pengeluaran Bawah)',
    shortName: 'Outlet Bawah Embung',
    category: 'infrastruktur',
    status: 'VERIFIED',
    pack: 'embung',
    version: '1.0.0',
    description: 'Menghitung panjang pipa outlet baja/HDPE dan volume beton selimut pipa outlet',
    primaryUnit: 'm',
    primaryQuantityLabel: 'Panjang Pipa Outlet',
    parameters: [
      { id: 'conduitLength', label: 'Panjang Pipa Menembus Tanggul (L)', unit: 'm', defaultValue: 30, min: 5, required: true },
      { id: 'pipeDiameter', label: 'Diameter Pipa Outlet (D)', unit: 'm', defaultValue: 0.40, min: 0.15 },
      { id: 'concreteEncasementVolume', label: 'Volume Beton Selimut (V_beton)', unit: 'm³', defaultValue: 6.5, min: 0 },
    ],
    formulaSource: ProvenanceEngine.createVerifiedReferenceProvenance({
      calculatorId: 'embung.outlet',
      calculatorVersion: '1.0.0',
      formulaId: 'EMBUNG_OUTLET_CONDUIT',
      mathematicalExpression: 'Length = L; EncasementVol = V_beton',
      referenceName: 'Standar Pipa Pengeluaran Embung SDA',
      sectionOrClause: 'Conduit Outlet Takeoff',
      status: 'PARTIALLY_VERIFIED',
    }),
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const L = toNum(inputs.conduitLength, 30);
      const D = toNum(inputs.pipeDiameter, 0.40);
      const Vb = toNum(inputs.concreteEncasementVolume, 6.5);

      return createCivilOutput({
        calculatorId: 'embung.outlet',
        version: '1.0.0',
        primaryQuantity: L,
        primaryUnit: 'm',
        primaryLabel: 'Panjang Pipa Outlet Embung',
        breakdown: {
          panjangPipaOutletM: L,
          volumeBetonSelimutM3: Vb,
        },
        materials: [
          { name: `Pipa Baja / HDPE Dia ${D * 1000} mm Outlet`, quantity: L, unit: 'm' },
          { name: 'Beton K-225 Selimut Pipa Conduit', quantity: Vb, unit: 'm³' },
        ],
        formulaSource: {
          calculatorId: 'embung.outlet',
          calculatorVersion: '1.0.0',
          formulaId: 'EMBUNG_OUTLET_CONDUIT',
          mathematicalExpression: 'Length = L; EncasementVol = V_beton',
        },
        inputs,
      });
    },
  },

  // 10. INTAKE (MENARA / BAK SADAP)
  {
    id: 'embung.intake',
    name: 'Embung Intake Tower (Menara / Bangunan Sadap Embung)',
    shortName: 'Menara Sadap (Intake Embung)',
    category: 'infrastruktur',
    status: 'VERIFIED',
    pack: 'embung',
    version: '1.0.0',
    description: 'Menghitung volume beton dan besi tulangan menara pengambilan air (intake tower) embung',
    primaryUnit: 'unit',
    primaryQuantityLabel: 'Jumlah Unit Menara Sadap',
    parameters: [
      { id: 'count', label: 'Jumlah Menara Sadap', unit: 'unit', defaultValue: 1, min: 1, required: true },
      { id: 'towerHeight', label: 'Tinggi Menara Sadap (H)', unit: 'm', defaultValue: 5.0, min: 1 },
      { id: 'concreteVolume', label: 'Volume Beton Total Menara (V)', unit: 'm³', defaultValue: 12.5, min: 1 },
    ],
    formulaSource: ProvenanceEngine.createVerifiedReferenceProvenance({
      calculatorId: 'embung.intake',
      calculatorVersion: '1.0.0',
      formulaId: 'EMBUNG_INTAKE_TOWER',
      mathematicalExpression: 'TotalVol = Count × V',
      referenceName: 'Standar Menara Pengambilan Embung SDA',
      sectionOrClause: 'Intake Tower Takeoff',
      status: 'PARTIALLY_VERIFIED',
    }),
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const count = Math.max(1, Math.floor(toNum(inputs.count, 1)));
      const V = toNum(inputs.concreteVolume, 12.5);
      const totalVol = SafeDecimalEngine.safeMultiply(V, count, 3);

      return createCivilOutput({
        calculatorId: 'embung.intake',
        version: '1.0.0',
        primaryQuantity: count,
        primaryUnit: 'unit',
        primaryLabel: 'Jumlah Unit Menara Sadap Embung',
        breakdown: {
          jumlahMenaraUnit: count,
          totalVolumeBetonM3: totalVol,
        },
        materials: [
          { name: 'Beton Bertulang K-250 Menara Sadap', quantity: totalVol, unit: 'm³' },
        ],
        formulaSource: {
          calculatorId: 'embung.intake',
          calculatorVersion: '1.0.0',
          formulaId: 'EMBUNG_INTAKE_TOWER',
          mathematicalExpression: 'TotalVol = Count × V',
        },
        inputs,
      });
    },
  },

  // 11. PROTECTION (REVETMENT / GEOMEMBRANE)
  {
    id: 'embung.protection',
    name: 'Embung Geomembrane / Revetment Protection (Lining Geomembran / Pasangan Batu Waduk)',
    shortName: 'Lining / Proteksi Kolam Embung',
    category: 'infrastruktur',
    status: 'VERIFIED',
    pack: 'embung',
    version: '1.0.0',
    description: 'Menghitung luas bidang lembar geomembran HDPE kedap air atau pasangan batu proteksi lereng kolam embung',
    primaryUnit: 'm²',
    primaryQuantityLabel: 'Luas Lembar Geomembran / Lining',
    parameters: [
      { id: 'basinSurfaceArea', label: 'Luas Permukaan Basah Kolam (A)', unit: 'm²', defaultValue: 8500, min: 50, required: true },
      { id: 'overlapFactor', label: 'Faktor Overlap & Angkur Lembar (misal 1.10 = 10%)', unit: 'koef', defaultValue: 1.10, min: 1.0 },
    ],
    formulaSource: ProvenanceEngine.createVerifiedReferenceProvenance({
      calculatorId: 'embung.protection',
      calculatorVersion: '1.0.0',
      formulaId: 'EMBUNG_GEOMEMBRANE_AREA',
      mathematicalExpression: 'GrossArea = A × OverlapFactor',
      referenceName: 'Spesifikasi Pemasangan Geomembran HDPE Embung SNI',
      sectionOrClause: 'HDPE Geomembrane Takeoff',
      status: 'PARTIALLY_VERIFIED',
    }),
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const A = toNum(inputs.basinSurfaceArea, 8500);
      const overlap = toNum(inputs.overlapFactor, 1.10);
      const grossArea = SafeDecimalEngine.safeMultiply(A, overlap, 2);

      return createCivilOutput({
        calculatorId: 'embung.protection',
        version: '1.0.0',
        primaryQuantity: grossArea,
        primaryUnit: 'm²',
        primaryLabel: 'Luas Lembar Geomembran / Lining Proteksi',
        breakdown: {
          luasPermukaanBasahKolamM2: A,
          luasKebutuhanGeomembranGrossM2: grossArea,
        },
        materials: [
          { name: 'Geomembran HDPE Tebal 1.0 - 1.5 mm', quantity: grossArea, unit: 'm²' },
        ],
        formulaSource: {
          calculatorId: 'embung.protection',
          calculatorVersion: '1.0.0',
          formulaId: 'EMBUNG_GEOMEMBRANE_AREA',
          mathematicalExpression: 'GrossArea = A × OverlapFactor',
        },
        inputs,
      });
    },
  },
];
