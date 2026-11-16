/**
 * MASTER PRICING §11 — UI LOGIC (pure, deterministic, no React).
 * ============================================================
 *
 * View-models + derivation rules for the §11 admin UI. Every function
 * here is pure: same input → same output, no storage, no network, no
 * mutation. React components import these helpers; the §11 test suite
 * (`src/test/masterPricingProjectUi.test.ts`) pins them.
 *
 * What this module does NOT do:
 * - It never resolves a price itself — resolution stays with
 *   `priceResolver2026` (§6) and the §9 impact calculator. Callers pass
 *   resolved values in.
 * - It never authorizes anything new — the admin gate view-model is a
 *   thin localized read over §4 `authorizeMasterPriceOperation`, the
 *   ONLY gate. Server-side / RLS enforcement is BLOCKED (§4.1):
 *   `SERVER_ENFORCEMENT_STATUS === 'BLOCKED'`, so in this frontend-only
 *   environment every global write is DENIED and the UI must show the
 *   action as unavailable with the honest reason, never hide it and
 *   never fake access.
 * - It never invents a number. A missing price stays null and formats
 *   as '—', never Rp0. A NOT_COMPUTED / STALE preview yields a dialog
 *   whose confirm is blocked, never a generic "Are you sure?".
 */

import {
  AHSP_BASELINE_VERSION_ID,
  AHSP_FAMILIES,
  AHSP_FAMILY_DOMAINS,
  computeAhspContentChecksum,
  getActiveVersion,
  getVersionRecord,
  listVersions,
  type AhspFamily,
  type AhspVersionRecord,
  type AhspVersionRegistryState,
} from '../../../data/nationalCostDatabase/ahspVersioning';
import type {
  AHSPDomain,
  AHSPVersionDiff,
  AhspItemFieldDiff,
  NationalAHSPItem,
} from '../../../data/nationalCostDatabase/types';
import type {
  AhspComponentPricing,
  AhspUnitPriceComposition,
  PriceLocation,
  PriceVerificationStatus,
  ProjectPricingMode,
  ResourcePriceRecord,
} from '../../../data/priceDatabase2026/types';
import { isValidProjectPricingMode, MASTER_PRICE_VERSION } from '../../../data/priceDatabase2026/types';
import { SafeDecimalEngine } from '../../safeDecimalEngine';
import type {
  AHSPComponent,
  EstimateVersion,
  Project,
  ProjectCostSummary,
  ProjectPriceOverride,
  RabItem,
} from '../../../types';
import {
  priceChangeKey,
  type FamilyImpactSummary,
  type AhspItemImpact,
  type ImpactPreviewStatus,
  type IndexedComponentRef,
  type MasterPriceChangeInput,
  type MasterPriceImpactPreview,
  type ProjectImpact,
  type ProjectImpactInput,
  type ResourceComponentIndex,
} from '../impact/masterPriceImpactPreview';
import {
  ADOPTION_REASON_MIN_LENGTH,
  type AdoptionPreview,
} from '../projectPriceModes';
import {
  authorizeMasterPriceOperation,
  authorizeMasterPriceWriteVia,
  currentLocalIdentity,
  SERVER_ENFORCEMENT_STATUS,
  type AhspVersionOperation,
  type AuthorizationDenialCode,
  type GlobalWriteOperation,
  type MasterPriceIdentity,
  type MasterPriceOperation,
  type MasterPriceWritePath,
} from './masterPriceAuthorization';
import type {
  MasterPriceHistoryEntry,
  MasterPriceHistoryOperation,
} from './masterPriceHistory';
import {
  labelForRecord,
  PROVENANCE_LABEL_MAPPING,
  type MasterProvenanceLabel,
} from './provenanceLabels';

// Re-exported for UI components (MasterDatabaseView imports the label type
// from this module, the UI layer's single import surface).
export type { MasterProvenanceLabel };

// ===========================================================================
// Formatting (Indonesian UI chrome — data values pass through unchanged)
// ===========================================================================

/** Rupiah, whole rupiah, id-ID grouping. Null/undefined = '—' (never Rp0). */
export function formatRupiah(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return `Rp ${Math.round(value).toLocaleString('id-ID')}`;
}

/** Signed rupiah delta. Null = '—'. Zero = 'Rp 0' (no sign). */
export function formatRupiahDelta(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  if (value === 0) return 'Rp 0';
  const sign = value > 0 ? '+' : '−';
  return `${sign}Rp ${Math.round(Math.abs(value)).toLocaleString('id-ID')}`;
}

/** Percent change, 2 decimals, signed. Null = '—'. */
export function formatPercentChange(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

/** Coefficient with id-ID decimals (0.6 → '0,6'), up to 4 decimals. */
export function formatCoefficient(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return value.toLocaleString('id-ID', { maximumFractionDigits: 4 });
}

/** ISO timestamp → '12 Jan 2026' (id-ID). Null/invalid → '—' / raw string. */
export function formatDateId(iso: string | null | undefined): string {
  if (iso === null || iso === undefined || iso === '') return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ===========================================================================
// Admin gate view-model (§4 is the ONLY gate; enforcement BLOCKED)
// ===========================================================================

/** Honest one-line reason shown on every unavailable global action. */
export const ADMIN_GATE_UNAVAILABLE_REASON =
  'Membutuhkan global admin — penegakan server belum aktif';

export const ADMIN_GATE_ENFORCEMENT_NOTE =
  'Penegakan server belum aktif (AUTH_ENABLED=false; migrasi RLS belum diterapkan; ' +
  'tanpa tabel master/AHSP di Postgres; tanpa endpoint API harga). Gerbang ini hanya UX — ' +
  'perubahan global membutuhkan global admin terverifikasi di server.';

/** Indonesian labels for the §4 global-write operations. */
export const MASTER_PRICE_OPERATION_LABELS_ID: Record<MasterPriceOperation, string> = {
  CREATE_MASTER_ITEM: 'Tambah item master',
  EDIT_MASTER_ITEM: 'Ubah item master',
  EDIT_MASTER_PRICE: 'Ubah harga master',
  DEACTIVATE_MASTER_ITEM: 'Nonaktifkan item master',
  PUBLISH_PRICE_UPDATE: 'Terbitkan update harga',
  ROLLBACK_PRICE_CHANGE: 'Rollback perubahan harga',
  APPROVE_ALIAS: 'Setujui alias',
  APPROVE_RECONCILIATION: 'Setujui rekonsiliasi',
  CHANGE_CLASSIFICATION: 'Ubah klasifikasi',
};

/** Indonesian labels for the §12 AHSP-version write operations. */
export const AHSP_VERSION_OPERATION_LABELS_ID: Record<AhspVersionOperation, string> = {
  CLONE_AHSP_VERSION: 'Clone versi AHSP',
  PUBLISH_AHSP_VERSION: 'Terbitkan versi AHSP',
  ROLLBACK_AHSP_VERSION: 'Rollback versi AHSP',
  EDIT_AHSP_ACTIVE: 'Ubah AHSP aktif (edit langsung)',
};

/** Indonesian labels for every global write operation (master + AHSP versions). */
export const GLOBAL_WRITE_OPERATION_LABELS_ID: Record<GlobalWriteOperation, string> = {
  ...MASTER_PRICE_OPERATION_LABELS_ID,
  ...AHSP_VERSION_OPERATION_LABELS_ID,
};

const DENIAL_REASONS_ID: Record<AuthorizationDenialCode, string> = {
  DENIED_NOT_AUTHENTICATED:
    'Tidak tersedia: membutuhkan global admin — penegakan server belum aktif (belum ada identitas terverifikasi).',
  DENIED_DEMO_ROLE:
    'Tidak tersedia: peran demo (PIN) hanya tampilan — bukan otorisasi untuk mengubah harga global.',
  DENIED_NOT_GLOBAL_ADMIN:
    'Tidak tersedia: pengguna ini bukan global admin (global_admins).',
  DENIED_MALFORMED_IDENTITY: 'Tidak tersedia: identitas tidak valid.',
  DENIED_SELF_APPROVAL:
    'Tidak tersedia: penyetuju tidak boleh sama dengan pembuat.',
  DENIED_WRONG_CHANNEL:
    'Tidak tersedia: jalur ini tidak dapat mengubah harga global.',
};

export interface AdminGateViewModel {
  operation: GlobalWriteOperation;
  operationLabel: string;
  allowed: boolean;
  code: 'ALLOWED' | AuthorizationDenialCode;
  /** Indonesian, UI-facing reason. */
  reason: string;
  /** Verbatim §4 engine reason (audit). */
  engineReason: string;
  /** Always true while §4.1 is BLOCKED — the gate is UX only. */
  enforcementBlocked: boolean;
  enforcementNote: string;
}

/**
 * The admin gate view-model for one global operation. Defaults to the
 * honest local identity (anonymous while AUTH_ENABLED=false), so every
 * global write is DENIED in this environment — by design, not by bug.
 * The UI shows the denied action as unavailable with `reason`, never
 * hidden and never bypassed. No local "login as admin" toggle exists.
 *
 * MASTER PRICING §13: `via` authorizes the operation attempted
 * through a given channel (e.g. the sync engine's 'SYNC' path) —
 * the decision is the same as the direct path except
 * PROJECT_OVERRIDE, which is denied for everyone.
 */
export function adminGateForOperation(
  operation: GlobalWriteOperation,
  identity?: MasterPriceIdentity,
  via?: MasterPriceWritePath,
): AdminGateViewModel {
  const effectiveIdentity = identity ?? currentLocalIdentity();
  const decision =
    via === undefined
      ? authorizeMasterPriceOperation(effectiveIdentity, operation)
      : authorizeMasterPriceWriteVia(effectiveIdentity, operation, via);
  const reason =
    decision.code === 'ALLOWED'
      ? 'Diizinkan: global admin terverifikasi.'
      : DENIAL_REASONS_ID[decision.code];
  return {
    operation,
    operationLabel: GLOBAL_WRITE_OPERATION_LABELS_ID[operation],
    allowed: decision.allowed,
    code: decision.code,
    reason,
    engineReason: decision.reason,
    enforcementBlocked: SERVER_ENFORCEMENT_STATUS === 'BLOCKED',
    enforcementNote: ADMIN_GATE_ENFORCEMENT_NOTE,
  };
}

/**
 * The gate for one AHSP VERSION write (clone / publish / rollback /
 * direct edit). MASTER PRICING §12 — §11 BLOCKED #2 CLOSED: §4's
 * operation enum now carries the four AHSP-version operations
 * (`AhspVersionOperation`), so this gate authorizes the CORRECT
 * operation instead of reusing EDIT_MASTER_PRICE, and returns the
 * FULL view model (operation + label included). Same global-admin
 * model, same fail-closed decisions, same UX-only status (§4.1
 * BLOCKED) as every other global write.
 */
export function ahspVersionWriteGate(
  operation: AhspVersionOperation,
  identity?: MasterPriceIdentity,
): AdminGateViewModel {
  return adminGateForOperation(operation, identity);
}

// ===========================================================================
// §11.3 — AHSP component sync status (9 statuses; NEVER SYNCED unresolved)
// ===========================================================================

export type AhspComponentSyncStatus =
  | 'SYNCED'
  | 'MASTER_PRICE_UPDATED'
  | 'PRICE_UNAVAILABLE'
  | 'UNIT_MISMATCH'
  | 'ITEM_NOT_MAPPED'
  | 'PRICE_CONFLICT'
  | 'NEEDS_VERIFICATION'
  | 'SNAPSHOT_LOCKED'
  | 'PROJECT_OVERRIDE';

export const AHSP_COMPONENT_SYNC_STATUSES: readonly AhspComponentSyncStatus[] = [
  'SYNCED',
  'MASTER_PRICE_UPDATED',
  'PRICE_UNAVAILABLE',
  'UNIT_MISMATCH',
  'ITEM_NOT_MAPPED',
  'PRICE_CONFLICT',
  'NEEDS_VERIFICATION',
  'SNAPSHOT_LOCKED',
  'PROJECT_OVERRIDE',
];

export const AHSP_COMPONENT_SYNC_STATUS_LABELS: Record<
  AhspComponentSyncStatus,
  { label: string; description: string }
> = {
  SYNCED: {
    label: 'Sinkron',
    description: 'Harga master ter-resolve dan selaras dengan harga sumber AHSP; tidak ada penanda masalah.',
  },
  MASTER_PRICE_UPDATED: {
    label: 'Harga master diperbarui',
    description: 'Harga master ter-resolve berbeda dari harga sumber AHSP asli.',
  },
  PRICE_UNAVAILABLE: {
    label: 'Harga belum tersedia',
    description: 'Item terpetakan tetapi tidak ada harga yang ter-resolve.',
  },
  UNIT_MISMATCH: {
    label: 'Satuan tidak cocok',
    description: 'Harga kandidat ditolak karena satuannya tidak cocok dengan satuan AHSP.',
  },
  ITEM_NOT_MAPPED: {
    label: 'Item belum terpetakan',
    description: 'Komponen tidak memiliki kode maupun ikatan entitas kanonis sehingga tidak dapat di-resolve.',
  },
  PRICE_CONFLICT: {
    label: 'Konflik harga',
    description: 'Lebih dari satu harga bersaing untuk kunci yang sama.',
  },
  NEEDS_VERIFICATION: {
    label: 'Perlu verifikasi',
    description: 'Harga ter-resolve tetapi provenance-nya belum terverifikasi atau kuncinya ditandai perlu tinjauan.',
  },
  SNAPSHOT_LOCKED: {
    label: 'Terkunci snapshot',
    description: 'Harga dibekukan oleh snapshot proyek; perubahan master tidak memengaruhinya sampai diadopsi.',
  },
  PROJECT_OVERRIDE: {
    label: 'Override proyek',
    description: 'Harga proyek menimpa harga master untuk komponen ini.',
  },
};

/** Statuses that mean "unresolved" — the item/price has no usable price. */
export const UNRESOLVED_SYNC_STATUSES: readonly AhspComponentSyncStatus[] = [
  'PRICE_UNAVAILABLE',
  'UNIT_MISMATCH',
  'ITEM_NOT_MAPPED',
];

export function isUnresolvedSyncStatus(status: AhspComponentSyncStatus): boolean {
  return (UNRESOLVED_SYNC_STATUSES as readonly string[]).includes(status);
}

export interface AhspComponentSyncInput {
  resolved: boolean;
  unitPrice: number | null;
  canonicalEntityId: string | null;
  hasCode: boolean;
  originalAhspSourcePrice: number | null;
  priceDifference: number | null;
  unitMismatch: boolean;
  needsReview: boolean;
  underspecified: boolean;
  unitMissing: boolean;
  hasConflict: boolean;
  verificationStatus: PriceVerificationStatus | null;
  isSnapshotLocked: boolean;
  isProjectOverride: boolean;
  masterPriceUpdated: boolean;
}

/**
 * Derive the §11.3 sync status. HARD RULE (structural, not a comment):
 * SYNCED is returned ONLY from the final branch, which is reachable
 * only after the unresolved early-return — an unresolved item/price can
 * never be SYNCED. Precedence: unresolved (mismatch → unmapped →
 * unavailable) → override → snapshot lock → conflict → needs
 * verification → master updated → synced.
 */
export function deriveAhspComponentSyncStatus(input: AhspComponentSyncInput): {
  status: AhspComponentSyncStatus;
  reason: string;
} {
  const unresolved = !input.resolved || input.unitPrice === null;
  if (unresolved) {
    if (input.unitMismatch) {
      return {
        status: 'UNIT_MISMATCH',
        reason: 'Harga kandidat ditolak: satuan tidak cocok dengan satuan AHSP (UNIT_MISMATCH).',
      };
    }
    if (!input.hasCode && input.canonicalEntityId === null) {
      return {
        status: 'ITEM_NOT_MAPPED',
        reason: 'Komponen tanpa kode dan tanpa ikatan entitas kanonis — tidak ada jalur resolusi.',
      };
    }
    return {
      status: 'PRICE_UNAVAILABLE',
      reason: 'Tidak ada harga yang ter-resolve untuk komponen ini.',
    };
  }
  if (input.isProjectOverride) {
    return {
      status: 'PROJECT_OVERRIDE',
      reason: 'Harga komponen ini ditimpa oleh override proyek.',
    };
  }
  if (input.isSnapshotLocked) {
    return {
      status: 'SNAPSHOT_LOCKED',
      reason: 'Harga komponen ini dibekukan oleh snapshot proyek.',
    };
  }
  if (input.hasConflict) {
    return {
      status: 'PRICE_CONFLICT',
      reason: 'Lebih dari satu harga bersaing untuk kunci ini.',
    };
  }
  if (
    input.needsReview ||
    input.underspecified ||
    input.unitMissing ||
    input.verificationStatus === 'NEEDS_REVIEW'
  ) {
    return {
      status: 'NEEDS_VERIFICATION',
      reason: 'Harga ter-resolve tetapi provenance-nya belum terverifikasi atau kuncinya ditandai perlu tinjauan.',
    };
  }
  const updated =
    input.masterPriceUpdated ||
    (input.priceDifference !== null && input.priceDifference !== 0);
  if (updated) {
    return {
      status: 'MASTER_PRICE_UPDATED',
      reason: 'Harga master berbeda dari harga sumber AHSP asli.',
    };
  }
  return {
    status: 'SYNCED',
    reason: 'Harga master ter-resolve dan selaras dengan sumber AHSP.',
  };
}

// ===========================================================================
// §11.3 — AHSP component detail (12 fields)
// ===========================================================================

export type AhspComponentCategory = 'labor' | 'material' | 'equipment';

export const AHSP_COMPONENT_CATEGORY_LABELS: Record<AhspComponentCategory, string> = {
  labor: 'Tenaga Kerja',
  material: 'Bahan / Material',
  equipment: 'Peralatan',
};

/** The 12 §11.3 fields, plus the evidence behind the sync status. */
export interface AhspComponentDetail {
  /** 1. Component name. */
  name: string;
  /** 2. Component category. */
  category: AhspComponentCategory;
  categoryLabel: string;
  /** 3. Coefficient. */
  coefficient: number;
  /** 4. AHSP unit (as printed on the component). */
  ahspUnit: string;
  /** 5. Canonical master item (RES-xxx), null when unbound. */
  canonicalMasterItem: string | null;
  /** 6. Master unit (the unit the resolved price applies to). */
  masterUnit: string | null;
  /** 7. Resolved master price (null = unresolved, never Rp0). */
  resolvedMasterPrice: number | null;
  /** 8. Original AHSP source price (the component's baked price). */
  originalAhspSourcePrice: number | null;
  /** 9. Price difference (master − source; null when either side missing). */
  priceDifference: number | null;
  /** 10. Provenance (winning source name; null when unresolved). */
  provenance: string | null;
  verificationStatus: PriceVerificationStatus | null;
  matchMethod: string | null;
  /** 11. Last update (the parent item's lastUpdated). */
  lastUpdated: string | null;
  /** 12. Synchronization status. */
  syncStatus: AhspComponentSyncStatus;
  syncReason: string;
  /** Evidence. */
  subtotalPerUnit: number | null;
  unresolvedReason: string | null;
}

export interface AhspComponentDetailContext {
  isSnapshotLocked?: boolean;
  isProjectOverride?: boolean;
  hasConflict?: boolean;
  masterPriceUpdated?: boolean;
}

export function buildAhspComponentDetail(input: {
  component: AHSPComponent;
  category: AhspComponentCategory;
  pricing: AhspComponentPricing | null;
  lastUpdated: string | null;
  context?: AhspComponentDetailContext;
}): AhspComponentDetail {
  const { component, pricing } = input;
  const resolvedMasterPrice = pricing?.unitPrice ?? null;
  const originalAhspSourcePrice =
    pricing?.originalAhspSourcePrice ?? component.unitPrice ?? null;
  const priceDifference =
    pricing?.priceDifference ??
    (resolvedMasterPrice !== null && originalAhspSourcePrice !== null
      ? SafeDecimalEngine.safeSubtract(resolvedMasterPrice, originalAhspSourcePrice)
      : null);
  const canonicalMasterItem = pricing?.canonicalEntityId ?? component.resourceId ?? null;
  const { status, reason } = deriveAhspComponentSyncStatus({
    resolved: pricing?.resolved ?? false,
    unitPrice: resolvedMasterPrice,
    canonicalEntityId: canonicalMasterItem,
    hasCode: component.code.trim() !== '',
    originalAhspSourcePrice,
    priceDifference,
    unitMismatch: (pricing?.unresolvedReason ?? '').includes('UNIT_MISMATCH'),
    needsReview: pricing?.needsReview != null,
    underspecified: pricing?.underspecified != null,
    unitMissing: pricing?.unitMissing === true,
    hasConflict: input.context?.hasConflict ?? false,
    verificationStatus: pricing?.verificationStatus ?? null,
    isSnapshotLocked: input.context?.isSnapshotLocked ?? false,
    isProjectOverride: input.context?.isProjectOverride ?? false,
    masterPriceUpdated: input.context?.masterPriceUpdated ?? false,
  });
  return {
    name: component.name,
    category: input.category,
    categoryLabel: AHSP_COMPONENT_CATEGORY_LABELS[input.category],
    coefficient: component.coefficient,
    ahspUnit: component.unit,
    canonicalMasterItem,
    masterUnit: pricing?.unit ?? null,
    resolvedMasterPrice,
    originalAhspSourcePrice,
    priceDifference,
    provenance: pricing?.sourceName ?? null,
    verificationStatus: pricing?.verificationStatus ?? null,
    matchMethod: pricing?.matchMethod ?? null,
    lastUpdated: input.lastUpdated,
    syncStatus: status,
    syncReason: reason,
    subtotalPerUnit: pricing?.subtotalPerUnit ?? null,
    unresolvedReason: pricing?.unresolvedReason ?? null,
  };
}

/**
 * Build the §11.3 detail rows for every component of one AHSP item.
 * Composition entries match raw components BY INDEX per category array
 * (the resolver builds them in array order; its componentId is
 * `${code}::${arrayType}::${index}`). A missing composition (or a
 * shorter array) yields unresolved details — never a guessed price.
 */
export function buildAhspItemComponentDetails(
  item: NationalAHSPItem,
  composition: AhspUnitPriceComposition | null,
  context?: AhspComponentDetailContext,
): AhspComponentDetail[] {
  const out: AhspComponentDetail[] = [];
  const arrays: ReadonlyArray<{
    key: 'laborComponents' | 'materialComponents' | 'equipmentComponents';
    category: AhspComponentCategory;
    pricing: readonly AhspComponentPricing[] | null;
  }> = [
    { key: 'laborComponents', category: 'labor', pricing: composition?.labor.components ?? null },
    { key: 'materialComponents', category: 'material', pricing: composition?.material.components ?? null },
    { key: 'equipmentComponents', category: 'equipment', pricing: composition?.equipment.components ?? null },
  ];
  for (const { key, category, pricing } of arrays) {
    const comps = item[key] ?? [];
    for (let i = 0; i < comps.length; i++) {
      out.push(
        buildAhspComponentDetail({
          component: comps[i],
          category,
          pricing: pricing?.[i] ?? null,
          lastUpdated: item.lastUpdated,
          context,
        }),
      );
    }
  }
  return out;
}

// ===========================================================================
// §11.1 — Master record rows, search + filters, linked AHSP references
// ===========================================================================

export interface MasterRecordFilter {
  query: string;
  category: 'ALL' | 'material' | 'labor' | 'equipment';
  verificationStatus: 'ALL' | PriceVerificationStatus;
  provenance: 'ALL' | MasterProvenanceLabel;
  /** 'ALL' or an exact province name from `masterRecordRegions`. */
  region: string;
}

export const EMPTY_MASTER_RECORD_FILTER: MasterRecordFilter = {
  query: '',
  category: 'ALL',
  verificationStatus: 'ALL',
  provenance: 'ALL',
  region: 'ALL',
};

export function filterMasterRecords(
  records: readonly ResourcePriceRecord[],
  filter: MasterRecordFilter,
): ResourcePriceRecord[] {
  const words = filter.query.toLowerCase().split(/\s+/).filter((w) => w !== '');
  return records.filter((record) => {
    if (filter.category !== 'ALL' && record.resourceType !== filter.category) return false;
    if (
      filter.verificationStatus !== 'ALL' &&
      record.verificationStatus !== filter.verificationStatus
    ) {
      return false;
    }
    if (filter.provenance !== 'ALL' && labelForRecord(record) !== filter.provenance) return false;
    if (filter.region !== 'ALL' && (record.location.provinceName ?? null) !== filter.region) {
      return false;
    }
    if (words.length === 0) return true;
    const hay = [
      record.resourceName,
      record.resourceCode,
      record.resourceId ?? '',
      record.sourceRecordId ?? '',
      record.sourceName,
    ]
      .join(' ')
      .toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

/** Distinct province names across the records (sorted, for the region filter). */
export function masterRecordRegions(records: readonly ResourcePriceRecord[]): string[] {
  const names = new Set<string>();
  for (const record of records) {
    if (record.location.provinceName) names.add(record.location.provinceName);
  }
  return [...names].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/** Human-readable location: regency/city + province, else the level. */
export function formatPriceLocation(location: PriceLocation): string {
  const parts: string[] = [];
  if (location.regencyName) parts.push(location.regencyName);
  else if (location.cityName) parts.push(location.cityName);
  if (location.provinceName) parts.push(location.provinceName);
  if (parts.length > 0) return parts.join(', ');
  return location.level === 'NATIONAL' ? 'Nasional' : location.level;
}

export interface MasterRecordRow {
  id: string;
  resourceId: string | null;
  resourceCode: string;
  resourceName: string;
  resourceType: string;
  unit: string;
  unitRaw: string;
  price: number;
  regionLabel: string;
  provinceName: string | null;
  periodLabel: string;
  sourceKey: string;
  sourceName: string;
  sourceTier: string;
  sourceDocument: string | null;
  verificationStatus: PriceVerificationStatus;
  provenanceLabel: MasterProvenanceLabel;
  provenanceExplanation: string;
  matchMethod: string;
  matchConfidence: number;
  version: number | null;
  status: string | null;
  priceType: string | null;
  specContext: string | null;
}

export function buildMasterRecordRow(record: ResourcePriceRecord): MasterRecordRow {
  const provenanceLabel = labelForRecord(record);
  return {
    id: record.id,
    resourceId: record.resourceId,
    resourceCode: record.resourceCode,
    resourceName: record.resourceName,
    resourceType: record.resourceType,
    unit: record.unit,
    unitRaw: record.unitRaw,
    price: record.price,
    regionLabel: formatPriceLocation(record.location),
    provinceName: record.location.provinceName ?? null,
    periodLabel: record.period.label,
    sourceKey: record.sourceKey,
    sourceName: record.sourceName,
    sourceTier: record.sourceTier,
    sourceDocument: record.sourceDocument ?? null,
    verificationStatus: record.verificationStatus,
    provenanceLabel,
    provenanceExplanation: PROVENANCE_LABEL_MAPPING[provenanceLabel].explanation,
    matchMethod: record.matchMethod,
    matchConfidence: record.matchConfidence,
    version: record.version ?? null,
    status: record.status ?? null,
    priceType: record.priceType ?? null,
    specContext: record.specContext ?? null,
  };
}

/**
 * Linked AHSP references for one master record: every catalog component
 * bound by the record's resource key (code|unit, the §9 index key).
 * The caller builds the index ONCE (`buildResourceComponentIndex`) and
 * reuses it — this lookup is O(1) per key.
 */
export function linkedAhspReferencesForKey(
  index: ResourceComponentIndex,
  resourceCode: string,
  unit: string,
): readonly IndexedComponentRef[] {
  const key = priceChangeKey({ resourceCode, unit });
  return index.byKey.get(key) ?? [];
}

export function summarizeLinkedReferences(refs: readonly IndexedComponentRef[]): {
  referenceCount: number;
  itemCount: number;
  byFamily: Array<{ family: AhspFamily; count: number }>;
} {
  const itemIds = new Set<string>();
  const byFamily = new Map<AhspFamily, number>();
  for (const ref of refs) {
    itemIds.add(ref.itemId);
    byFamily.set(ref.family, (byFamily.get(ref.family) ?? 0) + 1);
  }
  return {
    referenceCount: refs.length,
    itemCount: itemIds.size,
    byFamily: [...byFamily.entries()]
      .map(([family, count]) => ({ family, count }))
      .sort((a, b) => (a.family < b.family ? -1 : a.family > b.family ? 1 : 0)),
  };
}

// ===========================================================================
// §11.1 — Price-history rows (§4.4 entries, rendered, never invented)
// ===========================================================================

export const HISTORY_OPERATION_LABELS_ID: Record<MasterPriceHistoryOperation, string> = {
  BASELINE: 'Baseline',
  REGENERATION: 'Regenerasi',
  CREATE: 'Pembuatan',
  UPDATE: 'Perubahan harga',
  DEACTIVATE: 'Nonaktifkan',
  PUBLISH: 'Terbit',
  ROLLBACK: 'Rollback',
};

export interface MasterPriceHistoryRow {
  id: string;
  operation: MasterPriceHistoryOperation;
  operationLabel: string;
  changedAt: string;
  reason: string;
  previousAmount: number | null;
  newAmount: number | null;
  previousUnit: string | null;
  newUnit: string | null;
  resourceId: string | null;
  priceRecordId: string | null;
  sourceKey: string | null;
  verificationStatus: PriceVerificationStatus | null;
  adminIdentity: string | null;
  masterPriceVersion: string;
  publicationStatus: string;
  affectedAhspReferences: readonly string[];
  affectedLivePriceProjects: readonly string[];
}

export function buildHistoryRow(entry: MasterPriceHistoryEntry): MasterPriceHistoryRow {
  return {
    id: entry.id,
    operation: entry.operation,
    operationLabel: HISTORY_OPERATION_LABELS_ID[entry.operation],
    changedAt: entry.changedAt,
    reason: entry.reason,
    previousAmount: entry.previousAmount,
    newAmount: entry.newAmount,
    previousUnit: entry.previousUnit,
    newUnit: entry.newUnit,
    resourceId: entry.resourceId,
    priceRecordId: entry.priceRecordId,
    sourceKey: entry.sourceKey,
    verificationStatus: entry.verificationStatus,
    adminIdentity: entry.adminIdentity,
    masterPriceVersion: entry.masterPriceVersion,
    publicationStatus: entry.publicationStatus,
    affectedAhspReferences: [...entry.affectedAhspReferences],
    affectedLivePriceProjects: [...entry.affectedLivePriceProjects],
  };
}

// ===========================================================================
// §11.1 — Simulation change input (the §9 effective-price model)
// ===========================================================================

/**
 * Build the §9 change input for a simulated master-price edit. `oldPrice`
 * MUST be the current EFFECTIVE price from the resolver (the caller
 * resolves it live) — NOT the record's own price: the record may not be
 * the winning record for its key, and §9 verifies the baseline against
 * the resolver at compute time (a mismatch yields NOT_COMPUTED).
 */
export function toMasterPriceChangeInput(input: {
  record: ResourcePriceRecord;
  oldPrice: number | null;
  newPrice: number;
}): MasterPriceChangeInput {
  const category =
    input.record.resourceType === 'labor'
      ? 'LABOR'
      : input.record.resourceType === 'equipment'
        ? 'EQUIPMENT'
        : input.record.resourceType === 'material'
          ? 'MATERIAL'
          : null;
  return {
    resourceCode: input.record.resourceCode,
    resourceId: input.record.resourceId,
    resourceName: input.record.resourceName,
    category,
    unit: input.record.unit,
    oldPrice: input.oldPrice,
    newPrice: input.newPrice,
    region: input.record.location.provinceName ?? null,
    source: input.record.sourceKey,
  };
}

export function validateProposedPrice(
  newPrice: number | null | undefined,
  oldPrice: number | null,
): { valid: boolean; error: string | null } {
  if (newPrice === null || newPrice === undefined || !Number.isFinite(newPrice)) {
    return { valid: false, error: 'Harga baru harus berupa angka.' };
  }
  if (newPrice < 0) {
    return { valid: false, error: 'Harga baru tidak boleh negatif.' };
  }
  if (oldPrice !== null && newPrice === oldPrice) {
    return { valid: false, error: 'Harga baru sama dengan harga efektif saat ini — tidak ada perubahan.' };
  }
  return { valid: true, error: null };
}

// ===========================================================================
// §11.4 — Price-update confirmation dialog content (real §9 numbers only)
// ===========================================================================

export const IMPACT_KIND_LABELS_ID: Record<MasterPriceImpactPreview['kind'], string> = {
  MASTER_PRICE_CHANGE: 'Update harga master',
  AHSP_VERSION_CHANGE: 'Perubahan versi AHSP',
  ROLLBACK: 'Rollback versi AHSP',
};

export interface PriceUpdateDialogContent {
  title: string;
  kindLabel: string;
  status: ImpactPreviewStatus;
  /** Confirm is available only when the preview is COMPUTED. */
  computable: boolean;
  note: string;
  notComputedReasons: readonly string[];
  staleReasons: readonly string[];
  changeLines: string[];
  /** The scope statement — always present, always computed from real numbers. */
  scopeStatement: string;
  itemSummary: {
    added: number;
    removed: number;
    revised: number;
    priceChanged: number;
    totalAffected: number;
    uncomputable: number;
  };
  itemRows: readonly AhspItemImpact[];
  familyRows: readonly FamilyImpactSummary[];
  projectSummary: {
    totalProjectCount: number;
    liveProjectCount: number;
    snapshotProjectCount: number;
    overrideProjectCount: number;
    demoProjectCount: number;
    affectedProjectCount: number;
    lockedSnapshotCount: number;
    notComputableProjectCount: number;
  };
  projectRows: readonly ProjectImpact[];
  aggregates: {
    totalDeltaGrandTotal: number | null;
    totalDeltaDirectCost: number | null;
    newlyPricedItemCount: number;
    becameUnpricedItemCount: number;
    uncomputableProjectCount: number;
  };
  affectedAhspReferences: readonly string[];
  affectedLivePriceProjects: readonly string[];
  codelessComponentCount: number;
  computedAt: string;
  fingerprintHash: string;
  /** Why confirm is unavailable (null when COMPUTED). */
  blockedNote: string | null;
}

export function buildPriceUpdateDialogContent(
  preview: MasterPriceImpactPreview,
  opts?: { operationLabel?: string },
): PriceUpdateDialogContent {
  const kindLabel = IMPACT_KIND_LABELS_ID[preview.kind];
  const title = opts?.operationLabel ?? `Konfirmasi ${kindLabel.toLowerCase()}`;
  const computable = preview.status === 'COMPUTED';
  const changeLines: string[] = [];
  if (preview.kind === 'MASTER_PRICE_CHANGE') {
    for (const c of preview.change.priceChanges) {
      const oldText = c.oldPrice === null ? 'belum ada harga' : formatRupiah(c.oldPrice);
      const newText = c.newPrice === null ? 'dihapus' : formatRupiah(c.newPrice);
      changeLines.push(`${c.resourceCode} (${c.unit}): ${oldText} → ${newText}`);
    }
  } else {
    const familyLabel =
      preview.change.family === null
        ? 'semua keluarga'
        : AHSP_FAMILY_LABELS_ID[preview.change.family];
    changeLines.push(
      `Keluarga ${familyLabel}: ${preview.change.sourceVersionId ?? '—'} → ${preview.change.targetVersionId ?? '—'}`,
    );
  }
  const affectedRefs = preview.components.summary.affectedReferenceCount;
  const affectedProjects = preview.projects.summary.affectedProjectCount;
  const locked = preview.projects.summary.lockedSnapshotCount;
  const scopeStatement = computable
    ? `Operasi ini memengaruhi semua referensi AHSP aktif yang tertaut dalam cakupan yang diotorisasi: ` +
      `${preview.items.summary.totalAffected} item AHSP (${affectedRefs} referensi komponen) dan ` +
      `${affectedProjects} proyek harga-live. ${locked} proyek snapshot terkunci dan tidak berubah sampai diadopsi eksplisit.`
    : 'Dampak operasi ini TIDAK DAPAT dihitung dari data yang tersedia — cakupan yang terpengaruh tidak ' +
      'diketahui, sehingga operasi tidak dapat dikonfirmasi dari preview ini.';
  const blockedNote =
    preview.status === 'NOT_COMPUTED'
      ? `Preview tidak terhitung: ${preview.notComputedReasons.join('; ') || preview.note}`
      : preview.status === 'STALE'
        ? `Preview basi: ${preview.staleReasons.join('; ') || 'state bergerak sejak preview dihitung'} — hitung ulang preview sebelum mengonfirmasi.`
        : null;
  return {
    title,
    kindLabel,
    status: preview.status,
    computable,
    note: preview.note,
    notComputedReasons: [...preview.notComputedReasons],
    staleReasons: [...preview.staleReasons],
    changeLines,
    scopeStatement,
    itemSummary: { ...preview.items.summary },
    itemRows: [...preview.items.changed],
    familyRows: [...preview.components.summary.byFamily],
    projectSummary: { ...preview.projects.summary },
    projectRows: [...preview.projects.projects],
    aggregates: { ...preview.aggregates },
    affectedAhspReferences: [...preview.affectedAhspReferences],
    affectedLivePriceProjects: [...preview.affectedLivePriceProjects],
    codelessComponentCount: preview.components.summary.codelessComponentCount,
    computedAt: preview.computedAt,
    fingerprintHash: preview.fingerprint.fingerprintHash,
    blockedNote,
  };
}

// ===========================================================================
// §11.2 — AHSP registry view-model + sync status + version compare
// ===========================================================================

export const AHSP_FAMILY_LABELS_ID: Record<AhspFamily, string> = {
  CIPTA_KARYA: 'Cipta Karya',
  BINA_MARGA: 'Bina Marga',
  SUMBER_DAYA_AIR: 'Sumber Daya Air',
  SMKK: 'SMKK',
};

export interface AhspFamilyRegistryView {
  family: AhspFamily;
  familyLabel: string;
  activeVersionId: string;
  activeRecord: AhspVersionRecord | null;
  versions: AhspVersionRecord[];
  versionCount: number;
  draftCount: number;
}

export function buildAhspRegistryViewModel(
  state: AhspVersionRegistryState,
): AhspFamilyRegistryView[] {
  return AHSP_FAMILIES.map((family) => {
    const versions = listVersions(state, family);
    const activeVersionId = getActiveVersion(state, family);
    return {
      family,
      familyLabel: AHSP_FAMILY_LABELS_ID[family],
      activeVersionId,
      activeRecord: getVersionRecord(state, family, activeVersionId),
      versions,
      versionCount: versions.length,
      draftCount: versions.filter((v) => v.status === 'DRAFT').length,
    };
  });
}

export type AhspFamilySyncStatus = 'SYNCED' | 'MISMATCH' | 'UNKNOWN';

export interface AhspFamilySyncResult {
  family: AhspFamily;
  status: AhspFamilySyncStatus;
  recordChecksum: string;
  liveChecksum: string | null;
  liveItemCount: number;
  detail: string;
}

/**
 * Sync status for one family: the live runtime catalog's content
 * checksum (§8 canonical checksum) vs the ACTIVE registry record's
 * snapshot checksum. Equal = the runtime serves exactly the snapshotted
 * content. Different = the runtime drifted from the snapshot (an honest
 * mismatch, never papered over). No live items = UNKNOWN, never SYNCED.
 */
export function checkAhspFamilySync(input: {
  family: AhspFamily;
  record: AhspVersionRecord;
  liveItems: readonly NationalAHSPItem[];
}): AhspFamilySyncResult {
  const domain = AHSP_FAMILY_DOMAINS[input.family];
  const domainItems = input.liveItems.filter((item) => item.domain === domain);
  if (domainItems.length === 0) {
    return {
      family: input.family,
      status: 'UNKNOWN',
      recordChecksum: input.record.contentChecksum,
      liveChecksum: null,
      liveItemCount: 0,
      detail: 'Tidak ada item live untuk keluarga ini — sinkronisasi tidak dapat ditentukan.',
    };
  }
  const liveChecksum = computeAhspContentChecksum(domainItems);
  if (liveChecksum === input.record.contentChecksum) {
    return {
      family: input.family,
      status: 'SYNCED',
      recordChecksum: input.record.contentChecksum,
      liveChecksum,
      liveItemCount: domainItems.length,
      detail: `Checksum konten live sama dengan checksum snapshot ${input.record.versionId} (${liveChecksum}).`,
    };
  }
  return {
    family: input.family,
    status: 'MISMATCH',
    recordChecksum: input.record.contentChecksum,
    liveChecksum,
    liveItemCount: domainItems.length,
    detail:
      `Checksum konten live (${liveChecksum}) berbeda dari snapshot ${input.record.versionId} ` +
      `(${input.record.contentChecksum}) — konten runtime tidak sama dengan snapshot tersimpan.`,
  };
}

export interface VersionCompareViewModel {
  sourceVersion: string;
  targetVersion: string;
  domain: AHSPDomain;
  added: number;
  removed: number;
  revised: number;
  unchanged: number;
  totalSource: number;
  totalTarget: number;
  fieldChanges: number;
  componentChanges: number;
  addedItems: readonly NationalAHSPItem[];
  removedItems: readonly { code: string; name: string; reason: string }[];
  revisedItems: readonly {
    code: string;
    name: string;
    oldPrice: number | null;
    newPrice: number | null;
    diffNote: string;
  }[];
  fieldDiffs: readonly AhspItemFieldDiff[];
}

export function buildVersionCompareViewModel(diff: AHSPVersionDiff): VersionCompareViewModel {
  return {
    sourceVersion: diff.sourceVersion,
    targetVersion: diff.targetVersion,
    domain: diff.domain,
    added: diff.summary.added,
    removed: diff.summary.removed,
    revised: diff.summary.revised,
    unchanged: diff.summary.unchanged,
    totalSource: diff.summary.totalSource,
    totalTarget: diff.summary.totalTarget,
    fieldChanges: diff.summary.fieldChanges,
    componentChanges: diff.summary.componentChanges,
    addedItems: [...diff.addedCodes],
    removedItems: [...diff.removedCodes],
    revisedItems: [...diff.revisedCodes],
    fieldDiffs: [...diff.fieldDiffs],
  };
}

// ===========================================================================
// §10 UI — pricing-mode labels, adoption availability + summary
// ===========================================================================

export const PRICING_MODE_LABELS_ID: Record<
  ProjectPricingMode,
  { label: string; description: string }
> = {
  LIVE_MASTER_PRICE: {
    label: 'Live — Harga Master',
    description: 'Proyek selalu memakai harga master dan versi AHSP aktif terbaru.',
  },
  SNAPSHOT_PRICE: {
    label: 'Snapshot — Harga Beku',
    description: 'Harga dibekukan pada versi yang di-pin; perubahan master hanya masuk lewat adopsi eksplisit.',
  },
  PROJECT_OVERRIDE: {
    label: 'Override Proyek',
    description: 'Harga proyek menimpa harga master per komponen; sisanya mengikuti snapshot yang di-pin.',
  },
};

export interface FamilyAdoptionAvailability {
  family: AhspFamily;
  canAdoptVersion: boolean;
  versionReason: string;
  targetAhspVersion: string | null;
  canAdoptPrices: boolean;
  priceReason: string;
  targetMasterPriceVersion: string | null;
}

/**
 * What a project can adopt for one family, from its recorded mode +
 * pins. LIVE projects adopt nothing (they already follow). A legacy
 * unpinned project reads as 2026.1 (Decision D). A null pin is never
 * treated as "already current" unless the active label is 2026.1 too.
 */
export function familyAdoptionAvailability(input: {
  family: AhspFamily;
  mode: ProjectPricingMode;
  pinnedAhspDatabaseVersion: string | null;
  activeVersionId: string;
  pinnedMasterPriceVersion: string | null;
  masterPriceVersion?: string;
}): FamilyAdoptionAvailability {
  const masterVersion = input.masterPriceVersion ?? MASTER_PRICE_VERSION;
  if (input.mode === 'LIVE_MASTER_PRICE') {
    return {
      family: input.family,
      canAdoptVersion: false,
      versionReason: 'Proyek LIVE sudah mengikuti versi AHSP aktif terbaru — tidak ada yang diadopsi.',
      targetAhspVersion: null,
      canAdoptPrices: false,
      priceReason: 'Proyek LIVE sudah mengikuti harga master terbaru — tidak ada yang diadopsi.',
      targetMasterPriceVersion: null,
    };
  }
  const pinnedAhsp = input.pinnedAhspDatabaseVersion ?? AHSP_BASELINE_VERSION_ID;
  const pinnedMaster = input.pinnedMasterPriceVersion ?? MASTER_PRICE_VERSION;
  const canAdoptVersion = pinnedAhsp !== input.activeVersionId;
  const canAdoptPrices = pinnedMaster !== masterVersion;
  return {
    family: input.family,
    canAdoptVersion,
    versionReason: canAdoptVersion
      ? `Versi yang di-pin (${pinnedAhsp}) tertinggal dari versi aktif (${input.activeVersionId}).`
      : `Versi yang di-pin (${pinnedAhsp}) sudah sama dengan versi aktif — tidak ada adopsi versi.`,
    targetAhspVersion: canAdoptVersion ? input.activeVersionId : null,
    canAdoptPrices,
    priceReason: canAdoptPrices
      ? `Harga master yang di-pin (${pinnedMaster}) tertinggal dari label saat ini (${masterVersion}).`
      : `Harga master yang di-pin (${pinnedMaster}) sudah sama dengan label saat ini — tidak ada adopsi harga.`,
    targetMasterPriceVersion: canAdoptPrices ? masterVersion : null,
  };
}

/**
 * Build a `ProjectImpactInput` for one project from LIVE context data
 * (the §10 adoption flow's input). Mirrors the §9 workspace collector's
 * rules exactly: mode from the project record first, then the ACTIVE
 * estimate version, else ABSENT (reads as SNAPSHOT downstream — the
 * builder never assigns LIVE itself); an invalid recorded mode is
 * treated as absent, never thrown on (corrupt data must not crash the
 * UI); pins from the active version; cost-summary config built the way
 * `ProjectContext.recalculateProjectSummary` builds it, so preview
 * baselines match the totals the app shows.
 */
export function buildProjectImpactInput(input: {
  project: Project;
  items: readonly RabItem[];
  overrides: readonly ProjectPriceOverride[];
  activeVersion: EstimateVersion | null;
}): ProjectImpactInput {
  const { project, activeVersion } = input;
  let pricingMode: ProjectPricingMode | null = null;
  if (isValidProjectPricingMode(project.pricingMode)) {
    pricingMode = project.pricingMode;
  } else if (activeVersion && isValidProjectPricingMode(activeVersion.pricingMode)) {
    pricingMode = activeVersion.pricingMode;
  }
  const cs = (project.costSummary ?? {}) as Partial<ProjectCostSummary>;
  const p = project as unknown as Record<string, unknown>;
  return {
    projectId: project.id,
    projectName: project.name ?? project.id,
    isDemo: (project as { isDemo?: boolean }).isDemo === true,
    pricingMode,
    pinnedAhspDatabaseVersion: activeVersion?.ahspDatabaseVersion ?? null,
    pinnedMasterPriceVersion: activeVersion?.masterPriceVersion ?? null,
    items: [...input.items],
    costSummary: {
      ...cs,
      overheadPercent: (p.overheadPercent as number | undefined) ?? undefined,
      profitPercent: (p.profitPercent as number | undefined) ?? cs.profitPercent,
      taxPercent: (p.ppnPercent as number | undefined) ?? cs.taxPercent,
      ppnEnabled: p.ppnEnabled === true,
      pphEnabled: p.pphEnabled === true,
      pphPercent: (p.pphPercent as number | undefined) ?? cs.pphPercent ?? 0,
    },
    overrides: [...input.overrides],
  };
}

export function validateAdoptionReason(reason: string): {
  valid: boolean;
  length: number;
  minLength: number;
  error: string | null;
} {
  const length = reason.trim().length;
  if (length < ADOPTION_REASON_MIN_LENGTH) {
    return {
      valid: false,
      length,
      minLength: ADOPTION_REASON_MIN_LENGTH,
      error: `Alasan persetujuan minimal ${ADOPTION_REASON_MIN_LENGTH} karakter (saat ini ${length}).`,
    };
  }
  return { valid: true, length, minLength: ADOPTION_REASON_MIN_LENGTH, error: null };
}

export interface AdoptionPreviewSummary {
  computable: boolean;
  changeKind: MasterPriceImpactPreview['kind'];
  oldGrandTotal: number;
  newGrandTotal: number | null;
  deltaGrandTotal: number | null;
  oldDirectCost: number;
  newDirectCost: number | null;
  deltaDirectCost: number | null;
  adoptedItemCount: number;
  listedImpactCount: number;
  uncomputableCount: number;
  uncomputableReasons: string[];
  targetAhspDatabaseVersion: string;
  targetMasterPriceVersion: string;
}

/**
 * The numbers the adoption UI renders. Old totals come from the
 * project's §9 impact; new totals from the ADOPTED items (the repriced
 * items the approval would freeze) — never from the aggregate-only
 * `adoptionPreview` (which has no per-item list). Uncomputable means
 * `adoptedItems === null`: approval must refuse.
 */
export function summarizeAdoptionPreview(adoption: AdoptionPreview): AdoptionPreviewSummary {
  return {
    computable: adoption.adoptedItems !== null,
    changeKind: adoption.changeKind,
    oldGrandTotal: adoption.projectImpact.oldGrandTotal,
    newGrandTotal: adoption.adoptedNewGrandTotal,
    deltaGrandTotal: adoption.adoptedDeltaGrandTotal,
    oldDirectCost: adoption.projectImpact.oldDirectCost,
    newDirectCost: adoption.adoptedNewDirectCost,
    deltaDirectCost: adoption.adoptedDeltaDirectCost,
    adoptedItemCount: adoption.adoptedItems?.length ?? 0,
    listedImpactCount: adoption.adoptedItemImpacts.length,
    uncomputableCount: adoption.uncomputableReasons.length,
    uncomputableReasons: [...adoption.uncomputableReasons],
    targetAhspDatabaseVersion: adoption.targetAhspDatabaseVersion,
    targetMasterPriceVersion: adoption.targetMasterPriceVersion,
  };
}
