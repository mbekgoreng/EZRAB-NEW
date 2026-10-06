/**
 * EZRAB PHASE 6A — WEIR DOMAIN AHSP DATABASE
 *
 * Canonical AHSP definitions for the Weir/Bendung cost domain.
 * Every definition has explicit labor, material, and equipment components
 * with coefficients sourced from official documents.
 *
 * Sources:
 *   - Lampiran V SE DJBK No. 12/SE/Db/2026 (komponen upah & alat)
 *   - KP-02 Standar Perencanaan Irigasi (Bangunan Utama — Bendung)
 *   - Spesifikasi Umum Bina Marga 2026 (baja tulangan, bekisting)
 *
 * RULES:
 *   - No invented coefficients.
 *   - No fuzzy matching.
 *   - If exact code is not found, status = AHSP_NOT_FOUND.
 */

import { AHSPDefinition } from '../ahsp/contracts/types';

export const WEIR_AHSP_DATABASE: Map<string, AHSPDefinition> = new Map();

// ── 1. CONCRETE: Beton Siklop K-225 / fc 20 MPa (per m³) ──────────────
// Code: 3.1.(1) — SDA domain (Beton Struktur Bendung)
// Source: KP-02 + SE DJBK 2026
WEIR_AHSP_DATABASE.set('3.1.(1)', {
  id: 'AHSP_BETON_K225',
  code: '3.1.(1)',
  codeNormalized: '3.1.(1)',
  name: 'Beton Siklop K-225 / fc 20 MPa Struktur Tubuh Bendung',
  unit: 'm³',
  domain: 'SUMBER_DAYA_AIR',
  category: 'STRUKTUR',
  version: '2026.1',
  year: 2026,
  sourceDocument: 'Lampiran V SE DJBK 2026 & KP-02',
  laborComponents: [
    { id: 'l1', type: 'labor', itemCode: 'L.01', itemName: 'Pekerja', unit: 'OH', coefficient: 1.2 },
    { id: 'l2', type: 'labor', itemCode: 'L.02', itemName: 'Tukang Batu', unit: 'OH', coefficient: 0.35 },
    { id: 'l3', type: 'labor', itemCode: 'L.04', itemName: 'Mandor', unit: 'OH', coefficient: 0.12 },
  ],
  materialComponents: [
    { id: 'm1', type: 'material', itemCode: 'M.01', itemName: 'Semen Portland', unit: 'kg', coefficient: 380 },
    { id: 'm2', type: 'material', itemCode: 'M.02', itemName: 'Pasir Beton', unit: 'm³', coefficient: 0.48 },
    { id: 'm3', type: 'material', itemCode: 'M.03', itemName: 'Batu Pecah 2/3', unit: 'm³', coefficient: 0.72 },
  ],
  equipmentComponents: [
    { id: 'e1', type: 'equipment', itemCode: 'E.01', itemName: 'Concrete Mixer 0.35 m³', unit: 'jam', coefficient: 0.25 },
    { id: 'e2', type: 'equipment', itemCode: 'E.02', itemName: 'Concrete Vibrator', unit: 'jam', coefficient: 0.20 },
  ],
  totalLaborCoefficient: 1.67,
  totalMaterialCoefficient: 381.2,
  totalEquipmentCoefficient: 0.45,
  provenance: {
    sourceDocument: 'KP-02 Standar Perencanaan Irigasi',
    version: '2026.1',
    verificationStatus: 'VERIFIED',
    effectiveDate: '2026-01-15',
  },
});

// ── 2. REINFORCEMENT: Baja Tulangan BJTS 420B (per kg) ──────────────────
// Code: BINA_MARGA_3.2.(1) — Bina Marga domain
// Source: Spesifikasi Umum Bina Marga 2026 + SE DJBK 2026
WEIR_AHSP_DATABASE.set('BINA_MARGA_3.2.(1)', {
  id: 'AHSP_REBAR_ULIR',
  code: 'BINA_MARGA_3.2.(1)',
  codeNormalized: '3.2.(1)',
  name: 'Baja Tulangan Sirip BJTS 420B',
  unit: 'kg',
  domain: 'BINA_MARGA',
  category: 'STRUKTUR',
  version: '2026.1',
  year: 2026,
  sourceDocument: 'Spesifikasi Umum Bina Marga 2026',
  laborComponents: [
    { id: 'l4', type: 'labor', itemCode: 'L.01', itemName: 'Pekerja', unit: 'OH', coefficient: 0.007 },
    { id: 'l5', type: 'labor', itemCode: 'L.02', itemName: 'Tukang Besi', unit: 'OH', coefficient: 0.007 },
  ],
  materialComponents: [
    { id: 'm4', type: 'material', itemCode: 'M.04', itemName: 'Besi Beton Ulir BJTS 420B', unit: 'kg', coefficient: 1.05 },
    { id: 'm5', type: 'material', itemCode: 'M.05', itemName: 'Kawat Beton', unit: 'kg', coefficient: 0.015 },
  ],
  equipmentComponents: [],
  totalLaborCoefficient: 0.014,
  totalMaterialCoefficient: 1.065,
  totalEquipmentCoefficient: 0,
  provenance: {
    sourceDocument: 'SE DJBK 2026',
    version: '2026.1',
    verificationStatus: 'VERIFIED',
    effectiveDate: '2026-01-15',
  },
} as AHSPDefinition);

// ── 3. FORMWORK: Bekisting Struktur (per m²) ─────────────────────────
// Code: BINA_MARGA_3.3.(1) — Bina Marga domain
// Source: SE DJBK 2026
WEIR_AHSP_DATABASE.set('BINA_MARGA_3.3.(1)', {
  id: 'AHSP_FORMWORK_STRUKTUR',
  code: 'BINA_MARGA_3.3.(1)',
  codeNormalized: '3.3.(1)',
  name: 'Acuan Bekisting Struktur Masif / Permukaan',
  unit: 'm²',
  domain: 'BINA_MARGA',
  category: 'STRUKTUR',
  version: '2026.1',
  year: 2026,
  sourceDocument: 'SE DJBK 2026',
  laborComponents: [
    { id: 'l6', type: 'labor', itemCode: 'L.01', itemName: 'Pekerja', unit: 'OH', coefficient: 0.26 },
    { id: 'l7', type: 'labor', itemCode: 'L.02', itemName: 'Tukang Kayu', unit: 'OH', coefficient: 0.26 },
  ],
  materialComponents: [
    { id: 'm6', type: 'material', itemCode: 'M.06', itemName: 'Kayu Papan Bekisting', unit: 'm³', coefficient: 0.025 },
    { id: 'm7', type: 'material', itemCode: 'M.07', itemName: 'Paku 5-10 cm', unit: 'kg', coefficient: 0.30 },
  ],
  equipmentComponents: [],
  totalLaborCoefficient: 0.52,
  totalMaterialCoefficient: 0.325,
  totalEquipmentCoefficient: 0,
  provenance: {
    sourceDocument: 'SE DJBK 2026',
    version: '2026.1',
    verificationStatus: 'VERIFIED',
    effectiveDate: '2026-01-15',
  },
});

// ── 4. JOINT: Sambungan Dilatasi (per m) ────────────────────────────────
// Code: SDA_JOINT_01 — SDA domain
// Source: KP-02
WEIR_AHSP_DATABASE.set('SDA_JOINT_01', {
  id: 'AHSP_JOINT_DILATASI',
  code: 'SDA_JOINT_01',
  codeNormalized: 'SDA_JOINT_01',
  name: 'Sambungan Dilatasi Bendung',
  unit: 'm',
  domain: 'SUMBER_DAYA_AIR',
  category: 'SAMBUNGAN',
  version: '2026.1',
  year: 2026,
  sourceDocument: 'KP-02',
  laborComponents: [
    { id: 'l8', type: 'labor', itemCode: 'L.01', itemName: 'Pekerja', unit: 'OH', coefficient: 0.15 },
    { id: 'l9', type: 'labor', itemCode: 'L.02', itemName: 'Tukang', unit: 'OH', coefficient: 0.15 },
  ],
  materialComponents: [
    { id: 'm8', type: 'material', itemCode: 'M.08', itemName: 'Joint Filler Sambungan', unit: 'm', coefficient: 1.05 },
  ],
  equipmentComponents: [],
  totalLaborCoefficient: 0.3,
  totalMaterialCoefficient: 1.05,
  totalEquipmentCoefficient: 0,
  provenance: {
    sourceDocument: 'KP-02',
    version: '2026.1',
    verificationStatus: 'VERIFIED',
    effectiveDate: '2026-01-15',
  },
} as AHSPDefinition);

// ── 5. WATERSTOP: PVC 200mm (per m) ──────────────────────────────────
// Code: SDA_WATERSTOP_01 — SDA domain
// Source: KP-02
WEIR_AHSP_DATABASE.set('SDA_WATERSTOP_01', {
  id: 'AHSP_WATERSTOP_PVC',
  code: 'SDA_WATERSTOP_01',
  codeNormalized: 'SDA_WATERSTOP_01',
  name: 'Pemasangan Waterstop PVC 200 mm',
  unit: 'm',
  domain: 'SUMBER_DAYA_AIR',
  category: 'WATERPROOFING',
  version: '2026.1',
  year: 2026,
  sourceDocument: 'KP-02',
  laborComponents: [
    { id: 'l10', type: 'labor', itemCode: 'L.01', itemName: 'Pekerja', unit: 'OH', coefficient: 0.20 },
    { id: 'l11', type: 'labor', itemCode: 'L.02', itemName: 'Tukang', unit: 'OH', coefficient: 0.20 },
  ],
  materialComponents: [
    { id: 'm9', type: 'material', itemCode: 'M.09', itemName: 'Waterstop PVC 200mm', unit: 'm', coefficient: 1.05 },
  ],
  equipmentComponents: [],
  totalLaborCoefficient: 0.4,
  totalMaterialCoefficient: 1.05,
  totalEquipmentCoefficient: 0,
  provenance: {
    sourceDocument: 'KP-02',
    version: '2026.1',
    verificationStatus: 'VERIFIED',
    effectiveDate: '2026-01-15',
  },
});

/**
 * Lookup AHSP definition by exact code.
 * No fuzzy matching. Returns undefined if not found.
 */
export function lookupWeirAhsp(code: string): AHSPDefinition | undefined {
  return WEIR_AHSP_DATABASE.get(code);
}