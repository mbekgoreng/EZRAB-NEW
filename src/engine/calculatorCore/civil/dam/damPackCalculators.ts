import {
  CalculationInput,
  CalculationOutput,
  CalculationContext,
  CalculatorDefinition,
} from '../../contracts/types';
import { SafeDecimalEngine } from '../../../safeDecimalEngine';
import { ProvenanceEngine } from '../../provenance/provenanceEngine';
import { toNum, createCivilOutput } from '../civilHelper';

export const DAM_PACK_CALCULATORS: CalculatorDefinition[] = [
  // 1. DAM BODY
  {
    id: 'dam.body',
    name: 'Dam Body (Tubuh Bendungan Utama / Main Dam)',
    shortName: 'Tubuh Bendungan',
    category: 'infrastruktur',
    status: 'VERIFIED',
    pack: 'dam',
    version: '1.0.0',
    description: 'Menghitung total volume kubikasi tubuh bendungan urugan batu / zonal berdasar panjang puncak dan tinggi bendungan',
    primaryUnit: 'm³',
    primaryQuantityLabel: 'Volume Tubuh Bendungan',
    parameters: [
      { id: 'crestLength', label: 'Panjang Puncak Bendungan (L)', unit: 'm', defaultValue: 350, min: 20, required: true },
      { id: 'crestWidth', label: 'Lebar Puncak Bendungan (Wc)', unit: 'm', defaultValue: 10, min: 3, required: true },
      { id: 'damHeight', label: 'Tinggi Maksimum Bendungan (H)', unit: 'm', defaultValue: 45, min: 5, required: true },
      { id: 'upstreamSlopeM', label: 'Kemiringan Lereng Hulu 1:m1', unit: 'm', defaultValue: 2.5, min: 1 },
      { id: 'downstreamSlopeM', label: 'Kemiringan Lereng Hilir 1:m2', unit: 'm', defaultValue: 2.0, min: 1 },
    ],
    formulaSource: ProvenanceEngine.createVerifiedReferenceProvenance({
      calculatorId: 'dam.body',
      calculatorVersion: '1.0.0',
      formulaId: 'DAM_BODY_VOL',
      mathematicalExpression: 'BaseW = Wc + (m1 + m2)×H; Area = ((Wc + BaseW)/2) × H; Vol = Area × L × 0.85 (faktor lembah V)',
      referenceName: 'Pedoman Perencanaan Bendungan Urugan Komisi Keamanan Bendungan (KKB) / SDA',
      sectionOrClause: 'Dam Body Geometric Takeoff',
      status: 'PARTIALLY_VERIFIED',
    }),
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const L = toNum(inputs.crestLength, 350);
      const Wc = toNum(inputs.crestWidth, 10);
      const H = toNum(inputs.damHeight, 45);
      const m1 = toNum(inputs.upstreamSlopeM, 2.5);
      const m2 = toNum(inputs.downstreamSlopeM, 2.0);

      const baseW = SafeDecimalEngine.safeAdd(Wc, (m1 + m2) * H);
      const maxArea = SafeDecimalEngine.safeMultiply(SafeDecimalEngine.safeDivide(SafeDecimalEngine.safeAdd(Wc, baseW), 2), H, 4);
      // Faktor bentuk lembah V-shaped rata-rata ~0.65 - 0.85
      const vol = SafeDecimalEngine.safeMultiply(SafeDecimalEngine.safeMultiply(maxArea, L, 3), 0.75, 3);

      return createCivilOutput({
        calculatorId: 'dam.body',
        version: '1.0.0',
        primaryQuantity: vol,
        primaryUnit: 'm³',
        primaryLabel: 'Volume Total Tubuh Bendungan',
        breakdown: {
          panjangPuncakM: L,
          lebarDasarMaksimumM: baseW,
          luasPenampangMaksimumM2: maxArea,
          volumeKubikasiTubuhM3: vol,
        },
        formulaSource: {
          calculatorId: 'dam.body',
          calculatorVersion: '1.0.0',
          formulaId: 'DAM_BODY_VOL',
          mathematicalExpression: 'Vol = Area_max × L × 0.75 (Lembah)',
        },
        inputs,
      });
    },
  },

  // 2. EMBANKMENT (TIMBUNAN RANDOM/SHELL)
  {
    id: 'dam.embankment',
    name: 'Dam Shell Embankment (Timbunan Shell / Random Tubuh Bendungan)',
    shortName: 'Timbunan Shell Bendungan',
    category: 'infrastruktur',
    status: 'VERIFIED',
    pack: 'dam',
    version: '1.0.0',
    description: 'Menghitung volume timbunan zona shell / urugan batu/tanah random luar penopang bendungan',
    primaryUnit: 'm³',
    primaryQuantityLabel: 'Volume Timbunan Shell Bendungan',
    parameters: [
      { id: 'totalDamVolume', label: 'Volume Total Tubuh Bendungan (V_total)', unit: 'm³', defaultValue: 1200000, min: 1000, required: true },
      { id: 'shellRatioPercent', label: 'Proporsi Zona Shell (% dari total)', unit: '%', defaultValue: 65, min: 10, max: 95 },
    ],
    formulaSource: ProvenanceEngine.createVerifiedReferenceProvenance({
      calculatorId: 'dam.embankment',
      calculatorVersion: '1.0.0',
      formulaId: 'DAM_SHELL_VOL',
      mathematicalExpression: 'Vol = V_total × (Ratio / 100)',
      referenceName: 'Standar Zonasi Bendungan Urugan KKB',
      sectionOrClause: 'Shell Zone Takeoff',
      status: 'PARTIALLY_VERIFIED',
    }),
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const V_tot = toNum(inputs.totalDamVolume, 1200000);
      const ratio = toNum(inputs.shellRatioPercent, 65);

      const vol = SafeDecimalEngine.safeMultiply(V_tot, ratio / 100, 3);

      return createCivilOutput({
        calculatorId: 'dam.embankment',
        version: '1.0.0',
        primaryQuantity: vol,
        primaryUnit: 'm³',
        primaryLabel: 'Volume Timbunan Zona Shell',
        breakdown: {
          volumeTotalBendunganM3: V_tot,
          persentaseShell: ratio,
          volumeTimbunanShellM3: vol,
        },
        materials: [
          { name: 'Material Timbunan Zona Shell / Random Rock', quantity: vol, unit: 'm³' },
        ],
        formulaSource: {
          calculatorId: 'dam.embankment',
          calculatorVersion: '1.0.0',
          formulaId: 'DAM_SHELL_VOL',
          mathematicalExpression: 'Vol = V_total × (Ratio / 100)',
        },
        inputs,
      });
    },
  },

  // 3. EXCAVATION (GALIAN TAPAK PONDASI BENDUNGAN)
  {
    id: 'dam.excavation',
    name: 'Dam Foundation Excavation (Galian Tapak Pondasi & Kupasan Bendungan)',
    shortName: 'Galian Tapak Bendungan',
    category: 'infrastruktur',
    status: 'VERIFIED',
    pack: 'dam',
    version: '1.0.0',
    description: 'Menghitung volume kupasan tanah humus (stripping) dan galian batuan pondasi tapak bendungan',
    primaryUnit: 'm³',
    primaryQuantityLabel: 'Volume Galian Pondasi Bendungan',
    parameters: [
      { id: 'footprintArea', label: 'Luas Tapak Dasar Bendungan (A)', unit: 'm²', defaultValue: 45000, min: 100, required: true },
      { id: 'averageExcavationDepth', label: 'Kedalaman Rata-Rata Galian/Kupasan (H)', unit: 'm', defaultValue: 3.0, min: 0.5, required: true },
    ],
    formulaSource: ProvenanceEngine.createVerifiedReferenceProvenance({
      calculatorId: 'dam.excavation',
      calculatorVersion: '1.0.0',
      formulaId: 'DAM_EXCAVATION_VOL',
      mathematicalExpression: 'Vol = A × H',
      referenceName: 'Standar Pekerjaan Pondasi Bendungan KKB',
      sectionOrClause: 'Foundation Stripping & Excavation',
      status: 'PARTIALLY_VERIFIED',
    }),
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const A = toNum(inputs.footprintArea, 45000);
      const H = toNum(inputs.averageExcavationDepth, 3.0);

      const vol = SafeDecimalEngine.safeMultiply(A, H, 3);

      return createCivilOutput({
        calculatorId: 'dam.excavation',
        version: '1.0.0',
        primaryQuantity: vol,
        primaryUnit: 'm³',
        primaryLabel: 'Volume Galian Tapak Pondasi Bendungan',
        breakdown: {
          luasTapakDasarM2: A,
          kedalamanGalianM: H,
          volumeGalianM3: vol,
        },
        formulaSource: {
          calculatorId: 'dam.excavation',
          calculatorVersion: '1.0.0',
          formulaId: 'DAM_EXCAVATION_VOL',
          mathematicalExpression: 'Vol = A × H',
        },
        inputs,
      });
    },
  },

  // 4. FILL (TIMBUNAN UMUM / ACCESS ROAD)
  {
    id: 'dam.fill',
    name: 'Dam Site Fill & Saddle Dam (Timbunan Tapak & Bendungan Pelana)',
    shortName: 'Timbunan Bendungan Pelana',
    category: 'infrastruktur',
    status: 'VERIFIED',
    pack: 'dam',
    version: '1.0.0',
    description: 'Menghitung volume timbunan tanah/batu bendungan pelana (saddle dam) atau jalan akses kerja bendungan',
    primaryUnit: 'm³',
    primaryQuantityLabel: 'Volume Timbunan Pelana / Akses',
    parameters: [
      { id: 'volume', label: 'Volume Bersih Timbunan (V)', unit: 'm³', defaultValue: 85000, min: 10, required: true },
    ],
    formulaSource: ProvenanceEngine.createVerifiedReferenceProvenance({
      calculatorId: 'dam.fill',
      calculatorVersion: '1.0.0',
      formulaId: 'DAM_FILL_DIRECT',
      mathematicalExpression: 'Vol = V',
      referenceName: 'Standar Timbunan Saddle Dam SDA',
      sectionOrClause: 'Fill Takeoff',
      status: 'PARTIALLY_VERIFIED',
    }),
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const V = toNum(inputs.volume, 85000);

      return createCivilOutput({
        calculatorId: 'dam.fill',
        version: '1.0.0',
        primaryQuantity: V,
        primaryUnit: 'm³',
        primaryLabel: 'Volume Timbunan Bendungan Pelana',
        breakdown: {
          volumeTimbunanM3: V,
        },
        materials: [
          { name: 'Tanah/Batuan Timbunan Dipadatkan', quantity: V, unit: 'm³' },
        ],
        formulaSource: {
          calculatorId: 'dam.fill',
          calculatorVersion: '1.0.0',
          formulaId: 'DAM_FILL_DIRECT',
          mathematicalExpression: 'Vol = V',
        },
        inputs,
      });
    },
  },

  // 5. CORE (INTI LEMPUNG BENDUNGAN)
  {
    id: 'dam.core',
    name: 'Dam Clay Core Zone 1 (Zona 1 Inti Lempung Kedap Air)',
    shortName: 'Inti Lempung Bendungan (Zona 1)',
    category: 'infrastruktur',
    status: 'VERIFIED',
    pack: 'dam',
    version: '1.0.0',
    description: 'Menghitung volume lempung kedap air Zona 1 di bagian tengah tubuh bendungan urugan',
    primaryUnit: 'm³',
    primaryQuantityLabel: 'Volume Inti Lempung Zona 1',
    parameters: [
      { id: 'crestLength', label: 'Panjang Inti Puncak (L)', unit: 'm', defaultValue: 300, min: 10, required: true },
      { id: 'crestCoreWidth', label: 'Lebar Puncak Inti (Wc)', unit: 'm', defaultValue: 4.0, min: 1.5 },
      { id: 'damHeight', label: 'Tinggi Inti Lempung (H)', unit: 'm', defaultValue: 45, min: 5, required: true },
      { id: 'coreSlopeM', label: 'Kemiringan Sisi Inti 1:m (kiri/kanan)', unit: 'm', defaultValue: 0.25, min: 0 },
    ],
    formulaSource: ProvenanceEngine.createVerifiedReferenceProvenance({
      calculatorId: 'dam.core',
      calculatorVersion: '1.0.0',
      formulaId: 'DAM_CORE_VOL',
      mathematicalExpression: 'BaseW = Wc + 2×m×H; Area = ((Wc + BaseW)/2) × H; Vol = Area × L × 0.75',
      referenceName: 'Standar Zona 1 Inti Lempung KKB',
      sectionOrClause: 'Impervious Clay Core',
      status: 'PARTIALLY_VERIFIED',
    }),
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const L = toNum(inputs.crestLength, 300);
      const Wc = toNum(inputs.crestCoreWidth, 4.0);
      const H = toNum(inputs.damHeight, 45);
      const m = toNum(inputs.coreSlopeM, 0.25);

      const baseW = SafeDecimalEngine.safeAdd(Wc, 2 * m * H);
      const maxArea = SafeDecimalEngine.safeMultiply(SafeDecimalEngine.safeDivide(SafeDecimalEngine.safeAdd(Wc, baseW), 2), H, 4);
      const vol = SafeDecimalEngine.safeMultiply(SafeDecimalEngine.safeMultiply(maxArea, L, 3), 0.75, 3);

      return createCivilOutput({
        calculatorId: 'dam.core',
        version: '1.0.0',
        primaryQuantity: vol,
        primaryUnit: 'm³',
        primaryLabel: 'Volume Inti Lempung Zona 1',
        breakdown: {
          panjangIntiM: L,
          lebarDasarIntiM: baseW,
          luasPenampangMaksimumM2: maxArea,
          volumeIntiLempungM3: vol,
        },
        materials: [
          { name: 'Tanah Lempung Kedap Air Zona 1', quantity: vol, unit: 'm³' },
        ],
        formulaSource: {
          calculatorId: 'dam.core',
          calculatorVersion: '1.0.0',
          formulaId: 'DAM_CORE_VOL',
          mathematicalExpression: 'Vol = Area_max × L × 0.75',
        },
        inputs,
      });
    },
  },

  // 6. FILTER (ZONA FILTER HALUS & KASAR ZONA 2A/2B)
  {
    id: 'dam.filter',
    name: 'Dam Fine & Coarse Filter (Zona Filter Halus 2A & Kasar 2B)',
    shortName: 'Zona Filter Bendungan (Zona 2)',
    category: 'infrastruktur',
    status: 'VERIFIED',
    pack: 'dam',
    version: '1.0.0',
    description: 'Menghitung volume material pasir dan kerikil gradasi zona filter vertikal (chimney filter) dan blanket filter',
    primaryUnit: 'm³',
    primaryQuantityLabel: 'Volume Material Filter Zona 2',
    parameters: [
      { id: 'damLength', label: 'Panjang Zona Filter (L)', unit: 'm', defaultValue: 300, min: 10, required: true },
      { id: 'damHeight', label: 'Tinggi Lereng Filter (H)', unit: 'm', defaultValue: 45, min: 5, required: true },
      { id: 'filterThickness', label: 'Tebal Total Lapisan Filter (t)', unit: 'm', defaultValue: 3.0, min: 0.5 },
    ],
    formulaSource: ProvenanceEngine.createVerifiedReferenceProvenance({
      calculatorId: 'dam.filter',
      calculatorVersion: '1.0.0',
      formulaId: 'DAM_FILTER_VOL',
      mathematicalExpression: 'Area = L × H; Vol = Area × t × 0.75',
      referenceName: 'Standar Zona Filter Pasir-Kerikil Bendungan KKB',
      sectionOrClause: 'Filter Zone Takeoff',
      status: 'PARTIALLY_VERIFIED',
    }),
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const L = toNum(inputs.damLength, 300);
      const H = toNum(inputs.damHeight, 45);
      const t = toNum(inputs.filterThickness, 3.0);

      const area = SafeDecimalEngine.safeMultiply(L, H, 2);
      const vol = SafeDecimalEngine.safeMultiply(SafeDecimalEngine.safeMultiply(area, t, 3), 0.75, 3);

      return createCivilOutput({
        calculatorId: 'dam.filter',
        version: '1.0.0',
        primaryQuantity: vol,
        primaryUnit: 'm³',
        primaryLabel: 'Volume Material Filter Zona 2',
        breakdown: {
          luasBidangFilterM2: area,
          volumeMaterialFilterM3: vol,
        },
        materials: [
          { name: 'Pasir & Kerikil Filter Gradasi Terkontrol', quantity: vol, unit: 'm³' },
        ],
        formulaSource: {
          calculatorId: 'dam.filter',
          calculatorVersion: '1.0.0',
          formulaId: 'DAM_FILTER_VOL',
          mathematicalExpression: 'Vol = (L × H) × t × 0.75',
        },
        inputs,
      });
    },
  },

  // 7. DRAINAGE (GALLERY & TOE DRAIN)
  {
    id: 'dam.drainage',
    name: 'Dam Grouting Gallery & Drainage (Galeri Grouting & Drainase Bendungan)',
    shortName: 'Galeri Grouting & Drainase',
    category: 'infrastruktur',
    status: 'VERIFIED',
    pack: 'dam',
    version: '1.0.0',
    description: 'Menghitung volume beton struktur terowongan galeri grouting/inspeksi dan pipa drainase pondasi',
    primaryUnit: 'm',
    primaryQuantityLabel: 'Panjang Total Galeri Grouting',
    parameters: [
      { id: 'galleryLength', label: 'Panjang Galeri Grouting (L)', unit: 'm', defaultValue: 250, min: 10, required: true },
      { id: 'concreteVolumePerMeter', label: 'Volume Beton Struktur per Meter (v)', unit: 'm³/m', defaultValue: 4.5, min: 1.0 },
    ],
    formulaSource: ProvenanceEngine.createVerifiedReferenceProvenance({
      calculatorId: 'dam.drainage',
      calculatorVersion: '1.0.0',
      formulaId: 'DAM_GALLERY_VOL',
      mathematicalExpression: 'TotalConcrete = L × v',
      referenceName: 'Standar Terowongan & Galeri Grouting Bendungan SDA',
      sectionOrClause: 'Grouting Gallery Takeoff',
      status: 'PARTIALLY_VERIFIED',
    }),
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const L = toNum(inputs.galleryLength, 250);
      const v = toNum(inputs.concreteVolumePerMeter, 4.5);
      const totalConcrete = SafeDecimalEngine.safeMultiply(L, v, 3);

      return createCivilOutput({
        calculatorId: 'dam.drainage',
        version: '1.0.0',
        primaryQuantity: L,
        primaryUnit: 'm',
        primaryLabel: 'Panjang Galeri Grouting Bendungan',
        breakdown: {
          panjangGaleriM: L,
          totalVolumeBetonGaleriM3: totalConcrete,
        },
        materials: [
          { name: 'Beton K-300 Struktur Galeri Grouting', quantity: totalConcrete, unit: 'm³' },
        ],
        formulaSource: {
          calculatorId: 'dam.drainage',
          calculatorVersion: '1.0.0',
          formulaId: 'DAM_GALLERY_VOL',
          mathematicalExpression: 'TotalConcrete = L × v',
        },
        inputs,
      });
    },
  },

  // 8. ROCKFILL (ZONA 3 BATUAN PELEPAS)
  {
    id: 'dam.rockfill',
    name: 'Dam Rockfill Zone 3 (Zona 3 Timbunan Batu Kuari)',
    shortName: 'Timbunan Batu (Rockfill Zona 3)',
    category: 'infrastruktur',
    status: 'VERIFIED',
    pack: 'dam',
    version: '1.0.0',
    description: 'Menghitung volume timbunan batuan pecah kuari (quarry rockfill) zona 3A/3B penopang lereng luar bendungan',
    primaryUnit: 'm³',
    primaryQuantityLabel: 'Volume Timbunan Batu Kuari Zona 3',
    parameters: [
      { id: 'volume', label: 'Volume Timbunan Batuan Zona 3 (V)', unit: 'm³', defaultValue: 650000, min: 100, required: true },
    ],
    formulaSource: ProvenanceEngine.createVerifiedReferenceProvenance({
      calculatorId: 'dam.rockfill',
      calculatorVersion: '1.0.0',
      formulaId: 'DAM_ROCKFILL_VOL',
      mathematicalExpression: 'Vol = V',
      referenceName: 'Standar Zona 3 Rockfill Bendungan KKB',
      sectionOrClause: 'Rockfill Shell',
      status: 'PARTIALLY_VERIFIED',
    }),
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const V = toNum(inputs.volume, 650000);

      return createCivilOutput({
        calculatorId: 'dam.rockfill',
        version: '1.0.0',
        primaryQuantity: V,
        primaryUnit: 'm³',
        primaryLabel: 'Volume Timbunan Batuan Kuari Zona 3',
        breakdown: {
          volumeBatuKuariM3: V,
        },
        materials: [
          { name: 'Batuan Kuari Keras Zona 3 Rockfill', quantity: V, unit: 'm³' },
        ],
        formulaSource: {
          calculatorId: 'dam.rockfill',
          calculatorVersion: '1.0.0',
          formulaId: 'DAM_ROCKFILL_VOL',
          mathematicalExpression: 'Vol = V',
        },
        inputs,
      });
    },
  },

  // 9. SPILLWAY (BANGUNAN PELIMPAH BENDUNGAN)
  {
    id: 'dam.spillway',
    name: 'Dam Chute Spillway (Bangunan Pelimpah & Saluran Luncur Bendungan)',
    shortName: 'Pelimpah Bendungan (Spillway)',
    category: 'infrastruktur',
    status: 'VERIFIED',
    pack: 'dam',
    version: '1.0.0',
    description: 'Menghitung volume beton struktur ambang ogee, saluran luncur (chute), dan kolam peredam energi pelimpah bendungan',
    primaryUnit: 'm³',
    primaryQuantityLabel: 'Volume Beton Bangunan Pelimpah',
    parameters: [
      { id: 'chuteLength', label: 'Panjang Saluran Luncur (L)', unit: 'm', defaultValue: 250, min: 20, required: true },
      { id: 'chuteWidth', label: 'Lebar Saluran Luncur (W)', unit: 'm', defaultValue: 20, min: 3, required: true },
      { id: 'slabThickness', label: 'Tebal Plat Lantai Luncur (t)', unit: 'm', defaultValue: 1.0, min: 0.3 },
      { id: 'wallHeight', label: 'Tinggi Dinding Samping (Hw)', unit: 'm', defaultValue: 5.0, min: 1 },
      { id: 'wallThickness', label: 'Tebal Dinding Samping (tw)', unit: 'm', defaultValue: 0.8, min: 0.3 },
    ],
    formulaSource: ProvenanceEngine.createVerifiedReferenceProvenance({
      calculatorId: 'dam.spillway',
      calculatorVersion: '1.0.0',
      formulaId: 'DAM_SPILLWAY_VOL',
      mathematicalExpression: 'V_slab = L × W × t; V_walls = 2 × L × Hw × tw; Vol = V_slab + V_walls',
      referenceName: 'Standar Bangunan Pelimpah Bendungan Besar KKB / SDA',
      sectionOrClause: 'Chute Spillway Concrete',
      status: 'PARTIALLY_VERIFIED',
    }),
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const L = toNum(inputs.chuteLength, 250);
      const W = toNum(inputs.chuteWidth, 20);
      const t = toNum(inputs.slabThickness, 1.0);
      const Hw = toNum(inputs.wallHeight, 5.0);
      const tw = toNum(inputs.wallThickness, 0.8);

      const slabVol = SafeDecimalEngine.safeMultiply(L, SafeDecimalEngine.safeMultiply(W, t, 4), 3);
      const wallsVol = SafeDecimalEngine.safeMultiply(SafeDecimalEngine.safeMultiply(2, L, 2), SafeDecimalEngine.safeMultiply(Hw, tw, 4), 3);
      const totalVol = SafeDecimalEngine.safeAdd(slabVol, wallsVol);

      return createCivilOutput({
        calculatorId: 'dam.spillway',
        version: '1.0.0',
        primaryQuantity: totalVol,
        primaryUnit: 'm³',
        primaryLabel: 'Volume Beton Bangunan Pelimpah Bendungan',
        breakdown: {
          panjangSaluranLuncurM: L,
          volumePlatLantaiM3: slabVol,
          volumeDindingSampingM3: wallsVol,
          totalVolumeBetonSpillwayM3: totalVol,
        },
        materials: [
          { name: 'Beton Struktur K-350 Pelimpah Tahan Kavitasi', quantity: totalVol, unit: 'm³' },
        ],
        formulaSource: {
          calculatorId: 'dam.spillway',
          calculatorVersion: '1.0.0',
          formulaId: 'DAM_SPILLWAY_VOL',
          mathematicalExpression: 'Vol = (L × W × t) + (2 × L × Hw × tw)',
        },
        inputs,
      });
    },
  },

  // 10. OUTLET (TEROWONGAN PENGELUARAN / BOTTOM OUTLET)
  {
    id: 'dam.outlet',
    name: 'Dam Diversion & Outlet Tunnel (Terowongan Pengelak & Pengeluaran Bawah)',
    shortName: 'Terowongan Pengelak / Outlet',
    category: 'infrastruktur',
    status: 'VERIFIED',
    pack: 'dam',
    version: '1.0.0',
    description: 'Menghitung volume galian terowongan (tunnel excavation) dan volume beton lining sekunder terowongan pengelak/outlet bendungan',
    primaryUnit: 'm',
    primaryQuantityLabel: 'Panjang Terowongan Pengelak / Outlet',
    parameters: [
      { id: 'tunnelLength', label: 'Panjang Terowongan (L)', unit: 'm', defaultValue: 450, min: 20, required: true },
      { id: 'tunnelDiameter', label: 'Diameter Bersih Terowongan (D)', unit: 'm', defaultValue: 5.0, min: 1.5, required: true },
      { id: 'liningThickness', label: 'Tebal Beton Lining Sekunder (t)', unit: 'm', defaultValue: 0.50, min: 0.2 },
    ],
    formulaSource: ProvenanceEngine.createVerifiedReferenceProvenance({
      calculatorId: 'dam.outlet',
      calculatorVersion: '1.0.0',
      formulaId: 'DAM_TUNNEL_VOL',
      mathematicalExpression: 'D_exc = D + 2t; V_exc = (π/4 × D_exc²) × L; V_conc = (π/4 × (D_exc² - D²)) × L',
      referenceName: 'Standar Terowongan Pengelak Bendungan SDA',
      sectionOrClause: 'Tunnel Excavation & Lining',
      status: 'PARTIALLY_VERIFIED',
    }),
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const L = toNum(inputs.tunnelLength, 450);
      const D = toNum(inputs.tunnelDiameter, 5.0);
      const t = toNum(inputs.liningThickness, 0.50);

      const D_exc = SafeDecimalEngine.safeAdd(D, 2 * t);
      const areaExc = SafeDecimalEngine.safeMultiply(Math.PI / 4, Math.pow(D_exc, 2), 4);
      const areaVoid = SafeDecimalEngine.safeMultiply(Math.PI / 4, Math.pow(D, 2), 4);
      const areaConc = SafeDecimalEngine.safeSubtract(areaExc, areaVoid);

      const volExc = SafeDecimalEngine.safeMultiply(areaExc, L, 3);
      const volConc = SafeDecimalEngine.safeMultiply(areaConc, L, 3);

      return createCivilOutput({
        calculatorId: 'dam.outlet',
        version: '1.0.0',
        primaryQuantity: L,
        primaryUnit: 'm',
        primaryLabel: 'Panjang Terowongan Pengelak / Outlet',
        breakdown: {
          panjangTerowonganM: L,
          volumeGalianTerowonganM3: volExc,
          volumeBetonLiningM3: volConc,
        },
        materials: [
          { name: 'Beton Lining Terowongan K-350', quantity: volConc, unit: 'm³' },
        ],
        formulaSource: {
          calculatorId: 'dam.outlet',
          calculatorVersion: '1.0.0',
          formulaId: 'DAM_TUNNEL_VOL',
          mathematicalExpression: 'V_exc = (π/4 × D_exc²) × L; V_conc = (π/4 × (D_exc² - D²)) × L',
        },
        inputs,
      });
    },
  },

  // 11. INTAKE (MENARA PENGAMBILAN BENDUNGAN)
  {
    id: 'dam.intake',
    name: 'Dam Intake Tower (Menara Pengambilan Air Bendungan)',
    shortName: 'Menara Pengambilan (Intake Dam)',
    category: 'infrastruktur',
    status: 'VERIFIED',
    pack: 'dam',
    version: '1.0.0',
    description: 'Menghitung volume beton struktur menara intake penampung air baku / irigasi / PLTA bendungan',
    primaryUnit: 'm³',
    primaryQuantityLabel: 'Volume Beton Menara Intake',
    parameters: [
      { id: 'towerHeight', label: 'Tinggi Menara Intake (H)', unit: 'm', defaultValue: 35, min: 5, required: true },
      { id: 'concreteVolumePerMeter', label: 'Volume Beton per Meter Tinggi (v)', unit: 'm³/m', defaultValue: 15, min: 2 },
    ],
    formulaSource: ProvenanceEngine.createVerifiedReferenceProvenance({
      calculatorId: 'dam.intake',
      calculatorVersion: '1.0.0',
      formulaId: 'DAM_INTAKE_VOL',
      mathematicalExpression: 'Vol = H × v',
      referenceName: 'Standar Menara Pengambilan Bendungan Besar KKB',
      sectionOrClause: 'Intake Tower Takeoff',
      status: 'PARTIALLY_VERIFIED',
    }),
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const H = toNum(inputs.towerHeight, 35);
      const v = toNum(inputs.concreteVolumePerMeter, 15);
      const vol = SafeDecimalEngine.safeMultiply(H, v, 3);

      return createCivilOutput({
        calculatorId: 'dam.intake',
        version: '1.0.0',
        primaryQuantity: vol,
        primaryUnit: 'm³',
        primaryLabel: 'Volume Beton Menara Intake Bendungan',
        breakdown: {
          tinggiMenaraM: H,
          volumeBetonTotalM3: vol,
        },
        materials: [
          { name: 'Beton Struktur K-350 Menara Intake', quantity: vol, unit: 'm³' },
        ],
        formulaSource: {
          calculatorId: 'dam.intake',
          calculatorVersion: '1.0.0',
          formulaId: 'DAM_INTAKE_VOL',
          mathematicalExpression: 'Vol = H × v',
        },
        inputs,
      });
    },
  },

  // 12. PROTECTION (RIPRAP ZONA 4 PELINDUNG HULU)
  {
    id: 'dam.protection',
    name: 'Dam Upstream Riprap Protection (Riprap Batu Pelindung Lereng Hulu)',
    shortName: 'Riprap Pelindung Hulu Bendungan',
    category: 'infrastruktur',
    status: 'VERIFIED',
    pack: 'dam',
    version: '1.0.0',
    description: 'Menghitung volume batu armor riprap pelindung lereng hulu bendungan terhadap hantaman gelombang waduk',
    primaryUnit: 'm³',
    primaryQuantityLabel: 'Volume Batu Armor Riprap',
    parameters: [
      { id: 'crestLength', label: 'Panjang Lereng Hulu (L)', unit: 'm', defaultValue: 350, min: 10, required: true },
      { id: 'slopeLength', label: 'Panjang Miring Lereng Dilindungi (Ls)', unit: 'm', defaultValue: 60, min: 5, required: true },
      { id: 'riprapThickness', label: 'Tebal Lapisan Batu Riprap (t)', unit: 'm', defaultValue: 1.0, min: 0.3 },
    ],
    formulaSource: ProvenanceEngine.createVerifiedReferenceProvenance({
      calculatorId: 'dam.protection',
      calculatorVersion: '1.0.0',
      formulaId: 'DAM_RIPRAP_VOL',
      mathematicalExpression: 'Area = L × Ls; Vol = Area × t',
      referenceName: 'Standar Riprap Perlindungan Lereng Hulu Bendungan KKB',
      sectionOrClause: 'Upstream Riprap Protection',
      status: 'PARTIALLY_VERIFIED',
    }),
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const L = toNum(inputs.crestLength, 350);
      const Ls = toNum(inputs.slopeLength, 60);
      const t = toNum(inputs.riprapThickness, 1.0);

      const area = SafeDecimalEngine.safeMultiply(L, Ls, 2);
      const vol = SafeDecimalEngine.safeMultiply(area, t, 3);

      return createCivilOutput({
        calculatorId: 'dam.protection',
        version: '1.0.0',
        primaryQuantity: vol,
        primaryUnit: 'm³',
        primaryLabel: 'Volume Batu Armor Riprap Pelindung Hulu',
        breakdown: {
          luasPermukaanLerengHuluM2: area,
          volumeBatuArmorRiprapM3: vol,
        },
        materials: [
          { name: 'Batu Armor Kuari Keras Riprap Dia 50-80 cm', quantity: vol, unit: 'm³' },
        ],
        formulaSource: {
          calculatorId: 'dam.protection',
          calculatorVersion: '1.0.0',
          formulaId: 'DAM_RIPRAP_VOL',
          mathematicalExpression: 'Area = L × Ls; Vol = Area × t',
        },
        inputs,
      });
    },
  },
];
