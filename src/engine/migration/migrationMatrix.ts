/**
 * EZRAB CALCULATOR MIGRATION MATRIX
 *
 * Tracks the migration status of all calculators across the 5 batches:
 * Batch 1: Weir, Drainage
 * Batch 2: Culvert, Irrigation
 * Batch 3: Road, Bridge
 * Batch 4: Building
 * Batch 5: Dam, Water Infrastructure & others
 */

export type MigrationStatus = 'MIGRATED' | 'IN_PROGRESS' | 'PENDING' | 'BLOCKED';
export type TestStatus = 'PASS' | 'FAIL' | 'PENDING';

export interface MigrationMatrixEntry {
  calculatorId: string;
  name: string;
  batch: 1 | 2 | 3 | 4 | 5;
  category: string;
  oldPricing: string;
  newPricing: string;
  primaryAHSP: string;
  resources: string[];
  status: MigrationStatus;
  testStatus: TestStatus;
  regressionStatus: 'PASS_ZERO_DRIFT' | 'REGRESSION_DETECTED' | 'UNTESTED';
}

export const CALCULATOR_MIGRATION_MATRIX: MigrationMatrixEntry[] = [
  // =========================================================================
  // BATCH 1: WEIR & DRAINAGE
  // =========================================================================
  {
    calculatorId: 'weir.body',
    name: 'Tubuh Bendung Tetap (Weir Body)',
    batch: 1,
    category: 'Weir',
    oldPricing: 'Hardcoded borongan volume * 1.500.000',
    newPricing: 'CentralDeterministicCostEngine + KP-02 Scope Mapping (Concrete, Rebar, Formwork, Joint, Waterstop)',
    primaryAHSP: 'BINA_MARGA_3.1.(1)',
    resources: ['Beton Mutu Sedang fc 20 MPa', 'Besi Tulangan BJTS 420B', 'Bekisting', 'Dilatasi Joint', 'Waterstop PVC'],
    status: 'MIGRATED',
    testStatus: 'PASS',
    regressionStatus: 'PASS_ZERO_DRIFT',
  },
  {
    calculatorId: 'weir.spillway',
    name: 'Mercu & Pelimpah Bendung (Weir Spillway)',
    batch: 1,
    category: 'Weir',
    oldPricing: 'Legacy borongan rate',
    newPricing: 'CentralDeterministicCostEngine + Spillway Scope Mapping',
    primaryAHSP: 'BINA_MARGA_3.1.(1)',
    resources: ['Beton Tahan Erosi fc 25 MPa', 'Besi Ulir', 'Bekisting Lengkung'],
    status: 'MIGRATED',
    testStatus: 'PASS',
    regressionStatus: 'PASS_ZERO_DRIFT',
  },
  {
    calculatorId: 'drainage.channel',
    name: 'Saluran Drainase Trapesium / U-Ditch Cor',
    batch: 1,
    category: 'Drainage',
    oldPricing: 'Linear fallback rate Rp 150.000/m',
    newPricing: 'CentralDeterministicCostEngine (Galian Tanah + Pasangan Batu Mortar 1:4 + Plesteran)',
    primaryAHSP: 'BINA_MARGA_2.2.(1)',
    resources: ['Pekerja Galian', 'Batu Belah', 'Pasir Pasang', 'Semen Portland'],
    status: 'MIGRATED',
    testStatus: 'PASS',
    regressionStatus: 'PASS_ZERO_DRIFT',
  },
  {
    calculatorId: 'drainage.u_ditch',
    name: 'Saluran U-Ditch Pracetak',
    batch: 1,
    category: 'Drainage',
    oldPricing: 'Linear fallback rate Rp 250.000/m',
    newPricing: 'CentralDeterministicCostEngine (Unit U-Ditch Precast + Bedding Pasir + Mortar Sambungan)',
    primaryAHSP: 'BINA_MARGA_2.1.(1)',
    resources: ['Unit U-Ditch', 'Pasir Urug', 'Semen', 'Pekerja Pemasangan'],
    status: 'MIGRATED',
    testStatus: 'PASS',
    regressionStatus: 'PASS_ZERO_DRIFT',
  },

  // =========================================================================
  // BATCH 2: CULVERT & IRRIGATION
  // =========================================================================
  {
    calculatorId: 'drainage.box_culvert',
    name: 'Box Culvert Pracetak (Gorong-gorong Persegi)',
    batch: 2,
    category: 'Culvert',
    oldPricing: 'Fixed multiplier per meter',
    newPricing: 'CentralDeterministicCostEngine (Galian + Landasan Pasir + Unit Box Terpasang)',
    primaryAHSP: 'BINA_MARGA_3.1.(1)',
    resources: ['Unit Box Culvert', 'Pasir Pasang', 'Peralatan Crane', 'Pekerja'],
    status: 'MIGRATED',
    testStatus: 'PASS',
    regressionStatus: 'PASS_ZERO_DRIFT',
  },
  {
    calculatorId: 'irrigation.channel',
    name: 'Saluran Irigasi Primer / Sekunder',
    batch: 2,
    category: 'Irrigation',
    oldPricing: 'Legacy formula estimation',
    newPricing: 'CentralDeterministicCostEngine (Excavation + Lining Beton K-175 + Pintu Air)',
    primaryAHSP: 'SDA_IRRIG_01',
    resources: ['Beton fc 15 MPa', 'Galian Tanah', 'Pintu Air Sorong'],
    status: 'MIGRATED',
    testStatus: 'PASS',
    regressionStatus: 'PASS_ZERO_DRIFT',
  },

  // =========================================================================
  // BATCH 3: ROAD & BRIDGE
  // =========================================================================
  {
    calculatorId: 'road.flexible_pavement',
    name: 'Perkerasan Lentur Jalan (AC-WC, AC-BC, LPA, LPB)',
    batch: 3,
    category: 'Road',
    oldPricing: 'Old constant rate per m2',
    newPricing: 'CentralDeterministicCostEngine (Multi-layer Asphalt + Subbase)',
    primaryAHSP: 'BINA_MARGA_6.3.(1)',
    resources: ['Aspal Minyak 60/70', 'Agregat Kelas A', 'Agregat Kelas B', 'Tandem Roller'],
    status: 'IN_PROGRESS',
    testStatus: 'PENDING',
    regressionStatus: 'UNTESTED',
  },
  {
    calculatorId: 'bridge.girder',
    name: 'Gelagar Jembatan Beton Prategang / Baja',
    batch: 3,
    category: 'Bridge',
    oldPricing: 'Legacy unit pricing',
    newPricing: 'CentralDeterministicCostEngine (PC-I Girder + Diafragma + Plat Lantai)',
    primaryAHSP: 'BINA_MARGA_7.1.(1)',
    resources: ['Balok Girder', 'Kabel Strand Prestress', 'Beton fc 45 MPa'],
    status: 'IN_PROGRESS',
    testStatus: 'PENDING',
    regressionStatus: 'UNTESTED',
  },

  // =========================================================================
  // BATCH 4: BUILDING
  // =========================================================================
  {
    calculatorId: 'residential.kolom',
    name: 'Kolom Struktur Gedung Beton Bertulang',
    batch: 4,
    category: 'Building',
    oldPricing: 'Hardcoded keyword rate',
    newPricing: 'CentralDeterministicCostEngine (Beton Cor + Besi D13/D16 + Begel + Bekisting Multiplek)',
    primaryAHSP: 'SNI_GEDUNG_BETON_K250',
    resources: ['Ready Mix fc 20 MPa', 'Besi Beton', 'Kawat Bendrat', 'Papan Multiplek 9mm'],
    status: 'IN_PROGRESS',
    testStatus: 'PENDING',
    regressionStatus: 'UNTESTED',
  },

  // =========================================================================
  // BATCH 5: DAM & WATER INFRASTRUCTURE
  // =========================================================================
  {
    calculatorId: 'dam.embankment',
    name: 'Tubuh Bendungan Urugan (Dam Embankment)',
    batch: 5,
    category: 'Dam',
    oldPricing: 'Approximation rate per volume',
    newPricing: 'CentralDeterministicCostEngine (Zona Inti Lempung + Zona Transisi + Riprap Batu)',
    primaryAHSP: 'SDA_DAM_01',
    resources: ['Material Lempung Kedap', 'Filter Pasir', 'Batu Riprap', 'Vibratory Compactor'],
    status: 'IN_PROGRESS',
    testStatus: 'PENDING',
    regressionStatus: 'UNTESTED',
  },
];

/**
 * Generate migration report summary
 */
export function generateMigrationReport() {
  const total = CALCULATOR_MIGRATION_MATRIX.length;
  const migrated = CALCULATOR_MIGRATION_MATRIX.filter((m) => m.status === 'MIGRATED').length;
  const inProgress = CALCULATOR_MIGRATION_MATRIX.filter((m) => m.status === 'IN_PROGRESS').length;
  const regressions = CALCULATOR_MIGRATION_MATRIX.filter((m) => m.regressionStatus === 'REGRESSION_DETECTED').length;

  return {
    total,
    migrated,
    inProgress,
    regressions,
    criticalRegressionBlocked: regressions > 0,
    entries: CALCULATOR_MIGRATION_MATRIX,
  };
}
