import {
  CalculationInput,
  CalculationOutput,
  CalculationContext,
  CalculatorDefinition,
} from '../../contracts/types';
import { SafeDecimalEngine } from '../../../safeDecimalEngine';
import { ProvenanceEngine } from '../../provenance/provenanceEngine';
import { toNum, createCivilOutput } from '../civilHelper';

export const IRRIGATION_PACK_CALCULATORS: CalculatorDefinition[] = [
  // 1. CANAL
  {
    id: 'irrigation.canal',
    name: 'Irrigation Canal (Saluran Irigasi Primer/Sekunder/Tersier)',
    shortName: 'Saluran Irigasi',
    category: 'infrastruktur',
    status: 'VERIFIED',
    pack: 'irrigation',
    version: '1.0.0',
    description: 'Menghitung geometri saluran irigasi trapesium, galian tanah, dan luas basah dinding saluran',
    primaryUnit: 'm³',
    primaryQuantityLabel: 'Volume Galian Saluran Irigasi',
    parameters: [
      { id: 'length', label: 'Panjang Saluran (L)', unit: 'm', defaultValue: 500, min: 1, required: true },
      { id: 'bottomWidth', label: 'Lebar Dasar Saluran (b)', unit: 'm', defaultValue: 1.5, min: 0.3, required: true },
      { id: 'waterDepth', label: 'Tinggi Jagaan + Air / Kedalaman (h)', unit: 'm', defaultValue: 1.2, min: 0.2, required: true },
      { id: 'sideSlopeM', label: 'Kemiringan Tebing 1 : m (m)', unit: 'm', defaultValue: 1.0, min: 0 },
    ],
    formulaSource: ProvenanceEngine.createVerifiedReferenceProvenance({
      calculatorId: 'irrigation.canal',
      calculatorVersion: '1.0.0',
      formulaId: 'IRRIGATION_CANAL_VOL',
      mathematicalExpression: 'Area = (b + m×h) × h; Vol = Area × L',
      referenceName: 'Standar Perencanaan Irigasi KP-01 s/d KP-09 Dirjen SDA',
      sectionOrClause: 'Geometri Saluran Tanah / Pasangan',
      status: 'PARTIALLY_VERIFIED',
    }),
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const L = toNum(inputs.length, 500);
      const b = toNum(inputs.bottomWidth, 1.5);
      const h = toNum(inputs.waterDepth, 1.2);
      const m = toNum(inputs.sideSlopeM, 1.0);

      const topW = SafeDecimalEngine.safeAdd(b, 2 * m * h);
      const area = SafeDecimalEngine.safeMultiply(SafeDecimalEngine.safeAdd(b, m * h), h, 4);
      const vol = SafeDecimalEngine.safeMultiply(area, L, 3);
      const slopeLen = Math.sqrt(Math.pow(m * h, 2) + Math.pow(h, 2));
      const wettedPerimeter = SafeDecimalEngine.safeAdd(b, 2 * slopeLen);
      const wettedArea = SafeDecimalEngine.safeMultiply(wettedPerimeter, L, 2);

      return createCivilOutput({
        calculatorId: 'irrigation.canal',
        version: '1.0.0',
        primaryQuantity: vol,
        primaryUnit: 'm³',
        primaryLabel: 'Volume Galian Saluran Irigasi',
        breakdown: {
          panjangSaluranM: L,
          lebarAtasSaluranM: topW,
          luasPenampangBasahM2: area,
          volumeGalianM3: vol,
          luasPermukaanDindingM2: wettedArea,
        },
        formulaSource: {
          calculatorId: 'irrigation.canal',
          calculatorVersion: '1.0.0',
          formulaId: 'IRRIGATION_CANAL_VOL',
          mathematicalExpression: 'Area = (b + m×h) × h; Vol = Area × L',
        },
        inputs,
      });
    },
  },

  // 2. EXCAVATION
  {
    id: 'irrigation.excavation',
    name: 'Canal Excavation (Galian Tanah Saluran Irigasi)',
    shortName: 'Galian Saluran Irigasi',
    category: 'infrastruktur',
    status: 'VERIFIED',
    pack: 'irrigation',
    version: '1.0.0',
    description: 'Menghitung volume galian tanah saluran irigasi tanah/pasangan',
    primaryUnit: 'm³',
    primaryQuantityLabel: 'Volume Galian Tanah Irigasi',
    parameters: [
      { id: 'length', label: 'Panjang Saluran (L)', unit: 'm', defaultValue: 300, min: 1, required: true },
      { id: 'crossSectionArea', label: 'Luas Penampang Galian (A)', unit: 'm²', defaultValue: 2.5, min: 0.1, required: true },
    ],
    formulaSource: ProvenanceEngine.createVerifiedReferenceProvenance({
      calculatorId: 'irrigation.excavation',
      calculatorVersion: '1.0.0',
      formulaId: 'IRRIGATION_EXC_VOL',
      mathematicalExpression: 'Vol = A × L',
      referenceName: 'Standar KP Irigasi Pekerjaan Tanah',
      sectionOrClause: 'Galian Saluran',
      status: 'PARTIALLY_VERIFIED',
    }),
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const L = toNum(inputs.length, 300);
      const A = toNum(inputs.crossSectionArea, 2.5);
      const vol = SafeDecimalEngine.safeMultiply(A, L, 3);

      return createCivilOutput({
        calculatorId: 'irrigation.excavation',
        version: '1.0.0',
        primaryQuantity: vol,
        primaryUnit: 'm³',
        primaryLabel: 'Volume Galian Saluran Irigasi',
        breakdown: {
          panjangSaluranM: L,
          luasPenampangGalianM2: A,
          volumeGalianM3: vol,
        },
        formulaSource: {
          calculatorId: 'irrigation.excavation',
          calculatorVersion: '1.0.0',
          formulaId: 'IRRIGATION_EXC_VOL',
          mathematicalExpression: 'Vol = A × L',
        },
        inputs,
      });
    },
  },

  // 3. LINING
  {
    id: 'irrigation.lining',
    name: 'Canal Lining (Lining Pasangan Batu Saluran Irigasi)',
    shortName: 'Lining Pasangan Batu Irigasi',
    category: 'infrastruktur',
    status: 'VERIFIED',
    pack: 'irrigation',
    version: '1.0.0',
    description: 'Menghitung volume pasangan batu kali 1:4 dan plesteran lining dinding saluran irigasi',
    primaryUnit: 'm³',
    primaryQuantityLabel: 'Volume Pasangan Batu Lining',
    parameters: [
      { id: 'length', label: 'Panjang Saluran (L)', unit: 'm', defaultValue: 300, min: 1, required: true },
      { id: 'bottomWidth', label: 'Lebar Dasar Saluran (b)', unit: 'm', defaultValue: 1.0, min: 0.2 },
      { id: 'slopeLength', label: 'Panjang Miring Dinding (s)', unit: 'm', defaultValue: 1.5, min: 0.2 },
      { id: 'liningThickness', label: 'Tebal Pasangan Lining (t)', unit: 'm', defaultValue: 0.20, min: 0.1 },
    ],
    formulaSource: ProvenanceEngine.createVerifiedReferenceProvenance({
      calculatorId: 'irrigation.lining',
      calculatorVersion: '1.0.0',
      formulaId: 'IRRIGATION_LINING_VOL',
      mathematicalExpression: 'Area = (b + 2s) × L; Vol = Area × t',
      referenceName: 'Standar KP-04 Saluran Pasangan',
      sectionOrClause: 'Pasangan Batu Kali',
      status: 'PARTIALLY_VERIFIED',
    }),
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const L = toNum(inputs.length, 300);
      const b = toNum(inputs.bottomWidth, 1.0);
      const s = toNum(inputs.slopeLength, 1.5);
      const t = toNum(inputs.liningThickness, 0.20);

      const perimeter = SafeDecimalEngine.safeAdd(b, 2 * s);
      const area = SafeDecimalEngine.safeMultiply(perimeter, L, 2);
      const vol = SafeDecimalEngine.safeMultiply(area, t, 3);

      return createCivilOutput({
        calculatorId: 'irrigation.lining',
        version: '1.0.0',
        primaryQuantity: vol,
        primaryUnit: 'm³',
        primaryLabel: 'Volume Pasangan Batu Lining Saluran',
        breakdown: {
          kelilingPenampangPasanganM: perimeter,
          luasPasanganM2: area,
          volumePasanganBatuM3: vol,
        },
        materials: [
          { name: 'Pasangan Batu Kali 1:4 Saluran', quantity: vol, unit: 'm³', unitPriceEstimate: 850000 },
          { name: 'Plesteran Siar 1:2', quantity: area, unit: 'm²', unitPriceEstimate: 48000 },
        ],
        formulaSource: {
          calculatorId: 'irrigation.lining',
          calculatorVersion: '1.0.0',
          formulaId: 'IRRIGATION_LINING_VOL',
          mathematicalExpression: 'Area = (b + 2s) × L; Vol = Area × t',
        },
        inputs,
      });
    },
  },

  // 4. EMBANKMENT (TANGGUL SALURAN)
  {
    id: 'irrigation.embankment',
    name: 'Canal Embankment (Tanggul Saluran Irigasi)',
    shortName: 'Tanggul Saluran Irigasi',
    category: 'infrastruktur',
    status: 'VERIFIED',
    pack: 'irrigation',
    version: '1.0.0',
    description: 'Menghitung volume timbunan tanah tanggul inspeksi saluran irigasi (kiri & kanan)',
    primaryUnit: 'm³',
    primaryQuantityLabel: 'Volume Timbunan Tanggul Saluran',
    parameters: [
      { id: 'length', label: 'Panjang Saluran (L)', unit: 'm', defaultValue: 300, min: 1, required: true },
      { id: 'crestWidth', label: 'Lebar Puncak Tanggul (Wc)', unit: 'm', defaultValue: 1.5, min: 0.5 },
      { id: 'embankmentHeight', label: 'Tinggi Tanggul (H)', unit: 'm', defaultValue: 1.2, min: 0.2 },
      { id: 'sideSlopeM', label: 'Kemiringan Tanggul Luar 1:m', unit: 'm', defaultValue: 1.5, min: 0 },
      { id: 'numberOfDykes', label: 'Jumlah Sisi Tanggul (1 atau 2)', unit: 'sisi', defaultValue: 2, min: 1 },
    ],
    formulaSource: ProvenanceEngine.createVerifiedReferenceProvenance({
      calculatorId: 'irrigation.embankment',
      calculatorVersion: '1.0.0',
      formulaId: 'IRRIGATION_DYKE_VOL',
      mathematicalExpression: 'Area = (Wc + m×H/2) × H; Vol = Area × L × Dykes',
      referenceName: 'Standar KP Irigasi Tanggul Inspeksi',
      sectionOrClause: 'Embankment Volume',
      status: 'PARTIALLY_VERIFIED',
    }),
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const L = toNum(inputs.length, 300);
      const Wc = toNum(inputs.crestWidth, 1.5);
      const H = toNum(inputs.embankmentHeight, 1.2);
      const m = toNum(inputs.sideSlopeM, 1.5);
      const dykes = Math.max(1, Math.floor(toNum(inputs.numberOfDykes, 2)));

      const bottomW = SafeDecimalEngine.safeAdd(Wc, m * H);
      const area = SafeDecimalEngine.safeMultiply(SafeDecimalEngine.safeDivide(SafeDecimalEngine.safeAdd(Wc, bottomW), 2), H, 4);
      const singleVol = SafeDecimalEngine.safeMultiply(area, L, 3);
      const totalVol = SafeDecimalEngine.safeMultiply(singleVol, dykes, 3);

      return createCivilOutput({
        calculatorId: 'irrigation.embankment',
        version: '1.0.0',
        primaryQuantity: totalVol,
        primaryUnit: 'm³',
        primaryLabel: 'Volume Timbunan Tanggul Irigasi',
        breakdown: {
          volumePerSisiTanggulM3: singleVol,
          totalVolumeTimbunanM3: totalVol,
        },
        materials: [
          { name: 'Tanah Timbunan Tanggul Saluran Dipadatkan', quantity: totalVol, unit: 'm³', unitPriceEstimate: 120000 },
        ],
        formulaSource: {
          calculatorId: 'irrigation.embankment',
          calculatorVersion: '1.0.0',
          formulaId: 'IRRIGATION_DYKE_VOL',
          mathematicalExpression: 'Vol = Area × L × Dykes',
        },
        inputs,
      });
    },
  },

  // 5. GATE (PINTU AIR IRIGASI)
  {
    id: 'irrigation.gate',
    name: 'Sluice Gate (Pintu Air Saluran Irigasi)',
    shortName: 'Pintu Air Irigasi',
    category: 'infrastruktur',
    status: 'VERIFIED',
    pack: 'irrigation',
    version: '1.0.0',
    description: 'Menghitung jumlah unit pintu air geser (sluice gate) baja/kayu dan stang penggerak',
    primaryUnit: 'unit',
    primaryQuantityLabel: 'Jumlah Unit Pintu Air',
    parameters: [
      { id: 'count', label: 'Jumlah Unit Pintu Air', unit: 'unit', defaultValue: 3, min: 1, required: true },
      { id: 'gateWidth', label: 'Lebar Daun Pintu (W)', unit: 'm', defaultValue: 1.0, min: 0.3 },
      { id: 'gateHeight', label: 'Tinggi Daun Pintu (H)', unit: 'm', defaultValue: 1.2, min: 0.3 },
    ],
    formulaSource: ProvenanceEngine.createVerifiedReferenceProvenance({
      calculatorId: 'irrigation.gate',
      calculatorVersion: '1.0.0',
      formulaId: 'IRRIGATION_GATE_COUNT',
      mathematicalExpression: 'Total = Count; TotalArea = W × H × Count',
      referenceName: 'Standar KP-04 Pintu Pengatur Saluran',
      sectionOrClause: 'Pintu Air Irigasi',
      status: 'PARTIALLY_VERIFIED',
    }),
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const count = Math.max(1, Math.floor(toNum(inputs.count, 3)));
      const W = toNum(inputs.gateWidth, 1.0);
      const H = toNum(inputs.gateHeight, 1.2);

      const totalArea = SafeDecimalEngine.safeMultiply(SafeDecimalEngine.safeMultiply(W, H, 2), count, 2);

      return createCivilOutput({
        calculatorId: 'irrigation.gate',
        version: '1.0.0',
        primaryQuantity: count,
        primaryUnit: 'unit',
        primaryLabel: 'Jumlah Unit Pintu Air Irigasi',
        breakdown: {
          jumlahPintuAirUnit: count,
          luasDaunPintuTotalM2: totalArea,
        },
        materials: [
          {
            name: `Pintu Air Baja Ukuran ${W * 100}x${H * 100} cm Lengkap Stang`,
            quantity: count,
            unit: 'unit',
            unitPriceEstimate: 38500000,
          },
        ],
        formulaSource: {
          calculatorId: 'irrigation.gate',
          calculatorVersion: '1.0.0',
          formulaId: 'IRRIGATION_GATE_COUNT',
          mathematicalExpression: 'Total = Count; TotalArea = W × H × Count',
        },
        inputs,
      });
    },
  },

  // 6. INTAKE (BANGUNAN SADAP)
  {
    id: 'irrigation.intake',
    name: 'Offtake / Intake Structure (Bangunan Sadap / Bagi Irigasi)',
    shortName: 'Bangunan Sadap (Intake)',
    category: 'infrastruktur',
    status: 'VERIFIED',
    pack: 'irrigation',
    version: '1.0.0',
    description: 'Menghitung volume beton dan pasangan batu bangunan bagi/sadap saluran irigasi',
    primaryUnit: 'unit',
    primaryQuantityLabel: 'Jumlah Bangunan Sadap',
    parameters: [
      { id: 'count', label: 'Jumlah Bangunan Sadap', unit: 'unit', defaultValue: 2, min: 1, required: true },
      { id: 'concreteVolumePerUnit', label: 'Volume Beton per Bangunan (V)', unit: 'm³', defaultValue: 8.5, min: 0.5 },
    ],
    formulaSource: ProvenanceEngine.createVerifiedReferenceProvenance({
      calculatorId: 'irrigation.intake',
      calculatorVersion: '1.0.0',
      formulaId: 'INTAKE_STRUCT_VOL',
      mathematicalExpression: 'TotalVol = Count × V',
      referenceName: 'Standar KP-02 Bangunan Bagi dan Sadap',
      sectionOrClause: 'Intake Takeoff',
      status: 'PARTIALLY_VERIFIED',
    }),
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const count = Math.max(1, Math.floor(toNum(inputs.count, 2)));
      const V = toNum(inputs.concreteVolumePerUnit, 8.5);
      const totalVol = SafeDecimalEngine.safeMultiply(V, count, 3);

      return createCivilOutput({
        calculatorId: 'irrigation.intake',
        version: '1.0.0',
        primaryQuantity: count,
        primaryUnit: 'unit',
        primaryLabel: 'Jumlah Bangunan Sadap Irigasi',
        breakdown: {
          jumlahBangunanUnit: count,
          volumeBetonPerUnitM3: V,
          totalVolumeBetonM3: totalVol,
        },
        materials: [
          { name: 'Beton Struktur K-225 Bangunan Sadap', quantity: totalVol, unit: 'm³', unitPriceEstimate: 1200000 },
        ],
        formulaSource: {
          calculatorId: 'irrigation.intake',
          calculatorVersion: '1.0.0',
          formulaId: 'INTAKE_STRUCT_VOL',
          mathematicalExpression: 'TotalVol = Count × V',
        },
        inputs,
      });
    },
  },

  // 7. OUTLET (BANGUNAN PELIMPAH / BUANG)
  {
    id: 'irrigation.outlet',
    name: 'Canal Spillway / Waste Way (Bangunan Pelimpah Samping / Pembuang)',
    shortName: 'Pelimpah Saluran (Outlet)',
    category: 'infrastruktur',
    status: 'VERIFIED',
    pack: 'irrigation',
    version: '1.0.0',
    description: 'Menghitung volume pasangan batu/beton bangunan pelimpah samping dan pembuang saluran',
    primaryUnit: 'm³',
    primaryQuantityLabel: 'Volume Pasangan/Beton Outlet',
    parameters: [
      { id: 'count', label: 'Jumlah Bangunan Pelimpah', unit: 'unit', defaultValue: 1, min: 1, required: true },
      { id: 'crestLength', label: 'Panjang Ambang Pelimpah (L)', unit: 'm', defaultValue: 3.0, min: 0.5 },
      { id: 'structureVolume', label: 'Volume Fisik per Unit (V)', unit: 'm³', defaultValue: 6.0, min: 0.5 },
    ],
    formulaSource: ProvenanceEngine.createVerifiedReferenceProvenance({
      calculatorId: 'irrigation.outlet',
      calculatorVersion: '1.0.0',
      formulaId: 'IRRIGATION_OUTLET_VOL',
      mathematicalExpression: 'TotalVol = Count × V',
      referenceName: 'Standar KP-04 Bangunan Pengatur Muka Air',
      sectionOrClause: 'Pelimpah Samping Irigasi',
      status: 'PARTIALLY_VERIFIED',
    }),
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const count = Math.max(1, Math.floor(toNum(inputs.count, 1)));
      const V = toNum(inputs.structureVolume, 6.0);
      const totalVol = SafeDecimalEngine.safeMultiply(V, count, 3);

      return createCivilOutput({
        calculatorId: 'irrigation.outlet',
        version: '1.0.0',
        primaryQuantity: totalVol,
        primaryUnit: 'm³',
        primaryLabel: 'Volume Beton/Pasangan Bangunan Pembuang',
        breakdown: {
          jumlahBangunanPelimpah: count,
          totalVolumeM3: totalVol,
        },
        materials: [
          { name: 'Pasangan Batu Kali 1:4 / Beton K-225', quantity: totalVol, unit: 'm³', unitPriceEstimate: 950000 },
        ],
        formulaSource: {
          calculatorId: 'irrigation.outlet',
          calculatorVersion: '1.0.0',
          formulaId: 'IRRIGATION_OUTLET_VOL',
          mathematicalExpression: 'TotalVol = Count × V',
        },
        inputs,
      });
    },
  },

  // 8. BOX / CULVERT STRUCTURE (GORONG-GORONG PEMBAWA)
  {
    id: 'irrigation.box_channel',
    name: 'Irrigation Culvert / Syphon / Flume (Gorong-Gorong / Talang Irigasi)',
    shortName: 'Gorong-Gorong/Talang Irigasi',
    category: 'infrastruktur',
    status: 'VERIFIED',
    pack: 'irrigation',
    version: '1.0.0',
    description: 'Menghitung volume beton struktur talang pembawa (flume) atau gorong-gorong silang irigasi',
    primaryUnit: 'm³',
    primaryQuantityLabel: 'Volume Beton Talang / Gorong-Gorong',
    parameters: [
      { id: 'length', label: 'Panjang Struktur (L)', unit: 'm', defaultValue: 20, min: 1, required: true },
      { id: 'internalWidth', label: 'Lebar Dalam (W)', unit: 'm', defaultValue: 1.2, min: 0.3 },
      { id: 'internalHeight', label: 'Tinggi Dalam (H)', unit: 'm', defaultValue: 1.0, min: 0.3 },
      { id: 'wallThickness', label: 'Tebal Plat/Dinding (t)', unit: 'm', defaultValue: 0.15, min: 0.08 },
    ],
    formulaSource: ProvenanceEngine.createVerifiedReferenceProvenance({
      calculatorId: 'irrigation.box_channel',
      calculatorVersion: '1.0.0',
      formulaId: 'IRRIGATION_FLUME_VOL',
      mathematicalExpression: 'Area = (W+2t)(H+t) - W×H; Vol = Area × L',
      referenceName: 'Standar KP-05 Bangunan Silang Irigasi',
      sectionOrClause: 'Talang dan Gorong-Gorong',
      status: 'PARTIALLY_VERIFIED',
    }),
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const L = toNum(inputs.length, 20);
      const W = toNum(inputs.internalWidth, 1.2);
      const H = toNum(inputs.internalHeight, 1.0);
      const t = toNum(inputs.wallThickness, 0.15);

      const grossArea = SafeDecimalEngine.safeMultiply(SafeDecimalEngine.safeAdd(W, 2 * t), SafeDecimalEngine.safeAdd(H, t), 4);
      const voidArea = SafeDecimalEngine.safeMultiply(W, H, 4);
      const concreteSection = SafeDecimalEngine.safeSubtract(grossArea, voidArea);
      const vol = SafeDecimalEngine.safeMultiply(concreteSection, L, 3);

      return createCivilOutput({
        calculatorId: 'irrigation.box_channel',
        version: '1.0.0',
        primaryQuantity: vol,
        primaryUnit: 'm³',
        primaryLabel: 'Volume Beton Talang / Gorong-Gorong Irigasi',
        breakdown: {
          panjangStrukturM: L,
          luasPenampangBetonM2: concreteSection,
          volumeBetonM3: vol,
        },
        materials: [
          { name: 'Beton Bertulang K-250 Struktur Talang', quantity: vol, unit: 'm³', unitPriceEstimate: 1300000 },
        ],
        formulaSource: {
          calculatorId: 'irrigation.box_channel',
          calculatorVersion: '1.0.0',
          formulaId: 'IRRIGATION_FLUME_VOL',
          mathematicalExpression: 'Area = (W+2t)(H+t) - W×H; Vol = Area × L',
        },
        inputs,
      });
    },
  },

  // 9. CONCRETE GENERAL
  {
    id: 'irrigation.concrete',
    name: 'Irrigation Concrete Structure (Beton Struktur Irigasi Umum)',
    shortName: 'Beton Struktur Irigasi',
    category: 'infrastruktur',
    status: 'VERIFIED',
    pack: 'irrigation',
    version: '1.0.0',
    description: 'Menghitung volume beton mutu K-175, K-225, atau K-250 untuk bangunan air irigasi',
    primaryUnit: 'm³',
    primaryQuantityLabel: 'Volume Beton Cor Irigasi',
    parameters: [
      { id: 'length', label: 'Panjang (L)', unit: 'm', defaultValue: 10, min: 0.5, required: true },
      { id: 'width', label: 'Lebar (W)', unit: 'm', defaultValue: 2.0, min: 0.2, required: true },
      { id: 'height', label: 'Tebal / Tinggi (H)', unit: 'm', defaultValue: 0.5, min: 0.1, required: true },
      { id: 'count', label: 'Jumlah Unit', unit: 'unit', defaultValue: 1, min: 1 },
    ],
    formulaSource: ProvenanceEngine.createVerifiedReferenceProvenance({
      calculatorId: 'irrigation.concrete',
      calculatorVersion: '1.0.0',
      formulaId: 'IRRIGATION_CONC_VOL',
      mathematicalExpression: 'Vol = L × W × H × Count',
      referenceName: 'Standar KP Bangunan Irigasi',
      sectionOrClause: 'Pekerjaan Beton Struktur',
      status: 'PARTIALLY_VERIFIED',
    }),
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const L = toNum(inputs.length, 10);
      const W = toNum(inputs.width, 2.0);
      const H = toNum(inputs.height, 0.5);
      const count = Math.max(1, Math.floor(toNum(inputs.count, 1)));

      const singleVol = SafeDecimalEngine.safeMultiply(L, SafeDecimalEngine.safeMultiply(W, H, 4), 3);
      const totalVol = SafeDecimalEngine.safeMultiply(singleVol, count, 3);

      return createCivilOutput({
        calculatorId: 'irrigation.concrete',
        version: '1.0.0',
        primaryQuantity: totalVol,
        primaryUnit: 'm³',
        primaryLabel: 'Volume Beton Struktur Irigasi',
        breakdown: {
          volumePerUnitM3: singleVol,
          totalVolumeBetonM3: totalVol,
        },
        materials: [
          { name: 'Beton K-225 Bangunan Air Irigasi', quantity: totalVol, unit: 'm³', unitPriceEstimate: 1200000 },
        ],
        formulaSource: {
          calculatorId: 'irrigation.concrete',
          calculatorVersion: '1.0.0',
          formulaId: 'IRRIGATION_CONC_VOL',
          mathematicalExpression: 'Vol = L × W × H × Count',
        },
        inputs,
      });
    },
  },

  // 10. FORMWORK
  {
    id: 'irrigation.formwork',
    name: 'Irrigation Formwork (Bekisting Struktur Saluran Irigasi)',
    shortName: 'Bekisting Irigasi',
    category: 'infrastruktur',
    status: 'VERIFIED',
    pack: 'irrigation',
    version: '1.0.0',
    description: 'Menghitung luas bidang kontak bekisting acuan dinding dan lantai bangunan irigasi',
    primaryUnit: 'm²',
    primaryQuantityLabel: 'Luas Bekisting Irigasi',
    parameters: [
      { id: 'length', label: 'Panjang Dinding/Struktur (L)', unit: 'm', defaultValue: 25, min: 0.5, required: true },
      { id: 'height', label: 'Tinggi Bekisting (H)', unit: 'm', defaultValue: 1.5, min: 0.2, required: true },
      { id: 'numberOfSides', label: 'Jumlah Sisi Kontak (1 atau 2 sisi)', unit: 'sisi', defaultValue: 2, min: 1 },
    ],
    formulaSource: ProvenanceEngine.createVerifiedReferenceProvenance({
      calculatorId: 'irrigation.formwork',
      calculatorVersion: '1.0.0',
      formulaId: 'IRRIGATION_FORMWORK_AREA',
      mathematicalExpression: 'Area = L × H × Sides',
      referenceName: 'Standar Acuan Bangunan Air SDA',
      sectionOrClause: 'Formwork Takeoff',
      status: 'PARTIALLY_VERIFIED',
    }),
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const L = toNum(inputs.length, 25);
      const H = toNum(inputs.height, 1.5);
      const sides = Math.max(1, Math.floor(toNum(inputs.numberOfSides, 2)));

      const totalArea = SafeDecimalEngine.safeMultiply(SafeDecimalEngine.safeMultiply(L, H, 2), sides, 2);

      return createCivilOutput({
        calculatorId: 'irrigation.formwork',
        version: '1.0.0',
        primaryQuantity: totalArea,
        primaryUnit: 'm²',
        primaryLabel: 'Luas Bekisting Bangunan Irigasi',
        breakdown: {
          luasPerSisiM2: SafeDecimalEngine.safeMultiply(L, H, 2),
          totalLuasBekistingM2: totalArea,
        },
        materials: [
          { name: 'Bekisting Kayu / Multiplex Bangunan Air', quantity: totalArea, unit: 'm²', unitPriceEstimate: 185000 },
        ],
        formulaSource: {
          calculatorId: 'irrigation.formwork',
          calculatorVersion: '1.0.0',
          formulaId: 'IRRIGATION_FORMWORK_AREA',
          mathematicalExpression: 'Area = L × H × Sides',
        },
        inputs,
      });
    },
  },

  // 11. BACKFILL
  {
    id: 'irrigation.backfill',
    name: 'Canal Backfill (Urugan Tanah Kembali Bangunan Irigasi)',
    shortName: 'Urugan Kembali Irigasi',
    category: 'infrastruktur',
    status: 'VERIFIED',
    pack: 'irrigation',
    version: '1.0.0',
    description: 'Menghitung volume urugan tanah kembali di belakang dinding saluran atau bangunan sadap',
    primaryUnit: 'm³',
    primaryQuantityLabel: 'Volume Urugan Kembali',
    parameters: [
      { id: 'length', label: 'Panjang Dinding (L)', unit: 'm', defaultValue: 50, min: 1, required: true },
      { id: 'averageWidth', label: 'Lebar Rata-Rata Urugan (W)', unit: 'm', defaultValue: 0.8, min: 0.1 },
      { id: 'depth', label: 'Kedalaman Urugan (H)', unit: 'm', defaultValue: 1.2, min: 0.1 },
    ],
    formulaSource: ProvenanceEngine.createVerifiedReferenceProvenance({
      calculatorId: 'irrigation.backfill',
      calculatorVersion: '1.0.0',
      formulaId: 'IRRIGATION_BACKFILL_VOL',
      mathematicalExpression: 'Vol = L × W × H',
      referenceName: 'Standar Pekerjaan Tanah KP Irigasi',
      sectionOrClause: 'Backfill Takeoff',
      status: 'PARTIALLY_VERIFIED',
    }),
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const L = toNum(inputs.length, 50);
      const W = toNum(inputs.averageWidth, 0.8);
      const H = toNum(inputs.depth, 1.2);

      const vol = SafeDecimalEngine.safeMultiply(L, SafeDecimalEngine.safeMultiply(W, H, 4), 3);

      return createCivilOutput({
        calculatorId: 'irrigation.backfill',
        version: '1.0.0',
        primaryQuantity: vol,
        primaryUnit: 'm³',
        primaryLabel: 'Volume Urugan Tanah Kembali',
        breakdown: {
          panjangUruganM: L,
          volumeUruganM3: vol,
        },
        materials: [
          { name: 'Tanah Urug Kembali Dipadatkan', quantity: vol, unit: 'm³', unitPriceEstimate: 75000 },
        ],
        formulaSource: {
          calculatorId: 'irrigation.backfill',
          calculatorVersion: '1.0.0',
          formulaId: 'IRRIGATION_BACKFILL_VOL',
          mathematicalExpression: 'Vol = L × W × H',
        },
        inputs,
      });
    },
  },
];
