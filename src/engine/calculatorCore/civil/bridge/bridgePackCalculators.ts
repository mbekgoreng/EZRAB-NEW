import {
  CalculationInput,
  CalculationOutput,
  CalculationContext,
  CalculatorDefinition,
} from '../../contracts/types';
import { SafeDecimalEngine } from '../../../safeDecimalEngine';
import { ProvenanceEngine } from '../../provenance/provenanceEngine';
import { toNum, createCivilOutput } from '../civilHelper';

export const BRIDGE_PACK_CALCULATORS: CalculatorDefinition[] = [
  // 1. BRIDGE GEOMETRY
  {
    id: 'bridge.geometry',
    name: 'Bridge Geometry (Geometri Jembatan)',
    shortName: 'Geometri Jembatan',
    category: 'infrastruktur',
    status: 'VERIFIED',
    pack: 'bridge',
    version: '1.0.0',
    description: 'Menghitung total panjang bentang, lebar lantai, luas tapak lantai, dan jumlah bentang jembatan',
    primaryUnit: 'm²',
    primaryQuantityLabel: 'Luas Lantai Jembatan',
    parameters: [
      { id: 'totalSpan', label: 'Panjang Total Bentang (L)', unit: 'm', defaultValue: 30, min: 2, required: true },
      { id: 'deckWidth', label: 'Lebar Total Jembatan (W)', unit: 'm', defaultValue: 9.0, min: 2, required: true },
      { id: 'numberOfSpans', label: 'Jumlah Bentang (n)', unit: 'bentang', defaultValue: 1, min: 1 },
    ],
    formulaSource: ProvenanceEngine.createVerifiedReferenceProvenance({
      calculatorId: 'bridge.geometry',
      calculatorVersion: '1.0.0',
      formulaId: 'BRIDGE_GEOM_AREA',
      mathematicalExpression: 'DeckArea = L × W',
      referenceName: 'BMS (Bridge Management System) Bina Marga',
      sectionOrClause: 'Geometri Jembatan Standar',
      status: 'PARTIALLY_VERIFIED',
    }),
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const L = toNum(inputs.totalSpan, 30);
      const W = toNum(inputs.deckWidth, 9.0);
      const n = Math.max(1, Math.floor(toNum(inputs.numberOfSpans, 1)));
      const area = SafeDecimalEngine.safeMultiply(L, W, 2);
      const spanLen = SafeDecimalEngine.safeDivide(L, n, 2);

      return createCivilOutput({
        calculatorId: 'bridge.geometry',
        version: '1.0.0',
        primaryQuantity: area,
        primaryUnit: 'm²',
        primaryLabel: 'Luas Lantai Jembatan',
        breakdown: {
          panjangTotalBentangM: L,
          lebarJembatanM: W,
          jumlahBentang: n,
          panjangPerBentangM: spanLen,
          luasLantaiJembatanM2: area,
        },
        formulaSource: {
          calculatorId: 'bridge.geometry',
          calculatorVersion: '1.0.0',
          formulaId: 'BRIDGE_GEOM_AREA',
          mathematicalExpression: 'DeckArea = L × W',
        },
        inputs,
      });
    },
  },

  // 2. DECK SLAB
  {
    id: 'bridge.deck',
    name: 'Bridge Deck Slab (Plat Lantai Jembatan)',
    shortName: 'Plat Lantai Jembatan',
    category: 'infrastruktur',
    status: 'VERIFIED',
    pack: 'bridge',
    version: '1.0.0',
    description: 'Menghitung volume beton, luas bekisting bawah, dan estimasi pembesian plat lantai jembatan',
    primaryUnit: 'm³',
    primaryQuantityLabel: 'Volume Beton Plat Lantai',
    parameters: [
      { id: 'length', label: 'Panjang Bentang Lantai (L)', unit: 'm', defaultValue: 25, min: 1, required: true },
      { id: 'width', label: 'Lebar Plat Lantai (W)', unit: 'm', defaultValue: 9.0, min: 1, required: true },
      { id: 'slabThickness', label: 'Tebal Plat Lantai (t)', unit: 'm', defaultValue: 0.25, min: 0.15, required: true },
      { id: 'rebarRatio', label: 'Rasio Pembesian (kg/m³)', unit: 'kg/m³', defaultValue: 140, min: 50 },
    ],
    formulaSource: ProvenanceEngine.createVerifiedReferenceProvenance({
      calculatorId: 'bridge.deck',
      calculatorVersion: '1.0.0',
      formulaId: 'BRIDGE_DECK_VOL',
      mathematicalExpression: 'Vol = L × W × t; Rebar = Vol × Ratio',
      referenceName: 'Pedoman Perancangan Jembatan Bina Marga',
      sectionOrClause: 'Deck Slab Takeoff',
      status: 'PARTIALLY_VERIFIED',
    }),
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const L = toNum(inputs.length, 25);
      const W = toNum(inputs.width, 9.0);
      const t = toNum(inputs.slabThickness, 0.25);
      const ratio = toNum(inputs.rebarRatio, 140);

      const area = SafeDecimalEngine.safeMultiply(L, W, 2);
      const vol = SafeDecimalEngine.safeMultiply(area, t, 3);
      const rebarKg = SafeDecimalEngine.safeMultiply(vol, ratio, 2);

      return createCivilOutput({
        calculatorId: 'bridge.deck',
        version: '1.0.0',
        primaryQuantity: vol,
        primaryUnit: 'm³',
        primaryLabel: 'Volume Beton Plat Lantai Jembatan',
        breakdown: {
          luasLantaiM2: area,
          volumeBetonM3: vol,
          beratBesiTulanganKg: rebarKg,
        },
        materials: [
          { name: 'Beton Struktur K-350 / fc 30 MPa', quantity: vol, unit: 'm³' },
          { name: 'Besi Tulangan Ulir BJTS-420B', quantity: rebarKg, unit: 'kg' },
        ],
        formulaSource: {
          calculatorId: 'bridge.deck',
          calculatorVersion: '1.0.0',
          formulaId: 'BRIDGE_DECK_VOL',
          mathematicalExpression: 'Vol = L × W × t; Rebar = Vol × Ratio',
        },
        inputs,
      });
    },
  },

  // 3. GIRDER
  {
    id: 'bridge.girder',
    name: 'Prestressed / Concrete Girder (Balok Girder Jembatan)',
    shortName: 'Girder Jembatan',
    category: 'infrastruktur',
    status: 'VERIFIED',
    pack: 'bridge',
    version: '1.0.0',
    description: 'Menghitung volume beton girder precast I-Girder / Box-Girder, total panjang balok, dan jumlah batang',
    primaryUnit: 'm³',
    primaryQuantityLabel: 'Volume Beton Balok Girder',
    parameters: [
      { id: 'girderLength', label: 'Panjang per Balok Girder (Lg)', unit: 'm', defaultValue: 25, min: 5, required: true },
      { id: 'numberOfGirders', label: 'Jumlah Balok Girder (N)', unit: 'buah', defaultValue: 5, min: 1, required: true },
      { id: 'crossSectionArea', label: 'Luas Penampang Balok (A)', unit: 'm²', defaultValue: 0.65, min: 0.1, required: true },
    ],
    formulaSource: ProvenanceEngine.createVerifiedReferenceProvenance({
      calculatorId: 'bridge.girder',
      calculatorVersion: '1.0.0',
      formulaId: 'GIRDER_VOL',
      mathematicalExpression: 'TotalLen = Lg × N; Vol = TotalLen × A',
      referenceName: 'Standar Balok Girder Bina Marga',
      sectionOrClause: 'Precast Girder Volume',
      status: 'PARTIALLY_VERIFIED',
    }),
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const Lg = toNum(inputs.girderLength, 25);
      const N = Math.max(1, Math.floor(toNum(inputs.numberOfGirders, 5)));
      const A = toNum(inputs.crossSectionArea, 0.65);

      const totalLen = SafeDecimalEngine.safeMultiply(Lg, N, 2);
      const vol = SafeDecimalEngine.safeMultiply(totalLen, A, 3);

      return createCivilOutput({
        calculatorId: 'bridge.girder',
        version: '1.0.0',
        primaryQuantity: vol,
        primaryUnit: 'm³',
        primaryLabel: 'Volume Beton Balok Girder',
        breakdown: {
          panjangPerBalokM: Lg,
          jumlahBalokBuah: N,
          totalPanjangBalokM: totalLen,
          volumeBetonGirderM3: vol,
        },
        materials: [
          { name: `Balok Girder Precast L=${Lg}m`, quantity: N, unit: 'buah' },
        ],
        formulaSource: {
          calculatorId: 'bridge.girder',
          calculatorVersion: '1.0.0',
          formulaId: 'GIRDER_VOL',
          mathematicalExpression: 'TotalLen = Lg × N; Vol = TotalLen × A',
        },
        inputs,
      });
    },
  },

  // 4. ABUTMENT
  {
    id: 'bridge.abutment',
    name: 'Bridge Abutment (Kepala Jembatan / Abutmen)',
    shortName: 'Abutmen Jembatan',
    category: 'infrastruktur',
    status: 'VERIFIED',
    pack: 'bridge',
    version: '1.0.0',
    description: 'Menghitung volume beton breast wall, footing, backwall, dan wingwall abutmen jembatan',
    primaryUnit: 'm³',
    primaryQuantityLabel: 'Volume Beton Abutmen',
    parameters: [
      { id: 'count', label: 'Jumlah Abutmen', unit: 'unit', defaultValue: 2, min: 1, required: true },
      { id: 'width', label: 'Lebar Abutmen Melintang (W)', unit: 'm', defaultValue: 9.0, min: 2, required: true },
      { id: 'height', label: 'Tinggi Dinding Abutmen (H)', unit: 'm', defaultValue: 4.5, min: 1 },
      { id: 'wallThickness', label: 'Tebal Dinding Abutmen (t)', unit: 'm', defaultValue: 1.0, min: 0.3 },
      { id: 'footingWidth', label: 'Lebar Footing / Tapak (Wf)', unit: 'm', defaultValue: 3.5, min: 1 },
      { id: 'footingThickness', label: 'Tebal Footing / Tapak (tf)', unit: 'm', defaultValue: 1.2, min: 0.3 },
    ],
    formulaSource: ProvenanceEngine.createVerifiedReferenceProvenance({
      calculatorId: 'bridge.abutment',
      calculatorVersion: '1.0.0',
      formulaId: 'ABUTMENT_CONCRETE_VOL',
      mathematicalExpression: 'V_stem = W × H × t; V_footing = W × Wf × tf; V_total = (V_stem + V_footing) × Count',
      referenceName: 'BMS Bina Marga Panduan Abutmen',
      sectionOrClause: 'Abutment Structure',
      status: 'PARTIALLY_VERIFIED',
    }),
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const count = Math.max(1, Math.floor(toNum(inputs.count, 2)));
      const W = toNum(inputs.width, 9.0);
      const H = toNum(inputs.height, 4.5);
      const t = toNum(inputs.wallThickness, 1.0);
      const Wf = toNum(inputs.footingWidth, 3.5);
      const tf = toNum(inputs.footingThickness, 1.2);

      const stemVol = SafeDecimalEngine.safeMultiply(W, SafeDecimalEngine.safeMultiply(H, t, 4), 3);
      const footingVol = SafeDecimalEngine.safeMultiply(W, SafeDecimalEngine.safeMultiply(Wf, tf, 4), 3);
      const singleVol = SafeDecimalEngine.safeAdd(stemVol, footingVol);
      const totalVol = SafeDecimalEngine.safeMultiply(singleVol, count, 3);

      return createCivilOutput({
        calculatorId: 'bridge.abutment',
        version: '1.0.0',
        primaryQuantity: totalVol,
        primaryUnit: 'm³',
        primaryLabel: 'Volume Beton Abutmen Jembatan',
        breakdown: {
          jumlahAbutmenUnit: count,
          volumeDindingDadaM3: SafeDecimalEngine.safeMultiply(stemVol, count, 3),
          volumeFootingM3: SafeDecimalEngine.safeMultiply(footingVol, count, 3),
          totalVolumeBetonM3: totalVol,
        },
        materials: [
          { name: 'Beton Struktur K-300 / K-350 Abutmen', quantity: totalVol, unit: 'm³' },
        ],
        formulaSource: {
          calculatorId: 'bridge.abutment',
          calculatorVersion: '1.0.0',
          formulaId: 'ABUTMENT_CONCRETE_VOL',
          mathematicalExpression: 'V_total = (V_stem + V_footing) × Count',
        },
        inputs,
      });
    },
  },

  // 5. PIER
  {
    id: 'bridge.pier',
    name: 'Bridge Pier & Pier Head (Pilar Jembatan & Kepala Pilar)',
    shortName: 'Pilar Jembatan (Pier)',
    category: 'infrastruktur',
    status: 'VERIFIED',
    pack: 'bridge',
    version: '1.0.0',
    description: 'Menghitung volume beton kolom pilar (pier column) dan balok kepala pilar (pier head cap)',
    primaryUnit: 'm³',
    primaryQuantityLabel: 'Volume Beton Pilar Jembatan',
    parameters: [
      { id: 'count', label: 'Jumlah Pilar (Pier)', unit: 'unit', defaultValue: 1, min: 1, required: true },
      { id: 'pierHeadLength', label: 'Panjang Pier Head Cap (Lp)', unit: 'm', defaultValue: 9.0, min: 2 },
      { id: 'pierHeadWidth', label: 'Lebar Pier Head Cap (Wp)', unit: 'm', defaultValue: 1.5, min: 0.5 },
      { id: 'pierHeadHeight', label: 'Tinggi Pier Head Cap (Hp)', unit: 'm', defaultValue: 1.5, min: 0.5 },
      { id: 'columnDiameter', label: 'Diameter / Lebar Kolom (Dc)', unit: 'm', defaultValue: 1.2, min: 0.5 },
      { id: 'columnHeight', label: 'Tinggi Kolom Pilar (Hc)', unit: 'm', defaultValue: 6.0, min: 1 },
      { id: 'columnsPerPier', label: 'Jumlah Kolom per Pilar', unit: 'kolom', defaultValue: 2, min: 1 },
    ],
    formulaSource: ProvenanceEngine.createVerifiedReferenceProvenance({
      calculatorId: 'bridge.pier',
      calculatorVersion: '1.0.0',
      formulaId: 'PIER_CONCRETE_VOL',
      mathematicalExpression: 'V_cap = Lp × Wp × Hp; V_col = (π/4 × Dc² × Hc) × n_col; V_total = (V_cap + V_col) × Count',
      referenceName: 'BMS Bina Marga Panduan Pilar',
      sectionOrClause: 'Pier & Pier Head Structure',
      status: 'PARTIALLY_VERIFIED',
    }),
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const count = Math.max(1, Math.floor(toNum(inputs.count, 1)));
      const Lp = toNum(inputs.pierHeadLength, 9.0);
      const Wp = toNum(inputs.pierHeadWidth, 1.5);
      const Hp = toNum(inputs.pierHeadHeight, 1.5);
      const Dc = toNum(inputs.columnDiameter, 1.2);
      const Hc = toNum(inputs.columnHeight, 6.0);
      const nCol = Math.max(1, Math.floor(toNum(inputs.columnsPerPier, 2)));

      const capVol = SafeDecimalEngine.safeMultiply(Lp, SafeDecimalEngine.safeMultiply(Wp, Hp, 4), 3);
      const colArea = SafeDecimalEngine.safeMultiply(Math.PI / 4, Math.pow(Dc, 2), 4);
      const colVol = SafeDecimalEngine.safeMultiply(SafeDecimalEngine.safeMultiply(colArea, Hc, 4), nCol, 3);
      const singleVol = SafeDecimalEngine.safeAdd(capVol, colVol);
      const totalVol = SafeDecimalEngine.safeMultiply(singleVol, count, 3);

      return createCivilOutput({
        calculatorId: 'bridge.pier',
        version: '1.0.0',
        primaryQuantity: totalVol,
        primaryUnit: 'm³',
        primaryLabel: 'Volume Beton Pilar & Kepala Pilar',
        breakdown: {
          jumlahPilarUnit: count,
          volumePierHeadCapM3: SafeDecimalEngine.safeMultiply(capVol, count, 3),
          volumeKolomPilarM3: SafeDecimalEngine.safeMultiply(colVol, count, 3),
          totalVolumeBetonM3: totalVol,
        },
        materials: [
          { name: 'Beton Struktur K-350 / fc 30 MPa Pilar', quantity: totalVol, unit: 'm³' },
        ],
        formulaSource: {
          calculatorId: 'bridge.pier',
          calculatorVersion: '1.0.0',
          formulaId: 'PIER_CONCRETE_VOL',
          mathematicalExpression: 'V_total = (V_cap + V_col) × Count',
        },
        inputs,
      });
    },
  },

  // 6. FOUNDATION (PILE CAP & BORED PILE)
  {
    id: 'bridge.foundation',
    name: 'Bridge Foundation (Pile Cap & Tiang Pancang / Bored Pile)',
    shortName: 'Pondasi Jembatan',
    category: 'infrastruktur',
    status: 'VERIFIED',
    pack: 'bridge',
    version: '1.0.0',
    description: 'Menghitung volume beton pile cap, total panjang tiang pancang/bored pile, dan jumlah titik pondasi',
    primaryUnit: 'm³',
    primaryQuantityLabel: 'Volume Beton Pile Cap',
    parameters: [
      { id: 'pileCapLength', label: 'Panjang Pile Cap (Lpc)', unit: 'm', defaultValue: 10, min: 2, required: true },
      { id: 'pileCapWidth', label: 'Lebar Pile Cap (Wpc)', unit: 'm', defaultValue: 4.0, min: 1, required: true },
      { id: 'pileCapThickness', label: 'Tebal Pile Cap (tpc)', unit: 'm', defaultValue: 1.5, min: 0.5, required: true },
      { id: 'pileDiameter', label: 'Diameter Tiang / Bore (Dp)', unit: 'm', defaultValue: 0.8, min: 0.3 },
      { id: 'pileLength', label: 'Kedalaman per Tiang (Lp)', unit: 'm', defaultValue: 18, min: 2 },
      { id: 'numberOfPiles', label: 'Jumlah Titik Tiang per Cap (Np)', unit: 'titik', defaultValue: 8, min: 1 },
      { id: 'numberOfCaps', label: 'Jumlah Pile Cap', unit: 'unit', defaultValue: 2, min: 1 },
    ],
    formulaSource: ProvenanceEngine.createVerifiedReferenceProvenance({
      calculatorId: 'bridge.foundation',
      calculatorVersion: '1.0.0',
      formulaId: 'BRIDGE_FOUNDATION_VOL',
      mathematicalExpression: 'V_cap = Lpc × Wpc × tpc × n_cap; TotalPileLen = Lp × Np × n_cap; V_pile = (π/4 × Dp² × Lp) × Np × n_cap',
      referenceName: 'Spesifikasi Pondasi Dalam Jembatan Bina Marga',
      sectionOrClause: 'Pile Cap & Deep Foundation',
      status: 'PARTIALLY_VERIFIED',
    }),
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const Lpc = toNum(inputs.pileCapLength, 10);
      const Wpc = toNum(inputs.pileCapWidth, 4.0);
      const tpc = toNum(inputs.pileCapThickness, 1.5);
      const Dp = toNum(inputs.pileDiameter, 0.8);
      const Lp = toNum(inputs.pileLength, 18);
      const Np = Math.max(1, Math.floor(toNum(inputs.numberOfPiles, 8)));
      const nCap = Math.max(1, Math.floor(toNum(inputs.numberOfCaps, 2)));

      const singleCapVol = SafeDecimalEngine.safeMultiply(Lpc, SafeDecimalEngine.safeMultiply(Wpc, tpc, 4), 3);
      const totalCapVol = SafeDecimalEngine.safeMultiply(singleCapVol, nCap, 3);
      const totalPileLen = SafeDecimalEngine.safeMultiply(Lp, Np * nCap, 2);
      const pileArea = SafeDecimalEngine.safeMultiply(Math.PI / 4, Math.pow(Dp, 2), 4);
      const totalPileVol = SafeDecimalEngine.safeMultiply(pileArea, totalPileLen, 3);

      return createCivilOutput({
        calculatorId: 'bridge.foundation',
        version: '1.0.0',
        primaryQuantity: totalCapVol,
        primaryUnit: 'm³',
        primaryLabel: 'Volume Beton Pile Cap Jembatan',
        breakdown: {
          volumeBetonPileCapM3: totalCapVol,
          totalPanjangTiangM: totalPileLen,
          volumeBetonTiangBoredM3: totalPileVol,
          totalTitikTiang: Np * nCap,
        },
        materials: [
          { name: 'Beton Struktur K-350 Pile Cap', quantity: totalCapVol, unit: 'm³' },
          { name: `Tiang Pancang / Bored Pile Dia ${Dp * 1000}mm`, quantity: totalPileLen, unit: 'm' },
        ],
        formulaSource: {
          calculatorId: 'bridge.foundation',
          calculatorVersion: '1.0.0',
          formulaId: 'BRIDGE_FOUNDATION_VOL',
          mathematicalExpression: 'V_cap = Lpc × Wpc × tpc × n_cap; TotalPileLen = Lp × Np × n_cap',
        },
        inputs,
      });
    },
  },

  // 7. APPROACH SLAB
  {
    id: 'bridge.approach_slab',
    name: 'Approach Slab (Plat Injak Jembatan)',
    shortName: 'Plat Injak Jembatan',
    category: 'infrastruktur',
    status: 'VERIFIED',
    pack: 'bridge',
    version: '1.0.0',
    description: 'Menghitung volume beton dan luas plat injak transisi jalan menuju jembatan (2 sisi)',
    primaryUnit: 'm³',
    primaryQuantityLabel: 'Volume Beton Plat Injak',
    parameters: [
      { id: 'length', label: 'Panjang Plat Injak (L)', unit: 'm', defaultValue: 6.0, min: 2, required: true },
      { id: 'width', label: 'Lebar Plat Injak (W)', unit: 'm', defaultValue: 9.0, min: 2, required: true },
      { id: 'thickness', label: 'Tebal Plat Injak (t)', unit: 'm', defaultValue: 0.25, min: 0.15 },
      { id: 'numberOfSides', label: 'Jumlah Sisi (Abutmen A & B)', unit: 'sisi', defaultValue: 2, min: 1 },
    ],
    formulaSource: ProvenanceEngine.createVerifiedReferenceProvenance({
      calculatorId: 'bridge.approach_slab',
      calculatorVersion: '1.0.0',
      formulaId: 'APPROACH_SLAB_VOL',
      mathematicalExpression: 'Vol = L × W × t × Sides',
      referenceName: 'Spesifikasi Plat Injak Jembatan Bina Marga',
      sectionOrClause: 'Approach Slab Concrete',
      status: 'PARTIALLY_VERIFIED',
    }),
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const L = toNum(inputs.length, 6.0);
      const W = toNum(inputs.width, 9.0);
      const t = toNum(inputs.thickness, 0.25);
      const sides = Math.max(1, Math.floor(toNum(inputs.numberOfSides, 2)));

      const singleVol = SafeDecimalEngine.safeMultiply(L, SafeDecimalEngine.safeMultiply(W, t, 4), 3);
      const totalVol = SafeDecimalEngine.safeMultiply(singleVol, sides, 3);
      const totalArea = SafeDecimalEngine.safeMultiply(SafeDecimalEngine.safeMultiply(L, W, 2), sides, 2);

      return createCivilOutput({
        calculatorId: 'bridge.approach_slab',
        version: '1.0.0',
        primaryQuantity: totalVol,
        primaryUnit: 'm³',
        primaryLabel: 'Volume Beton Plat Injak Jembatan',
        breakdown: {
          luasTotalPlatInjakM2: totalArea,
          volumeBetonTotalM3: totalVol,
        },
        materials: [
          { name: 'Beton Plat Injak K-300 / fc 25 MPa', quantity: totalVol, unit: 'm³' },
        ],
        formulaSource: {
          calculatorId: 'bridge.approach_slab',
          calculatorVersion: '1.0.0',
          formulaId: 'APPROACH_SLAB_VOL',
          mathematicalExpression: 'Vol = L × W × t × Sides',
        },
        inputs,
      });
    },
  },

  // 8. BARRIER
  {
    id: 'bridge.barrier',
    name: 'Bridge Concrete Barrier (Barier Pembatas Jembatan)',
    shortName: 'Barier Beton Jembatan',
    category: 'infrastruktur',
    status: 'VERIFIED',
    pack: 'bridge',
    version: '1.0.0',
    description: 'Menghitung volume beton barier pengaman samping jembatan (kiri & kanan)',
    primaryUnit: 'm³',
    primaryQuantityLabel: 'Volume Beton Barrier Jembatan',
    parameters: [
      { id: 'length', label: 'Panjang Jembatan (L)', unit: 'm', defaultValue: 30, min: 1, required: true },
      { id: 'crossSectionArea', label: 'Luas Penampang Barrier (A)', unit: 'm²', defaultValue: 0.35, min: 0.1 },
      { id: 'numberOfSides', label: 'Jumlah Sisi (Kiri & Kanan)', unit: 'sisi', defaultValue: 2, min: 1 },
    ],
    formulaSource: ProvenanceEngine.createVerifiedReferenceProvenance({
      calculatorId: 'bridge.barrier',
      calculatorVersion: '1.0.0',
      formulaId: 'BRIDGE_BARRIER_VOL',
      mathematicalExpression: 'TotalLen = L × Sides; Vol = TotalLen × A',
      referenceName: 'Standar Barrier Beton Jembatan Bina Marga',
      sectionOrClause: 'Parapet Barrier Volume',
      status: 'PARTIALLY_VERIFIED',
    }),
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const L = toNum(inputs.length, 30);
      const A = toNum(inputs.crossSectionArea, 0.35);
      const sides = Math.max(1, Math.floor(toNum(inputs.numberOfSides, 2)));

      const totalLen = SafeDecimalEngine.safeMultiply(L, sides, 2);
      const vol = SafeDecimalEngine.safeMultiply(totalLen, A, 3);

      return createCivilOutput({
        calculatorId: 'bridge.barrier',
        version: '1.0.0',
        primaryQuantity: vol,
        primaryUnit: 'm³',
        primaryLabel: 'Volume Beton Barrier Jembatan',
        breakdown: {
          panjangTotalBarrierM: totalLen,
          volumeBetonBarrierM3: vol,
        },
        materials: [
          { name: 'Beton Barrier Jembatan K-350', quantity: vol, unit: 'm³' },
        ],
        formulaSource: {
          calculatorId: 'bridge.barrier',
          calculatorVersion: '1.0.0',
          formulaId: 'BRIDGE_BARRIER_VOL',
          mathematicalExpression: 'TotalLen = L × Sides; Vol = TotalLen × A',
        },
        inputs,
      });
    },
  },

  // 9. PARAPET / RAILING
  {
    id: 'bridge.parapet',
    name: 'Bridge Parapet & Railing (Railing Pagar Pengaman Jembatan)',
    shortName: 'Railing Pagar Jembatan',
    category: 'infrastruktur',
    status: 'VERIFIED',
    pack: 'bridge',
    version: '1.0.0',
    description: 'Menghitung panjang railing pipa baja galvanis dan jumlah tiang sandaran railing',
    primaryUnit: 'm',
    primaryQuantityLabel: 'Panjang Total Railing Jembatan',
    parameters: [
      { id: 'length', label: 'Panjang Jembatan (L)', unit: 'm', defaultValue: 30, min: 1, required: true },
      { id: 'postSpacing', label: 'Jarak Antar Tiang Sandaran (s)', unit: 'm', defaultValue: 2.0, min: 1.0 },
      { id: 'numberOfSides', label: 'Jumlah Sisi (Kiri & Kanan)', unit: 'sisi', defaultValue: 2, min: 1 },
    ],
    formulaSource: ProvenanceEngine.createVerifiedReferenceProvenance({
      calculatorId: 'bridge.parapet',
      calculatorVersion: '1.0.0',
      formulaId: 'RAILING_LEN_COUNT',
      mathematicalExpression: 'TotalLen = L × Sides; TotalPosts = (Ceil(L / s) + 1) × Sides',
      referenceName: 'Standar Railing Jembatan Bina Marga',
      sectionOrClause: 'Steel Railing Takeoff',
      status: 'PARTIALLY_VERIFIED',
    }),
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const L = toNum(inputs.length, 30);
      const s = toNum(inputs.postSpacing, 2.0);
      const sides = Math.max(1, Math.floor(toNum(inputs.numberOfSides, 2)));

      const totalLen = SafeDecimalEngine.safeMultiply(L, sides, 2);
      const postsPerSide = Math.ceil(L / s) + 1;
      const totalPosts = postsPerSide * sides;

      return createCivilOutput({
        calculatorId: 'bridge.parapet',
        version: '1.0.0',
        primaryQuantity: totalLen,
        primaryUnit: 'm',
        primaryLabel: 'Total Panjang Railing Jembatan',
        breakdown: {
          totalPanjangRailingM: totalLen,
          totalJumlahTiangSandaran: totalPosts,
        },
        materials: [
          { name: 'Pipa Baja Galvanis Dia 3" Railing', quantity: totalLen, unit: 'm' },
          { name: 'Tiang Sandaran Railing Baja', quantity: totalPosts, unit: 'buah' },
        ],
        formulaSource: {
          calculatorId: 'bridge.parapet',
          calculatorVersion: '1.0.0',
          formulaId: 'RAILING_LEN_COUNT',
          mathematicalExpression: 'TotalLen = L × Sides; TotalPosts = (Ceil(L / s) + 1) × Sides',
        },
        inputs,
      });
    },
  },

  // 10. BEARING
  {
    id: 'bridge.bearing',
    name: 'Elastomeric Bearing Pad (Perletakan Elastomer Jembatan)',
    shortName: 'Bantalan Elastomer (Bearing)',
    category: 'infrastruktur',
    status: 'VERIFIED',
    pack: 'bridge',
    version: '1.0.0',
    description: 'Menghitung jumlah unit bantalan karet elastomer (elastomeric bearing pad) penopang balok girder',
    primaryUnit: 'buah',
    primaryQuantityLabel: 'Jumlah Unit Elastomeric Bearing',
    parameters: [
      { id: 'girdersPerSpan', label: 'Jumlah Girder per Bentang', unit: 'buah', defaultValue: 5, min: 1, required: true },
      { id: 'numberOfSpans', label: 'Jumlah Bentang (n)', unit: 'bentang', defaultValue: 1, min: 1, required: true },
      { id: 'bearingsPerGirderEnd', label: 'Bearing per Ujung Girder', unit: 'buah', defaultValue: 2, min: 1 },
    ],
    formulaSource: ProvenanceEngine.createVerifiedReferenceProvenance({
      calculatorId: 'bridge.bearing',
      calculatorVersion: '1.0.0',
      formulaId: 'BEARING_PAD_COUNT',
      mathematicalExpression: 'Total = Girders × Spans × 2 Ends × perEnd',
      referenceName: 'Standar Elastomeric Bearing Bina Marga',
      sectionOrClause: 'Elastomer Pad Takeoff',
      status: 'PARTIALLY_VERIFIED',
    }),
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const g = Math.max(1, Math.floor(toNum(inputs.girdersPerSpan, 5)));
      const spans = Math.max(1, Math.floor(toNum(inputs.numberOfSpans, 1)));
      const perEnd = Math.max(1, Math.floor(toNum(inputs.bearingsPerGirderEnd, 1))); // default 1 per tumpuan ujung

      const totalBearings = g * spans * 2 * perEnd;

      return createCivilOutput({
        calculatorId: 'bridge.bearing',
        version: '1.0.0',
        primaryQuantity: totalBearings,
        primaryUnit: 'buah',
        primaryLabel: 'Jumlah Bantalan Karet Elastomer',
        breakdown: {
          jumlahGirderPerBentang: g,
          jumlahBentang: spans,
          totalBantalanElastomerBuah: totalBearings,
        },
        materials: [
          { name: 'Elastomeric Bearing Pad', quantity: totalBearings, unit: 'buah' },
        ],
        formulaSource: {
          calculatorId: 'bridge.bearing',
          calculatorVersion: '1.0.0',
          formulaId: 'BEARING_PAD_COUNT',
          mathematicalExpression: 'Total = Girders × Spans × 2 Ends × perEnd',
        },
        inputs,
      });
    },
  },

  // 11. EXPANSION JOINT
  {
    id: 'bridge.expansion_joint',
    name: 'Bridge Expansion Joint (Sambungan Siar Muai Jembatan)',
    shortName: 'Expansion Joint Jembatan',
    category: 'infrastruktur',
    status: 'VERIFIED',
    pack: 'bridge',
    version: '1.0.0',
    description: 'Menghitung panjang sambungan muai tipe asphaltic plug atau modular expansion joint jembatan',
    primaryUnit: 'm',
    primaryQuantityLabel: 'Panjang Sambungan Siar Muai',
    parameters: [
      { id: 'deckWidth', label: 'Lebar Lantai Jembatan (W)', unit: 'm', defaultValue: 9.0, min: 2, required: true },
      { id: 'numberOfJoints', label: 'Jumlah Titik Sambungan Siar Muai', unit: 'titik', defaultValue: 2, min: 1, required: true },
    ],
    formulaSource: ProvenanceEngine.createVerifiedReferenceProvenance({
      calculatorId: 'bridge.expansion_joint',
      calculatorVersion: '1.0.0',
      formulaId: 'EXPANSION_JOINT_LEN',
      mathematicalExpression: 'TotalLen = W × Joints',
      referenceName: 'Spesifikasi Expansion Joint Bina Marga',
      sectionOrClause: 'Siar Muai Takeoff',
      status: 'PARTIALLY_VERIFIED',
    }),
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const W = toNum(inputs.deckWidth, 9.0);
      const joints = Math.max(1, Math.floor(toNum(inputs.numberOfJoints, 2)));

      const totalLen = SafeDecimalEngine.safeMultiply(W, joints, 2);

      return createCivilOutput({
        calculatorId: 'bridge.expansion_joint',
        version: '1.0.0',
        primaryQuantity: totalLen,
        primaryUnit: 'm',
        primaryLabel: 'Panjang Sambungan Siar Muai',
        breakdown: {
          lebarLantaiM: W,
          jumlahTitikJoint: joints,
          totalPanjangJointM: totalLen,
        },
        materials: [
          { name: 'Expansion Joint Tipe Asphaltic Plug / Baja Modular', quantity: totalLen, unit: 'm' },
        ],
        formulaSource: {
          calculatorId: 'bridge.expansion_joint',
          calculatorVersion: '1.0.0',
          formulaId: 'EXPANSION_JOINT_LEN',
          mathematicalExpression: 'TotalLen = W × Joints',
        },
        inputs,
      });
    },
  },

  // 12. EXCAVATION
  {
    id: 'bridge.excavation',
    name: 'Bridge Substructure Excavation (Galian Tanah Struktur Jembatan)',
    shortName: 'Galian Struktur Jembatan',
    category: 'infrastruktur',
    status: 'VERIFIED',
    pack: 'bridge',
    version: '1.0.0',
    description: 'Menghitung volume galian tanah pondasi abutmen dan pilar jembatan',
    primaryUnit: 'm³',
    primaryQuantityLabel: 'Volume Galian Tanah Struktur',
    parameters: [
      { id: 'length', label: 'Panjang Galian (L)', unit: 'm', defaultValue: 12, min: 1, required: true },
      { id: 'width', label: 'Lebar Galian (W)', unit: 'm', defaultValue: 5.0, min: 1, required: true },
      { id: 'depth', label: 'Kedalaman Rata-Rata Galian (H)', unit: 'm', defaultValue: 3.5, min: 0.5, required: true },
      { id: 'numberOfPits', label: 'Jumlah Lubang Galian (Abutmen/Pilar)', unit: 'titik', defaultValue: 2, min: 1 },
    ],
    formulaSource: ProvenanceEngine.createVerifiedReferenceProvenance({
      calculatorId: 'bridge.excavation',
      calculatorVersion: '1.0.0',
      formulaId: 'BRIDGE_EXCAVATION_VOL',
      mathematicalExpression: 'Vol = L × W × H × Pits',
      referenceName: 'Spesifikasi Pekerjaan Tanah Struktur Bina Marga Divisi 3',
      sectionOrClause: 'Galian Pondasi Jembatan',
      status: 'PARTIALLY_VERIFIED',
    }),
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const L = toNum(inputs.length, 12);
      const W = toNum(inputs.width, 5.0);
      const H = toNum(inputs.depth, 3.5);
      const pits = Math.max(1, Math.floor(toNum(inputs.numberOfPits, 2)));

      const singleVol = SafeDecimalEngine.safeMultiply(L, SafeDecimalEngine.safeMultiply(W, H, 4), 3);
      const totalVol = SafeDecimalEngine.safeMultiply(singleVol, pits, 3);

      return createCivilOutput({
        calculatorId: 'bridge.excavation',
        version: '1.0.0',
        primaryQuantity: totalVol,
        primaryUnit: 'm³',
        primaryLabel: 'Volume Galian Struktur Jembatan',
        breakdown: {
          volumeGalianPerTitikM3: singleVol,
          jumlahTitikGalian: pits,
          totalVolumeGalianM3: totalVol,
        },
        formulaSource: {
          calculatorId: 'bridge.excavation',
          calculatorVersion: '1.0.0',
          formulaId: 'BRIDGE_EXCAVATION_VOL',
          mathematicalExpression: 'Vol = L × W × H × Pits',
        },
        inputs,
      });
    },
  },

  // 13. BACKFILL
  {
    id: 'bridge.backfill',
    name: 'Bridge Abutment Backfill (Urugan Tanah Terpilih Oprit & Abutmen)',
    shortName: 'Timbunan Oprit Abutmen',
    category: 'infrastruktur',
    status: 'VERIFIED',
    pack: 'bridge',
    version: '1.0.0',
    description: 'Menghitung volume timbunan pilihan berbutir di belakang dinding abutmen / oprit jembatan',
    primaryUnit: 'm³',
    primaryQuantityLabel: 'Volume Timbunan Pilihan Oprit',
    parameters: [
      { id: 'opritLength', label: 'Panjang Oprit Timbunan (L)', unit: 'm', defaultValue: 25, min: 2, required: true },
      { id: 'topWidth', label: 'Lebar Atas Oprit (W1)', unit: 'm', defaultValue: 9.0, min: 2 },
      { id: 'bottomWidth', label: 'Lebar Bawah Oprit (W2)', unit: 'm', defaultValue: 18.0, min: 2 },
      { id: 'height', label: 'Tinggi Timbunan Abutmen (H)', unit: 'm', defaultValue: 4.5, min: 0.5 },
      { id: 'numberOfSides', label: 'Jumlah Sisi Oprit (A & B)', unit: 'sisi', defaultValue: 2, min: 1 },
    ],
    formulaSource: ProvenanceEngine.createVerifiedReferenceProvenance({
      calculatorId: 'bridge.backfill',
      calculatorVersion: '1.0.0',
      formulaId: 'BRIDGE_BACKFILL_VOL',
      mathematicalExpression: 'Vol = ((W1 + W2)/2) × H/2 × L × Sides',
      referenceName: 'Spesifikasi Timbunan Pilihan Berbutir Oprit Bina Marga',
      sectionOrClause: 'Abutment Embankment Backfill',
      status: 'PARTIALLY_VERIFIED',
    }),
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const L = toNum(inputs.opritLength, 25);
      const W1 = toNum(inputs.topWidth, 9.0);
      const W2 = toNum(inputs.bottomWidth, 18.0);
      const H = toNum(inputs.height, 4.5);
      const sides = Math.max(1, Math.floor(toNum(inputs.numberOfSides, 2)));

      const avgW = SafeDecimalEngine.safeDivide(SafeDecimalEngine.safeAdd(W1, W2), 2);
      const avgH = SafeDecimalEngine.safeDivide(H, 2); // bentuk baji transisi oprit
      const singleVol = SafeDecimalEngine.safeMultiply(L, SafeDecimalEngine.safeMultiply(avgW, avgH, 4), 3);
      const totalVol = SafeDecimalEngine.safeMultiply(singleVol, sides, 3);

      return createCivilOutput({
        calculatorId: 'bridge.backfill',
        version: '1.0.0',
        primaryQuantity: totalVol,
        primaryUnit: 'm³',
        primaryLabel: 'Volume Timbunan Pilihan Oprit Jembatan',
        breakdown: {
          volumePerSisiOpritM3: singleVol,
          jumlahSisiOprit: sides,
          totalVolumeTimbunanM3: totalVol,
        },
        materials: [
          { name: 'Timbunan Pilihan Berbutir (Selected Embankment)', quantity: totalVol, unit: 'm³' },
        ],
        formulaSource: {
          calculatorId: 'bridge.backfill',
          calculatorVersion: '1.0.0',
          formulaId: 'BRIDGE_BACKFILL_VOL',
          mathematicalExpression: 'Vol = ((W1 + W2)/2) × (H/2) × L × Sides',
        },
        inputs,
      });
    },
  },

  // 14. CONCRETE GENERAL
  {
    id: 'bridge.concrete',
    name: 'Bridge Structural Concrete (Beton Struktur Jembatan Umum)',
    shortName: 'Beton Struktur Jembatan',
    category: 'infrastruktur',
    status: 'VERIFIED',
    pack: 'bridge',
    version: '1.0.0',
    description: 'Menghitung total volume beton berbagai kelas mutu untuk komponen struktur jembatan',
    primaryUnit: 'm³',
    primaryQuantityLabel: 'Volume Total Beton Jembatan',
    parameters: [
      { id: 'length', label: 'Panjang Elemen (L)', unit: 'm', defaultValue: 10, min: 0.5, required: true },
      { id: 'width', label: 'Lebar Elemen (W)', unit: 'm', defaultValue: 2.0, min: 0.2, required: true },
      { id: 'height', label: 'Tinggi / Tebal Elemen (H)', unit: 'm', defaultValue: 1.0, min: 0.1, required: true },
      { id: 'count', label: 'Jumlah Unit', unit: 'unit', defaultValue: 1, min: 1 },
    ],
    formulaSource: ProvenanceEngine.createVerifiedReferenceProvenance({
      calculatorId: 'bridge.concrete',
      calculatorVersion: '1.0.0',
      formulaId: 'BRIDGE_CONCRETE_GEN',
      mathematicalExpression: 'Vol = L × W × H × Count',
      referenceName: 'Spesifikasi Beton Jembatan Bina Marga Divisi 7',
      sectionOrClause: 'Beton Struktur',
      status: 'PARTIALLY_VERIFIED',
    }),
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const L = toNum(inputs.length, 10);
      const W = toNum(inputs.width, 2.0);
      const H = toNum(inputs.height, 1.0);
      const count = Math.max(1, Math.floor(toNum(inputs.count, 1)));

      const singleVol = SafeDecimalEngine.safeMultiply(L, SafeDecimalEngine.safeMultiply(W, H, 4), 3);
      const totalVol = SafeDecimalEngine.safeMultiply(singleVol, count, 3);

      return createCivilOutput({
        calculatorId: 'bridge.concrete',
        version: '1.0.0',
        primaryQuantity: totalVol,
        primaryUnit: 'm³',
        primaryLabel: 'Volume Beton Struktur Jembatan',
        breakdown: {
          volumePerUnitM3: singleVol,
          totalVolumeBetonM3: totalVol,
        },
        materials: [
          { name: 'Beton Struktur Jembatan fc 30 MPa', quantity: totalVol, unit: 'm³' },
        ],
        formulaSource: {
          calculatorId: 'bridge.concrete',
          calculatorVersion: '1.0.0',
          formulaId: 'BRIDGE_CONCRETE_GEN',
          mathematicalExpression: 'Vol = L × W × H × Count',
        },
        inputs,
      });
    },
  },

  // 15. FORMWORK
  {
    id: 'bridge.formwork',
    name: 'Bridge Formwork (Acuan Bekisting Struktur Jembatan)',
    shortName: 'Bekisting Jembatan',
    category: 'infrastruktur',
    status: 'VERIFIED',
    pack: 'bridge',
    version: '1.0.0',
    description: 'Menghitung luas bidang kontak bekisting acuan untuk komponen beton jembatan',
    primaryUnit: 'm²',
    primaryQuantityLabel: 'Luas Pasang Bekisting Jembatan',
    parameters: [
      { id: 'contactPerimeter', label: 'Keliling Kontak Bekisting (P)', unit: 'm', defaultValue: 6.0, min: 0.5, required: true },
      { id: 'elementLength', label: 'Panjang / Tinggi Elemen (L)', unit: 'm', defaultValue: 15, min: 0.5, required: true },
      { id: 'count', label: 'Jumlah Elemen', unit: 'unit', defaultValue: 1, min: 1 },
    ],
    formulaSource: ProvenanceEngine.createVerifiedReferenceProvenance({
      calculatorId: 'bridge.formwork',
      calculatorVersion: '1.0.0',
      formulaId: 'BRIDGE_FORMWORK_AREA',
      mathematicalExpression: 'Area = P × L × Count',
      referenceName: 'Spesifikasi Acuan Bekisting Bina Marga Divisi 7',
      sectionOrClause: 'Formwork Area',
      status: 'PARTIALLY_VERIFIED',
    }),
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const P = toNum(inputs.contactPerimeter, 6.0);
      const L = toNum(inputs.elementLength, 15);
      const count = Math.max(1, Math.floor(toNum(inputs.count, 1)));

      const singleArea = SafeDecimalEngine.safeMultiply(P, L, 2);
      const totalArea = SafeDecimalEngine.safeMultiply(singleArea, count, 2);

      return createCivilOutput({
        calculatorId: 'bridge.formwork',
        version: '1.0.0',
        primaryQuantity: totalArea,
        primaryUnit: 'm²',
        primaryLabel: 'Luas Bekisting Jembatan',
        breakdown: {
          luasPerElemenM2: singleArea,
          totalLuasBekistingM2: totalArea,
        },
        materials: [
          { name: 'Bekisting Kayu / Baja Jembatan', quantity: totalArea, unit: 'm²' },
        ],
        formulaSource: {
          calculatorId: 'bridge.formwork',
          calculatorVersion: '1.0.0',
          formulaId: 'BRIDGE_FORMWORK_AREA',
          mathematicalExpression: 'Area = P × L × Count',
        },
        inputs,
      });
    },
  },

  // 16. REINFORCEMENT
  {
    id: 'bridge.reinforcement',
    name: 'Bridge Reinforcement Steel (Baja Tulangan Struktur Jembatan)',
    shortName: 'Besi Tulangan Jembatan',
    category: 'infrastruktur',
    status: 'VERIFIED',
    pack: 'bridge',
    version: '1.0.0',
    description: 'Menghitung total berat baja tulangan sirip/polos jembatan berdasar volume beton dan rasio pembesian',
    primaryUnit: 'kg',
    primaryQuantityLabel: 'Berat Total Besi Tulangan',
    parameters: [
      { id: 'concreteVolume', label: 'Volume Beton Struktur (V_beton)', unit: 'm³', defaultValue: 100, min: 0.1, required: true },
      { id: 'rebarRatio', label: 'Rasio Pembesian (kg/m³)', unit: 'kg/m³', defaultValue: 150, min: 50, required: true },
    ],
    formulaSource: ProvenanceEngine.createVerifiedReferenceProvenance({
      calculatorId: 'bridge.reinforcement',
      calculatorVersion: '1.0.0',
      formulaId: 'BRIDGE_REBAR_WEIGHT',
      mathematicalExpression: 'Weight = V_beton × Ratio',
      referenceName: 'Spesifikasi Baja Tulangan Bina Marga Divisi 7',
      sectionOrClause: 'Reinforcing Steel Takeoff',
      status: 'PARTIALLY_VERIFIED',
    }),
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const V = toNum(inputs.concreteVolume, 100);
      const ratio = toNum(inputs.rebarRatio, 150);

      const totalKg = SafeDecimalEngine.safeMultiply(V, ratio, 2);
      const totalTon = SafeDecimalEngine.safeDivide(totalKg, 1000, 3);

      return createCivilOutput({
        calculatorId: 'bridge.reinforcement',
        version: '1.0.0',
        primaryQuantity: totalKg,
        primaryUnit: 'kg',
        primaryLabel: 'Berat Total Besi Tulangan Jembatan',
        breakdown: {
          volumeBetonM3: V,
          rasioPembesianKgM3: ratio,
          totalBeratBesiKg: totalKg,
          totalBeratBesiTon: totalTon,
        },
        materials: [
          { name: 'Baja Tulangan Sirip BJTS-420B', quantity: totalKg, unit: 'kg' },
        ],
        formulaSource: {
          calculatorId: 'bridge.reinforcement',
          calculatorVersion: '1.0.0',
          formulaId: 'BRIDGE_REBAR_WEIGHT',
          mathematicalExpression: 'Weight = V_beton × Ratio',
        },
        inputs,
      });
    },
  },
];
