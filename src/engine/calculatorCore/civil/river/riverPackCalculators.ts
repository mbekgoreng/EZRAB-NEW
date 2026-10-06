import {
  CalculationInput,
  CalculationOutput,
  CalculationContext,
  CalculatorDefinition,
} from '../../contracts/types';
import { SafeDecimalEngine } from '../../../safeDecimalEngine';
import { ProvenanceEngine } from '../../provenance/provenanceEngine';
import { toNum, createCivilOutput } from '../civilHelper';

export const RIVER_PACK_CALCULATORS: CalculatorDefinition[] = [
  // 1. RIVER SEGMENT
  {
    id: 'river.segment',
    name: 'River Reach & Flood Protection (Segmen Sungai & Pengendalian Banjir)',
    shortName: 'Segmen Sungai',
    category: 'infrastruktur',
    status: 'VERIFIED',
    pack: 'river',
    version: '1.0.0',
    description: 'Menghitung panjang penanganan tebing sungai, luas bidang perkuatan lereng tebing, dan normalisasi',
    primaryUnit: 'm²',
    primaryQuantityLabel: 'Luas Bidang Penanganan Tebing',
    parameters: [
      { id: 'length', label: 'Panjang Penanganan Sungai (L)', unit: 'm', defaultValue: 200, min: 1, required: true },
      { id: 'slopeLength', label: 'Panjang Bidang Miring Tebing (Ls)', unit: 'm', defaultValue: 6.0, min: 1, required: true },
      { id: 'numberOfBanks', label: 'Jumlah Tebing (1 atau 2 sisi)', unit: 'sisi', defaultValue: 2, min: 1 },
    ],
    formulaSource: ProvenanceEngine.createVerifiedReferenceProvenance({
      calculatorId: 'river.segment',
      calculatorVersion: '1.0.0',
      formulaId: 'RIVER_SEGMENT_AREA',
      mathematicalExpression: 'Area = L × Ls × Banks',
      referenceName: 'Pedoman Normalisasi & Perkuatan Tebing Sungai Dirjen SDA',
      sectionOrClause: 'River Reach Geometry',
      status: 'PARTIALLY_VERIFIED',
    }),
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const L = toNum(inputs.length, 200);
      const Ls = toNum(inputs.slopeLength, 6.0);
      const banks = Math.max(1, Math.floor(toNum(inputs.numberOfBanks, 2)));

      const totalArea = SafeDecimalEngine.safeMultiply(SafeDecimalEngine.safeMultiply(L, Ls, 2), banks, 2);

      return createCivilOutput({
        calculatorId: 'river.segment',
        version: '1.0.0',
        primaryQuantity: totalArea,
        primaryUnit: 'm²',
        primaryLabel: 'Luas Bidang Penanganan Tebing Sungai',
        breakdown: {
          panjangPenangananM: L,
          panjangMiringTebingM: Ls,
          jumlahSisiTebing: banks,
          totalLuasPenangananM2: totalArea,
        },
        formulaSource: {
          calculatorId: 'river.segment',
          calculatorVersion: '1.0.0',
          formulaId: 'RIVER_SEGMENT_AREA',
          mathematicalExpression: 'Area = L × Ls × Banks',
        },
        inputs,
      });
    },
  },

  // 2. RIPRAP
  {
    id: 'river.riprap',
    name: 'Riprap Bank Protection (Perlindungan Tebing Batu Belah / Riprap)',
    shortName: 'Riprap Tebing Sungai',
    category: 'infrastruktur',
    status: 'VERIFIED',
    pack: 'river',
    version: '1.0.0',
    description: 'Menghitung volume batu belah riprap pelindung tebing sungai dan tanggul dari gerusan arus',
    primaryUnit: 'm³',
    primaryQuantityLabel: 'Volume Batu Belah Riprap',
    parameters: [
      { id: 'length', label: 'Panjang Penanganan (L)', unit: 'm', defaultValue: 150, min: 1, required: true },
      { id: 'slopeLength', label: 'Panjang Miring Tebing (Ls)', unit: 'm', defaultValue: 5.0, min: 1, required: true },
      { id: 'thickness', label: 'Tebal Lapisan Riprap (t)', unit: 'm', defaultValue: 0.50, min: 0.2, required: true },
    ],
    formulaSource: ProvenanceEngine.createVerifiedReferenceProvenance({
      calculatorId: 'river.riprap',
      calculatorVersion: '1.0.0',
      formulaId: 'RIPRAP_VOL',
      mathematicalExpression: 'Area = L × Ls; Vol = Area × t',
      referenceName: 'Standar Perkuatan Tebing Sungai SDA',
      sectionOrClause: 'Riprap Stone Protection',
      status: 'PARTIALLY_VERIFIED',
    }),
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const L = toNum(inputs.length, 150);
      const Ls = toNum(inputs.slopeLength, 5.0);
      const t = toNum(inputs.thickness, 0.50);

      const area = SafeDecimalEngine.safeMultiply(L, Ls, 2);
      const vol = SafeDecimalEngine.safeMultiply(area, t, 3);

      return createCivilOutput({
        calculatorId: 'river.riprap',
        version: '1.0.0',
        primaryQuantity: vol,
        primaryUnit: 'm³',
        primaryLabel: 'Volume Batu Belah Riprap',
        breakdown: {
          luasTebingRiprapM2: area,
          volumeBatuRiprapM3: vol,
        },
        materials: [
          { name: 'Batu Belah Armor Riprap 20-40 cm', quantity: vol, unit: 'm³' },
        ],
        formulaSource: {
          calculatorId: 'river.riprap',
          calculatorVersion: '1.0.0',
          formulaId: 'RIPRAP_VOL',
          mathematicalExpression: 'Area = L × Ls; Vol = Area × t',
        },
        inputs,
      });
    },
  },

  // 3. GABION / BRONJONG
  {
    id: 'river.gabion',
    name: 'Gabion Bank Protection (Kawat Bronjong Pengaman Tebing)',
    shortName: 'Kawat Bronjong (Gabion)',
    category: 'infrastruktur',
    status: 'VERIFIED',
    pack: 'river',
    version: '1.0.0',
    description: 'Menghitung jumlah unit keranjang kawat bronjong (2x1x0.5 m / 2x1x1 m) dan volume batu pengisi',
    primaryUnit: 'unit',
    primaryQuantityLabel: 'Jumlah Unit Keranjang Bronjong',
    parameters: [
      { id: 'length', label: 'Panjang Dinding Bronjong (L)', unit: 'm', defaultValue: 50, min: 2, required: true },
      { id: 'boxLength', label: 'Panjang Unit Bronjong (Lb)', unit: 'm', defaultValue: 2.0, min: 1.0 },
      { id: 'boxWidth', label: 'Lebar Unit Bronjong (Wb)', unit: 'm', defaultValue: 1.0, min: 0.5 },
      { id: 'boxHeight', label: 'Tinggi Unit Bronjong (Hb)', unit: 'm', defaultValue: 0.5, min: 0.5 },
      { id: 'numberOfLayers', label: 'Jumlah Trap / Lapisan Tingkat (n)', unit: 'lapisan', defaultValue: 3, min: 1 },
      { id: 'widthLayers', label: 'Jumlah Baris per Lapisan', unit: 'baris', defaultValue: 1, min: 1 },
    ],
    formulaSource: ProvenanceEngine.createVerifiedReferenceProvenance({
      calculatorId: 'river.gabion',
      calculatorVersion: '1.0.0',
      formulaId: 'GABION_COUNT_VOL',
      mathematicalExpression: 'BoxesPerLayer = Ceil(L / Lb); TotalBoxes = BoxesPerLayer × Layers × Rows; VolStone = TotalBoxes × (Lb × Wb × Hb)',
      referenceName: 'SNI 03-0090-1999 Kawat Bronjong Galvanis',
      sectionOrClause: 'Gabion Volume Takeoff',
      status: 'PARTIALLY_VERIFIED',
    }),
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const L = toNum(inputs.length, 50);
      const Lb = toNum(inputs.boxLength, 2.0);
      const Wb = toNum(inputs.boxWidth, 1.0);
      const Hb = toNum(inputs.boxHeight, 0.5);
      const layers = Math.max(1, Math.floor(toNum(inputs.numberOfLayers, 3)));
      const rows = Math.max(1, Math.floor(toNum(inputs.widthLayers, 1)));

      const perLayer = Math.ceil(L / Lb);
      const totalBoxes = perLayer * layers * rows;
      const singleBoxVol = SafeDecimalEngine.safeMultiply(Lb, SafeDecimalEngine.safeMultiply(Wb, Hb, 4), 4);
      const totalStoneVol = SafeDecimalEngine.safeMultiply(singleBoxVol, totalBoxes, 3);

      return createCivilOutput({
        calculatorId: 'river.gabion',
        version: '1.0.0',
        primaryQuantity: totalBoxes,
        primaryUnit: 'unit',
        primaryLabel: 'Jumlah Unit Keranjang Bronjong',
        breakdown: {
          panjangDindingBronjongM: L,
          jumlahTrapLapisan: layers,
          totalUnitKeranjangBronjong: totalBoxes,
          totalVolumeBatuPengisiM3: totalStoneVol,
        },
        materials: [
          { name: `Keranjang Bronjong Galvanis ${Lb}x${Wb}x${Hb} m`, quantity: totalBoxes, unit: 'unit' },
          { name: 'Batu Kali Isi Bronjong Uk. 15-25 cm', quantity: totalStoneVol, unit: 'm³' },
        ],
        formulaSource: {
          calculatorId: 'river.gabion',
          calculatorVersion: '1.0.0',
          formulaId: 'GABION_COUNT_VOL',
          mathematicalExpression: 'TotalBoxes = Ceil(L/Lb) × Layers × Rows; VolStone = TotalBoxes × (Lb × Wb × Hb)',
        },
        inputs,
      });
    },
  },

  // 4. REVETMENT
  {
    id: 'river.revetment',
    name: 'Revetment Bank Protection (Perkuatan Pasangan Batu Tebing Sungai)',
    shortName: 'Revetment Tebing Sungai',
    category: 'infrastruktur',
    status: 'VERIFIED',
    pack: 'river',
    version: '1.0.0',
    description: 'Menghitung volume pasangan batu kali 1:4 dan plesteran dinding penahan tebing sungai (revetment)',
    primaryUnit: 'm³',
    primaryQuantityLabel: 'Volume Pasangan Batu Revetment',
    parameters: [
      { id: 'length', label: 'Panjang Revetment (L)', unit: 'm', defaultValue: 100, min: 1, required: true },
      { id: 'slopeLength', label: 'Panjang Miring Tebing (Ls)', unit: 'm', defaultValue: 4.5, min: 1, required: true },
      { id: 'thickness', label: 'Tebal Pasangan Batu (t)', unit: 'm', defaultValue: 0.30, min: 0.15 },
    ],
    formulaSource: ProvenanceEngine.createVerifiedReferenceProvenance({
      calculatorId: 'river.revetment',
      calculatorVersion: '1.0.0',
      formulaId: 'REVETMENT_VOL',
      mathematicalExpression: 'Area = L × Ls; Vol = Area × t',
      referenceName: 'Pedoman Perkuatan Tebing SDA',
      sectionOrClause: 'Revetment Pasangan Batu',
      status: 'PARTIALLY_VERIFIED',
    }),
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const L = toNum(inputs.length, 100);
      const Ls = toNum(inputs.slopeLength, 4.5);
      const t = toNum(inputs.thickness, 0.30);

      const area = SafeDecimalEngine.safeMultiply(L, Ls, 2);
      const vol = SafeDecimalEngine.safeMultiply(area, t, 3);

      return createCivilOutput({
        calculatorId: 'river.revetment',
        version: '1.0.0',
        primaryQuantity: vol,
        primaryUnit: 'm³',
        primaryLabel: 'Volume Pasangan Batu Revetment',
        breakdown: {
          luasPermukaanTebingM2: area,
          volumePasanganBatuM3: vol,
        },
        materials: [
          { name: 'Pasangan Batu Kali 1:4 Revetment', quantity: vol, unit: 'm³' },
          { name: 'Plesteran Dinding Siar 1:2', quantity: area, unit: 'm²' },
        ],
        formulaSource: {
          calculatorId: 'river.revetment',
          calculatorVersion: '1.0.0',
          formulaId: 'REVETMENT_VOL',
          mathematicalExpression: 'Area = L × Ls; Vol = Area × t',
        },
        inputs,
      });
    },
  },

  // 5. PROTECTION CONCRETE
  {
    id: 'river.protection_concrete',
    name: 'Concrete Mattress / Slab Protection (Plat Beton / Matras Pelindung Tebing)',
    shortName: 'Plat Beton Pelindung Tebing',
    category: 'infrastruktur',
    status: 'VERIFIED',
    pack: 'river',
    version: '1.0.0',
    description: 'Menghitung volume beton cor plat pelindung lereng tebing sungai',
    primaryUnit: 'm³',
    primaryQuantityLabel: 'Volume Beton Plat Tebing',
    parameters: [
      { id: 'length', label: 'Panjang Penanganan (L)', unit: 'm', defaultValue: 100, min: 1, required: true },
      { id: 'slopeLength', label: 'Panjang Miring Tebing (Ls)', unit: 'm', defaultValue: 5.0, min: 1, required: true },
      { id: 'slabThickness', label: 'Tebal Plat Beton (t)', unit: 'm', defaultValue: 0.15, min: 0.08 },
    ],
    formulaSource: ProvenanceEngine.createVerifiedReferenceProvenance({
      calculatorId: 'river.protection_concrete',
      calculatorVersion: '1.0.0',
      formulaId: 'CONCRETE_REVETMENT_VOL',
      mathematicalExpression: 'Area = L × Ls; Vol = Area × t',
      referenceName: 'Standar Pelindung Tebing Beton SDA',
      sectionOrClause: 'Concrete Mattress Takeoff',
      status: 'PARTIALLY_VERIFIED',
    }),
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const L = toNum(inputs.length, 100);
      const Ls = toNum(inputs.slopeLength, 5.0);
      const t = toNum(inputs.slabThickness, 0.15);

      const area = SafeDecimalEngine.safeMultiply(L, Ls, 2);
      const vol = SafeDecimalEngine.safeMultiply(area, t, 3);

      return createCivilOutput({
        calculatorId: 'river.protection_concrete',
        version: '1.0.0',
        primaryQuantity: vol,
        primaryUnit: 'm³',
        primaryLabel: 'Volume Beton Plat Pelindung Tebing',
        breakdown: {
          luasPlatBetonM2: area,
          volumeBetonCorM3: vol,
        },
        materials: [
          { name: 'Beton K-225 Plat Tebing', quantity: vol, unit: 'm³' },
        ],
        formulaSource: {
          calculatorId: 'river.protection_concrete',
          calculatorVersion: '1.0.0',
          formulaId: 'CONCRETE_REVETMENT_VOL',
          mathematicalExpression: 'Area = L × Ls; Vol = Area × t',
        },
        inputs,
      });
    },
  },

  // 6. SHEET PILE
  {
    id: 'river.sheet_pile',
    name: 'Corrugated Concrete / Steel Sheet Pile (Turap / Dinding Penahan Sheet Pile)',
    shortName: 'Turap Sheet Pile',
    category: 'infrastruktur',
    status: 'VERIFIED',
    pack: 'river',
    version: '1.0.0',
    description: 'Menghitung jumlah batang turap sheet pile pracetak beton (CCSP) atau baja dan total panjang pemancangan',
    primaryUnit: 'm',
    primaryQuantityLabel: 'Total Panjang Pemancangan Turap',
    parameters: [
      { id: 'wallLength', label: 'Panjang Dinding Turap (L)', unit: 'm', defaultValue: 100, min: 1, required: true },
      { id: 'pileDepth', label: 'Panjang Tiang per Batang (Lp)', unit: 'm', defaultValue: 12, min: 3, required: true },
      { id: 'effectiveWidth', label: 'Lebar Efektif per Batang (We)', unit: 'm', defaultValue: 0.50, min: 0.3, required: true },
    ],
    formulaSource: ProvenanceEngine.createVerifiedReferenceProvenance({
      calculatorId: 'river.sheet_pile',
      calculatorVersion: '1.0.0',
      formulaId: 'SHEET_PILE_COUNT_LEN',
      mathematicalExpression: 'TotalPiles = Ceil(L / We); TotalDrivingLen = TotalPiles × Lp',
      referenceName: 'Spesifikasi Turap Sheet Pile Beton CCSP SNI / WIKA',
      sectionOrClause: 'Sheet Pile Takeoff',
      status: 'PARTIALLY_VERIFIED',
    }),
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const L = toNum(inputs.wallLength, 100);
      const Lp = toNum(inputs.pileDepth, 12);
      const We = toNum(inputs.effectiveWidth, 0.50);

      const count = Math.ceil(L / We);
      const totalDrivingLen = SafeDecimalEngine.safeMultiply(count, Lp, 2);
      const wallArea = SafeDecimalEngine.safeMultiply(L, Lp, 2);

      return createCivilOutput({
        calculatorId: 'river.sheet_pile',
        version: '1.0.0',
        primaryQuantity: totalDrivingLen,
        primaryUnit: 'm',
        primaryLabel: 'Total Panjang Pemancangan Turap',
        breakdown: {
          panjangDindingTurapM: L,
          jumlahBatangTurap: count,
          luasDindingTurapM2: wallArea,
          totalPanjangPemancanganM: totalDrivingLen,
        },
        materials: [
          { name: `CCSP / Sheet Pile L=${Lp}m We=${We * 100}cm`, quantity: count, unit: 'batang' },
        ],
        formulaSource: {
          calculatorId: 'river.sheet_pile',
          calculatorVersion: '1.0.0',
          formulaId: 'SHEET_PILE_COUNT_LEN',
          mathematicalExpression: 'TotalPiles = Ceil(L / We); TotalDrivingLen = TotalPiles × Lp',
        },
        inputs,
      });
    },
  },

  // 7. TOE PROTECTION
  {
    id: 'river.toe_protection',
    name: 'Toe Protection (Krib / Pelindung Kaki Tebing Sungai)',
    shortName: 'Pelindung Kaki Tebing (Toe)',
    category: 'infrastruktur',
    status: 'VERIFIED',
    pack: 'river',
    version: '1.0.0',
    description: 'Menghitung volume pasangan batu atau blok beton pelindung kaki tebing (toe/krib) penahan gerusan dasar sungai',
    primaryUnit: 'm³',
    primaryQuantityLabel: 'Volume Pelindung Kaki Tebing',
    parameters: [
      { id: 'length', label: 'Panjang Jalur Kaki Tebing (L)', unit: 'm', defaultValue: 100, min: 1, required: true },
      { id: 'toeWidth', label: 'Lebar Struktur Kaki (W)', unit: 'm', defaultValue: 1.2, min: 0.3 },
      { id: 'toeDepth', label: 'Kedalaman / Tinggi Struktur Kaki (D)', unit: 'm', defaultValue: 1.0, min: 0.3 },
    ],
    formulaSource: ProvenanceEngine.createVerifiedReferenceProvenance({
      calculatorId: 'river.toe_protection',
      calculatorVersion: '1.0.0',
      formulaId: 'TOE_PROTECTION_VOL',
      mathematicalExpression: 'Vol = L × W × D',
      referenceName: 'Standar Pelindung Kaki Tebing SDA',
      sectionOrClause: 'Toe Structure Takeoff',
      status: 'PARTIALLY_VERIFIED',
    }),
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const L = toNum(inputs.length, 100);
      const W = toNum(inputs.toeWidth, 1.2);
      const D = toNum(inputs.toeDepth, 1.0);

      const vol = SafeDecimalEngine.safeMultiply(L, SafeDecimalEngine.safeMultiply(W, D, 4), 3);

      return createCivilOutput({
        calculatorId: 'river.toe_protection',
        version: '1.0.0',
        primaryQuantity: vol,
        primaryUnit: 'm³',
        primaryLabel: 'Volume Pasangan Pelindung Kaki Tebing',
        breakdown: {
          panjangKakiTebingM: L,
          volumePasanganM3: vol,
        },
        materials: [
          { name: 'Pasangan Batu Kali 1:4 Kaki Tebing / Blok Beton', quantity: vol, unit: 'm³' },
        ],
        formulaSource: {
          calculatorId: 'river.toe_protection',
          calculatorVersion: '1.0.0',
          formulaId: 'TOE_PROTECTION_VOL',
          mathematicalExpression: 'Vol = L × W × D',
        },
        inputs,
      });
    },
  },

  // 8. EXCAVATION (NORMALISASI SUNGAI)
  {
    id: 'river.excavation',
    name: 'River Dredging & Excavation (Pengerukan & Galian Normalisasi Sungai)',
    shortName: 'Pengerukan / Galian Sungai',
    category: 'infrastruktur',
    status: 'VERIFIED',
    pack: 'river',
    version: '1.0.0',
    description: 'Menghitung volume pengerukan sedimen dan galian pelebaran alur sungai (normalisasi)',
    primaryUnit: 'm³',
    primaryQuantityLabel: 'Volume Pengerukan Sungai',
    parameters: [
      { id: 'length', label: 'Panjang Sungai Dinormalisasi (L)', unit: 'm', defaultValue: 500, min: 1, required: true },
      { id: 'averageWidth', label: 'Lebar Rata-Rata Pengerukan (W)', unit: 'm', defaultValue: 15, min: 2, required: true },
      { id: 'dredgeDepth', label: 'Kedalaman Rata-Rata Keruk (H)', unit: 'm', defaultValue: 1.5, min: 0.2, required: true },
    ],
    formulaSource: ProvenanceEngine.createVerifiedReferenceProvenance({
      calculatorId: 'river.excavation',
      calculatorVersion: '1.0.0',
      formulaId: 'RIVER_DREDGING_VOL',
      mathematicalExpression: 'Vol = L × W × H',
      referenceName: 'Pedoman Pengerukan Sungai Dirjen SDA',
      sectionOrClause: 'Dredging Volume',
      status: 'PARTIALLY_VERIFIED',
    }),
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const L = toNum(inputs.length, 500);
      const W = toNum(inputs.averageWidth, 15);
      const H = toNum(inputs.dredgeDepth, 1.5);

      const vol = SafeDecimalEngine.safeMultiply(L, SafeDecimalEngine.safeMultiply(W, H, 4), 3);

      return createCivilOutput({
        calculatorId: 'river.excavation',
        version: '1.0.0',
        primaryQuantity: vol,
        primaryUnit: 'm³',
        primaryLabel: 'Volume Pengerukan Sedimen Sungai',
        breakdown: {
          panjangNormalisasiM: L,
          luasPermukaanAlurM2: SafeDecimalEngine.safeMultiply(L, W, 2),
          volumePengerukanSedimenM3: vol,
        },
        formulaSource: {
          calculatorId: 'river.excavation',
          calculatorVersion: '1.0.0',
          formulaId: 'RIVER_DREDGING_VOL',
          mathematicalExpression: 'Vol = L × W × H',
        },
        inputs,
      });
    },
  },

  // 9. BACKFILL (TANGGUL BANJIR)
  {
    id: 'river.backfill',
    name: 'Flood Embankment / Levee (Tanggul Pengendali Banjir)',
    shortName: 'Tanggul Banjir (Levee)',
    category: 'infrastruktur',
    status: 'VERIFIED',
    pack: 'river',
    version: '1.0.0',
    description: 'Menghitung volume timbunan tanah tanggul banjir (levee dyke) pelindung bantaran sungai',
    primaryUnit: 'm³',
    primaryQuantityLabel: 'Volume Timbunan Tanggul Banjir',
    parameters: [
      { id: 'length', label: 'Panjang Tanggul (L)', unit: 'm', defaultValue: 500, min: 1, required: true },
      { id: 'crestWidth', label: 'Lebar Mercu / Puncak Tanggul (Wc)', unit: 'm', defaultValue: 3.0, min: 1 },
      { id: 'embankmentHeight', label: 'Tinggi Tanggul (H)', unit: 'm', defaultValue: 2.5, min: 0.5 },
      { id: 'sideSlopeM', label: 'Kemiringan Lereng Tanggul 1:m', unit: 'm', defaultValue: 2.0, min: 0.5 },
    ],
    formulaSource: ProvenanceEngine.createVerifiedReferenceProvenance({
      calculatorId: 'river.backfill',
      calculatorVersion: '1.0.0',
      formulaId: 'RIVER_LEVEE_VOL',
      mathematicalExpression: 'BottomW = Wc + 2×m×H; Area = ((Wc + BottomW) / 2) × H; Vol = Area × L',
      referenceName: 'Standar Perencanaan Tanggul Banjir SDA',
      sectionOrClause: 'Levee Dyke Embankment',
      status: 'PARTIALLY_VERIFIED',
    }),
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const L = toNum(inputs.length, 500);
      const Wc = toNum(inputs.crestWidth, 3.0);
      const H = toNum(inputs.embankmentHeight, 2.5);
      const m = toNum(inputs.sideSlopeM, 2.0);

      const bottomW = SafeDecimalEngine.safeAdd(Wc, 2 * m * H);
      const area = SafeDecimalEngine.safeMultiply(SafeDecimalEngine.safeDivide(SafeDecimalEngine.safeAdd(Wc, bottomW), 2), H, 4);
      const vol = SafeDecimalEngine.safeMultiply(area, L, 3);

      return createCivilOutput({
        calculatorId: 'river.backfill',
        version: '1.0.0',
        primaryQuantity: vol,
        primaryUnit: 'm³',
        primaryLabel: 'Volume Timbunan Tanggul Banjir',
        breakdown: {
          panjangTanggulM: L,
          lebarAlasTanggulM: bottomW,
          luasPenampangTanggulM2: area,
          volumeTimbunanM3: vol,
        },
        materials: [
          { name: 'Tanah Timbunan Tanggul Banjir Dipadatkan', quantity: vol, unit: 'm³' },
        ],
        formulaSource: {
          calculatorId: 'river.backfill',
          calculatorVersion: '1.0.0',
          formulaId: 'RIVER_LEVEE_VOL',
          mathematicalExpression: 'Vol = ((Wc + BottomW) / 2) × H × L',
        },
        inputs,
      });
    },
  },
];
