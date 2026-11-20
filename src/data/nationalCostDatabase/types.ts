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
  /** Kode resmi SE DJBK (mis. "2.1.(1)" untuk Bina Marga) — dibawa agar pencarian kode resmi menemukan itemnya (F-08). */
  standardCode?: string;
  name: string;                  // e.g. "1 m2 Pembersihan dan pengupasan permukaan tanah (striping)..."
  unit: string;                  // e.g. "m2", "m3", "m'", "buah", "ls", "kg", "unit", "jam"
  /** Unit exactly as printed in the source, before unit normalization (§13). */
  unitRaw?: string;
  /**
   * Satuan TAMPIL Bina Marga (D-55, dipersempit 2026-11-14): hasil
   * `resolveBinaMargaUnit` — satuan kanonis bila unit master adalah
   * fragmen deskripsi, verbatim bila sudah valid, "—" bila tanpa
   * padanan. Hanya diisi pada item BINA_MARGA dari masterRegistry.
   * DISPLAY ONLY: tidak ada jalur resolusi harga yang boleh membaca
   * field ini — resolusi memakai `unit` (verbatim master, pra-G2).
   */
  unitDisplay?: string;
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
  /** Null = belum dapat dihitung karena ada harga komponen yang hilang. Bukan 0. */
  totalLabor: number | null;
  totalMaterial: number | null;
  totalEquipment: number | null;
  /** Null = harga item belum tersedia (PRICE_MISSING). Bukan 0. */
  unitPrice: number | null;
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

/**
 * MASTER PRICING §8 — one field-level change inside a revised AHSP item.
 *
 * `path` locates the change deterministically, e.g. `name`, `unit`,
 * `unitPrice`, `laborComponents[1].code`, `materialComponents[0].coefficient`.
 * Component positions are SOURCE-side indices (the diff matches components
 * by stable id when both sides carry one, else by position within the
 * same array — see compareAhspSnapshots in ahspVersioning.ts).
 */
export interface AhspItemFieldChange {
  path: string;
  /** Short field name (the last segment of `path`). */
  field: string;
  oldValue: unknown;
  newValue: unknown;
}

/** Field-level diff for one item present in both versions with differences. */
export interface AhspItemFieldDiff {
  id: string;
  code: string;
  name: string;
  /** Sorted by `path` (deterministic). */
  changes: AhspItemFieldChange[];
}

/** Deterministic count summary of a version diff. */
export interface AhspVersionDiffSummary {
  added: number;
  removed: number;
  revised: number;
  unchanged: number;
  totalSource: number;
  totalTarget: number;
  /** Total field-level changes across all revised items. */
  fieldChanges: number;
  /** Added + removed components + component field changes across revised items. */
  componentChanges: number;
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
    /** Baked item unitPrice (null = no baked price — NOT Rp0). */
    oldPrice: number | null;
    /** Baked item unitPrice (null = no baked price — NOT Rp0). */
    newPrice: number | null;
    diffNote: string;
  }[];
  /**
   * MASTER PRICING §8 — field-level diff per revised item (added by §8;
   * the pre-§8 stub returned empty removed/revised arrays and no field
   * detail at all). Sorted by (code, id); changes sorted by path.
   */
  fieldDiffs: AhspItemFieldDiff[];
  /** MASTER PRICING §8 — deterministic count summary. */
  summary: AhspVersionDiffSummary;
}

/**
 * FROZEN FIRST BASELINE id of the EZRAB AHSP database (== AHSP_BASELINE_VERSION_ID,
 * ahspVersioning.ts; Master Pricing §3 I-11, §8). `2026.1` labels the runtime
 * catalog as generated 2026-10-20 — it is NOT the current version of the
 * database: families advance INDEPENDENTLY (per-domain versions in
 * ACTIVE_AHSP_VERSIONS, ahspVersionPointer.generated.ts — CK/SDA are at
 * 2026.2 while BM/SMKK remain at 2026.1), so no single value can ever be
 * "the" current AHSP version. Do NOT bump this constant to track a
 * publication: it is (a) the baseline-extract guard in
 * scripts/ahsp2026/buildAhspVersionSnapshots.ts, (b) the legacy fallback
 * for snapshots/projects written before §3 without a pin (Decision D —
 * historical projects are never silently re-pointed), and (c) the stamp
 * on new project snapshots (pinned by masterPricing tests). For the
 * version a family is CURRENTLY at, read ACTIVE_AHSP_VERSIONS.
 */
export const AHSP_DATABASE_VERSION = '2026.1';

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
  /** Null = harga item belum tersedia (PRICE_MISSING). Bukan 0. */
  unitPrice: number | null;
  snapshotTimestamp: string;
  /**
   * MASTER PRICING §3 (I-11) — source versions this snapshot was frozen
   * against. A snapshot freezes VALUES; these fields record WHICH database
   * versions produced them, so §10.2 explicit adoption can distinguish
   * "adopt newer prices" from "manual price edit". Optional: snapshots
   * written before §3 have no version stamp and are read as the pre-§3
   * baseline (pricingMode absent ⇒ SNAPSHOT_PRICE — Decision D).
   */
  ahspDatabaseVersion?: string;
  masterPriceVersion?: string;
  /** Pricing mode in force when the snapshot was taken (model only — §10 behaviour is not implemented in §3). */
  pricingMode?: import('../../data/priceDatabase2026/types').ProjectPricingMode;
}
