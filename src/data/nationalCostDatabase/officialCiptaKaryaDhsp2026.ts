/**
 * OFFICIAL CIPTA KARYA DHSP 2026 (DAFTAR HARGA SATUAN PEKERJAAN)
 * Sourced directly from SE DJBK No. 47/SE/Dk/2026 (Workbook: ahsp bina kontruksi 2026.xlsx)
 * Evaluated from sheet 'Daftar Harga Satuan Pekerjaan' with formula traceability
 * Formula clauses: see AHSP_2026_CIPTA_KARYA_FORMULA_CLAUSES.md
 */

export interface OfficialCiptaKaryaDhspEntry {
  code: string;
  rawCode: string;
  name: string;
  unit: string;
  unitPrice: number | null;
  isLeaf: boolean;
  sourceSheet: string;
  sourceRow: number;
  formulaRaw?: string | null;
  notes?: string | null;
}

import { CHUNK_00 } from './ckDhspChunks/chunk00';
import { CHUNK_01 } from './ckDhspChunks/chunk01';
import { CHUNK_02 } from './ckDhspChunks/chunk02';
import { CHUNK_03 } from './ckDhspChunks/chunk03';
import { CHUNK_04 } from './ckDhspChunks/chunk04';
import { CHUNK_05 } from './ckDhspChunks/chunk05';
import { CHUNK_06 } from './ckDhspChunks/chunk06';
import { CHUNK_07 } from './ckDhspChunks/chunk07';
import { CHUNK_08 } from './ckDhspChunks/chunk08';
import { CHUNK_09 } from './ckDhspChunks/chunk09';
import { CHUNK_10 } from './ckDhspChunks/chunk10';
import { CHUNK_11 } from './ckDhspChunks/chunk11';
import { CHUNK_12 } from './ckDhspChunks/chunk12';
import { CHUNK_13 } from './ckDhspChunks/chunk13';
import { CHUNK_14 } from './ckDhspChunks/chunk14';

export const OFFICIAL_CK_2026_DHSP_LIST: OfficialCiptaKaryaDhspEntry[] = [
  ...CHUNK_00,
  ...CHUNK_01,
  ...CHUNK_02,
  ...CHUNK_03,
  ...CHUNK_04,
  ...CHUNK_05,
  ...CHUNK_06,
  ...CHUNK_07,
  ...CHUNK_08,
  ...CHUNK_09,
  ...CHUNK_10,
  ...CHUNK_11,
  ...CHUNK_12,
  ...CHUNK_13,
  ...CHUNK_14,
];
export const OFFICIAL_CK_2026_DHSP_MAP = new Map<string, OfficialCiptaKaryaDhspEntry>(
  OFFICIAL_CK_2026_DHSP_LIST.map((e) => [e.code, e] as [string, OfficialCiptaKaryaDhspEntry]),
);
export const CK_2026_DHSP_TOTAL_COUNT = OFFICIAL_CK_2026_DHSP_LIST.length;
export const CK_2026_DHSP_LEAF_COUNT = OFFICIAL_CK_2026_DHSP_LIST.filter((e) => e.isLeaf).length;
