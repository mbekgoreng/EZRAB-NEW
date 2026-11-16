/**
 * MASTER PRICING §4.3 — PRICE PROVENANCE LABELS (pure mapping, D2).
 * ================================================================
 *
 * The master prompt §4.3 names SEVEN provenance labels. D2 maps them
 * onto the enums that ALREADY EXIST — no third enum is created:
 *   OFFICIAL AHSP / OFFICIAL VERIFIED → VERIFIED + OFFICIAL_GOVERNMENT
 *   MARKET REFERENCE → COMMERCIAL_REFERENCE (+ market label)
 *   MANUAL → PRICE_MANUAL
 *   ASSUMPTION → the assumption path (never a master price)
 *   PRICE UNAVAILABLE → null + PRICE_UNRESOLVED
 *   NEEDS VERIFICATION → NEEDS_REVIEW
 *
 * The `MasterProvenanceLabel` union below is the §4.3 INPUT vocabulary
 * (the labels the master prompt names), not a persisted enum: every
 * label maps to { verificationStatus, sourceTier, priceStatus } from
 * the existing enums, and `labelForRecord` derives the label back from
 * a record's existing fields. The mapping is total in both directions
 * for records (every record maps to exactly one label; every label
 * maps to existing enum values).
 *
 * Two guards are load-bearing:
 *   1. A market reference must NEVER be mislabeled as official
 *      (MARKET_REFERENCE never yields VERIFIED or OFFICIAL_GOVERNMENT).
 *   2. An assumption must NEVER become a master price
 *      (mayBecomeMasterPrice is false for ASSUMPTION — and for MANUAL,
 *      PRICE_UNAVAILABLE, and NEEDS_VERIFICATION).
 *
 * Note on the assumption layer's PriceSourceKind (OFFICIAL_AHSP /
 * MARKET_REFERENCE / EZRAB_ASSUMPTION / UNRESOLVED): that is the
 * RAB-item-level vocabulary of src/engine/pricing/assumption/types.ts.
 * It is compatible with these labels (same words for the same states)
 * but lives at a different layer; this module does not replace it and
 * does not add a third persisted enum.
 */
import type {
  PriceSourceTier,
  PriceVerificationStatus,
  ResourcePriceRecord,
} from '../../../data/priceDatabase2026/types';
import type { PriceStatus } from '../../../types';

/** The seven §4.3 provenance labels (master-prompt vocabulary). */
export type MasterProvenanceLabel =
  | 'OFFICIAL_AHSP'
  | 'OFFICIAL_VERIFIED'
  | 'MARKET_REFERENCE'
  | 'MANUAL'
  | 'ASSUMPTION'
  | 'PRICE_UNAVAILABLE'
  | 'NEEDS_VERIFICATION';

export const MASTER_PROVENANCE_LABELS: readonly MasterProvenanceLabel[] = [
  'OFFICIAL_AHSP',
  'OFFICIAL_VERIFIED',
  'MARKET_REFERENCE',
  'MANUAL',
  'ASSUMPTION',
  'PRICE_UNAVAILABLE',
  'NEEDS_VERIFICATION',
];

/**
 * Direct AHSP price sources (the resolver reads them directly, not via
 * priceMaster). A VERIFIED record from one of these is OFFICIAL_AHSP;
 * a VERIFIED record from another OFFICIAL_GOVERNMENT source (e.g. HSD
 * SE 12/SE/Db/2026) is OFFICIAL_VERIFIED. The distinction is the
 * source dataset, not the tier — both are official government.
 */
export const AHSP_DIRECT_SOURCE_KEYS: readonly string[] = ['CK_HSD_2026', 'BM_HSD_2026'];

export interface ProvenanceMapping {
  label: MasterProvenanceLabel;
  /** Existing enum, or null when the label asserts no verification status. */
  verificationStatus: PriceVerificationStatus | null;
  /** Existing enum, or null when the label asserts no source tier. */
  sourceTier: PriceSourceTier | null;
  /**
   * Existing enum, or null when the label asserts no price status —
   * the status is then derived from the VALUE via resolvePriceStatus
   * (NEEDS_VERIFICATION: a priced-but-unverified record still resolves;
   * an unpriced one is PRICE_UNRESOLVED).
   */
  priceStatus: PriceStatus | null;
  /** Whether a record carrying this label may enter the master price DB. */
  mayBecomeMasterPrice: boolean;
  explanation: string;
}

/** D2 mapping table — the single source of truth for §4.3. */
export const PROVENANCE_LABEL_MAPPING: Record<MasterProvenanceLabel, ProvenanceMapping> = {
  OFFICIAL_AHSP: {
    label: 'OFFICIAL_AHSP',
    verificationStatus: 'VERIFIED',
    sourceTier: 'OFFICIAL_GOVERNMENT',
    priceStatus: 'PRICE_RESOLVED',
    mayBecomeMasterPrice: true,
    explanation: 'Harga resmi dari sumber AHSP (SE DJBK 47/2026) — terverifikasi, tier pemerintah.',
  },
  OFFICIAL_VERIFIED: {
    label: 'OFFICIAL_VERIFIED',
    verificationStatus: 'VERIFIED',
    sourceTier: 'OFFICIAL_GOVERNMENT',
    priceStatus: 'PRICE_RESOLVED',
    mayBecomeMasterPrice: true,
    explanation: 'Harga resmi terverifikasi dari sumber pemerintah non-AHSP (mis. HSD SE 12/SE/Db/2026).',
  },
  MARKET_REFERENCE: {
    label: 'MARKET_REFERENCE',
    verificationStatus: 'SOURCE_REPORTED',
    sourceTier: 'COMMERCIAL_REFERENCE',
    priceStatus: 'PRICE_RESOLVED',
    mayBecomeMasterPrice: true,
    explanation:
      'Referensi harga pasar/komersial — boleh menjadi record master, tetapi TIDAK PERNAH berlabel resmi (bukan VERIFIED, bukan OFFICIAL_GOVERNMENT).',
  },
  MANUAL: {
    label: 'MANUAL',
    verificationStatus: 'SOURCE_REPORTED',
    sourceTier: null,
    priceStatus: 'PRICE_MANUAL',
    mayBecomeMasterPrice: false,
    explanation:
      'Harga manual yang dimasukkan pengguna untuk sebuah proyek — berlabel PRICE_MANUAL; tidak menjadi harga master global tanpa verifikasi admin.',
  },
  ASSUMPTION: {
    label: 'ASSUMPTION',
    verificationStatus: null,
    sourceTier: null,
    priceStatus: 'PRICE_ESTIMATED',
    mayBecomeMasterPrice: false,
    explanation:
      'Asumsi harga — mengikuti jalur asumsi (assumptionStore + approval), TIDAK PERNAH menjadi harga master.',
  },
  PRICE_UNAVAILABLE: {
    label: 'PRICE_UNAVAILABLE',
    verificationStatus: null,
    sourceTier: null,
    priceStatus: 'PRICE_UNRESOLVED',
    mayBecomeMasterPrice: false,
    explanation: 'Tidak ada harga — nilai null + PRICE_UNRESOLVED, tidak pernah Rp0.',
  },
  NEEDS_VERIFICATION: {
    label: 'NEEDS_VERIFICATION',
    verificationStatus: 'NEEDS_REVIEW',
    sourceTier: null,
    priceStatus: null,
    mayBecomeMasterPrice: false,
    explanation:
      'Provenance belum lengkap — NEEDS_REVIEW. Status harga mengikuti NILAI (terisi = resolved, kosong = unresolved), bukan labelnya.',
  },
};

/** Map one §4.3 label to the existing enums. Throws on an unknown label (fail-closed). */
export function mapProvenanceLabel(label: string): ProvenanceMapping {
  const mapping = (PROVENANCE_LABEL_MAPPING as Record<string, ProvenanceMapping | undefined>)[label];
  if (!mapping) throw new Error(`Unknown §4.3 provenance label: ${JSON.stringify(label)}`);
  return mapping;
}

/**
 * Validate the whole mapping table. Returns error strings (empty =
 * valid). Guards: market never official; assumption never master;
 * unavailable never resolved; exactly the seven labels; every label
 * maps to existing enum values only.
 */
export function validateProvenanceMappings(): string[] {
  const errors: string[] = [];
  const labels = Object.keys(PROVENANCE_LABEL_MAPPING);
  if (labels.length !== MASTER_PROVENANCE_LABELS.length) {
    errors.push(`Expected ${MASTER_PROVENANCE_LABELS.length} labels, found ${labels.length}`);
  }
  for (const label of MASTER_PROVENANCE_LABELS) {
    if (!PROVENANCE_LABEL_MAPPING[label]) errors.push(`Missing mapping for ${label}`);
  }
  const market = PROVENANCE_LABEL_MAPPING.MARKET_REFERENCE;
  if (market.verificationStatus === 'VERIFIED') {
    errors.push('MARKET_REFERENCE must never map to VERIFIED');
  }
  if (market.sourceTier === 'OFFICIAL_GOVERNMENT') {
    errors.push('MARKET_REFERENCE must never map to OFFICIAL_GOVERNMENT');
  }
  for (const label of ['ASSUMPTION', 'MANUAL', 'PRICE_UNAVAILABLE', 'NEEDS_VERIFICATION'] as const) {
    if (PROVENANCE_LABEL_MAPPING[label].mayBecomeMasterPrice) {
      errors.push(`${label} must never become a master price`);
    }
  }
  if (PROVENANCE_LABEL_MAPPING.PRICE_UNAVAILABLE.priceStatus !== 'PRICE_UNRESOLVED') {
    errors.push('PRICE_UNAVAILABLE must map to PRICE_UNRESOLVED');
  }
  if (PROVENANCE_LABEL_MAPPING.ASSUMPTION.priceStatus !== 'PRICE_ESTIMATED') {
    errors.push('ASSUMPTION must map to PRICE_ESTIMATED');
  }
  if (PROVENANCE_LABEL_MAPPING.MANUAL.priceStatus !== 'PRICE_MANUAL') {
    errors.push('MANUAL must map to PRICE_MANUAL');
  }
  if (PROVENANCE_LABEL_MAPPING.NEEDS_VERIFICATION.verificationStatus !== 'NEEDS_REVIEW') {
    errors.push('NEEDS_VERIFICATION must map to NEEDS_REVIEW');
  }
  return errors;
}

/** The label for a missing price — the null case has no record to derive from. */
export function labelForMissingPrice(): MasterProvenanceLabel {
  return 'PRICE_UNAVAILABLE';
}

export interface LabelForRecordOptions {
  /** RAB-item price status, when the caller knows it (MANUAL is item-level context, not record-intrinsic). */
  priceStatus?: PriceStatus | null;
  /** Explicit assumption flag — assumptions never live on price records, so this is caller-supplied context only. */
  isAssumption?: boolean;
}

/**
 * Derive the §4.3 label for one price record from its EXISTING fields.
 * Total: every record maps to exactly one label.
 *   1. Caller context first: ASSUMPTION / MANUAL are contextual labels.
 *   2. VERIFIED + AHSP direct source → OFFICIAL_AHSP.
 *   3. VERIFIED + COMMERCIAL_REFERENCE tier → MARKET_REFERENCE
 *      (the market-never-official guard wins over VERIFIED).
 *   4. VERIFIED → OFFICIAL_VERIFIED. The enum itself defines VERIFIED
 *      as "backed by a named official/authoritative document" — the 7
 *      VERIFIED labor records cite SE DJBK 12/2026 & Permen PUPR
 *      1/2022. The tier is a separate axis (source-dataset authority),
 *      not a veto on the record's verified-official status.
 *   5. COMMERCIAL_REFERENCE tier → MARKET_REFERENCE.
 *   6. Everything else (NEEDS_REVIEW, SOURCE_REPORTED non-commercial, …)
 *      → NEEDS_VERIFICATION: not verified, not market, not manual —
 *      it still needs verification.
 * A record can never yield PRICE_UNAVAILABLE (records always carry a
 * price; the unavailable state is the ABSENCE of a record — see
 * labelForMissingPrice).
 *
 * FORWARD/REVERSE ASYMMETRY (documented, intentional): the FORWARD
 * mapping (label → enums, PROVENANCE_LABEL_MAPPING) is strict per D2 —
 * asserting OFFICIAL_VERIFIED requires OFFICIAL_GOVERNMENT. The
 * REVERSE mapping here is descriptive: a VERIFIED record is DESCRIBED
 * as OFFICIAL_VERIFIED whatever its tier, because VERIFIED already
 * means "backed by a named official/authoritative document". The
 * round-trip is lossy in this one direction (the tier is not recovered
 * from the label) — and nothing here ever CHANGES a record's tier.
 */
export function labelForRecord(
  record: ResourcePriceRecord,
  opts: LabelForRecordOptions = {},
): MasterProvenanceLabel {
  if (opts.isAssumption === true) return 'ASSUMPTION';
  if (opts.priceStatus === 'PRICE_MANUAL') return 'MANUAL';
  if (record.verificationStatus === 'VERIFIED') {
    if (AHSP_DIRECT_SOURCE_KEYS.includes(record.sourceKey)) return 'OFFICIAL_AHSP';
    if (record.sourceTier === 'COMMERCIAL_REFERENCE') return 'MARKET_REFERENCE';
    return 'OFFICIAL_VERIFIED';
  }
  if (record.sourceTier === 'COMMERCIAL_REFERENCE') return 'MARKET_REFERENCE';
  return 'NEEDS_VERIFICATION';
}
