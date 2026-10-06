import {
  CalculationInput,
  CalculationOutput,
  CalculationContext,
  CalculatorDefinition,
} from '../../contracts/types';
import { SafeDecimalEngine } from '../../../safeDecimalEngine';
import { ProvenanceEngine } from '../../provenance/provenanceEngine';
import { toNum, createCivilOutput } from '../civilHelper';

export const WATER_STRUCTURE_PACK_CALCULATORS: CalculatorDefinition[] = [
  // 1. INTAKE (BANGUNAN SADAP AIR BAKU)
  {
    id: 'water.intake',
    name: 'Raw Water Intake (Bangunan Pengambilan Air Baku SPAM)',
    shortName: 'Intake Air Baku (SPAM)',
    category: 'infrastruktur',
    status: 'VERIFIED',
    pack: 'water_structure',
    version: '1.0.0',
    description: 'Menghitung volume beton dan galian sumur pengumpul / bangunan intake air baku sungai atau mata air',
    primaryUnit: 'm³',
    primaryQuantityLabel: 'Volume Beton Bangunan Intake',
    parameters: [
      { id: 'length', label: 'Panjang Luar Bangunan (L)', unit: 'm', defaultValue: 6.0, min: 1, required: true },
      { id: 'width', label: 'Lebar Luar Bangunan (W)', unit: 'm', defaultValue: 4.0, min: 1, required: true },
      { id: 'height', label: 'Tinggi / Kedalaman Bangunan (H)', unit: 'm', defaultValue: 4.5, min: 1, required: true },
      { id: 'wallThickness', label: 'Tebal Dinding Beton (t)', unit: 'm', defaultValue: 0.25, min: 0.15 },
    ],
    formulaSource: ProvenanceEngine.createVerifiedReferenceProvenance({
      calculatorId: 'water.intake',
      calculatorVersion: '1.0.0',
      formulaId: 'WATER_INTAKE_VOL',
      mathematicalExpression: 'V_gross = L × W × H; V_void = (L-2t)(W-2t)(H-t); V_conc = V_gross - V_void',
      referenceName: 'Pedoman Teknis SPAM Air Baku Cipta Karya PU',
      sectionOrClause: 'Intake Sump Concrete',
      status: 'PARTIALLY_VERIFIED',
    }),
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const L = toNum(inputs.length, 6.0);
      const W = toNum(inputs.width, 4.0);
      const H = toNum(inputs.height, 4.5);
      const t = toNum(inputs.wallThickness, 0.25);

      const grossVol = SafeDecimalEngine.safeMultiply(L, SafeDecimalEngine.safeMultiply(W, H, 4), 3);
      const voidL = Math.max(0, SafeDecimalEngine.safeSubtract(L, 2 * t));
      const voidW = Math.max(0, SafeDecimalEngine.safeSubtract(W, 2 * t));
      const voidH = Math.max(0, SafeDecimalEngine.safeSubtract(H, t));
      const voidVol = SafeDecimalEngine.safeMultiply(voidL, SafeDecimalEngine.safeMultiply(voidW, voidH, 4), 3);
      const concreteVol = SafeDecimalEngine.safeSubtract(grossVol, voidVol);

      return createCivilOutput({
        calculatorId: 'water.intake',
        version: '1.0.0',
        primaryQuantity: concreteVol,
        primaryUnit: 'm³',
        primaryLabel: 'Volume Beton Bangunan Intake',
        breakdown: {
          volumeGalianTotalM3: grossVol,
          volumeBetonStrukturM3: concreteVol,
          volumeKapasitasBakM3: voidVol,
        },
        materials: [
          { name: 'Beton Kedap Air K-300 / Water Tight', quantity: concreteVol, unit: 'm³' },
        ],
        formulaSource: {
          calculatorId: 'water.intake',
          calculatorVersion: '1.0.0',
          formulaId: 'WATER_INTAKE_VOL',
          mathematicalExpression: 'V_conc = V_gross - V_void',
        },
        inputs,
      });
    },
  },

  // 2. OUTLET (BANGUNAN PELEPAS AIR)
  {
    id: 'water.outlet',
    name: 'Water Discharge Outlet (Struktur Pelimpah & Pembuang Air Bersih)',
    shortName: 'Outlet Bangunan Air',
    category: 'infrastruktur',
    status: 'VERIFIED',
    pack: 'water_structure',
    version: '1.0.0',
    description: 'Menghitung volume beton struktur pelepas air olahan atau pipa pembuang lumpur',
    primaryUnit: 'm³',
    primaryQuantityLabel: 'Volume Beton Outlet',
    parameters: [
      { id: 'volume', label: 'Volume Bersih Beton Outlet (V)', unit: 'm³', defaultValue: 12.5, min: 0.5, required: true },
    ],
    formulaSource: ProvenanceEngine.createVerifiedReferenceProvenance({
      calculatorId: 'water.outlet',
      calculatorVersion: '1.0.0',
      formulaId: 'WATER_OUTLET_DIRECT',
      mathematicalExpression: 'Vol = V',
      referenceName: 'Standar SPAM Perpipaan',
      sectionOrClause: 'Outlet Structure',
      status: 'PARTIALLY_VERIFIED',
    }),
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const V = toNum(inputs.volume, 12.5);

      return createCivilOutput({
        calculatorId: 'water.outlet',
        version: '1.0.0',
        primaryQuantity: V,
        primaryUnit: 'm³',
        primaryLabel: 'Volume Beton Struktur Outlet',
        breakdown: {
          volumeBetonM3: V,
        },
        materials: [
          { name: 'Beton Struktur K-250 Outlet', quantity: V, unit: 'm³' },
        ],
        formulaSource: {
          calculatorId: 'water.outlet',
          calculatorVersion: '1.0.0',
          formulaId: 'WATER_OUTLET_DIRECT',
          mathematicalExpression: 'Vol = V',
        },
        inputs,
      });
    },
  },

  // 3. CHAMBER (BAK PENENANG / SEDIMENTASI)
  {
    id: 'water.chamber',
    name: 'Sedimentation & Grit Chamber (Bak Penenang / Pengendap Pasir)',
    shortName: 'Bak Penenang (Chamber)',
    category: 'infrastruktur',
    status: 'VERIFIED',
    pack: 'water_structure',
    version: '1.0.0',
    description: 'Menghitung volume beton dinding, lantai, dan sekat baffle bak pengendap pasir',
    primaryUnit: 'm³',
    primaryQuantityLabel: 'Volume Beton Bak Penenang',
    parameters: [
      { id: 'length', label: 'Panjang Bak (L)', unit: 'm', defaultValue: 15, min: 2, required: true },
      { id: 'width', label: 'Lebar Bak (W)', unit: 'm', defaultValue: 5.0, min: 1, required: true },
      { id: 'depth', label: 'Kedalaman Bak (H)', unit: 'm', defaultValue: 3.0, min: 1, required: true },
      { id: 'wallThickness', label: 'Tebal Dinding & Lantai (t)', unit: 'm', defaultValue: 0.25, min: 0.15 },
    ],
    formulaSource: ProvenanceEngine.createVerifiedReferenceProvenance({
      calculatorId: 'water.chamber',
      calculatorVersion: '1.0.0',
      formulaId: 'CHAMBER_CONCRETE_VOL',
      mathematicalExpression: 'V_gross = (L+2t)(W+2t)(H+t); V_void = L×W×H; V_conc = V_gross - V_void',
      referenceName: 'Standar Perencanaan Bangunan Pengolah Air IPA / SPAM',
      sectionOrClause: 'Sedimentation Chamber Takeoff',
      status: 'PARTIALLY_VERIFIED',
    }),
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const L = toNum(inputs.length, 15);
      const W = toNum(inputs.width, 5.0);
      const H = toNum(inputs.depth, 3.0);
      const t = toNum(inputs.wallThickness, 0.25);

      const grossL = SafeDecimalEngine.safeAdd(L, 2 * t);
      const grossW = SafeDecimalEngine.safeAdd(W, 2 * t);
      const grossH = SafeDecimalEngine.safeAdd(H, t);
      const grossVol = SafeDecimalEngine.safeMultiply(grossL, SafeDecimalEngine.safeMultiply(grossW, grossH, 4), 3);
      const voidVol = SafeDecimalEngine.safeMultiply(L, SafeDecimalEngine.safeMultiply(W, H, 4), 3);
      const concVol = SafeDecimalEngine.safeSubtract(grossVol, voidVol);

      return createCivilOutput({
        calculatorId: 'water.chamber',
        version: '1.0.0',
        primaryQuantity: concVol,
        primaryUnit: 'm³',
        primaryLabel: 'Volume Beton Bak Pengendap / Penenang',
        breakdown: {
          volumeKapasitasAirM3: voidVol,
          volumeBetonStrukturM3: concVol,
          volumeGalianTotalM3: grossVol,
        },
        materials: [
          { name: 'Beton Kedap Air K-300 Bak Pengendap', quantity: concVol, unit: 'm³' },
        ],
        formulaSource: {
          calculatorId: 'water.chamber',
          calculatorVersion: '1.0.0',
          formulaId: 'CHAMBER_CONCRETE_VOL',
          mathematicalExpression: 'V_conc = V_gross - V_void',
        },
        inputs,
      });
    },
  },

  // 4. MANHOLE (BAK KONTROL KATUP / VALVE CHAMBER)
  {
    id: 'water.manhole',
    name: 'Valve Chamber & Air Release Box (Bak Katup & Bak Pelepas Udara)',
    shortName: 'Bak Kontrol Valve (Chamber)',
    category: 'infrastruktur',
    status: 'VERIFIED',
    pack: 'water_structure',
    version: '1.0.0',
    description: 'Menghitung jumlah unit dan volume beton bak perlindungan valve / gate / air release valve',
    primaryUnit: 'unit',
    primaryQuantityLabel: 'Jumlah Unit Bak Valve',
    parameters: [
      { id: 'count', label: 'Jumlah Unit Bak Katup', unit: 'unit', defaultValue: 6, min: 1, required: true },
      { id: 'internalLength', label: 'Panjang Dalam (L)', unit: 'm', defaultValue: 1.5, min: 0.5 },
      { id: 'internalWidth', label: 'Lebar Dalam (W)', unit: 'm', defaultValue: 1.5, min: 0.5 },
      { id: 'depth', label: 'Kedalaman Bak (H)', unit: 'm', defaultValue: 1.8, min: 0.5 },
      { id: 'wallThickness', label: 'Tebal Dinding (t)', unit: 'm', defaultValue: 0.15, min: 0.10 },
    ],
    formulaSource: ProvenanceEngine.createVerifiedReferenceProvenance({
      calculatorId: 'water.manhole',
      calculatorVersion: '1.0.0',
      formulaId: 'VALVE_CHAMBER_COUNT_VOL',
      mathematicalExpression: 'V_single = (L+2t)(W+2t)(H+t) - (L×W×H); TotalVol = V_single × Count',
      referenceName: 'Standar Valve Chamber Jaringan Perpipaan Air Bersih',
      sectionOrClause: 'Valve Box Takeoff',
      status: 'PARTIALLY_VERIFIED',
    }),
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const count = Math.max(1, Math.floor(toNum(inputs.count, 6)));
      const L = toNum(inputs.internalLength, 1.5);
      const W = toNum(inputs.internalWidth, 1.5);
      const H = toNum(inputs.depth, 1.8);
      const t = toNum(inputs.wallThickness, 0.15);

      const grossVol = SafeDecimalEngine.safeMultiply(SafeDecimalEngine.safeAdd(L, 2 * t), SafeDecimalEngine.safeMultiply(SafeDecimalEngine.safeAdd(W, 2 * t), SafeDecimalEngine.safeAdd(H, t), 4), 4);
      const voidVol = SafeDecimalEngine.safeMultiply(L, SafeDecimalEngine.safeMultiply(W, H, 4), 4);
      const singleConcVol = SafeDecimalEngine.safeSubtract(grossVol, voidVol);
      const totalConcVol = SafeDecimalEngine.safeMultiply(singleConcVol, count, 3);

      return createCivilOutput({
        calculatorId: 'water.manhole',
        version: '1.0.0',
        primaryQuantity: count,
        primaryUnit: 'unit',
        primaryLabel: 'Jumlah Unit Bak Valve Chamber',
        breakdown: {
          jumlahBakValve: count,
          volumeBetonPerUnitM3: singleConcVol,
          totalVolumeBetonM3: totalConcVol,
        },
        materials: [
          { name: 'Beton K-250 Valve Chamber', quantity: totalConcVol, unit: 'm³' },
        ],
        formulaSource: {
          calculatorId: 'water.manhole',
          calculatorVersion: '1.0.0',
          formulaId: 'VALVE_CHAMBER_COUNT_VOL',
          mathematicalExpression: 'TotalVol = V_single × Count',
        },
        inputs,
      });
    },
  },

  // 5. RESERVOIR (GROUND RESERVOIR AIR MINUM)
  {
    id: 'water.reservoir',
    name: 'Ground Water Reservoir (Reservoir Distribusi Air Bersih Bawah Tanah / Ground)',
    shortName: 'Ground Reservoir Air Bersih',
    category: 'infrastruktur',
    status: 'VERIFIED',
    pack: 'water_structure',
    version: '1.0.0',
    description: 'Menghitung volume beton lantai, dinding, kolom, dan plat atap ground reservoir air minum',
    primaryUnit: 'm³',
    primaryQuantityLabel: 'Volume Beton Ground Reservoir',
    parameters: [
      { id: 'length', label: 'Panjang Bersih Dalam (L)', unit: 'm', defaultValue: 20, min: 2, required: true },
      { id: 'width', label: 'Lebar Bersih Dalam (W)', unit: 'm', defaultValue: 15, min: 2, required: true },
      { id: 'waterDepth', label: 'Tinggi Dinding / Air (H)', unit: 'm', defaultValue: 4.0, min: 1, required: true },
      { id: 'slabThickness', label: 'Tebal Plat Dasar (ts)', unit: 'm', defaultValue: 0.35, min: 0.2 },
      { id: 'wallThickness', label: 'Tebal Dinding (tw)', unit: 'm', defaultValue: 0.30, min: 0.2 },
      { id: 'roofThickness', label: 'Tebal Plat Atap Dak (tr)', unit: 'm', defaultValue: 0.20, min: 0.15 },
    ],
    formulaSource: ProvenanceEngine.createVerifiedReferenceProvenance({
      calculatorId: 'water.reservoir',
      calculatorVersion: '1.0.0',
      formulaId: 'RESERVOIR_CONCRETE_VOL',
      mathematicalExpression: 'V_base = (L+2tw)(W+2tw)×ts; V_roof = (L+2tw)(W+2tw)×tr; V_walls = 2×tw×(L+W+2tw)×H; Vol = V_base + V_roof + V_walls',
      referenceName: 'Pedoman Perencanaan Reservoir SPAM Cipta Karya',
      sectionOrClause: 'Ground Reservoir Structure',
      status: 'PARTIALLY_VERIFIED',
    }),
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const L = toNum(inputs.length, 20);
      const W = toNum(inputs.width, 15);
      const H = toNum(inputs.waterDepth, 4.0);
      const ts = toNum(inputs.slabThickness, 0.35);
      const tw = toNum(inputs.wallThickness, 0.30);
      const tr = toNum(inputs.roofThickness, 0.20);

      const outerL = SafeDecimalEngine.safeAdd(L, 2 * tw);
      const outerW = SafeDecimalEngine.safeAdd(W, 2 * tw);
      const footprint = SafeDecimalEngine.safeMultiply(outerL, outerW, 2);

      const baseVol = SafeDecimalEngine.safeMultiply(footprint, ts, 3);
      const roofVol = SafeDecimalEngine.safeMultiply(footprint, tr, 3);
      const wallPerimeter = SafeDecimalEngine.safeMultiply(2, SafeDecimalEngine.safeAdd(outerL, outerW), 2);
      const wallVol = SafeDecimalEngine.safeMultiply(wallPerimeter, SafeDecimalEngine.safeMultiply(tw, H, 4), 3);
      const totalConcVol = SafeDecimalEngine.safeAdd(baseVol, SafeDecimalEngine.safeAdd(roofVol, wallVol));
      const waterCapacity = SafeDecimalEngine.safeMultiply(L, SafeDecimalEngine.safeMultiply(W, H, 3), 2);

      return createCivilOutput({
        calculatorId: 'water.reservoir',
        version: '1.0.0',
        primaryQuantity: totalConcVol,
        primaryUnit: 'm³',
        primaryLabel: 'Volume Beton Ground Reservoir',
        breakdown: {
          kapasitasTampunganAirM3: waterCapacity,
          volumePlatDasarM3: baseVol,
          volumePlatAtapDakM3: roofVol,
          volumeDindingBetonM3: wallVol,
          totalVolumeBetonM3: totalConcVol,
        },
        materials: [
          { name: 'Beton Kedap Air K-350 / fc 30 MPa Reservoir', quantity: totalConcVol, unit: 'm³' },
        ],
        formulaSource: {
          calculatorId: 'water.reservoir',
          calculatorVersion: '1.0.0',
          formulaId: 'RESERVOIR_CONCRETE_VOL',
          mathematicalExpression: 'Vol = V_base + V_roof + V_walls',
        },
        inputs,
      });
    },
  },

  // 6. TANK (ELEVATED WATER TANK / MENARA AIR)
  {
    id: 'water.tank',
    name: 'Elevated Water Tank (Menara Tangki Air Atas)',
    shortName: 'Menara Tangki Air',
    category: 'infrastruktur',
    status: 'VERIFIED',
    pack: 'water_structure',
    version: '1.0.0',
    description: 'Menghitung volume beton atau struktur baja menara tandon air peninggi tekanan gravitasi',
    primaryUnit: 'm³',
    primaryQuantityLabel: 'Volume Kapasitas Tangki Air',
    parameters: [
      { id: 'tankVolume', label: 'Kapasitas Tangki (V_tank)', unit: 'm³', defaultValue: 50, min: 5, required: true },
      { id: 'towerHeight', label: 'Tinggi Menara Penyangga (H)', unit: 'm', defaultValue: 12, min: 3 },
    ],
    formulaSource: ProvenanceEngine.createVerifiedReferenceProvenance({
      calculatorId: 'water.tank',
      calculatorVersion: '1.0.0',
      formulaId: 'ELEVATED_TANK_CAP',
      mathematicalExpression: 'Cap = V_tank',
      referenceName: 'Standar Menara Air SPAM Pedesaan/Perkotaan',
      sectionOrClause: 'Elevated Water Tank',
      status: 'PARTIALLY_VERIFIED',
    }),
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const V = toNum(inputs.tankVolume, 50);
      const H = toNum(inputs.towerHeight, 12);

      return createCivilOutput({
        calculatorId: 'water.tank',
        version: '1.0.0',
        primaryQuantity: V,
        primaryUnit: 'm³',
        primaryLabel: 'Kapasitas Menara Tangki Air',
        breakdown: {
          kapasitasTangkiM3: V,
          tinggiMenaraM: H,
        },
        materials: [
          { name: `Tangki Air Bersih Kapasitas ${V} m³`, quantity: 1, unit: 'unit' },
        ],
        formulaSource: {
          calculatorId: 'water.tank',
          calculatorVersion: '1.0.0',
          formulaId: 'ELEVATED_TANK_CAP',
          mathematicalExpression: 'Cap = V_tank',
        },
        inputs,
      });
    },
  },

  // 7. PIPE (JARINGAN TRANSMISI / DISTRIBUSI PIPA AIR)
  {
    id: 'water.pipe',
    name: 'Water Transmission & Distribution Pipeline (Pipa Transmisi / Distribusi Air)',
    shortName: 'Pipa Jaringan Air Bersih',
    category: 'infrastruktur',
    status: 'VERIFIED',
    pack: 'water_structure',
    version: '1.0.0',
    description: 'Menghitung total panjang pipa HDPE/PVC/DIP, galian parit, dan urugan pasir perlindungan pipa',
    primaryUnit: 'm',
    primaryQuantityLabel: 'Panjang Total Pipa Jalur',
    parameters: [
      { id: 'pipeLength', label: 'Panjang Jalur Pipa (L)', unit: 'm', defaultValue: 1000, min: 1, required: true },
      { id: 'diameterMm', label: 'Diameter Nominal Pipa (DN)', unit: 'mm', defaultValue: 150, min: 20, required: true },
      { id: 'trenchDepth', label: 'Kedalaman Parit Pipa (H)', unit: 'm', defaultValue: 1.2, min: 0.5 },
      { id: 'trenchWidth', label: 'Lebar Parit Pipa (W)', unit: 'm', defaultValue: 0.6, min: 0.3 },
    ],
    formulaSource: ProvenanceEngine.createVerifiedReferenceProvenance({
      calculatorId: 'water.pipe',
      calculatorVersion: '1.0.0',
      formulaId: 'PIPELINE_LEN_EXC',
      mathematicalExpression: 'TotalLen = L; VolExc = L × W × H',
      referenceName: 'Spesifikasi Jaringan Pipa Air Minum SNI 7511:2011',
      sectionOrClause: 'Pipe Laying & Trench Excavation',
      status: 'PARTIALLY_VERIFIED',
    }),
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const L = toNum(inputs.pipeLength, 1000);
      const DN = toNum(inputs.diameterMm, 150);
      const H = toNum(inputs.trenchDepth, 1.2);
      const W = toNum(inputs.trenchWidth, 0.6);

      const excVol = SafeDecimalEngine.safeMultiply(L, SafeDecimalEngine.safeMultiply(W, H, 4), 3);
      const sandVol = SafeDecimalEngine.safeMultiply(L, SafeDecimalEngine.safeMultiply(W, 0.15, 4), 3); // 15cm pasir keliling

      return createCivilOutput({
        calculatorId: 'water.pipe',
        version: '1.0.0',
        primaryQuantity: L,
        primaryUnit: 'm',
        primaryLabel: 'Panjang Pemasangan Jaringan Pipa',
        breakdown: {
          panjangJalurPipaM: L,
          volumeGalianParitM3: excVol,
          volumePasirPelindungM3: sandVol,
        },
        materials: [
          { name: `Pipa Air Bersih HDPE/DIP/PVC ND ${DN} mm`, quantity: L, unit: 'm' },
          { name: 'Pasir Urug Selimut Pipa', quantity: sandVol, unit: 'm³' },
        ],
        formulaSource: {
          calculatorId: 'water.pipe',
          calculatorVersion: '1.0.0',
          formulaId: 'PIPELINE_LEN_EXC',
          mathematicalExpression: 'TotalLen = L; VolExc = L × W × H',
        },
        inputs,
      });
    },
  },

  // 8. BOX STRUCTURE (BOX KATUP / RUMAH POMPA)
  {
    id: 'water.box_structure',
    name: 'Pump House & Box Structure (Rumah Pompa / Gardu Air)',
    shortName: 'Rumah Pompa (Pump House)',
    category: 'infrastruktur',
    status: 'VERIFIED',
    pack: 'water_structure',
    version: '1.0.0',
    description: 'Menghitung volume beton lantai dasar dan dinding rumah pompa / gardu instalasi air',
    primaryUnit: 'm³',
    primaryQuantityLabel: 'Volume Beton Rumah Pompa',
    parameters: [
      { id: 'length', label: 'Panjang Bangunan (L)', unit: 'm', defaultValue: 8.0, min: 2, required: true },
      { id: 'width', label: 'Lebar Bangunan (W)', unit: 'm', defaultValue: 6.0, min: 2, required: true },
      { id: 'height', label: 'Tinggi Bangunan (H)', unit: 'm', defaultValue: 3.5, min: 1 },
      { id: 'concreteVolume', label: 'Volume Beton Struktur Bersih (V)', unit: 'm³', defaultValue: 22.5, min: 1 },
    ],
    formulaSource: ProvenanceEngine.createVerifiedReferenceProvenance({
      calculatorId: 'water.box_structure',
      calculatorVersion: '1.0.0',
      formulaId: 'PUMP_HOUSE_CONC',
      mathematicalExpression: 'Vol = V',
      referenceName: 'Standar Gedung Rumah Pompa SPAM',
      sectionOrClause: 'Concrete Works',
      status: 'PARTIALLY_VERIFIED',
    }),
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const L = toNum(inputs.length, 8.0);
      const W = toNum(inputs.width, 6.0);
      const H = toNum(inputs.height, 3.5);
      const V = toNum(inputs.concreteVolume, 22.5);

      return createCivilOutput({
        calculatorId: 'water.box_structure',
        version: '1.0.0',
        primaryQuantity: V,
        primaryUnit: 'm³',
        primaryLabel: 'Volume Beton Struktur Rumah Pompa',
        breakdown: {
          luasLantaiBangunanM2: SafeDecimalEngine.safeMultiply(L, W, 2),
          volumeBetonStrukturM3: V,
        },
        materials: [
          { name: 'Beton Struktur K-250 Rumah Pompa', quantity: V, unit: 'm³' },
        ],
        formulaSource: {
          calculatorId: 'water.box_structure',
          calculatorVersion: '1.0.0',
          formulaId: 'PUMP_HOUSE_CONC',
          mathematicalExpression: 'Vol = V',
        },
        inputs,
      });
    },
  },

  // 9. CONCRETE STRUCTURE GENERAL
  {
    id: 'water.concrete_structure',
    name: 'Water Retaining Concrete Structure (Beton Struktur Bangunan Air Kedap Air)',
    shortName: 'Beton Kedap Air (Water Structure)',
    category: 'infrastruktur',
    status: 'VERIFIED',
    pack: 'water_structure',
    version: '1.0.0',
    description: 'Menghitung volume cor beton bertulang kedap air (water-tight concrete) untuk bak penampung umum',
    primaryUnit: 'm³',
    primaryQuantityLabel: 'Volume Beton Kedap Air',
    parameters: [
      { id: 'length', label: 'Panjang (L)', unit: 'm', defaultValue: 10, min: 0.5, required: true },
      { id: 'width', label: 'Lebar (W)', unit: 'm', defaultValue: 5.0, min: 0.5, required: true },
      { id: 'thickness', label: 'Tebal / Tinggi (t)', unit: 'm', defaultValue: 0.30, min: 0.1, required: true },
      { id: 'count', label: 'Jumlah Elemen', unit: 'unit', defaultValue: 1, min: 1 },
    ],
    formulaSource: ProvenanceEngine.createVerifiedReferenceProvenance({
      calculatorId: 'water.concrete_structure',
      calculatorVersion: '1.0.0',
      formulaId: 'WATER_CONCRETE_GEN',
      mathematicalExpression: 'Vol = L × W × t × Count',
      referenceName: 'Standar Beton Struktur Kedap Air SNI 2847:2019',
      sectionOrClause: 'Water Retaining Concrete',
      status: 'PARTIALLY_VERIFIED',
    }),
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const L = toNum(inputs.length, 10);
      const W = toNum(inputs.width, 5.0);
      const t = toNum(inputs.thickness, 0.30);
      const count = Math.max(1, Math.floor(toNum(inputs.count, 1)));

      const singleVol = SafeDecimalEngine.safeMultiply(L, SafeDecimalEngine.safeMultiply(W, t, 4), 3);
      const totalVol = SafeDecimalEngine.safeMultiply(singleVol, count, 3);

      return createCivilOutput({
        calculatorId: 'water.concrete_structure',
        version: '1.0.0',
        primaryQuantity: totalVol,
        primaryUnit: 'm³',
        primaryLabel: 'Volume Beton Struktur Kedap Air',
        breakdown: {
          volumePerElemenM3: singleVol,
          totalVolumeBetonM3: totalVol,
        },
        materials: [
          { name: 'Beton Kedap Air K-300 / K-350 Admixture Waterproofing', quantity: totalVol, unit: 'm³' },
        ],
        formulaSource: {
          calculatorId: 'water.concrete_structure',
          calculatorVersion: '1.0.0',
          formulaId: 'WATER_CONCRETE_GEN',
          mathematicalExpression: 'Vol = L × W × t × Count',
        },
        inputs,
      });
    },
  },

  // 10. EXCAVATION
  {
    id: 'water.excavation',
    name: 'Water Structure Pit Excavation (Galian Tanah Bak / Bangunan Air)',
    shortName: 'Galian Bak Air',
    category: 'infrastruktur',
    status: 'VERIFIED',
    pack: 'water_structure',
    version: '1.0.0',
    description: 'Menghitung volume galian tanah lubang bak penampung, reservoir, atau intake air',
    primaryUnit: 'm³',
    primaryQuantityLabel: 'Volume Galian Tanah Bak Air',
    parameters: [
      { id: 'length', label: 'Panjang Galian (L)', unit: 'm', defaultValue: 22, min: 1, required: true },
      { id: 'width', label: 'Lebar Galian (W)', unit: 'm', defaultValue: 17, min: 1, required: true },
      { id: 'depth', label: 'Kedalaman Galian (H)', unit: 'm', defaultValue: 4.5, min: 0.5, required: true },
    ],
    formulaSource: ProvenanceEngine.createVerifiedReferenceProvenance({
      calculatorId: 'water.excavation',
      calculatorVersion: '1.0.0',
      formulaId: 'WATER_EXC_VOL',
      mathematicalExpression: 'Vol = L × W × H',
      referenceName: 'Standar Galian Tanah Bangunan Air SNI 2835',
      sectionOrClause: 'Pit Excavation',
      status: 'PARTIALLY_VERIFIED',
    }),
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const L = toNum(inputs.length, 22);
      const W = toNum(inputs.width, 17);
      const H = toNum(inputs.depth, 4.5);

      const vol = SafeDecimalEngine.safeMultiply(L, SafeDecimalEngine.safeMultiply(W, H, 4), 3);

      return createCivilOutput({
        calculatorId: 'water.excavation',
        version: '1.0.0',
        primaryQuantity: vol,
        primaryUnit: 'm³',
        primaryLabel: 'Volume Galian Tanah Bak Air',
        breakdown: {
          luasTapakGalianM2: SafeDecimalEngine.safeMultiply(L, W, 2),
          volumeGalianM3: vol,
        },
        formulaSource: {
          calculatorId: 'water.excavation',
          calculatorVersion: '1.0.0',
          formulaId: 'WATER_EXC_VOL',
          mathematicalExpression: 'Vol = L × W × H',
        },
        inputs,
      });
    },
  },

  // 11. BACKFILL
  {
    id: 'water.backfill',
    name: 'Water Structure Backfill (Urugan Tanah Sisi Bak / Reservoir)',
    shortName: 'Urugan Kembali Bak Air',
    category: 'infrastruktur',
    status: 'VERIFIED',
    pack: 'water_structure',
    version: '1.0.0',
    description: 'Menghitung volume urugan tanah kembali di sekeliling dinding luar bak reservoir atau chamber',
    primaryUnit: 'm³',
    primaryQuantityLabel: 'Volume Urugan Kembali Sisi Bak',
    parameters: [
      { id: 'excavationVolume', label: 'Volume Galian Pit (V_galian)', unit: 'm³', defaultValue: 1680, min: 10, required: true },
      { id: 'structureDisplacementVolume', label: 'Volume Fisik Bangunan Luar (V_struktur)', unit: 'm³', defaultValue: 1350, min: 10, required: true },
    ],
    formulaSource: ProvenanceEngine.createVerifiedReferenceProvenance({
      calculatorId: 'water.backfill',
      calculatorVersion: '1.0.0',
      formulaId: 'WATER_BACKFILL_VOL',
      mathematicalExpression: 'Vol = Max(0, V_galian - V_struktur)',
      referenceName: 'Standar Urugan Tanah Struktur Bangunan Air',
      sectionOrClause: 'Backfill Takeoff',
      status: 'PARTIALLY_VERIFIED',
    }),
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const V_galian = toNum(inputs.excavationVolume, 1680);
      const V_str = toNum(inputs.structureDisplacementVolume, 1350);

      const netBackfill = Math.max(0, SafeDecimalEngine.safeSubtract(V_galian, V_str));

      return createCivilOutput({
        calculatorId: 'water.backfill',
        version: '1.0.0',
        primaryQuantity: netBackfill,
        primaryUnit: 'm³',
        primaryLabel: 'Volume Urugan Tanah Kembali Sisi Bak',
        breakdown: {
          volumeGalianM3: V_galian,
          volumeStrukturLuarM3: V_str,
          volumeUruganKembaliM3: netBackfill,
        },
        materials: [
          { name: 'Tanah Timbunan Kembali Dipadatkan', quantity: netBackfill, unit: 'm³' },
        ],
        formulaSource: {
          calculatorId: 'water.backfill',
          calculatorVersion: '1.0.0',
          formulaId: 'WATER_BACKFILL_VOL',
          mathematicalExpression: 'Vol = Max(0, V_galian - V_struktur)',
        },
        inputs,
      });
    },
  },

  // 12. LINING / WATERPROOFING COATING
  {
    id: 'water.lining',
    name: 'Waterproofing Membrane & Food-Grade Epoxy (Waterproofing Bak Air Bersih)',
    shortName: 'Waterproofing Bak Air',
    category: 'infrastruktur',
    status: 'VERIFIED',
    pack: 'water_structure',
    version: '1.0.0',
    description: 'Menghitung luas bidang pelapisan waterproofing semen / membrane / epoxy food grade dinding & lantai bak air',
    primaryUnit: 'm²',
    primaryQuantityLabel: 'Luas Pelapisan Waterproofing',
    parameters: [
      { id: 'floorArea', label: 'Luas Lantai Bak (A_lantai)', unit: 'm²', defaultValue: 300, min: 1, required: true },
      { id: 'wallPerimeter', label: 'Keliling Dinding Dalam (P)', unit: 'm', defaultValue: 70, min: 2, required: true },
      { id: 'wallHeight', label: 'Tinggi Dinding (H)', unit: 'm', defaultValue: 4.0, min: 0.5, required: true },
    ],
    formulaSource: ProvenanceEngine.createVerifiedReferenceProvenance({
      calculatorId: 'water.lining',
      calculatorVersion: '1.0.0',
      formulaId: 'WATERPROOFING_AREA',
      mathematicalExpression: 'TotalArea = A_lantai + (P × H)',
      referenceName: 'Standar Pelapisan Kedap Air Bak Air Minum SNI',
      sectionOrClause: 'Waterproofing & Epoxy Coating',
      status: 'PARTIALLY_VERIFIED',
    }),
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const A_fl = toNum(inputs.floorArea, 300);
      const P = toNum(inputs.wallPerimeter, 70);
      const H = toNum(inputs.wallHeight, 4.0);

      const wallArea = SafeDecimalEngine.safeMultiply(P, H, 2);
      const totalArea = SafeDecimalEngine.safeAdd(A_fl, wallArea);

      return createCivilOutput({
        calculatorId: 'water.lining',
        version: '1.0.0',
        primaryQuantity: totalArea,
        primaryUnit: 'm²',
        primaryLabel: 'Luas Pelapisan Waterproofing Bak',
        breakdown: {
          luasLantaiBakM2: A_fl,
          luasDindingBakM2: wallArea,
          totalLuasWaterproofingM2: totalArea,
        },
        materials: [
          { name: 'Waterproofing Cementitious / Epoxy Food Grade', quantity: totalArea, unit: 'm²' },
        ],
        formulaSource: {
          calculatorId: 'water.lining',
          calculatorVersion: '1.0.0',
          formulaId: 'WATERPROOFING_AREA',
          mathematicalExpression: 'TotalArea = A_lantai + (P × H)',
        },
        inputs,
      });
    },
  },

  // 13. COVER / SLAB (TUTUP PLAT RESERVOIR)
  {
    id: 'water.cover',
    name: 'Reservoir Access Hatch & Cover Slab (Pintu Akses & Plat Penutup Reservoir)',
    shortName: 'Plat Penutup & Manhole Bak',
    category: 'infrastruktur',
    status: 'VERIFIED',
    pack: 'water_structure',
    version: '1.0.0',
    description: 'Menghitung luas bidang penutup pelat atap dan jumlah pintu inspeksi (access hatch) reservoir',
    primaryUnit: 'm²',
    primaryQuantityLabel: 'Luas Plat Atap Penutup',
    parameters: [
      { id: 'roofArea', label: 'Luas Plat Atap Reservoir (A)', unit: 'm²', defaultValue: 300, min: 1, required: true },
      { id: 'accessHatchCount', label: 'Jumlah Pintu Akses / Manhole Hatch', unit: 'unit', defaultValue: 2, min: 1 },
    ],
    formulaSource: ProvenanceEngine.createVerifiedReferenceProvenance({
      calculatorId: 'water.cover',
      calculatorVersion: '1.0.0',
      formulaId: 'RESERVOIR_ROOF_COVER',
      mathematicalExpression: 'Area = A; Hatches = accessHatchCount',
      referenceName: 'Standar Penutup Reservoir Air Minum',
      sectionOrClause: 'Roof Slab & Access Hatch',
      status: 'PARTIALLY_VERIFIED',
    }),
    dependencies: [],
    calculate: (inputs: CalculationInput, _ctx?: CalculationContext): CalculationOutput => {
      const A = toNum(inputs.roofArea, 300);
      const hatches = Math.max(1, Math.floor(toNum(inputs.accessHatchCount, 2)));

      return createCivilOutput({
        calculatorId: 'water.cover',
        version: '1.0.0',
        primaryQuantity: A,
        primaryUnit: 'm²',
        primaryLabel: 'Luas Plat Penutup Atap Reservoir',
        breakdown: {
          luasPlatPenutupM2: A,
          jumlahPintuAksesManhole: hatches,
        },
        materials: [
          { name: 'Pintu Akses Stainless Steel Manhole Hatch', quantity: hatches, unit: 'unit' },
        ],
        formulaSource: {
          calculatorId: 'water.cover',
          calculatorVersion: '1.0.0',
          formulaId: 'RESERVOIR_ROOF_COVER',
          mathematicalExpression: 'Area = A; Hatches = accessHatchCount',
        },
        inputs,
      });
    },
  },
];
