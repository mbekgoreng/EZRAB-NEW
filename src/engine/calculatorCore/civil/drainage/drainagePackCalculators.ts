import {
  CalculationInput,
  CalculationOutput,
  CalculationContext,
  CalculatorDefinition,
} from '../../contracts/types';
import { SafeDecimalEngine } from '../../../safeDecimalEngine';
import { ProvenanceEngine } from '../../provenance/provenanceEngine';
import { toNum, createCivilOutput } from '../civilHelper';

export const DRAINAGE_PACK_CALCULATORS: CalculatorDefinition[] = [
  // 1. DRAINAGE CHANNEL
  {
    id: 'drainage.channel',
    name: 'Drainage Channel (Saluran Drainase Umum)',
    shortName: 'Saluran Drainase',
    category: 'infrastruktur',
    status: 'VERIFIED',
    pack: 'drainage',
    version: '1.0.0',
    description: 'Menghitung luas penampang, volume galian tanah, dan lining saluran drainase terbuka',
    primaryUnit: 'm³',
    primaryQuantityLabel: 'Volume Galian Saluran',
    parameters: [
      { id: 'length', label: 'Panjang Saluran (L)', unit: 'm', defaultValue: 100, min: 1, required: true },
      { id: 'topWidth', label: 'Lebar Atas Saluran (T)', unit: 'm', defaultValue: 1.2, min: 0.2, required: true },
      { id: 'bottomWidth', label: 'Lebar Bawah Saluran (B)', unit: 'm', defaultValue: 0.8, min: 0.2, required: true },
      { id: 'depth', label: 'Kedalaman Saluran (H)', unit: 'm', defaultValue: 1.0, min: 0.2, required: true },
      { id: 'liningThickness', label: 'Tebal Pasangan / Lining (t)', unit: 'm', defaultValue: 0.15, min: 0 },
    ],
    formulaSource: ProvenanceEngine.createVerifiedReferenceProvenance({
      calculatorId: 'drainage.channel',
      calculatorVersion: '1.0.0',
      formulaId: 'DRAINAGE_CHANNEL_VOL',
      mathematicalExpression: 'Area = ((T + B) / 2) × H; Volume = Area × L',
      referenceName: 'Pedoman Perencanaan Saluran Drainase (Bina Marga / SDA)',
      sectionOrClause: 'Geometri Penampang Trapesium/Persegi',
      status: 'PARTIALLY_VERIFIED',
    }),
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const L = toNum(inputs.length, 100);
      const T = toNum(inputs.topWidth, 1.2);
      const B = toNum(inputs.bottomWidth, 0.8);
      const H = toNum(inputs.depth, 1.0);
      const t = toNum(inputs.liningThickness, 0.15);

      const sectionArea = SafeDecimalEngine.safeMultiply(SafeDecimalEngine.safeDivide(SafeDecimalEngine.safeAdd(T, B), 2), H, 4);
      const excavationVol = SafeDecimalEngine.safeMultiply(sectionArea, L, 3);
      const sideSlopeLen = Math.sqrt(Math.pow((T - B) / 2, 2) + Math.pow(H, 2));
      const wettedPerimeter = SafeDecimalEngine.safeAdd(B, 2 * sideSlopeLen);
      const liningArea = SafeDecimalEngine.safeMultiply(wettedPerimeter, L, 3);
      const liningVol = SafeDecimalEngine.safeMultiply(liningArea, t, 3);

      return createCivilOutput({
        calculatorId: 'drainage.channel',
        version: '1.0.0',
        primaryQuantity: excavationVol,
        primaryUnit: 'm³',
        primaryLabel: 'Volume Galian Saluran',
        breakdown: {
          panjangSaluranM: L,
          luasPenampangM2: sectionArea,
          volumeGalianM3: excavationVol,
          luasLiningM2: liningArea,
          volumeLiningM3: liningVol,
        },
        formulaSource: {
          calculatorId: 'drainage.channel',
          calculatorVersion: '1.0.0',
          formulaId: 'DRAINAGE_CHANNEL_VOL',
          mathematicalExpression: 'Area = ((T + B) / 2) × H; Vol = Area × L',
        },
        inputs,
      });
    },
  },

  // 2. U-DITCH
  {
    id: 'drainage.u_ditch',
    name: 'U-Ditch Precast (Saluran U-Ditch Pracetak)',
    shortName: 'U-Ditch Precast',
    category: 'infrastruktur',
    status: 'VERIFIED',
    pack: 'drainage',
    version: '1.0.0',
    description: 'Menghitung jumlah unit U-Ditch pracetak, panjang jalur, pasir urug bedding, dan mortar sambungan',
    primaryUnit: 'm',
    primaryQuantityLabel: 'Panjang Pemasangan U-Ditch',
    parameters: [
      { id: 'length', label: 'Panjang Saluran (L)', unit: 'm', defaultValue: 100, min: 1, required: true },
      { id: 'segmentLength', label: 'Panjang per Unit U-Ditch (Ls)', unit: 'm', defaultValue: 1.2, min: 0.5, required: true },
      { id: 'width', label: 'Lebar Bersih U-Ditch (W)', unit: 'm', defaultValue: 0.6, min: 0.2 },
      { id: 'height', label: 'Tinggi Bersih U-Ditch (H)', unit: 'm', defaultValue: 0.6, min: 0.2 },
      { id: 'wallThickness', label: 'Tebal Dinding (t)', unit: 'm', defaultValue: 0.08, min: 0.05 },
      { id: 'beddingThickness', label: 'Tebal Pasir Urug Bedding (tb)', unit: 'm', defaultValue: 0.10, min: 0 },
    ],
    formulaSource: ProvenanceEngine.createVerifiedReferenceProvenance({
      calculatorId: 'drainage.u_ditch',
      calculatorVersion: '1.0.0',
      formulaId: 'UDITCH_COUNT_VOL',
      mathematicalExpression: 'Count = Ceil(L / Ls); VolBedding = (W + 2t) × tb × L',
      referenceName: 'Spesifikasi Saluran Beton Pracetak SNI / Bina Marga',
      sectionOrClause: 'Pemasangan U-Ditch',
      status: 'PARTIALLY_VERIFIED',
    }),
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const L = toNum(inputs.length, 100);
      const Ls = toNum(inputs.segmentLength, 1.2);
      const W = toNum(inputs.width, 0.6);
      const H = toNum(inputs.height, 0.6);
      const t = toNum(inputs.wallThickness, 0.08);
      const tb = toNum(inputs.beddingThickness, 0.10);

      const count = Math.ceil(L / Ls);
      const outerWidth = SafeDecimalEngine.safeAdd(W, 2 * t);
      const outerHeight = SafeDecimalEngine.safeAdd(H, t);
      const beddingVol = SafeDecimalEngine.safeMultiply(outerWidth, SafeDecimalEngine.safeMultiply(tb, L, 4), 3);
      const excavationVol = SafeDecimalEngine.safeMultiply(outerWidth, SafeDecimalEngine.safeMultiply(SafeDecimalEngine.safeAdd(outerHeight, tb), L, 4), 3);

      return createCivilOutput({
        calculatorId: 'drainage.u_ditch',
        version: '1.0.0',
        primaryQuantity: L,
        primaryUnit: 'm',
        primaryLabel: 'Panjang Saluran U-Ditch',
        breakdown: {
          panjangSaluranM: L,
          jumlahUnitBuah: count,
          volumeBeddingM3: beddingVol,
          volumeGalianM3: excavationVol,
        },
        materials: [
          { name: `U-Ditch Precast ${W * 100}x${H * 100}x${Ls * 100} cm`, quantity: count, unit: 'buah' },
          { name: 'Pasir Urug Landasan', quantity: beddingVol, unit: 'm³' },
        ],
        formulaSource: {
          calculatorId: 'drainage.u_ditch',
          calculatorVersion: '1.0.0',
          formulaId: 'UDITCH_COUNT_VOL',
          mathematicalExpression: 'Count = Ceil(L / Ls); VolBedding = (W + 2t) × tb × L',
        },
        inputs,
      });
    },
  },

  // 3. BOX CULVERT
  {
    id: 'drainage.box_culvert',
    name: 'Box Culvert (Gorong-Gorong Persegi)',
    shortName: 'Box Culvert',
    category: 'infrastruktur',
    status: 'VERIFIED',
    pack: 'drainage',
    version: '1.0.0',
    description: 'Menghitung volume beton, bekisting, galian, dan unit box culvert gorong-gorong persegi',
    primaryUnit: 'm³',
    primaryQuantityLabel: 'Volume Beton Box Culvert',
    parameters: [
      { id: 'length', label: 'Panjang Lintasan (L)', unit: 'm', defaultValue: 12, min: 1, required: true },
      { id: 'span', label: 'Bentang Bersih / Span (S)', unit: 'm', defaultValue: 2.0, min: 0.5, required: true },
      { id: 'rise', label: 'Tinggi Bersih / Rise (R)', unit: 'm', defaultValue: 2.0, min: 0.5, required: true },
      { id: 'topSlabThickness', label: 'Tebal Plat Atas (t1)', unit: 'm', defaultValue: 0.25, min: 0.1 },
      { id: 'bottomSlabThickness', label: 'Tebal Plat Bawah (t2)', unit: 'm', defaultValue: 0.25, min: 0.1 },
      { id: 'wallThickness', label: 'Tebal Dinding Samping (tw)', unit: 'm', defaultValue: 0.25, min: 0.1 },
      { id: 'numberOfCells', label: 'Jumlah Lubang / Cell', unit: 'cell', defaultValue: 1, min: 1 },
    ],
    formulaSource: ProvenanceEngine.createVerifiedReferenceProvenance({
      calculatorId: 'drainage.box_culvert',
      calculatorVersion: '1.0.0',
      formulaId: 'BOX_CULVERT_VOL',
      mathematicalExpression: 'A_outer = (S×n + tw×(n+1)) × (R + t1 + t2); A_inner = n × S × R; V_concrete = (A_outer - A_inner) × L',
      referenceName: 'Spesifikasi Standar Gorong-Gorong Bina Marga',
      sectionOrClause: 'Box Culvert Geometry',
      status: 'PARTIALLY_VERIFIED',
    }),
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const L = toNum(inputs.length, 12);
      const S = toNum(inputs.span, 2.0);
      const R = toNum(inputs.rise, 2.0);
      const t1 = toNum(inputs.topSlabThickness, 0.25);
      const t2 = toNum(inputs.bottomSlabThickness, 0.25);
      const tw = toNum(inputs.wallThickness, 0.25);
      const n = Math.max(1, Math.floor(toNum(inputs.numberOfCells, 1)));

      const outerW = SafeDecimalEngine.safeAdd(SafeDecimalEngine.safeMultiply(S, n, 4), SafeDecimalEngine.safeMultiply(tw, n + 1, 4));
      const outerH = SafeDecimalEngine.safeAdd(R, SafeDecimalEngine.safeAdd(t1, t2));
      const grossArea = SafeDecimalEngine.safeMultiply(outerW, outerH, 4);
      const voidArea = SafeDecimalEngine.safeMultiply(SafeDecimalEngine.safeMultiply(S, R, 4), n, 4);
      const netConcreteArea = SafeDecimalEngine.safeSubtract(grossArea, voidArea);
      const concreteVol = SafeDecimalEngine.safeMultiply(netConcreteArea, L, 3);
      const excavationVol = SafeDecimalEngine.safeMultiply(outerW, SafeDecimalEngine.safeMultiply(outerH, L, 4), 3);

      return createCivilOutput({
        calculatorId: 'drainage.box_culvert',
        version: '1.0.0',
        primaryQuantity: concreteVol,
        primaryUnit: 'm³',
        primaryLabel: 'Volume Beton Box Culvert',
        breakdown: {
          panjangLintasanM: L,
          volumeBetonM3: concreteVol,
          volumeGalianM3: excavationVol,
          luasPenampangBetonM2: netConcreteArea,
        },
        materials: [
          { name: 'Beton Struktur K-350 / fc 30 MPa', quantity: concreteVol, unit: 'm³' },
        ],
        formulaSource: {
          calculatorId: 'drainage.box_culvert',
          calculatorVersion: '1.0.0',
          formulaId: 'BOX_CULVERT_VOL',
          mathematicalExpression: 'V_concrete = (A_outer - A_inner) × L',
        },
        inputs,
      });
    },
  },

  // 4. PIPE DRAINAGE
  {
    id: 'drainage.pipe_culvert',
    name: 'Pipe Culvert (Gorong-Gorong Pipa Beton / RCP)',
    shortName: 'Pipe Culvert (RCP)',
    category: 'infrastruktur',
    status: 'VERIFIED',
    pack: 'drainage',
    version: '1.0.0',
    description: 'Menghitung panjang pipa gorong-gorong, volume bedding pasir, dan galian parit pipa',
    primaryUnit: 'm',
    primaryQuantityLabel: 'Panjang Pemasangan Pipa Culvert',
    parameters: [
      { id: 'length', label: 'Panjang Pipa (L)', unit: 'm', defaultValue: 10, min: 1, required: true },
      { id: 'diameter', label: 'Diameter Dalam Pipa (D)', unit: 'm', defaultValue: 0.8, min: 0.3, required: true },
      { id: 'wallThickness', label: 'Tebal Dinding Pipa (t)', unit: 'm', defaultValue: 0.08, min: 0.03 },
      { id: 'numberOfLines', label: 'Jumlah Jalur Pipa / Line', unit: 'jalur', defaultValue: 1, min: 1 },
      { id: 'trenchDepth', label: 'Kedalaman Parit Galian (H)', unit: 'm', defaultValue: 1.5, min: 0.5 },
    ],
    formulaSource: ProvenanceEngine.createVerifiedReferenceProvenance({
      calculatorId: 'drainage.pipe_culvert',
      calculatorVersion: '1.0.0',
      formulaId: 'PIPE_CULVERT_LEN',
      mathematicalExpression: 'TotalLen = L × Lines; VolExcavation = (D_out + 0.4) × H × L',
      referenceName: 'Spesifikasi Bina Marga Gorong-Gorong Pipa',
      sectionOrClause: 'RCP Culvert Takeoff',
      status: 'PARTIALLY_VERIFIED',
    }),
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const L = toNum(inputs.length, 10);
      const D = toNum(inputs.diameter, 0.8);
      const t = toNum(inputs.wallThickness, 0.08);
      const lines = Math.max(1, Math.floor(toNum(inputs.numberOfLines, 1)));
      const H = toNum(inputs.trenchDepth, 1.5);

      const totalLen = SafeDecimalEngine.safeMultiply(L, lines, 2);
      const D_out = SafeDecimalEngine.safeAdd(D, 2 * t);
      const trenchW = SafeDecimalEngine.safeAdd(SafeDecimalEngine.safeMultiply(D_out, lines, 3), 0.4 * (lines + 1));
      const excavationVol = SafeDecimalEngine.safeMultiply(trenchW, SafeDecimalEngine.safeMultiply(H, L, 4), 3);

      return createCivilOutput({
        calculatorId: 'drainage.pipe_culvert',
        version: '1.0.0',
        primaryQuantity: totalLen,
        primaryUnit: 'm',
        primaryLabel: 'Total Panjang Pipa Culvert',
        breakdown: {
          totalPanjangPipaM: totalLen,
          volumeGalianTrenchM3: excavationVol,
          lebarGalianParitM: trenchW,
        },
        materials: [
          { name: `Pipa Beton RCP Dia ${D * 1000} mm`, quantity: totalLen, unit: 'm' },
        ],
        formulaSource: {
          calculatorId: 'drainage.pipe_culvert',
          calculatorVersion: '1.0.0',
          formulaId: 'PIPE_CULVERT_LEN',
          mathematicalExpression: 'TotalLen = L × Lines; VolExcavation = trenchW × H × L',
        },
        inputs,
      });
    },
  },

  // 5. DITCH
  {
    id: 'drainage.ditch',
    name: 'Roadside Ditch (Parit Samping)',
    shortName: 'Parit Samping (Ditch)',
    category: 'infrastruktur',
    status: 'VERIFIED',
    pack: 'drainage',
    version: '1.0.0',
    description: 'Menghitung volume galian parit tanah samping jalan dan luas permukaan pembersihan',
    primaryUnit: 'm³',
    primaryQuantityLabel: 'Volume Galian Parit',
    parameters: [
      { id: 'length', label: 'Panjang Parit (L)', unit: 'm', defaultValue: 100, min: 1, required: true },
      { id: 'topWidth', label: 'Lebar Atas (W1)', unit: 'm', defaultValue: 1.0, min: 0.2 },
      { id: 'bottomWidth', label: 'Lebar Bawah (W2)', unit: 'm', defaultValue: 0.5, min: 0.1 },
      { id: 'depth', label: 'Kedalaman Parit (D)', unit: 'm', defaultValue: 0.6, min: 0.1 },
    ],
    formulaSource: ProvenanceEngine.createVerifiedReferenceProvenance({
      calculatorId: 'drainage.ditch',
      calculatorVersion: '1.0.0',
      formulaId: 'DITCH_EXCAVATION',
      mathematicalExpression: 'Area = ((W1 + W2)/2) × D; Vol = Area × L',
      referenceName: 'Spesifikasi Drainase Tanah Bina Marga',
      sectionOrClause: 'Galian Parit Tanah',
      status: 'PARTIALLY_VERIFIED',
    }),
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const L = toNum(inputs.length, 100);
      const W1 = toNum(inputs.topWidth, 1.0);
      const W2 = toNum(inputs.bottomWidth, 0.5);
      const D = toNum(inputs.depth, 0.6);

      const sectionArea = SafeDecimalEngine.safeMultiply(SafeDecimalEngine.safeDivide(SafeDecimalEngine.safeAdd(W1, W2), 2), D, 4);
      const vol = SafeDecimalEngine.safeMultiply(sectionArea, L, 3);

      return createCivilOutput({
        calculatorId: 'drainage.ditch',
        version: '1.0.0',
        primaryQuantity: vol,
        primaryUnit: 'm³',
        primaryLabel: 'Volume Galian Parit Tanah',
        breakdown: {
          panjangParitM: L,
          luasPenampangM2: sectionArea,
          volumeGalianM3: vol,
        },
        formulaSource: {
          calculatorId: 'drainage.ditch',
          calculatorVersion: '1.0.0',
          formulaId: 'DITCH_EXCAVATION',
          mathematicalExpression: 'Area = ((W1 + W2)/2) × D; Vol = Area × L',
        },
        inputs,
      });
    },
  },

  // 6. INLET
  {
    id: 'drainage.inlet',
    name: 'Drainage Inlet (Mulut Saluran Pemasukan)',
    shortName: 'Drainage Inlet',
    category: 'infrastruktur',
    status: 'VERIFIED',
    pack: 'drainage',
    version: '1.0.0',
    description: 'Menghitung volume beton/pasangan batu dan jumlah unit struktur inlet saluran',
    primaryUnit: 'unit',
    primaryQuantityLabel: 'Jumlah Unit Inlet',
    parameters: [
      { id: 'count', label: 'Jumlah Inlet (Unit)', unit: 'unit', defaultValue: 5, min: 1, required: true },
      { id: 'length', label: 'Panjang Struktur Inlet (L)', unit: 'm', defaultValue: 1.0, min: 0.3 },
      { id: 'width', label: 'Lebar Struktur Inlet (W)', unit: 'm', defaultValue: 0.8, min: 0.3 },
      { id: 'height', label: 'Tinggi Struktur Inlet (H)', unit: 'm', defaultValue: 0.8, min: 0.3 },
      { id: 'wallThickness', label: 'Tebal Dinding (t)', unit: 'm', defaultValue: 0.15, min: 0.05 },
    ],
    formulaSource: ProvenanceEngine.createVerifiedReferenceProvenance({
      calculatorId: 'drainage.inlet',
      calculatorVersion: '1.0.0',
      formulaId: 'INLET_COUNT_VOL',
      mathematicalExpression: 'TotalVol = Count × V_single',
      referenceName: 'Standar Struktur Inlet Drainase',
      sectionOrClause: 'Inlet Detail',
      status: 'PARTIALLY_VERIFIED',
    }),
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const count = Math.max(1, Math.floor(toNum(inputs.count, 5)));
      const L = toNum(inputs.length, 1.0);
      const W = toNum(inputs.width, 0.8);
      const H = toNum(inputs.height, 0.8);
      const t = toNum(inputs.wallThickness, 0.15);

      const grossVol = SafeDecimalEngine.safeMultiply(L, SafeDecimalEngine.safeMultiply(W, H, 4), 4);
      const voidVol = SafeDecimalEngine.safeMultiply(SafeDecimalEngine.safeSubtract(L, 2 * t), SafeDecimalEngine.safeMultiply(SafeDecimalEngine.safeSubtract(W, 2 * t), H, 4), 4);
      const singleConcreteVol = SafeDecimalEngine.safeSubtract(grossVol, Math.max(0, voidVol));
      const totalConcreteVol = SafeDecimalEngine.safeMultiply(singleConcreteVol, count, 3);

      return createCivilOutput({
        calculatorId: 'drainage.inlet',
        version: '1.0.0',
        primaryQuantity: count,
        primaryUnit: 'unit',
        primaryLabel: 'Jumlah Unit Inlet',
        breakdown: {
          jumlahUnitInlet: count,
          volumeBetonPerUnitM3: singleConcreteVol,
          totalVolumeBetonM3: totalConcreteVol,
        },
        materials: [
          { name: 'Beton Struktur K-250', quantity: totalConcreteVol, unit: 'm³' },
        ],
        formulaSource: {
          calculatorId: 'drainage.inlet',
          calculatorVersion: '1.0.0',
          formulaId: 'INLET_COUNT_VOL',
          mathematicalExpression: 'TotalVol = Count × V_single',
        },
        inputs,
      });
    },
  },

  // 7. OUTLET
  {
    id: 'drainage.outlet',
    name: 'Drainage Outlet / Drop Structure (Mulut Pengeluaran)',
    shortName: 'Drainage Outlet',
    category: 'infrastruktur',
    status: 'VERIFIED',
    pack: 'drainage',
    version: '1.0.0',
    description: 'Menghitung volume beton lantai dan dinding struktur outlet saluran pembuangan',
    primaryUnit: 'unit',
    primaryQuantityLabel: 'Jumlah Unit Outlet',
    parameters: [
      { id: 'count', label: 'Jumlah Unit Outlet', unit: 'unit', defaultValue: 2, min: 1, required: true },
      { id: 'apronLength', label: 'Panjang Apron Pelindung (La)', unit: 'm', defaultValue: 2.0, min: 0.5 },
      { id: 'apronWidth', label: 'Lebar Apron Pelindung (Wa)', unit: 'm', defaultValue: 1.5, min: 0.5 },
      { id: 'apronThickness', label: 'Tebal Plat Apron (ta)', unit: 'm', defaultValue: 0.20, min: 0.1 },
    ],
    formulaSource: ProvenanceEngine.createVerifiedReferenceProvenance({
      calculatorId: 'drainage.outlet',
      calculatorVersion: '1.0.0',
      formulaId: 'OUTLET_VOL',
      mathematicalExpression: 'VolApron = La × Wa × ta × Count',
      referenceName: 'Standar Bangunan Outlet Drainase',
      sectionOrClause: 'Outlet Apron Structure',
      status: 'PARTIALLY_VERIFIED',
    }),
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const count = Math.max(1, Math.floor(toNum(inputs.count, 2)));
      const La = toNum(inputs.apronLength, 2.0);
      const Wa = toNum(inputs.apronWidth, 1.5);
      const ta = toNum(inputs.apronThickness, 0.20);

      const singleVol = SafeDecimalEngine.safeMultiply(La, SafeDecimalEngine.safeMultiply(Wa, ta, 4), 4);
      const totalVol = SafeDecimalEngine.safeMultiply(singleVol, count, 3);

      return createCivilOutput({
        calculatorId: 'drainage.outlet',
        version: '1.0.0',
        primaryQuantity: count,
        primaryUnit: 'unit',
        primaryLabel: 'Jumlah Unit Outlet',
        breakdown: {
          jumlahUnitOutlet: count,
          volumeBetonPerUnitM3: singleVol,
          totalVolumeBetonM3: totalVol,
        },
        materials: [
          { name: 'Beton Rabat Apron K-250', quantity: totalVol, unit: 'm³' },
        ],
        formulaSource: {
          calculatorId: 'drainage.outlet',
          calculatorVersion: '1.0.0',
          formulaId: 'OUTLET_VOL',
          mathematicalExpression: 'VolApron = La × Wa × ta × Count',
        },
        inputs,
      });
    },
  },

  // 8. MANHOLE
  {
    id: 'drainage.manhole',
    name: 'Drainage Manhole (Bak Kontrol Drainase)',
    shortName: 'Bak Kontrol / Manhole',
    category: 'infrastruktur',
    status: 'VERIFIED',
    pack: 'drainage',
    version: '1.0.0',
    description: 'Menghitung jumlah unit manhole, volume beton dinding/lantai, galian parit, dan tutup manhole',
    primaryUnit: 'unit',
    primaryQuantityLabel: 'Jumlah Unit Manhole',
    parameters: [
      { id: 'count', label: 'Jumlah Titik Manhole', unit: 'unit', defaultValue: 4, min: 1, required: true },
      { id: 'internalLength', label: 'Panjang Dalam Manhole (L)', unit: 'm', defaultValue: 0.8, min: 0.4 },
      { id: 'internalWidth', label: 'Lebar Dalam Manhole (W)', unit: 'm', defaultValue: 0.8, min: 0.4 },
      { id: 'depth', label: 'Kedalaman Manhole (H)', unit: 'm', defaultValue: 1.2, min: 0.4 },
      { id: 'wallThickness', label: 'Tebal Dinding Beton/Pasangan (t)', unit: 'm', defaultValue: 0.15, min: 0.08 },
    ],
    formulaSource: ProvenanceEngine.createVerifiedReferenceProvenance({
      calculatorId: 'drainage.manhole',
      calculatorVersion: '1.0.0',
      formulaId: 'MANHOLE_QUANTITY',
      mathematicalExpression: 'V_gross = (L+2t)(W+2t)(H+t); V_inner = L×W×H; V_concrete = V_gross - V_inner',
      referenceName: 'Standar Bak Kontrol Drainase SNI 03-2401',
      sectionOrClause: 'Manhole Concrete Takeoff',
      status: 'PARTIALLY_VERIFIED',
    }),
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const count = Math.max(1, Math.floor(toNum(inputs.count, 4)));
      const L = toNum(inputs.internalLength, 0.8);
      const W = toNum(inputs.internalWidth, 0.8);
      const H = toNum(inputs.depth, 1.2);
      const t = toNum(inputs.wallThickness, 0.15);

      const outerL = SafeDecimalEngine.safeAdd(L, 2 * t);
      const outerW = SafeDecimalEngine.safeAdd(W, 2 * t);
      const outerH = SafeDecimalEngine.safeAdd(H, t); // slab bawah
      const grossVol = SafeDecimalEngine.safeMultiply(outerL, SafeDecimalEngine.safeMultiply(outerW, outerH, 4), 4);
      const voidVol = SafeDecimalEngine.safeMultiply(L, SafeDecimalEngine.safeMultiply(W, H, 4), 4);
      const singleConcreteVol = SafeDecimalEngine.safeSubtract(grossVol, voidVol);
      const totalConcreteVol = SafeDecimalEngine.safeMultiply(singleConcreteVol, count, 3);
      const totalExcavationVol = SafeDecimalEngine.safeMultiply(grossVol, count, 3);

      return createCivilOutput({
        calculatorId: 'drainage.manhole',
        version: '1.0.0',
        primaryQuantity: count,
        primaryUnit: 'unit',
        primaryLabel: 'Jumlah Unit Manhole',
        breakdown: {
          jumlahManholeUnit: count,
          volumeBetonPerUnitM3: singleConcreteVol,
          totalVolumeBetonM3: totalConcreteVol,
          totalVolumeGalianM3: totalExcavationVol,
        },
        materials: [
          { name: 'Beton Struktur K-250 Manhole', quantity: totalConcreteVol, unit: 'm³' },
          { name: 'Cover Manhole Ductile / Precast', quantity: count, unit: 'buah' },
        ],
        formulaSource: {
          calculatorId: 'drainage.manhole',
          calculatorVersion: '1.0.0',
          formulaId: 'MANHOLE_QUANTITY',
          mathematicalExpression: 'V_concrete = (V_gross - V_inner) × Count',
        },
        inputs,
      });
    },
  },

  // 9. HEADWALL
  {
    id: 'drainage.headwall',
    name: 'Culvert Headwall (Dinding Kepala Gorong-Gorong)',
    shortName: 'Headwall Gorong-Gorong',
    category: 'infrastruktur',
    status: 'VERIFIED',
    pack: 'drainage',
    version: '1.0.0',
    description: 'Menghitung volume pasangan batu/beton dinding kepala (headwall) pada inlet/outlet gorong-gorong',
    primaryUnit: 'm³',
    primaryQuantityLabel: 'Volume Pasangan/Beton Headwall',
    parameters: [
      { id: 'count', label: 'Jumlah Titik Headwall', unit: 'titik', defaultValue: 2, min: 1, required: true },
      { id: 'width', label: 'Panjang / Lebar Dinding (W)', unit: 'm', defaultValue: 3.5, min: 1.0 },
      { id: 'height', label: 'Tinggi Dinding (H)', unit: 'm', defaultValue: 1.5, min: 0.5 },
      { id: 'thickness', label: 'Tebal Rata-Rata Dinding (t)', unit: 'm', defaultValue: 0.35, min: 0.15 },
    ],
    formulaSource: ProvenanceEngine.createVerifiedReferenceProvenance({
      calculatorId: 'drainage.headwall',
      calculatorVersion: '1.0.0',
      formulaId: 'HEADWALL_VOL',
      mathematicalExpression: 'Vol = W × H × t × Count',
      referenceName: 'Standar Dinding Kepala Bina Marga',
      sectionOrClause: 'Headwall Volume',
      status: 'PARTIALLY_VERIFIED',
    }),
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const count = Math.max(1, Math.floor(toNum(inputs.count, 2)));
      const W = toNum(inputs.width, 3.5);
      const H = toNum(inputs.height, 1.5);
      const t = toNum(inputs.thickness, 0.35);

      const singleVol = SafeDecimalEngine.safeMultiply(W, SafeDecimalEngine.safeMultiply(H, t, 4), 4);
      const totalVol = SafeDecimalEngine.safeMultiply(singleVol, count, 3);

      return createCivilOutput({
        calculatorId: 'drainage.headwall',
        version: '1.0.0',
        primaryQuantity: totalVol,
        primaryUnit: 'm³',
        primaryLabel: 'Volume Pasangan / Beton Headwall',
        breakdown: {
          jumlahHeadwallTitik: count,
          volumePerTitikM3: singleVol,
          totalVolumeM3: totalVol,
        },
        formulaSource: {
          calculatorId: 'drainage.headwall',
          calculatorVersion: '1.0.0',
          formulaId: 'HEADWALL_VOL',
          mathematicalExpression: 'Vol = W × H × t × Count',
        },
        inputs,
      });
    },
  },

  // 10. DRAINAGE EXCAVATION
  {
    id: 'drainage.excavation',
    name: 'Drainage Trench Excavation (Galian Tanah Jalur Drainase)',
    shortName: 'Galian Jalur Drainase',
    category: 'infrastruktur',
    status: 'VERIFIED',
    pack: 'drainage',
    version: '1.0.0',
    description: 'Menghitung volume galian parit drainase berdasar panjang dan penampang trapesium/persegi',
    primaryUnit: 'm³',
    primaryQuantityLabel: 'Volume Galian Parit Drainase',
    parameters: [
      { id: 'length', label: 'Panjang Jalur (L)', unit: 'm', defaultValue: 150, min: 1, required: true },
      { id: 'topWidth', label: 'Lebar Atas Galian (Wt)', unit: 'm', defaultValue: 1.4, min: 0.3 },
      { id: 'bottomWidth', label: 'Lebar Bawah Galian (Wb)', unit: 'm', defaultValue: 1.0, min: 0.3 },
      { id: 'depth', label: 'Kedalaman Galian (H)', unit: 'm', defaultValue: 1.2, min: 0.2 },
    ],
    formulaSource: ProvenanceEngine.createVerifiedReferenceProvenance({
      calculatorId: 'drainage.excavation',
      calculatorVersion: '1.0.0',
      formulaId: 'DRAINAGE_EXCAVATION_VOL',
      mathematicalExpression: 'Vol = ((Wt + Wb) / 2) × H × L',
      referenceName: 'Pedoman Estimasi Pekerjaan Tanah SNI 2835:2008',
      sectionOrClause: 'Galian Tanah Saluran',
      status: 'PARTIALLY_VERIFIED',
    }),
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const L = toNum(inputs.length, 150);
      const Wt = toNum(inputs.topWidth, 1.4);
      const Wb = toNum(inputs.bottomWidth, 1.0);
      const H = toNum(inputs.depth, 1.2);

      const area = SafeDecimalEngine.safeMultiply(SafeDecimalEngine.safeDivide(SafeDecimalEngine.safeAdd(Wt, Wb), 2), H, 4);
      const vol = SafeDecimalEngine.safeMultiply(area, L, 3);

      return createCivilOutput({
        calculatorId: 'drainage.excavation',
        version: '1.0.0',
        primaryQuantity: vol,
        primaryUnit: 'm³',
        primaryLabel: 'Volume Galian Saluran Drainase',
        breakdown: {
          panjangGalianM: L,
          luasPenampangGalianM2: area,
          volumeGalianM3: vol,
        },
        formulaSource: {
          calculatorId: 'drainage.excavation',
          calculatorVersion: '1.0.0',
          formulaId: 'DRAINAGE_EXCAVATION_VOL',
          mathematicalExpression: 'Vol = ((Wt + Wb) / 2) × H × L',
        },
        inputs,
      });
    },
  },

  // 11. BEDDING
  {
    id: 'drainage.bedding',
    name: 'Drainage Bedding (Landasan Pasir Urug Saluran)',
    shortName: 'Bedding Pasir Saluran',
    category: 'infrastruktur',
    status: 'VERIFIED',
    pack: 'drainage',
    version: '1.0.0',
    description: 'Menghitung volume pasir urug atau lean concrete landasan dasar saluran/pipa',
    primaryUnit: 'm³',
    primaryQuantityLabel: 'Volume Pasir Urug Bedding',
    parameters: [
      { id: 'length', label: 'Panjang Saluran (L)', unit: 'm', defaultValue: 100, min: 1, required: true },
      { id: 'width', label: 'Lebar Landasan (W)', unit: 'm', defaultValue: 0.8, min: 0.2 },
      { id: 'thickness', label: 'Tebal Landasan (t)', unit: 'm', defaultValue: 0.10, min: 0.02 },
    ],
    formulaSource: ProvenanceEngine.createVerifiedReferenceProvenance({
      calculatorId: 'drainage.bedding',
      calculatorVersion: '1.0.0',
      formulaId: 'BEDDING_VOL',
      mathematicalExpression: 'Vol = L × W × t',
      referenceName: 'Spesifikasi Drainase Bina Marga Divisi 2',
      sectionOrClause: 'Landasan Pasir Urug',
      status: 'PARTIALLY_VERIFIED',
    }),
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const L = toNum(inputs.length, 100);
      const W = toNum(inputs.width, 0.8);
      const t = toNum(inputs.thickness, 0.10);

      const vol = SafeDecimalEngine.safeMultiply(L, SafeDecimalEngine.safeMultiply(W, t, 4), 3);

      return createCivilOutput({
        calculatorId: 'drainage.bedding',
        version: '1.0.0',
        primaryQuantity: vol,
        primaryUnit: 'm³',
        primaryLabel: 'Volume Pasir Urug Landasan',
        breakdown: {
          panjangBeddingM: L,
          lebarBeddingM: W,
          volumeBeddingM3: vol,
        },
        materials: [
          { name: 'Pasir Urug Landasan Bawah', quantity: vol, unit: 'm³' },
        ],
        formulaSource: {
          calculatorId: 'drainage.bedding',
          calculatorVersion: '1.0.0',
          formulaId: 'BEDDING_VOL',
          mathematicalExpression: 'Vol = L × W × t',
        },
        inputs,
      });
    },
  },

  // 12. BACKFILL
  {
    id: 'drainage.backfill',
    name: 'Drainage Trench Backfill (Urugan Kembali Sisi Saluran)',
    shortName: 'Urugan Kembali Saluran',
    category: 'infrastruktur',
    status: 'VERIFIED',
    pack: 'drainage',
    version: '1.0.0',
    description: 'Menghitung volume urugan tanah kembali sisi saluran setelah dipasang struktur',
    primaryUnit: 'm³',
    primaryQuantityLabel: 'Volume Urugan Kembali',
    parameters: [
      { id: 'excavationVolume', label: 'Volume Galian Parit (V_galian)', unit: 'm³', defaultValue: 120, min: 0, required: true },
      { id: 'structureOccupiedVolume', label: 'Volume Fisik Struktur Saluran (V_struktur)', unit: 'm³', defaultValue: 45, min: 0, required: true },
      { id: 'beddingVolume', label: 'Volume Pasir Bedding (V_bedding)', unit: 'm³', defaultValue: 8, min: 0 },
    ],
    formulaSource: ProvenanceEngine.createVerifiedReferenceProvenance({
      calculatorId: 'drainage.backfill',
      calculatorVersion: '1.0.0',
      formulaId: 'DRAINAGE_BACKFILL_VOL',
      mathematicalExpression: 'V_backfill = Max(0, V_galian - V_struktur - V_bedding)',
      referenceName: 'Spesifikasi Pekerjaan Tanah Bina Marga Divisi 3',
      sectionOrClause: 'Urugan Kembali Struktur',
      status: 'PARTIALLY_VERIFIED',
    }),
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const V_exc = toNum(inputs.excavationVolume, 120);
      const V_str = toNum(inputs.structureOccupiedVolume, 45);
      const V_bed = toNum(inputs.beddingVolume, 8);

      const netBackfill = Math.max(0, SafeDecimalEngine.safeSubtract(V_exc, SafeDecimalEngine.safeAdd(V_str, V_bed)));
      const disposalVol = SafeDecimalEngine.safeAdd(V_str, V_bed);

      return createCivilOutput({
        calculatorId: 'drainage.backfill',
        version: '1.0.0',
        primaryQuantity: netBackfill,
        primaryUnit: 'm³',
        primaryLabel: 'Volume Urugan Tanah Kembali',
        breakdown: {
          volumeGalianM3: V_exc,
          volumeStrukturM3: V_str,
          volumeBeddingM3: V_bed,
          volumeUruganKembaliM3: netBackfill,
          volumeSisaBuanganM3: disposalVol,
        },
        formulaSource: {
          calculatorId: 'drainage.backfill',
          calculatorVersion: '1.0.0',
          formulaId: 'DRAINAGE_BACKFILL_VOL',
          mathematicalExpression: 'V_backfill = Max(0, V_galian - V_struktur - V_bedding)',
        },
        inputs,
      });
    },
  },

  // 13. CONCRETE CHANNEL
  {
    id: 'drainage.concrete_drain',
    name: 'Cast-in-Place Concrete Channel (Saluran Beton Cor)',
    shortName: 'Saluran Beton Cor',
    category: 'infrastruktur',
    status: 'VERIFIED',
    pack: 'drainage',
    version: '1.0.0',
    description: 'Menghitung volume beton dan bekisting saluran drainase cor di tempat (cast in situ)',
    primaryUnit: 'm³',
    primaryQuantityLabel: 'Volume Cor Beton Saluran',
    parameters: [
      { id: 'length', label: 'Panjang Saluran (L)', unit: 'm', defaultValue: 100, min: 1, required: true },
      { id: 'internalWidth', label: 'Lebar Dalam (W)', unit: 'm', defaultValue: 0.8, min: 0.2 },
      { id: 'internalHeight', label: 'Tinggi Dalam (H)', unit: 'm', defaultValue: 0.8, min: 0.2 },
      { id: 'wallThickness', label: 'Tebal Dinding & Plat Dasar (t)', unit: 'm', defaultValue: 0.12, min: 0.05 },
    ],
    formulaSource: ProvenanceEngine.createVerifiedReferenceProvenance({
      calculatorId: 'drainage.concrete_drain',
      calculatorVersion: '1.0.0',
      formulaId: 'CONCRETE_DRAIN_VOL',
      mathematicalExpression: 'Area_concrete = (W + 2t)(H + t) - (W × H); Vol = Area_concrete × L',
      referenceName: 'Spesifikasi Drainase Beton Bina Marga',
      sectionOrClause: 'Concrete Drain Takeoff',
      status: 'PARTIALLY_VERIFIED',
    }),
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const L = toNum(inputs.length, 100);
      const W = toNum(inputs.internalWidth, 0.8);
      const H = toNum(inputs.internalHeight, 0.8);
      const t = toNum(inputs.wallThickness, 0.12);

      const grossArea = SafeDecimalEngine.safeMultiply(SafeDecimalEngine.safeAdd(W, 2 * t), SafeDecimalEngine.safeAdd(H, t), 4);
      const voidArea = SafeDecimalEngine.safeMultiply(W, H, 4);
      const concreteSection = SafeDecimalEngine.safeSubtract(grossArea, voidArea);
      const concreteVol = SafeDecimalEngine.safeMultiply(concreteSection, L, 3);
      const formworkArea = SafeDecimalEngine.safeMultiply(SafeDecimalEngine.safeAdd(2 * H, 2 * (H + t)), L, 3); // 2 sisi dalam + 2 sisi luar

      return createCivilOutput({
        calculatorId: 'drainage.concrete_drain',
        version: '1.0.0',
        primaryQuantity: concreteVol,
        primaryUnit: 'm³',
        primaryLabel: 'Volume Cor Beton Saluran',
        breakdown: {
          panjangSaluranM: L,
          luasPenampangBetonM2: concreteSection,
          volumeBetonCorM3: concreteVol,
          luasBekistingM2: formworkArea,
        },
        materials: [
          { name: 'Beton Cor Saluran K-250', quantity: concreteVol, unit: 'm³' },
        ],
        formulaSource: {
          calculatorId: 'drainage.concrete_drain',
          calculatorVersion: '1.0.0',
          formulaId: 'CONCRETE_DRAIN_VOL',
          mathematicalExpression: 'Area_concrete = (W + 2t)(H + t) - (W × H); Vol = Area_concrete × L',
        },
        inputs,
      });
    },
  },

  // 14. LINING
  {
    id: 'drainage.lining',
    name: 'Channel Lining / Pasangan Batu Saluran',
    shortName: 'Lining Saluran Pas. Batu',
    category: 'infrastruktur',
    status: 'VERIFIED',
    pack: 'drainage',
    version: '1.0.0',
    description: 'Menghitung luas permukaan lining pasangan batu kali atau plesteran penahan erosi saluran',
    primaryUnit: 'm²',
    primaryQuantityLabel: 'Luas Pasangan Lining',
    parameters: [
      { id: 'length', label: 'Panjang Saluran (L)', unit: 'm', defaultValue: 100, min: 1, required: true },
      { id: 'bottomWidth', label: 'Lebar Dasar (B)', unit: 'm', defaultValue: 0.6, min: 0.1 },
      { id: 'slopeLength', label: 'Panjang Miring Sisi Saluran (s)', unit: 'm', defaultValue: 1.0, min: 0.2 },
      { id: 'liningThickness', label: 'Tebal Pasangan Lining (t)', unit: 'm', defaultValue: 0.15, min: 0.05 },
    ],
    formulaSource: ProvenanceEngine.createVerifiedReferenceProvenance({
      calculatorId: 'drainage.lining',
      calculatorVersion: '1.0.0',
      formulaId: 'LINING_AREA_VOL',
      mathematicalExpression: 'Area = (B + 2×s) × L; Vol = Area × t',
      referenceName: 'Pedoman Pasangan Batu Saluran SDA / Bina Marga',
      sectionOrClause: 'Lining Pasangan Batu',
      status: 'PARTIALLY_VERIFIED',
    }),
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const L = toNum(inputs.length, 100);
      const B = toNum(inputs.bottomWidth, 0.6);
      const s = toNum(inputs.slopeLength, 1.0);
      const t = toNum(inputs.liningThickness, 0.15);

      const perimeter = SafeDecimalEngine.safeAdd(B, 2 * s);
      const liningArea = SafeDecimalEngine.safeMultiply(perimeter, L, 3);
      const liningVol = SafeDecimalEngine.safeMultiply(liningArea, t, 3);

      return createCivilOutput({
        calculatorId: 'drainage.lining',
        version: '1.0.0',
        primaryQuantity: liningArea,
        primaryUnit: 'm²',
        primaryLabel: 'Luas Pasangan Lining Saluran',
        breakdown: {
          panjangSaluranM: L,
          kelilingBasahLiningM: perimeter,
          luasLiningM2: liningArea,
          volumeLiningM3: liningVol,
        },
        materials: [
          { name: 'Pasangan Batu Kali 1:4', quantity: liningVol, unit: 'm³' },
        ],
        formulaSource: {
          calculatorId: 'drainage.lining',
          calculatorVersion: '1.0.0',
          formulaId: 'LINING_AREA_VOL',
          mathematicalExpression: 'Area = (B + 2×s) × L; Vol = Area × t',
        },
        inputs,
      });
    },
  },

  // 15. COVER / SLAB
  {
    id: 'drainage.cover',
    name: 'Drainage Cover Slab (Tutup Saluran Beton / Grating)',
    shortName: 'Tutup Saluran / Cover',
    category: 'infrastruktur',
    status: 'VERIFIED',
    pack: 'drainage',
    version: '1.0.0',
    description: 'Menghitung jumlah buah, luas bidang, dan volume beton pelat penutup saluran drainase',
    primaryUnit: 'buah',
    primaryQuantityLabel: 'Jumlah Unit Tutup Saluran',
    parameters: [
      { id: 'length', label: 'Panjang Jalur Tertutup (L)', unit: 'm', defaultValue: 50, min: 1, required: true },
      { id: 'segmentLength', label: 'Panjang per Unit Tutup (Ls)', unit: 'm', defaultValue: 0.60, min: 0.2, required: true },
      { id: 'width', label: 'Lebar Tutup Saluran (W)', unit: 'm', defaultValue: 0.80, min: 0.2 },
      { id: 'thickness', label: 'Tebal Plat Tutup (t)', unit: 'm', defaultValue: 0.10, min: 0.05 },
    ],
    formulaSource: ProvenanceEngine.createVerifiedReferenceProvenance({
      calculatorId: 'drainage.cover',
      calculatorVersion: '1.0.0',
      formulaId: 'DRAINAGE_COVER_COUNT',
      mathematicalExpression: 'Count = Ceil(L / Ls); Vol = Count × (Ls × W × t)',
      referenceName: 'Spesifikasi Tutup Saluran Beton Pracetak SNI',
      sectionOrClause: 'Cover Slab Takeoff',
      status: 'PARTIALLY_VERIFIED',
    }),
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const L = toNum(inputs.length, 50);
      const Ls = toNum(inputs.segmentLength, 0.60);
      const W = toNum(inputs.width, 0.80);
      const t = toNum(inputs.thickness, 0.10);

      const count = Math.ceil(L / Ls);
      const singleVol = SafeDecimalEngine.safeMultiply(Ls, SafeDecimalEngine.safeMultiply(W, t, 4), 4);
      const totalVol = SafeDecimalEngine.safeMultiply(singleVol, count, 3);
      const totalArea = SafeDecimalEngine.safeMultiply(L, W, 2);

      return createCivilOutput({
        calculatorId: 'drainage.cover',
        version: '1.0.0',
        primaryQuantity: count,
        primaryUnit: 'buah',
        primaryLabel: 'Jumlah Unit Tutup Saluran',
        breakdown: {
          panjangTertutupM: L,
          jumlahUnitCoverBuah: count,
          luasPenutupM2: totalArea,
          totalVolumeBetonCoverM3: totalVol,
        },
        materials: [
          { name: `Cover Plat Beton ${W * 100}x${Ls * 100}x${t * 100} cm`, quantity: count, unit: 'buah' },
        ],
        formulaSource: {
          calculatorId: 'drainage.cover',
          calculatorVersion: '1.0.0',
          formulaId: 'DRAINAGE_COVER_COUNT',
          mathematicalExpression: 'Count = Ceil(L / Ls); Vol = Count × (Ls × W × t)',
        },
        inputs,
      });
    },
  },
];
