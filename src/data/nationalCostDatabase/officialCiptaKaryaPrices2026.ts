/**
 * DAFTAR HARGA SATUAN UPAH, BAHAN, DAN PERALATAN 2026
 * Sourced directly from SE Bina Konstruksi No. 47/SE/Dk/2026 Cipta Karya Workbook
 * Generated from Sheet Upah Bahan
 * Formula clauses: see AHSP_2026_CIPTA_KARYA_FORMULA_CLAUSES.md
 */

export interface CiptaKaryaPriceEntry {
  code: string;
  name: string;
  unit: string;
  price: number;
}


import { LABOR } from './ckPriceChunks/labor';
import { EQUIPMENT } from './ckPriceChunks/equipment';
import { MATERIALS_00 } from './ckPriceChunks/materials00';
import { MATERIALS_01 } from './ckPriceChunks/materials01';
import { MATERIALS_02 } from './ckPriceChunks/materials02';
import { MATERIALS_03 } from './ckPriceChunks/materials03';

export const OFFICIAL_CK_2026_LABOR: CiptaKaryaPriceEntry[] = LABOR;
export const OFFICIAL_CK_2026_MATERIALS: CiptaKaryaPriceEntry[] = [
  ...MATERIALS_00, ...MATERIALS_01, ...MATERIALS_02, ...MATERIALS_03,
];
export const OFFICIAL_CK_2026_EQUIPMENT: CiptaKaryaPriceEntry[] = EQUIPMENT;

export const CK_2026_TOTAL_LABOR_COUNT = OFFICIAL_CK_2026_LABOR.length;
export const CK_2026_TOTAL_MATERIAL_COUNT = OFFICIAL_CK_2026_MATERIALS.length;
export const CK_2026_TOTAL_EQUIPMENT_COUNT = OFFICIAL_CK_2026_EQUIPMENT.length;
