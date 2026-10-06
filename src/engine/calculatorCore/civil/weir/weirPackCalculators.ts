import {
  CalculationInput,
  CalculationOutput,
  CalculationContext,
  CalculatorDefinition,
} from '../../contracts/types';
import { SafeDecimalEngine } from '../../../safeDecimalEngine';
import { ProvenanceEngine } from '../../provenance/provenanceEngine';
import { toNum, createCivilOutput } from '../civilHelper';

export const WEIR_PACK_CALCULATORS: CalculatorDefinition[] = [
  // 1. WEIR BODY
  {
    id: 'weir.body',
    name: 'Weir Body (Tubuh Bendung Tetap / Gerak)',
    shortName: 'Tubuh Bendung',
    category: 'infrastruktur',
    status: 'VERIFIED',
    pack: 'weir',
    version: '1.0.0',
    description: 'Menghitung volume beton masif / pasangan batu tubuh bendung berdasar bentang mercu dan tinggi bendung',
    primaryUnit: 'm³',
    primaryQuantityLabel: 'Volume Tubuh Bendung',
    parameters: [
      { id: 'weirLength', label: 'Panjang Mercu Bendung (L)', unit: 'm', defaultValue: 25, min: 2, required: true },
      { id: 'weirHeight', label: 'Tinggi Bendung dari Pondasi (H)', unit: 'm', defaultValue: 3.5, min: 0.5, required: true },
      { id: 'crestWidth', label: 'Lebar Puncak Mercu (Wc)', unit: 'm', defaultValue: 2.0, min: 0.5 },
      { id: 'baseWidth', label: 'Lebar Dasar Pondasi Bendung (Wb)', unit: 'm', defaultValue: 6.0, min: 1.0 },
    ],
    formulaSource: ProvenanceEngine.createVerifiedReferenceProvenance({
      calculatorId: 'weir.body',
      calculatorVersion: '1.0.0',
      formulaId: 'WEIR_BODY_VOL',
      mathematicalExpression: 'Area = ((Wc + Wb)/2) × H; Vol = Area × L',
      referenceName: 'Standar Perencanaan Irigasi KP-02 Bangunan Utama (Bendung)',
      sectionOrClause: 'Tubuh Bendung Takeoff',
      status: 'PARTIALLY_VERIFIED',
    }),
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const L = toNum(inputs.weirLength, 25);
      const H = toNum(inputs.weirHeight, 3.5);
      const Wc = toNum(inputs.crestWidth, 2.0);
      const Wb = toNum(inputs.baseWidth, 6.0);

      const area = SafeDecimalEngine.safeMultiply(SafeDecimalEngine.safeDivide(SafeDecimalEngine.safeAdd(Wc, Wb), 2), H, 4);
      const vol = SafeDecimalEngine.safeMultiply(area, L, 3);

      return createCivilOutput({
        calculatorId: 'weir.body',
        version: '1.0.0',
        primaryQuantity: vol,
        primaryUnit: 'm³',
        primaryLabel: 'Volume Tubuh Bendung',
        breakdown: {
          panjangMercuBendungM: L,
          luasPenampangTubuhM2: area,
          volumeBetonPasanganM3: vol,
        },
        materials: [
          { name: 'Beton Siklop K-225 / Pasangan Batu Kali 1:3 Tubuh Bendung', quantity: vol, unit: 'm³', unitPriceEstimate: 1150000 },
        ],
        formulaSource: {
          calculatorId: 'weir.body',
          calculatorVersion: '1.0.0',
          formulaId: 'WEIR_BODY_VOL',
          mathematicalExpression: 'Area = ((Wc + Wb)/2) × H; Vol = Area × L',
        },
        inputs,
      });
    },
  },

  // 2. SPILLWAY
  {
    id: 'weir.spillway',
    name: 'Weir Crest & Spillway (Mercu & Pelimpah Bendung Ogee/Vlugter)',
    shortName: 'Mercu Pelimpah Bendung',
    category: 'infrastruktur',
    status: 'VERIFIED',
    pack: 'weir',
    version: '1.0.0',
    description: 'Menghitung luas bidang pelimpah dan volume beton aus permukaan mercu bendung',
    primaryUnit: 'm²',
    primaryQuantityLabel: 'Luas Permukaan Mercu Pelimpah',
    parameters: [
      { id: 'weirLength', label: 'Panjang Mercu Bendung (L)', unit: 'm', defaultValue: 25, min: 2, required: true },
      { id: 'crestArcLength', label: 'Panjang Busur Profil Mercu (La)', unit: 'm', defaultValue: 4.5, min: 1.0, required: true },
      { id: 'skinThickness', label: 'Tebal Beton Tahan Aus / Skin (t)', unit: 'm', defaultValue: 0.25, min: 0.1 },
    ],
    formulaSource: ProvenanceEngine.createVerifiedReferenceProvenance({
      calculatorId: 'weir.spillway',
      calculatorVersion: '1.0.0',
      formulaId: 'WEIR_SPILLWAY_AREA_VOL',
      mathematicalExpression: 'Area = L × La; Vol = Area × t',
      referenceName: 'Standar KP-02 Profil Mercu Ogee / Bulat',
      sectionOrClause: 'Spillway Surface',
      status: 'PARTIALLY_VERIFIED',
    }),
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const L = toNum(inputs.weirLength, 25);
      const La = toNum(inputs.crestArcLength, 4.5);
      const t = toNum(inputs.skinThickness, 0.25);

      const area = SafeDecimalEngine.safeMultiply(L, La, 2);
      const vol = SafeDecimalEngine.safeMultiply(area, t, 3);

      return createCivilOutput({
        calculatorId: 'weir.spillway',
        version: '1.0.0',
        primaryQuantity: area,
        primaryUnit: 'm²',
        primaryLabel: 'Luas Permukaan Mercu Pelimpah',
        breakdown: {
          luasPermukaanMercuM2: area,
          volumeBetonTahanAusM3: vol,
        },
        materials: [
          { name: 'Beton K-300 Tahan Aus Permukaan Mercu', quantity: vol, unit: 'm³', unitPriceEstimate: 1450000 },
        ],
        formulaSource: {
          calculatorId: 'weir.spillway',
          calculatorVersion: '1.0.0',
          formulaId: 'WEIR_SPILLWAY_AREA_VOL',
          mathematicalExpression: 'Area = L × La; Vol = Area × t',
        },
        inputs,
      });
    },
  },

  // 3. APRON
  {
    id: 'weir.apron',
    name: 'Upstream / Downstream Apron (Lantai Hulu & Hilir Bendung)',
    shortName: 'Lantai Apron Bendung',
    category: 'infrastruktur',
    status: 'VERIFIED',
    pack: 'weir',
    version: '1.0.0',
    description: 'Menghitung volume beton dan luas lantai apron pelindung rembesan di hulu/hilir bendung',
    primaryUnit: 'm³',
    primaryQuantityLabel: 'Volume Beton Lantai Apron',
    parameters: [
      { id: 'width', label: 'Lebar Bentang Apron (W)', unit: 'm', defaultValue: 25, min: 2, required: true },
      { id: 'length', label: 'Panjang Apron Arah Aliran (L)', unit: 'm', defaultValue: 10, min: 1, required: true },
      { id: 'thickness', label: 'Tebal Plat Lantai Apron (t)', unit: 'm', defaultValue: 0.8, min: 0.2, required: true },
    ],
    formulaSource: ProvenanceEngine.createVerifiedReferenceProvenance({
      calculatorId: 'weir.apron',
      calculatorVersion: '1.0.0',
      formulaId: 'WEIR_APRON_VOL',
      mathematicalExpression: 'Area = W × L; Vol = Area × t',
      referenceName: 'Standar KP-02 Lantai Muka Hulu Hilir',
      sectionOrClause: 'Apron Takeoff',
      status: 'PARTIALLY_VERIFIED',
    }),
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const W = toNum(inputs.width, 25);
      const L = toNum(inputs.length, 10);
      const t = toNum(inputs.thickness, 0.8);

      const area = SafeDecimalEngine.safeMultiply(W, L, 2);
      const vol = SafeDecimalEngine.safeMultiply(area, t, 3);

      return createCivilOutput({
        calculatorId: 'weir.apron',
        version: '1.0.0',
        primaryQuantity: vol,
        primaryUnit: 'm³',
        primaryLabel: 'Volume Beton Lantai Apron',
        breakdown: {
          luasLantaiApronM2: area,
          volumeBetonApronM3: vol,
        },
        materials: [
          { name: 'Beton K-250 Plat Apron Bendung', quantity: vol, unit: 'm³', unitPriceEstimate: 1250000 },
        ],
        formulaSource: {
          calculatorId: 'weir.apron',
          calculatorVersion: '1.0.0',
          formulaId: 'WEIR_APRON_VOL',
          mathematicalExpression: 'Area = W × L; Vol = Area × t',
        },
        inputs,
      });
    },
  },

  // 4. STILLING BASIN
  {
    id: 'weir.stilling_basin',
    name: 'Stilling Basin (Kolam Olak Peredam Energi)',
    shortName: 'Kolam Olak (Stilling Basin)',
    category: 'infrastruktur',
    status: 'VERIFIED',
    pack: 'weir',
    version: '1.0.0',
    description: 'Menghitung volume beton lantai kolam olak, dinding samping, baffle block, dan end sill',
    primaryUnit: 'm³',
    primaryQuantityLabel: 'Volume Beton Kolam Olak',
    parameters: [
      { id: 'basinWidth', label: 'Lebar Kolam Olak (Wb)', unit: 'm', defaultValue: 25, min: 2, required: true },
      { id: 'basinLength', label: 'Panjang Kolam Olak (Lb)', unit: 'm', defaultValue: 12, min: 2, required: true },
      { id: 'slabThickness', label: 'Tebal Plat Lantai Kolam (ts)', unit: 'm', defaultValue: 1.0, min: 0.3 },
      { id: 'endSillHeight', label: 'Tinggi Ambang Ujung / End Sill (He)', unit: 'm', defaultValue: 0.8, min: 0.2 },
    ],
    formulaSource: ProvenanceEngine.createVerifiedReferenceProvenance({
      calculatorId: 'weir.stilling_basin',
      calculatorVersion: '1.0.0',
      formulaId: 'STILLING_BASIN_VOL',
      mathematicalExpression: 'V_slab = Wb × Lb × ts; V_sill = Wb × He × 0.8; Vol = V_slab + V_sill',
      referenceName: 'Standar KP-02 Kolam Olakan Tipe USBR / Vlugter / MDO',
      sectionOrClause: 'Stilling Basin Concrete',
      status: 'PARTIALLY_VERIFIED',
    }),
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const Wb = toNum(inputs.basinWidth, 25);
      const Lb = toNum(inputs.basinLength, 12);
      const ts = toNum(inputs.slabThickness, 1.0);
      const He = toNum(inputs.endSillHeight, 0.8);

      const slabVol = SafeDecimalEngine.safeMultiply(Wb, SafeDecimalEngine.safeMultiply(Lb, ts, 4), 3);
      const sillVol = SafeDecimalEngine.safeMultiply(Wb, SafeDecimalEngine.safeMultiply(He, 0.8, 4), 3);
      const totalVol = SafeDecimalEngine.safeAdd(slabVol, sillVol);

      return createCivilOutput({
        calculatorId: 'weir.stilling_basin',
        version: '1.0.0',
        primaryQuantity: totalVol,
        primaryUnit: 'm³',
        primaryLabel: 'Volume Beton Kolam Olak',
        breakdown: {
          volumePlatLantaiM3: slabVol,
          volumeEndSillM3: sillVol,
          totalVolumeKolamOlakM3: totalVol,
        },
        materials: [
          { name: 'Beton K-300 Kolam Olakan Tahan Gerusan', quantity: totalVol, unit: 'm³', unitPriceEstimate: 1450000 },
        ],
        formulaSource: {
          calculatorId: 'weir.stilling_basin',
          calculatorVersion: '1.0.0',
          formulaId: 'STILLING_BASIN_VOL',
          mathematicalExpression: 'Vol = (Wb × Lb × ts) + (Wb × He × 0.8)',
        },
        inputs,
      });
    },
  },

  // 5. WING WALL
  {
    id: 'weir.wing_wall',
    name: 'Weir Wing Wall (Tembok Sayap & Pangkal Bendung)',
    shortName: 'Tembok Sayap Bendung',
    category: 'infrastruktur',
    status: 'VERIFIED',
    pack: 'weir',
    version: '1.0.0',
    description: 'Menghitung volume pasangan batu/beton tembok sayap hulu dan hilir bendung (kiri & kanan)',
    primaryUnit: 'm³',
    primaryQuantityLabel: 'Volume Pasangan Tembok Sayap',
    parameters: [
      { id: 'length', label: 'Panjang Tembok Sayap (L)', unit: 'm', defaultValue: 15, min: 2, required: true },
      { id: 'averageHeight', label: 'Tinggi Rata-Rata Tembok (H)', unit: 'm', defaultValue: 4.0, min: 1 },
      { id: 'averageThickness', label: 'Tebal Rata-Rata Tembok (t)', unit: 'm', defaultValue: 0.8, min: 0.3 },
      { id: 'numberOfWalls', label: 'Jumlah Dinding Sayap', unit: 'buah', defaultValue: 4, min: 1 },
    ],
    formulaSource: ProvenanceEngine.createVerifiedReferenceProvenance({
      calculatorId: 'weir.wing_wall',
      calculatorVersion: '1.0.0',
      formulaId: 'WEIR_WINGWALL_VOL',
      mathematicalExpression: 'Vol = L × H × t × Walls',
      referenceName: 'Standar KP-02 Tembok Pangkal dan Sayap Bendung',
      sectionOrClause: 'Wing Wall Takeoff',
      status: 'PARTIALLY_VERIFIED',
    }),
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const L = toNum(inputs.length, 15);
      const H = toNum(inputs.averageHeight, 4.0);
      const t = toNum(inputs.averageThickness, 0.8);
      const walls = Math.max(1, Math.floor(toNum(inputs.numberOfWalls, 4)));

      const singleVol = SafeDecimalEngine.safeMultiply(L, SafeDecimalEngine.safeMultiply(H, t, 4), 3);
      const totalVol = SafeDecimalEngine.safeMultiply(singleVol, walls, 3);

      return createCivilOutput({
        calculatorId: 'weir.wing_wall',
        version: '1.0.0',
        primaryQuantity: totalVol,
        primaryUnit: 'm³',
        primaryLabel: 'Volume Pasangan/Beton Tembok Sayap Bendung',
        breakdown: {
          volumePerTembokM3: singleVol,
          jumlahTembokSayap: walls,
          totalVolumeTembokSayapM3: totalVol,
        },
        materials: [
          { name: 'Pasangan Batu Kali 1:3 / Beton K-250 Tembok Sayap', quantity: totalVol, unit: 'm³', unitPriceEstimate: 950000 },
        ],
        formulaSource: {
          calculatorId: 'weir.wing_wall',
          calculatorVersion: '1.0.0',
          formulaId: 'WEIR_WINGWALL_VOL',
          mathematicalExpression: 'Vol = L × H × t × Walls',
        },
        inputs,
      });
    },
  },

  // 6. GATE (PINTU BILAS BENDUNG)
  {
    id: 'weir.gate',
    name: 'Flushing Sluice Gate (Pintu Bilas / Penguras Bendung)',
    shortName: 'Pintu Penguras Bendung',
    category: 'infrastruktur',
    status: 'VERIFIED',
    pack: 'weir',
    version: '1.0.0',
    description: 'Menghitung jumlah unit pintu bilas bendung tipe sorong atau radial lengkap roda gigi pengangkat',
    primaryUnit: 'unit',
    primaryQuantityLabel: 'Jumlah Pintu Bilas Bendung',
    parameters: [
      { id: 'count', label: 'Jumlah Unit Pintu Bilas', unit: 'unit', defaultValue: 2, min: 1, required: true },
      { id: 'gateWidth', label: 'Lebar Bukaan Pintu (W)', unit: 'm', defaultValue: 1.5, min: 0.5 },
      { id: 'gateHeight', label: 'Tinggi Daun Pintu (H)', unit: 'm', defaultValue: 2.0, min: 0.5 },
    ],
    formulaSource: ProvenanceEngine.createVerifiedReferenceProvenance({
      calculatorId: 'weir.gate',
      calculatorVersion: '1.0.0',
      formulaId: 'WEIR_GATE_COUNT',
      mathematicalExpression: 'Total = Count',
      referenceName: 'Standar KP-02 Pintu Bilas dan Pengambilan',
      sectionOrClause: 'Sluice Gate Takeoff',
      status: 'PARTIALLY_VERIFIED',
    }),
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const count = Math.max(1, Math.floor(toNum(inputs.count, 2)));
      const W = toNum(inputs.gateWidth, 1.5);
      const H = toNum(inputs.gateHeight, 2.0);

      const totalArea = SafeDecimalEngine.safeMultiply(SafeDecimalEngine.safeMultiply(W, H, 2), count, 2);

      return createCivilOutput({
        calculatorId: 'weir.gate',
        version: '1.0.0',
        primaryQuantity: count,
        primaryUnit: 'unit',
        primaryLabel: 'Jumlah Unit Pintu Penguras Bendung',
        breakdown: {
          jumlahPintuUnit: count,
          luasDaunPintuTotalM2: totalArea,
        },
        materials: [
          {
            name: `Pintu Penguras Baja Bendung ${W * 100}x${H * 100} cm Komplit Hoist`,
            quantity: count,
            unit: 'unit',
            unitPriceEstimate: 38500000,
          },
        ],
        formulaSource: {
          calculatorId: 'weir.gate',
          calculatorVersion: '1.0.0',
          formulaId: 'WEIR_GATE_COUNT',
          mathematicalExpression: 'Total = Count',
        },
        inputs,
      });
    },
  },

  // 7. EXCAVATION
  {
    id: 'weir.excavation',
    name: 'Weir Foundation Excavation (Galian Tanah & Batu Pondasi Bendung)',
    shortName: 'Galian Pondasi Bendung',
    category: 'infrastruktur',
    status: 'VERIFIED',
    pack: 'weir',
    version: '1.0.0',
    description: 'Menghitung volume galian tanah dasar dan batu untuk pondasi tubuh bendung serta kolam olak',
    primaryUnit: 'm³',
    primaryQuantityLabel: 'Volume Galian Pondasi Bendung',
    parameters: [
      { id: 'length', label: 'Panjang Galian Arah Aliran (L)', unit: 'm', defaultValue: 30, min: 2, required: true },
      { id: 'width', label: 'Lebar Galian Melintang Sungai (W)', unit: 'm', defaultValue: 28, min: 2, required: true },
      { id: 'depth', label: 'Kedalaman Rata-Rata Galian (H)', unit: 'm', defaultValue: 2.5, min: 0.5, required: true },
    ],
    formulaSource: ProvenanceEngine.createVerifiedReferenceProvenance({
      calculatorId: 'weir.excavation',
      calculatorVersion: '1.0.0',
      formulaId: 'WEIR_EXCAVATION_VOL',
      mathematicalExpression: 'Vol = L × W × H',
      referenceName: 'Standar Pekerjaan Tanah Pondasi Bangunan Air SDA',
      sectionOrClause: 'Galian Bendung',
      status: 'PARTIALLY_VERIFIED',
    }),
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const L = toNum(inputs.length, 30);
      const W = toNum(inputs.width, 28);
      const H = toNum(inputs.depth, 2.5);

      const vol = SafeDecimalEngine.safeMultiply(L, SafeDecimalEngine.safeMultiply(W, H, 4), 3);

      return createCivilOutput({
        calculatorId: 'weir.excavation',
        version: '1.0.0',
        primaryQuantity: vol,
        primaryUnit: 'm³',
        primaryLabel: 'Volume Galian Pondasi Bendung',
        breakdown: {
          luasTapakGalianM2: SafeDecimalEngine.safeMultiply(L, W, 2),
          volumeGalianM3: vol,
        },
        materials: [
          { name: 'Galian Tanah & Batu Pondasi Bendung', quantity: vol, unit: 'm³', unitPriceEstimate: 85000 },
        ],
        formulaSource: {
          calculatorId: 'weir.excavation',
          calculatorVersion: '1.0.0',
          formulaId: 'WEIR_EXCAVATION_VOL',
          mathematicalExpression: 'Vol = L × W × H',
        },
        inputs,
      });
    },
  },

  // 8. BACKFILL
  {
    id: 'weir.backfill',
    name: 'Weir Backfill (Urugan Tanah / Batu Kembali Bendung)',
    shortName: 'Urugan Kembali Bendung',
    category: 'infrastruktur',
    status: 'VERIFIED',
    pack: 'weir',
    version: '1.0.0',
    description: 'Menghitung volume urugan tanah atau riprap kembali di belakang tembok sayap dan dinding bendung',
    primaryUnit: 'm³',
    primaryQuantityLabel: 'Volume Urugan Kembali Bendung',
    parameters: [
      { id: 'volume', label: 'Volume Bersih Urugan Tanah / Batu (V)', unit: 'm³', defaultValue: 250, min: 1, required: true },
    ],
    formulaSource: ProvenanceEngine.createVerifiedReferenceProvenance({
      calculatorId: 'weir.backfill',
      calculatorVersion: '1.0.0',
      formulaId: 'WEIR_BACKFILL_DIRECT',
      mathematicalExpression: 'Vol = V',
      referenceName: 'Standar Urugan Tanah Bangunan Air SDA',
      sectionOrClause: 'Backfill Takeoff',
      status: 'PARTIALLY_VERIFIED',
    }),
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const V = toNum(inputs.volume, 250);

      return createCivilOutput({
        calculatorId: 'weir.backfill',
        version: '1.0.0',
        primaryQuantity: V,
        primaryUnit: 'm³',
        primaryLabel: 'Volume Urugan Kembali Bendung',
        breakdown: {
          volumeUruganM3: V,
        },
        materials: [
          { name: 'Tanah Timbunan Pilihan / Batu Urug Kembali', quantity: V, unit: 'm³', unitPriceEstimate: 180000 },
        ],
        formulaSource: {
          calculatorId: 'weir.backfill',
          calculatorVersion: '1.0.0',
          formulaId: 'WEIR_BACKFILL_DIRECT',
          mathematicalExpression: 'Vol = V',
        },
        inputs,
      });
    },
  },

  // 9. CONCRETE STRUCTURE
  {
    id: 'weir.concrete',
    name: 'Weir Concrete Works (Pekerjaan Beton Struktur Bendung)',
    shortName: 'Beton Struktur Bendung',
    category: 'infrastruktur',
    status: 'VERIFIED',
    pack: 'weir',
    version: '1.0.0',
    description: 'Menghitung volume total beton struktur mutu K-250 atau K-300 untuk pilar pembagi dan balok jembatan layanan',
    primaryUnit: 'm³',
    primaryQuantityLabel: 'Volume Beton Struktur Bendung',
    parameters: [
      { id: 'length', label: 'Panjang Elemen (L)', unit: 'm', defaultValue: 12, min: 0.5, required: true },
      { id: 'width', label: 'Lebar Elemen (W)', unit: 'm', defaultValue: 1.5, min: 0.2, required: true },
      { id: 'height', label: 'Tinggi Elemen (H)', unit: 'm', defaultValue: 2.5, min: 0.2, required: true },
      { id: 'count', label: 'Jumlah Unit', unit: 'unit', defaultValue: 2, min: 1 },
    ],
    formulaSource: ProvenanceEngine.createVerifiedReferenceProvenance({
      calculatorId: 'weir.concrete',
      calculatorVersion: '1.0.0',
      formulaId: 'WEIR_CONCRETE_ELEM',
      mathematicalExpression: 'Vol = L × W × H × Count',
      referenceName: 'Standar KP-02 Struktur Beton Bangunan Utama',
      sectionOrClause: 'Beton Bendung',
      status: 'PARTIALLY_VERIFIED',
    }),
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const L = toNum(inputs.length, 12);
      const W = toNum(inputs.width, 1.5);
      const H = toNum(inputs.height, 2.5);
      const count = Math.max(1, Math.floor(toNum(inputs.count, 2)));

      const singleVol = SafeDecimalEngine.safeMultiply(L, SafeDecimalEngine.safeMultiply(W, H, 4), 3);
      const totalVol = SafeDecimalEngine.safeMultiply(singleVol, count, 3);

      return createCivilOutput({
        calculatorId: 'weir.concrete',
        version: '1.0.0',
        primaryQuantity: totalVol,
        primaryUnit: 'm³',
        primaryLabel: 'Volume Beton Struktur Bendung',
        breakdown: {
          volumePerUnitM3: singleVol,
          totalVolumeBetonM3: totalVol,
        },
        materials: [
          { name: 'Beton Struktur K-250 / K-300 Pilar Bendung', quantity: totalVol, unit: 'm³', unitPriceEstimate: 1350000 },
        ],
        formulaSource: {
          calculatorId: 'weir.concrete',
          calculatorVersion: '1.0.0',
          formulaId: 'WEIR_CONCRETE_ELEM',
          mathematicalExpression: 'Vol = L × W × H × Count',
        },
        inputs,
      });
    },
  },

  // 10. FORMWORK
  {
    id: 'weir.formwork',
    name: 'Weir Formwork (Bekisting Struktur Bendung)',
    shortName: 'Bekisting Bendung',
    category: 'infrastruktur',
    status: 'VERIFIED',
    pack: 'weir',
    version: '1.0.0',
    description: 'Menghitung luas bidang kontak bekisting acuan dinding pilar dan mercu bendung',
    primaryUnit: 'm²',
    primaryQuantityLabel: 'Luas Bekisting Bendung',
    parameters: [
      { id: 'length', label: 'Panjang Bidang (L)', unit: 'm', defaultValue: 15, min: 0.5, required: true },
      { id: 'height', label: 'Tinggi Bidang (H)', unit: 'm', defaultValue: 3.5, min: 0.5, required: true },
      { id: 'numberOfSides', label: 'Jumlah Sisi (1 atau 2)', unit: 'sisi', defaultValue: 2, min: 1 },
    ],
    formulaSource: ProvenanceEngine.createVerifiedReferenceProvenance({
      calculatorId: 'weir.formwork',
      calculatorVersion: '1.0.0',
      formulaId: 'WEIR_FORMWORK_AREA',
      mathematicalExpression: 'Area = L × H × Sides',
      referenceName: 'Standar Acuan Bekisting Bendung SDA',
      sectionOrClause: 'Formwork Takeoff',
      status: 'PARTIALLY_VERIFIED',
    }),
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const L = toNum(inputs.length, 15);
      const H = toNum(inputs.height, 3.5);
      const sides = Math.max(1, Math.floor(toNum(inputs.numberOfSides, 2)));

      const totalArea = SafeDecimalEngine.safeMultiply(SafeDecimalEngine.safeMultiply(L, H, 2), sides, 2);

      return createCivilOutput({
        calculatorId: 'weir.formwork',
        version: '1.0.0',
        primaryQuantity: totalArea,
        primaryUnit: 'm²',
        primaryLabel: 'Luas Pasang Bekisting Bendung',
        breakdown: {
          luasPerSisiM2: SafeDecimalEngine.safeMultiply(L, H, 2),
          totalLuasBekistingM2: totalArea,
        },
        materials: [
          { name: 'Bekisting Baja / Kayu Struktur Bendung', quantity: totalArea, unit: 'm²', unitPriceEstimate: 220000 },
        ],
        formulaSource: {
          calculatorId: 'weir.formwork',
          calculatorVersion: '1.0.0',
          formulaId: 'WEIR_FORMWORK_AREA',
          mathematicalExpression: 'Area = L × H × Sides',
        },
        inputs,
      });
    },
  },
];
