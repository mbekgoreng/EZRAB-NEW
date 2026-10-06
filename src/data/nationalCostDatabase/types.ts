import { AHSPComponent } from '../../types';

/**
 * EZRAB AHSP DOMAIN TYPES
 * =======================
 *
 * Aligned with SE DJBK No. 47/SE/Dk/2026, which has SEVEN annexes:
 *   I   — Teknis pengumpulan data harga pokok          (not an AHSP catalog)
 *   II  — Acuan dalam Penyusunan AHSP                  (NOT Bina Marga)
 *   III — Biaya Penerapan SMKK                         (AHSP-bearing)
 *   IV  — AHSP Bidang Sumber Daya Air                  (AHSP-bearing)
 *   V   — AHSP Bidang Bina Marga                       (AHSP-bearing)
 *   VI  — AHSP Bidang Cipta Karya                      (AHSP-bearing)
 *   VII — Tata Cara Pengajuan Usulan AHSP              (not an AHSP catalog)
 *
 * There is NO "AHSP Bidang Umum". The former 'UMUM' domain has been removed so
 * that no record can be silently categorised as Umum (purge §3 / §10).
 */

export type AHSPDomain =
  | 'SUMBER_DAYA_AIR'
  | 'BINA_MARGA'
  | 'CIPTA_KARYA'
  | 'SMKK'
  | 'CUSTOM';

/** The four AHSP-bearing annexes of SE DJBK No. 47/SE/Dk/2026. */
export type AHSPAttachment = 'III' | 'IV' | 'V' | 'VI';

/**
 * Normative status as printed in the source. 'UNSPECIFIED' means the source
 * does not carry the marker — it is NOT a synonym for "Informatif" and must
 * never be resolved to a concrete status by guessing.
 */
export type AHSPNormativeStatus = 'Normatif' | 'Informatif' | 'Custom' | 'UNSPECIFIED';

/** Work method as printed in the source. 'UNSPECIFIED' = not present in source. */
export type AHSPMethod = 'Manual' | 'Semi-Mekanis' | 'Mekanis' | 'Fabrikasi' | 'UNSPECIFIED';

export type AHSPVerificationStatus =
  | 'VERIFIED'
  | 'UNVERIFIED'
  | 'REVIEW'
  | 'ACTIVE'
  | 'DEPRECATED'
  | 'NEEDS_REVIEW'
  | 'SOURCE_DEFECT';

export interface AHSPSourceMetadata {
  sourceId: string;
  institution: string;
  directorate: string;
  documentName: string;
  documentNumber: string;
  documentYear: number;
  version: string;
  effectiveDate: string;
  status: AHSPVerificationStatus;
  sourceUrl?: string;
  description: string;
}

/** Per-item provenance. Attachment is the annex number, e.g. "V" for Bina Marga. */
export interface AHSPItemProvenance {
  regulation: string;
  attachment: AHSPAttachment;
  page: number | null;
  sourceFile: string;
}

export interface AHSPValidationFlags {
  code: boolean;
  description: boolean;
  unit: boolean;
  components: boolean;
  coefficients: boolean;
  source: boolean;
}

export interface NationalAHSPItem {
  id: string;
  code: string;                  // e.g. "A.1.01.a.1" or "A.3.08.3.1.a" — "" when the source prints none
  codeNormalized: string;        // Clean stripped code for exact matching
  name: string;                  // e.g. "1 m2 Pembersihan dan pengupasan permukaan tanah (striping)..."
  unit: string;                  // e.g. "m2", "m3", "m'", "buah", "ls", "kg", "unit", "jam"
  /** Unit exactly as printed in the source, before unit normalization (§13). */
  unitRaw?: string;
  domain: AHSPDomain;
  subDomain?: string;            // e.g. "Pekerjaan Tanah", "Bendung", "Irigasi", "Aspal"
  category: string;              // e.g. "PEKERJAAN TANAH", "DIVISI 5 - ..."
  subCategory?: string;
  version: string;               // e.g. "2026", "2024", "2022"
  year: number;
  normativeStatus: AHSPNormativeStatus;
  method: AHSPMethod;
  sourceId: string;              // References AHSPSourceMetadata
  sourceDocument: string;        // e.g. "Lampiran V SE DJBK No. 47/SE/Dk/2026"
  sourcePage?: number;           // Page number in official source document
  status: AHSPVerificationStatus;
  laborComponents: AHSPComponent[];
  materialComponents: AHSPComponent[];
  equipmentComponents: AHSPComponent[];
  totalLabor: number;
  totalMaterial: number;
  totalEquipment: number;
  unitPrice: number;
  lastUpdated: string;
  dataQualityScore: number;      // 0 to 100

  // ---- Canonical (AHSP 2026) provenance & validation extensions ----
  /** Full source provenance. Present on every canonical record. */
  provenance?: AHSPItemProvenance;
  /** Pipeline validation status (mirrors `status` for canonical records). */
  validationStatus?: 'VERIFIED' | 'NEEDS_REVIEW' | 'SOURCE_DEFECT';
  /** Machine-readable validation issues carried from the pipeline. */
  validationIssues?: string[];
  /** Per-field verification flags. */
  validationFlags?: AHSPValidationFlags;
  /** Division label from the source index (e.g. "DIVISI 9"). */
  division?: string;
  /** Subdivision label from the source index. */
  subdivision?: string;
  /**
   * Deterministic coefficient readability assessment:
   *   OK         — every coefficient printed with usable precision
   *   DEGRADED   — some coefficients are tiny (<0.001)
   *   UNREADABLE — no components, or a coefficient is 0 / non-finite
   */
  coefficientReadability?: 'OK' | 'DEGRADED' | 'UNREADABLE';
  /** Free-form pipeline notes (the source may carry several). */
  notes?: string[];
}

/** SMKK cost-component master row (Lampiran III). */
export interface SMKKMasterItem {
  id: string;
  code: string;
  name: string;
  category: 'DOKUMEN_K3' | 'APD_PERSONAL' | 'APK_KOMUNAL' | 'PERSONIL_K3' | 'FASILITAS_KESEHATAN' | 'SOSIALISASI_PELATIHAN';
  unit: string;
  unitPrice: number;
  mandatory: boolean;
  regulationReference: string;
  specification: string;
}

/** Canonical resource master row (derived from every AHSP component). */
export interface CanonicalResource {
  resource_id: string;
  code: string;
  name: string;
  type: 'labor' | 'material' | 'equipment';
  unit: string;
  category: string;
  source_ahsp_codes: string[];
  duplicate_status: 'unique' | 'possible_duplicate' | 'exact_duplicate' | 'conflict';
}

export interface AHSPVersionDiff {
  sourceVersion: string;
  targetVersion: string;
  domain: AHSPDomain;
  addedCodes: NationalAHSPItem[];
  removedCodes: { code: string; name: string; reason: string }[];
  revisedCodes: {
    code: string;
    name: string;
    oldPrice: number;
    newPrice: number;
    diffNote: string;
  }[];
}

export interface AHSPProjectSnapshot {
  ahspId: string;
  code: string;
  version: string;
  sourceDocument: string;
  name: string;
  unit: string;
  laborComponents: AHSPComponent[];
  materialComponents: AHSPComponent[];
  equipmentComponents: AHSPComponent[];
  unitPrice: number;
  snapshotTimestamp: string;
}
