/**
 * MASTER PRICING §10 — PROJECT PRICE MODES + HISTORICAL PROTECTION.
 * ================================================================
 *
 * Wujud desain D5 (§2.4.6): setiap proyek punya kebijakan harga
 * eksplisit — LIVE_MASTER_PRICE / SNAPSHOT_PRICE / PROJECT_OVERRIDE —
 * dan proyek historis TIDAK PERNAH ditulis ulang diam-diam oleh update
 * harga master atau publikasi versi AHSP (Decision D).
 *
 * Yang dibangun modul ini (per (a)–(g) tugas §10):
 *
 * (a) MODE PADA PROYEK — `Project.pricingMode` (field di `src/types`,
 *     ditulis `setProjectPricingMode`; `createProject` mencap LIVE
 *     untuk proyek baru). Proyek lama tanpa mode dibaca SNAPSHOT
 *     (`resolveEffectiveProjectPricingMode` — memakai resolver §9,
 *     bukan salinan kedua). Mode tak-valid → throw (fail-closed).
 *     Mode pada versi estimasi ditulis lewat `versionStamps`
 *     `createRevision` (versi immutable — modenya ditetapkan saat
 *     dibuat, tidak pernah ditulis ulang).
 *
 * (b) RESOLUSI DARI SNAPSHOT BERVERSI — `resolveVersionedAhspUnitPrice`
 *     memuat item AHSP dari versi yang di-pin proyek
 *     (`resolveProjectAhspVersion` §8) lewat `VersionedAhspCatalogSource`,
 *     BUKAN hanya pointer aktif. LIVE mengikuti pointer; SNAPSHOT /
 *     OVERRIDE mengikuti pin. Konten versi yang tidak tersedia →
 *     throw (fail-closed — konten live tidak pernah disubstitusi diam-diam
 *     untuk versi yang di-pin).
 *
 * (c) CACHE KOMPOSISI — KEPUTUSAN: resolusi konten berversi SELALU lewat
 *     konteks pricing EKSPLISIT (pola §9 Keputusan 7). Cache komposisi
 *     default resolver dikunci KODE item, jadi konten versi baru yang
 *     berbagi kode dengan versi lama akan mengembalikan harga lama yang
 *     ter-cache bila di-resolve lewat jalur default. Setiap resolusi §10
 *     melewatkan `ProjectPricingContext` eksplisit (konteks LIVE eksplisit
 *     pun mengecualikan kueri dari cache default — §6 (d)) — tanpa
 *     mengubah semantik cache default untuk jalur lain. §10 TIDAK PERNAH
 *     memanggil `invalidateAhspCache()`: jalur baca tidak boleh memutasi
 *     state cache global (preseden kemurnian §9); invalidasi berversi
 *     tetap alat §13 untuk perubahan harga master yang sesungguhnya.
 *
 * (d) ADOPSI EKSPLISIT — satu-satunya jalan proyek SNAPSHOT / OVERRIDE
 *     mengadopsi versi/harga baru: `previewAdoption` (§9 preview +
 *     diff lama-vs-baru per item + item hasil repricing) →
 *     `approveAdoption` (alasan wajib ≥10 karakter, pola §4; preview
 *     harus COMPUTED + segar; item yang tidak dapat dihitung menolak
 *     adopsi) → versi estimasi BARU (pin pindah ke yang diadopsi;
 *     versi lama tetap ada + tetap bisa dibaca). Tanpa adopsi eksplisit,
 *     proyek SNAPSHOT tidak pernah berubah harganya.
 *
 *     CATATAN SESI: `AdoptionPreview` berlaku untuk sesi saat ini.
 *     Preview yang diserialisasi lintas sesi harus dihitung ulang
 *     (`previewAdoption`) sebelum disetujui — persetujuan memvalidasi
 *     fingerprint proyek + kesegaran terhadap dunia saat ini, dan
 *     menolak preview basi (§9 (d)).
 *
 * (e) OVERRIDE — memakai ulang `ProjectPriceEngine` (store
 *     `ezrab_project_overrides_v2`, bentuk contracts) DAN store
 *     `ezrab_prod_price_overrides` (bentuk `src/types`, pemetaan §9 —
 *     `buildProjectOverrideRef`). Override menang per komponen;
 *     OVERRIDE + pin bekerja bersama lewat MERGE (snapshot sebagai
 *     basis, override menutupi per kunci) — karena resolver §6
 *     berkonsultasi pada SATU ref per mode, merge adalah komposisi
 *     yang benar tanpa menyentuh resolver. Store override TIDAK diubah.
 *
 * (f) DEFAULT FINANSIAL TIDAK BERUBAH — modul ini tidak menyentuh
 *     overhead/profit (0%/0% untuk proyek baru, keputusan owner
 *     2026-11-08). Mode harga tidak memengaruhi overhead/profit.
 *
 * (g) KOMPATIBILITAS — proyek/snapshot lama tanpa field mode/versi
 *     tetap terbaca: tanpa mode = SNAPSHOT, tanpa pin = `2026.1`.
 *     Tidak ada migrasi data paksa; pembacaan tidak pernah menulis
 *     ulang proyek lama (read-only compat).
 *
 * YANG TIDAK DIBANGUN §10: UI mode/adopsi (§11 — modul ini hanya
 * logika + API + data diff); perubahan harga/versi itu sendiri
 * (§4/§8 — §10 hanya mengonsumsi); pemuatan berkas snapshot JSON
 * dari disk (§13 — sumber konten diinjeksikan lewat
 * `VersionedAhspCatalogSource`).
 *
 * INTEGRITAS HARGA: modul ini tidak pernah mengarang harga, mengubah
 * harga yang ada, atau menulis ulang koefisien/data AHSP resmi. Semua
 * total lewat `recalculateCostSummary` (mesin kanonis) dan semua
 * repricing lewat repricer §9 (satu implementasi — adopsi memutar
 * ulang repricer preview, bukan salinannya).
 */

import {
  AHSP_BASELINE_VERSION_ID,
  AHSP_FAMILY_DOMAINS,
  AHSP_VERSION_REASON_MIN_LENGTH,
  getActiveVersion as getRegistryActiveVersion,
  getVersionRecord,
  resolveProjectAhspVersion,
  type AhspFamily,
  type AhspVersionRegistryState,
} from '../../data/nationalCostDatabase/ahspVersioning';
import { ALL_OFFICIAL_AHSP_ITEMS } from '../../data/nationalCostDatabase/masterRegistry';
import type {
  AHSPVersionDiff,
  NationalAHSPItem,
} from '../../data/nationalCostDatabase/types';
import { priceResolver2026 } from '../../data/priceDatabase2026/resolver';
import { buildComponentPriceRef } from '../../data/priceDatabase2026/centralResolution';
import {
  DEFAULT_NEW_PROJECT_PRICING_MODE,
  DEFAULT_SNAPSHOT_PRICING_MODE,
  MASTER_PRICE_VERSION,
  isValidProjectPricingMode,
  type AhspUnitPriceComposition,
  type ComponentPriceMapRef,
  type ProjectPriceSnapshotMap,
  type ProjectPricingContext,
  type ProjectPricingMode,
} from '../../data/priceDatabase2026/types';
import type {
  EstimateVersion,
  Project,
  ProjectPriceOverride,
  RabItem,
} from '../../types';
import { buildBaselineVersion, createRevision } from '../estimateVersioning';
import { SafeDecimalEngine } from '../safeDecimalEngine';
import { recalculateCostSummary } from '../unifiedProjectEngine';
import { ProjectPriceEngine } from './projectPriceEngine';
import type { ProjectPriceOverride as EngineProjectPriceOverride } from './contracts/types';
import {
  buildAhspVersionItemRepricer,
  buildCatalogMaps,
  buildMasterPriceItemRepricer,
  buildProjectOverrideRef,
  buildResourceComponentIndex,
  componentLookupKey,
  computeAhspVersionImpact,
  computeMasterPriceImpact,
  computeProjectsFingerprint,
  findCatalogItemForCode,
  priceChangeKey,
  repriceProjectItem,
  resolveOldCatalogItem,
  resolveProjectPricingMode,
  validateImpactPreviewFreshness,
  verifyChangeBaseline,
  type CurrentImpactState,
  type ImpactPreviewKind,
  type ItemRepricer,
  type MasterPriceChangeInput,
  type MasterPriceImpactPreview,
  type ProjectImpact,
  type ProjectImpactInput,
  type ProjectItemImpact,
} from './impact/masterPriceImpactPreview';

// ===========================================================================
// (a) MODE PADA PROYEK
// ===========================================================================

/** Minimum approval-reason length for adoption (§10 (d) — pola §4 / §8). */
export const ADOPTION_REASON_MIN_LENGTH = AHSP_VERSION_REASON_MIN_LENGTH;

export type PricingModeSource = 'RECORDED' | 'DEFAULT_SNAPSHOT';

/**
 * Resolve a project's effective pricing mode (§10 (a) + Decision D).
 * Absent mode (legacy project) reads as SNAPSHOT_PRICE — never LIVE.
 * An explicitly invalid mode string throws (fail-closed).
 *
 * This REUSES §9's `resolveProjectPricingMode` (one rule, two call
 * sites) — never a second copy of the rule.
 */
export function resolveEffectiveProjectPricingMode(
  mode?: ProjectPricingMode | null,
): { mode: ProjectPricingMode; source: PricingModeSource } {
  return resolveProjectPricingMode({ pricingMode: mode ?? null });
}

/** Throw unless the value is a valid pricing mode (fail-closed, Decision D). */
export function assertValidProjectPricingMode(value: unknown): ProjectPricingMode {
  if (!isValidProjectPricingMode(value)) {
    throw new Error(
      `Unknown project pricing mode ${JSON.stringify(value)} — refusing to guess (fail-closed, Decision D)`,
    );
  }
  return value;
}

/**
 * Write a pricing mode onto a project record (§10 (a)). PURE: returns
 * a NEW project object; the input is never mutated. The mode change
 * itself is a policy decision (§11's UI presents it); this API only
 * records it, validated. An invalid mode throws.
 *
 * NOTE: switching a project TO snapshot does not itself pin a version —
 * the pin lives on the project's ACTIVE estimate version (read by the
 * §9 collector); a version created under §3+ already carries the pin
 * it was frozen against, and a legacy unpinned version reads as 2026.1.
 */
export function setProjectPricingMode(
  project: Project,
  mode: ProjectPricingMode,
  opts?: { now?: string },
): Project {
  const valid = assertValidProjectPricingMode(mode);
  return {
    ...project,
    pricingMode: valid,
    updatedAt: opts?.now ?? new Date().toISOString(),
  };
}

/** The pricing mode a NEW project is born with (§10 (a) / D5). */
export function defaultNewProjectPricingMode(): ProjectPricingMode {
  return DEFAULT_NEW_PROJECT_PRICING_MODE;
}

/** The pricing mode a snapshot / legacy project reads as (§10 (a) / Decision D). */
export function defaultSnapshotPricingMode(): ProjectPricingMode {
  return DEFAULT_SNAPSHOT_PRICING_MODE;
}

/** A project's resolved pricing state (mode + pins, legacy defaults applied). */
export interface EffectiveProjectPricingState {
  mode: ProjectPricingMode;
  modeSource: PricingModeSource;
  /** The AHSP version the project resolves against (never null — legacy default 2026.1). */
  pinnedAhspDatabaseVersion: string;
  pinSource: 'RECORDED' | 'LEGACY_DEFAULT';
  /** The master price version the project resolves against (never null — legacy default 2026.1). */
  pinnedMasterPriceVersion: string;
  masterPinSource: 'RECORDED' | 'LEGACY_DEFAULT';
}

/**
 * Resolve a project's effective pricing state (§10 (a) + (g)): mode
 * (absent ⇒ SNAPSHOT) + pins (absent ⇒ 2026.1). Read-only: the input
 * is never mutated and no default is ever written back.
 */
export function effectiveProjectPricingState(input: {
  pricingMode?: ProjectPricingMode | null;
  pinnedAhspDatabaseVersion?: string | null;
  pinnedMasterPriceVersion?: string | null;
}): EffectiveProjectPricingState {
  const { mode, source } = resolveEffectiveProjectPricingMode(input.pricingMode ?? null);
  const ahspPin = input.pinnedAhspDatabaseVersion ?? null;
  const masterPin = input.pinnedMasterPriceVersion ?? null;
  return {
    mode,
    modeSource: source,
    pinnedAhspDatabaseVersion: ahspPin ?? AHSP_BASELINE_VERSION_ID,
    pinSource: ahspPin === null ? 'LEGACY_DEFAULT' : 'RECORDED',
    pinnedMasterPriceVersion: masterPin ?? MASTER_PRICE_VERSION,
    masterPinSource: masterPin === null ? 'LEGACY_DEFAULT' : 'RECORDED',
  };
}

/**
 * MASTER PRICING §13 (#4) — the project's ACTIVE estimate version:
 * by `activeEstimateVersionId`, else the latest by timestamp (the
 * §9 collector rule, shared by the export labeller and the snapshot
 * builder below). Null when the project has no versions at all.
 */
export function findActiveEstimateVersion(
  project: Pick<Project, 'id' | 'activeEstimateVersionId'>,
  versions: readonly EstimateVersion[] | null | undefined,
): EstimateVersion | null {
  if (!versions || versions.length === 0) return null;
  const mine = versions.filter((v) => v.projectId === project.id);
  if (project.activeEstimateVersionId) {
    const byId = mine.find((v) => v.id === project.activeEstimateVersionId);
    if (byId) return byId;
  }
  if (mine.length === 0) return null;
  const sorted = [...mine].sort((a, b) =>
    a.timestamp < b.timestamp ? 1 : a.timestamp > b.timestamp ? -1 : 0,
  );
  return sorted[0] ?? null;
}

/**
 * MASTER PRICING §13 (#4) — build the SNAPSHOT price ref for a
 * project from its ACTIVE estimate version's captured component map
 * (`EstimateVersion.componentPriceSnapshot`). Returns null when the
 * active version carries no map (versions written before capture
 * exists) — the caller falls through to live resolution with a
 * labelled note (§12), never a derived or invented map. Only finite
 * positive prices enter the ref (a missing/zero price stays
 * missing — never Rp0). The map's estimateVersionId must match the
 * active version's id (a map captured for another version is
 * refused — it would price the project against the wrong pin).
 */
export function buildSnapshotRefFromProject(
  project: Pick<Project, 'id' | 'activeEstimateVersionId'>,
  versions: readonly EstimateVersion[] | null | undefined,
): ComponentPriceMapRef | null {
  const active = findActiveEstimateVersion(project, versions);
  const map: ProjectPriceSnapshotMap | null | undefined = active?.componentPriceSnapshot;
  if (!active || !map) return null;
  if (map.estimateVersionId !== active.id) return null;
  const pricesByComponentKey: Record<string, number> = {};
  for (const [key, price] of Object.entries(map.pricesByComponentKey)) {
    if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) continue;
    pricesByComponentKey[key] = price;
  }
  return {
    pricesByComponentKey,
    label: `snapshot:${active.id}`,
    masterPriceVersion: map.masterPriceVersion,
    ahspDatabaseVersion: map.ahspDatabaseVersion,
  };
}

/**
 * MASTER PRICING §12 — the effective pricing state for a whole PROJECT,
 * for export labelling (Excel 5-sheet + 16-sheet cover + PDF cover).
 * The mode comes from the project record; the pins come from the
 * project's ACTIVE estimate version when the caller supplies the
 * version list (same rule as the §9 collector: by
 * `activeEstimateVersionId`, else the latest by timestamp). When no
 * versions are supplied — or the active version carries no pins — the
 * pins fall back to the legacy defaults with pinSource LEGACY_DEFAULT,
 * so the label never claims a recorded pin it did not see. Pure read;
 * the project is never mutated.
 */
export function effectiveProjectPricingStateForProject(
  project: Project,
  versions?: readonly EstimateVersion[] | null,
): EffectiveProjectPricingState {
  const active = findActiveEstimateVersion(project, versions);
  return effectiveProjectPricingState({
    pricingMode: project.pricingMode ?? null,
    pinnedAhspDatabaseVersion: active?.ahspDatabaseVersion ?? null,
    pinnedMasterPriceVersion: active?.masterPriceVersion ?? null,
  });
}

/** Indonesian mode labels for export artefacts (§12). */
export const PROJECT_PRICING_MODE_LABELS_ID: Record<ProjectPricingMode, string> = {
  LIVE_MASTER_PRICE: 'Live — harga master kini',
  SNAPSHOT_PRICE: 'Snapshot — harga beku proyek',
  PROJECT_OVERRIDE: 'Override — harga proyek',
};

/**
 * One-line pricing-basis label for export artefacts (§12). Pin sources
 * are named explicitly: a recorded pin reads `AHSP 2026.2`, a legacy
 * default reads `AHSP 2026.1 (default)` — the label never presents a
 * default as a recorded pin.
 */
export function formatPricingBasisLabel(state: EffectiveProjectPricingState): string {
  const modeLabel = PROJECT_PRICING_MODE_LABELS_ID[state.mode];
  const modeNote = state.modeSource === 'DEFAULT_SNAPSHOT' ? ' (default snapshot)' : '';
  const ahspNote = state.pinSource === 'LEGACY_DEFAULT' ? ' (default)' : '';
  const masterNote = state.masterPinSource === 'LEGACY_DEFAULT' ? ' (default)' : '';
  return `Mode ${modeLabel}${modeNote} • AHSP ${state.pinnedAhspDatabaseVersion}${ahspNote} • Harga master ${state.pinnedMasterPriceVersion}${masterNote}`;
}

// ===========================================================================
// (b) SUMBER KATALOG BERVERSI + RESOLUSI
// ===========================================================================

/**
 * A source of versioned AHSP catalog content (§10 (b)). The caller
 * supplies the content: the LIVE runtime catalog covers the ACTIVE
 * version, and snapshot contents (e.g. loaded from
 * `data/ahsp2026/versions/*.json` by §13) cover pinned versions.
 * A version with no content answers NULL — never a substitute.
 */
export interface VersionedAhspCatalogSource {
  /** Items of one family at one version; null when the version's content is not available. */
  getVersionItems(family: AhspFamily, versionId: string): readonly NationalAHSPItem[] | null;
  /** The currently active version for a family (the §8 pointer). */
  getActiveVersion(family: AhspFamily): string;
}

/**
 * MASTER PRICING §13 — exported for the snapshot loader: the
 * contents map key (`${family}|${versionId}`) is the §10 contract
 * and must be computed by ONE function, never re-derived by string
 * interpolation in the loader (drift would silently orphan pinned
 * versions).
 */
export function versionContentKey(family: AhspFamily, versionId: string): string {
  return `${family}|${versionId}`;
}

/**
 * Build a versioned catalog source (§10 (b)). Lookup order per
 * (family, version): (1) the injected `contents` map (snapshot files,
 * fixture content); (2) the LIVE runtime catalog — ONLY when the
 * requested version IS the active version (the live catalog is the
 * active version's content; serving it for a pinned older version
 * would silently substitute new content for old). Anything else → null.
 */
export function createVersionedCatalogSource(input: {
  activeVersions: Readonly<Record<AhspFamily, string>>;
  /** Versioned snapshot contents, keyed `${family}|${versionId}`. */
  contents?: Readonly<Record<string, readonly NationalAHSPItem[]>>;
  /** Serve the live runtime catalog as the ACTIVE version's content (default true). */
  includeLiveCatalog?: boolean;
}): VersionedAhspCatalogSource {
  const contents = input.contents ?? {};
  const includeLiveCatalog = input.includeLiveCatalog ?? true;
  const liveByFamily = new Map<AhspFamily, readonly NationalAHSPItem[]>();
  return {
    getVersionItems(family, versionId) {
      const keyed = contents[versionContentKey(family, versionId)];
      if (keyed) return keyed;
      if (includeLiveCatalog && versionId === input.activeVersions[family]) {
        let live = liveByFamily.get(family);
        if (!live) {
          const domain = AHSP_FAMILY_DOMAINS[family];
          live = ALL_OFFICIAL_AHSP_ITEMS.filter((item) => item.domain === domain);
          liveByFamily.set(family, live);
        }
        return live;
      }
      return null;
    },
    getActiveVersion(family) {
      return input.activeVersions[family];
    },
  };
}

export interface VersionedResolutionInput {
  family: AhspFamily;
  code: string;
  pricingMode?: ProjectPricingMode | null;
  pinnedAhspDatabaseVersion?: string | null;
  source: VersionedAhspCatalogSource;
  /** Frozen per-component prices for SNAPSHOT_PRICE mode (from the project's snapshot). */
  snapshotRef?: ComponentPriceMapRef | null;
  /** Project-specific override prices for PROJECT_OVERRIDE mode. */
  overrideRef?: ComponentPriceMapRef | null;
}

export interface VersionedAhspItemResolution {
  item: NationalAHSPItem;
  /** The version the item was loaded from (the pin, or the active pointer for LIVE). */
  versionId: string;
  pricingMode: ProjectPricingMode;
}

/**
 * Load one AHSP item from the version the project resolves against
 * (§10 (b)). LIVE → the active pointer; SNAPSHOT / OVERRIDE → the pin
 * (legacy unpinned ⇒ 2026.1). Throws when the pinned version's content
 * is unavailable or the code is absent/ambiguous in that version
 * (fail-closed — never substitutes live content for pinned content).
 */
export function resolveVersionedAhspItem(
  input: VersionedResolutionInput,
): VersionedAhspItemResolution {
  const { mode } = resolveEffectiveProjectPricingMode(input.pricingMode ?? null);
  const activeVersions: Record<AhspFamily, string> = {
    CIPTA_KARYA: input.source.getActiveVersion('CIPTA_KARYA'),
    BINA_MARGA: input.source.getActiveVersion('BINA_MARGA'),
    SUMBER_DAYA_AIR: input.source.getActiveVersion('SUMBER_DAYA_AIR'),
    SMKK: input.source.getActiveVersion('SMKK'),
  };
  const versionId = resolveProjectAhspVersion({
    pricingMode: mode,
    pinnedAhspDatabaseVersion: input.pinnedAhspDatabaseVersion ?? null,
    family: input.family,
    activeVersions,
  });
  const items = input.source.getVersionItems(input.family, versionId);
  if (!items) {
    throw new Error(
      `Cannot resolve ${input.family} ${input.code}: version ${versionId} content is not available ` +
        `(the project pins ${versionId} but no snapshot content was supplied for it — refusing to substitute live content)`,
    );
  }
  const maps = buildCatalogMaps(items);
  const item = findCatalogItemForCode(maps, input.code);
  if (!item) {
    throw new Error(
      `Cannot resolve ${input.family} ${input.code}: no item with that code in version ${versionId}` +
        (maps.ambiguousCodes.has(input.code.trim().toLowerCase())
          ? ' (the code is ambiguous in this version — it names more than one item)'
          : ''),
    );
  }
  return { item, versionId, pricingMode: mode };
}

export interface VersionedAhspUnitPriceResolution extends VersionedAhspItemResolution {
  composition: AhspUnitPriceComposition;
}

/**
 * Resolve one AHSP item's unit price from the version the project pins
 * (§10 (b)). The composition is ALWAYS computed through an explicit
 * pricing context — never the code-keyed default cache (§10 (c)).
 */
export function resolveVersionedAhspUnitPrice(
  input: VersionedResolutionInput,
): VersionedAhspUnitPriceResolution {
  const { item, versionId, pricingMode } = resolveVersionedAhspItem(input);
  const context = buildProjectPricingContext({
    mode: pricingMode,
    snapshotRef: input.snapshotRef ?? null,
    overrideRef: input.overrideRef ?? null,
  });
  const composition = priceResolver2026.resolveAhspUnitPrice(item, { pricingContext: context });
  return { item, versionId, pricingMode, composition };
}

// ===========================================================================
// (b)/(e) SNAPSHOT + OVERRIDE REFS, PRICING CONTEXT
// ===========================================================================

/** A priced component (structural — accepts AHSPComponent and snapshot components alike). */
export interface PricedComponentLike {
  code?: string | null;
  name?: string | null;
  unit?: string | null;
  unitPrice?: number | null;
}

/**
 * Build a snapshot price ref from a project snapshot's frozen
 * components (§10 (b)/(e)). Components without a usable positive
 * price are skipped (a missing price stays missing — never Rp0).
 * Accepts either `AHSPProjectSnapshot` shape (both declare the same
 * component arrays + version fields).
 */
export function buildSnapshotPriceRef(snapshot: {
  laborComponents?: readonly PricedComponentLike[] | null;
  materialComponents?: readonly PricedComponentLike[] | null;
  equipmentComponents?: readonly PricedComponentLike[] | null;
  ahspDatabaseVersion?: string | null;
  masterPriceVersion?: string | null;
  code?: string | null;
  ahspId?: string | null;
}): ComponentPriceMapRef {
  const components: PricedComponentLike[] = [
    ...(snapshot.laborComponents ?? []),
    ...(snapshot.materialComponents ?? []),
    ...(snapshot.equipmentComponents ?? []),
  ];
  return buildComponentPriceRef(components, {
    label: `snapshot:${snapshot.ahspId ?? snapshot.code ?? 'unknown'}`,
    masterPriceVersion: snapshot.masterPriceVersion ?? null,
    ahspDatabaseVersion: snapshot.ahspDatabaseVersion ?? null,
  });
}

/**
 * Build an override price ref from `ProjectPriceEngine` override
 * records (§10 (e) — the engine store, contracts shape). Only ACTIVE
 * overrides enter the map; an inactive override never prices a
 * component. The store is READ as-is; nothing here writes to it.
 */
export function buildOverrideRefFromEngineOverrides(
  overrides: readonly EngineProjectPriceOverride[],
  opts?: { label?: string | null },
): ComponentPriceMapRef {
  const active = overrides.filter((o) => o.active);
  return buildComponentPriceRef(
    active.map((o) => ({
      code: o.materialCode ?? o.materialId,
      name: o.materialName ?? null,
      unit: o.unit,
      unitPrice: o.price,
    })),
    { label: opts?.label ?? 'project-overrides:engine' },
  );
}

/**
 * Build an override price ref from the ProjectContext override store
 * (§10 (e) — the `ezrab_prod_price_overrides` shape). Reuses §9's
 * mapping exactly (`buildProjectOverrideRef`); only ACTIVE overrides
 * (`isOverridden`) enter the map.
 */
export function buildOverrideRefFromProjectOverrides(
  overrides: readonly ProjectPriceOverride[] | undefined,
  projectId: string,
): ComponentPriceMapRef {
  return buildProjectOverrideRef(overrides, projectId).context.overrideRef ?? {
    pricesByComponentKey: {},
    label: `project-overrides:${projectId}`,
    masterPriceVersion: null,
    ahspDatabaseVersion: null,
  };
}

/**
 * Read a project's LIVE overrides from the `ProjectPriceEngine`
 * singleton and build the override ref (§10 (e)). The engine is the
 * reuse path for the override store — this function never invents
 * override prices and never writes to the store.
 */
export function buildOverrideRefForProject(
  projectId: string,
  engine?: ProjectPriceEngine,
): ComponentPriceMapRef {
  const eng = engine ?? ProjectPriceEngine.getInstance();
  return buildOverrideRefFromEngineOverrides(eng.getProjectOverrides(projectId), {
    label: `project-overrides:${projectId}`,
  });
}

/**
 * Merge a snapshot price map with an override map (§10 (e)): the
 * override wins per component key; every other key follows the pinned
 * snapshot. The §6 resolver consults ONE ref per mode, so this merge
 * is how OVERRIDE + pin compose without touching the resolver. The
 * merged label records both sources (provenance, never silent).
 */
export function mergeSnapshotAndOverrideRefs(
  snapshotRef: ComponentPriceMapRef | null | undefined,
  overrideRef: ComponentPriceMapRef | null | undefined,
  opts?: { label?: string | null },
): ComponentPriceMapRef {
  const pricesByComponentKey: Record<string, number> = {
    ...(snapshotRef?.pricesByComponentKey ?? {}),
    ...(overrideRef?.pricesByComponentKey ?? {}),
  };
  const label =
    opts?.label ??
    `snapshot+override:${snapshotRef?.label ?? 'none'}|${overrideRef?.label ?? 'none'}`;
  return {
    pricesByComponentKey,
    label,
    masterPriceVersion: overrideRef?.masterPriceVersion ?? snapshotRef?.masterPriceVersion ?? null,
    ahspDatabaseVersion: overrideRef?.ahspDatabaseVersion ?? snapshotRef?.ahspDatabaseVersion ?? null,
  };
}

/**
 * Build the resolver pricing context for a project (§10 (b)/(e)).
 * ALWAYS returns an explicit context — never null — so versioned
 * resolutions bypass the code-keyed default cache (§10 (c), the §9
 * Keputusan 7 pattern). A LIVE context resolves exactly like a
 * default query; it only bypasses the cache.
 *
 * OVERRIDE + pin (§10 (e)): when a snapshot ref is supplied, the
 * context's override map is the MERGE (snapshot base, override
 * overlay); without a snapshot, plain overrides + live fallback (§6).
 */
export function buildProjectPricingContext(input: {
  mode: ProjectPricingMode;
  snapshotRef?: ComponentPriceMapRef | null;
  overrideRef?: ComponentPriceMapRef | null;
}): ProjectPricingContext {
  const mode = assertValidProjectPricingMode(input.mode);
  if (mode === 'SNAPSHOT_PRICE') {
    return { pricingMode: 'SNAPSHOT_PRICE', snapshotRef: input.snapshotRef ?? null };
  }
  if (mode === 'PROJECT_OVERRIDE') {
    const overrideRef = input.snapshotRef
      ? mergeSnapshotAndOverrideRefs(input.snapshotRef, input.overrideRef ?? null)
      : input.overrideRef ?? null;
    return { pricingMode: 'PROJECT_OVERRIDE', overrideRef };
  }
  return { pricingMode: 'LIVE_MASTER_PRICE' };
}

// ===========================================================================
// (d) ADOPSI EKSPLISIT
// ===========================================================================

/**
 * The change a SNAPSHOT / OVERRIDE project may adopt (§10 (d)).
 *
 * - Version kind: adopt a NEW AHSP version (the target must be the
 *   ACTIVE version in the supplied registry — adopting a draft or a
 *   superseded version is refused; a rollback adoption targets the
 *   rollback COPY, ACTIVE after publish). `targetMasterPriceVersion`
 *   defaults to the current label (a version change does not move
 *   prices).
 * - Price kind: adopt NEW master prices. `targetMasterPriceVersion`
 *   is REQUIRED — pinning new prices under the old label would lie
 *   about what the snapshot was priced against.
 */
export type AdoptionChangeDescription =
  | {
      kind: 'AHSP_VERSION_CHANGE' | 'ROLLBACK';
      family: AhspFamily;
      sourceVersionId: string;
      targetVersionId: string;
      sourceItems: readonly NationalAHSPItem[];
      targetItems: readonly NationalAHSPItem[];
      diff: AHSPVersionDiff;
      sourceContentChecksum: string;
      targetContentChecksum: string;
      registry: AhspVersionRegistryState;
      targetMasterPriceVersion?: string;
    }
  | {
      kind: 'MASTER_PRICE_CHANGE';
      priceChanges: readonly MasterPriceChangeInput[];
      catalogItems: readonly NationalAHSPItem[];
      targetMasterPriceVersion: string;
    };

export interface AdoptionPreviewInput {
  project: ProjectImpactInput;
  change: AdoptionChangeDescription;
  /** Master price version label the preview is computed under (default: current). */
  masterPriceVersion?: string;
  computedAt?: string;
}

/**
 * The adoption preview (§10 (d)): the §9 preview (with the project's
 * `adoptionPreview` aggregates) + the per-item old-vs-new diff + the
 * repriced items the adoption would freeze. Data only — §11 renders it.
 *
 * `adoptedItems` is NULL when any item is UNCOMPUTABLE (e.g. its AHSP
 * item was removed in the new version) — the approval then refuses the
 * adoption (fail-closed); the reasons name every uncomputable item.
 */
export interface AdoptionPreview {
  /** The §9 preview computed with the project in its recorded mode. */
  preview: MasterPriceImpactPreview;
  /**
   * SNAPSHOT only: the same change computed as-if LIVE — the per-item
   * old-vs-new diff. Null for OVERRIDE (its own impact IS the diff).
   */
  livePreview: MasterPriceImpactPreview | null;
  /** The adopting project's impact in `preview` (LOCKED_SNAPSHOT + adoptionPreview, or the OVERRIDE delta). */
  projectImpact: ProjectImpact;
  /** The adopting project's impact in `livePreview` (SNAPSHOT only). */
  liveProjectImpact: ProjectImpact | null;
  /** The repriced items the adoption would freeze (null when uncomputable). */
  adoptedItems: RabItem[] | null;
  /** Per-item impacts behind `adoptedItems` (the diff; UNCHANGED items are counted, not listed — §9's rule). */
  adoptedItemImpacts: ProjectItemImpact[];
  /** Totals of the adopted items via the canonical engine (null when uncomputable). */
  adoptedNewGrandTotal: number | null;
  adoptedNewDirectCost: number | null;
  adoptedDeltaGrandTotal: number | null;
  adoptedDeltaDirectCost: number | null;
  uncomputableReasons: string[];
  /** What the adopted version would pin. */
  targetAhspDatabaseVersion: string;
  targetMasterPriceVersion: string;
  changeKind: ImpactPreviewKind;
}

/**
 * Run the §9 repricers over one project's items and return the
 * repriced items + impacts (§10 (d)). This replays the preview's OWN
 * repricers (`buildAhspVersionItemRepricer` /
 * `buildMasterPriceItemRepricer` + `repriceProjectItem`) — the adopted
 * items are the preview's items, by construction. The loop mirrors
 * §9's `runRepricing` exactly (same skip rules, same UNCHANGED
 * exclusion, same uncomputable reasons).
 */
function repriceProjectItemsForAdoption(
  project: ProjectImpactInput,
  change: AdoptionChangeDescription,
  preview: MasterPriceImpactPreview,
): { items: RabItem[]; impacts: ProjectItemImpact[]; uncomputableReasons: string[] } {
  let resolveCatalogItem: (rabItem: RabItem) => NationalAHSPItem | null;
  let repricer: ItemRepricer;
  if (change.kind === 'MASTER_PRICE_CHANGE') {
    const catalogMaps = buildCatalogMaps(change.catalogItems);
    // Binding changes only: refused keys (non-binding) and no-ops
    // (old == new) move nothing — the same filter §9's compute used.
    const refusedKeys = new Set(preview.change.nonBindingChanges.map((n) => n.key));
    const changedPrices = new Map<string, number>();
    for (const c of change.priceChanges) {
      const key = priceChangeKey(c);
      if (refusedKeys.has(key)) continue;
      if (c.oldPrice === c.newPrice) continue;
      if (c.newPrice === null) continue;
      changedPrices.set(key, c.newPrice);
    }
    const index = buildResourceComponentIndex(change.catalogItems);
    const affectedItemIds = new Set<string>();
    for (const key of changedPrices.keys()) {
      const refs = index.byKey.get(key);
      if (refs) for (const ref of refs) affectedItemIds.add(ref.itemId);
    }
    repricer = buildMasterPriceItemRepricer({ affectedItemIds, changedPrices, project });
    resolveCatalogItem = (rabItem: RabItem): NationalAHSPItem | null =>
      resolveOldCatalogItem(catalogMaps, rabItem);
  } else {
    const sourceMaps = buildCatalogMaps(change.sourceItems);
    const targetMaps = buildCatalogMaps(change.targetItems);
    repricer = buildAhspVersionItemRepricer({
      targetMaps,
      diff: change.diff,
      sourceVersionId: change.sourceVersionId,
      targetVersionId: change.targetVersionId,
      project,
    });
    resolveCatalogItem = (rabItem: RabItem): NationalAHSPItem | null =>
      resolveOldCatalogItem(sourceMaps, rabItem);
  }
  const items: RabItem[] = [];
  const impacts: ProjectItemImpact[] = [];
  const uncomputableReasons: string[] = [];
  for (const item of project.items) {
    const catalogItem = resolveCatalogItem(item);
    const { newItem, impact } = repriceProjectItem(item, catalogItem, repricer);
    items.push(newItem);
    if (impact.status !== 'UNCHANGED') impacts.push(impact);
    if (impact.status === 'UNCOMPUTABLE') {
      uncomputableReasons.push(`${impact.code || impact.rabItemId}: ${impact.reason}`);
    }
  }
  return { items, impacts, uncomputableReasons };
}

/**
 * Compute the adoption preview for a SNAPSHOT / OVERRIDE project
 * (§10 (d), step 1–2): the §9 preview + the per-item old-vs-new diff
 * + the repriced items the adoption would freeze. PURE (no writes,
 * no state changes).
 *
 * Throws when: the project is LIVE (nothing to adopt); the target
 * version is not ACTIVE (version kind); the price kind has no new
 * master-price label; or the §9 preview is NOT_COMPUTED (never adopt
 * from a preview that could not be computed).
 */
export function previewAdoption(input: AdoptionPreviewInput): AdoptionPreview {
  const { mode } = resolveEffectiveProjectPricingMode(input.project.pricingMode ?? null);
  if (mode === 'LIVE_MASTER_PRICE') {
    throw new Error(
      `Project ${input.project.projectId} is LIVE_MASTER_PRICE — it already follows new prices and versions; there is nothing to adopt (adoption is for SNAPSHOT / OVERRIDE projects)`,
    );
  }
  const computedAt = input.computedAt ?? new Date().toISOString();
  const masterPriceVersion = input.masterPriceVersion ?? MASTER_PRICE_VERSION;
  const change = input.change;

  let targetAhspDatabaseVersion: string;
  let targetMasterPriceVersion: string;
  if (change.kind === 'AHSP_VERSION_CHANGE' || change.kind === 'ROLLBACK') {
    const targetRecord = getVersionRecord(change.registry, change.family, change.targetVersionId);
    if (!targetRecord) {
      throw new Error(
        `Cannot adopt ${change.family} ${change.targetVersionId}: no such version in the registry`,
      );
    }
    if (targetRecord.status !== 'ACTIVE') {
      throw new Error(
        `Cannot adopt ${change.family} ${change.targetVersionId}: version status is ${targetRecord.status} (only the ACTIVE version can be adopted)`,
      );
    }
    const activeNow = getRegistryActiveVersion(change.registry, change.family);
    if (activeNow !== change.targetVersionId) {
      throw new Error(
        `Cannot adopt ${change.family} ${change.targetVersionId}: the active pointer is ${activeNow} (adoption always targets the active version)`,
      );
    }
    targetAhspDatabaseVersion = change.targetVersionId;
    targetMasterPriceVersion = change.targetMasterPriceVersion ?? masterPriceVersion;
  } else {
    if (!change.targetMasterPriceVersion || change.targetMasterPriceVersion.trim() === '') {
      throw new Error(
        'Cannot adopt a master price change without a new master price version label (targetMasterPriceVersion) — pinning new prices under the old label would lie about what the snapshot was priced against',
      );
    }
    targetAhspDatabaseVersion =
      input.project.pinnedAhspDatabaseVersion ?? AHSP_BASELINE_VERSION_ID;
    targetMasterPriceVersion = change.targetMasterPriceVersion;
  }

  const computeChangePreview = (
    projects: readonly ProjectImpactInput[],
  ): MasterPriceImpactPreview => {
    if (change.kind === 'MASTER_PRICE_CHANGE') {
      return computeMasterPriceImpact({
        priceChanges: change.priceChanges,
        catalogItems: change.catalogItems,
        projects,
        masterPriceVersion,
        computedAt,
      });
    }
    return computeAhspVersionImpact({
      kind: change.kind,
      family: change.family,
      sourceVersionId: change.sourceVersionId,
      targetVersionId: change.targetVersionId,
      sourceItems: change.sourceItems,
      targetItems: change.targetItems,
      diff: change.diff,
      sourceContentChecksum: change.sourceContentChecksum,
      targetContentChecksum: change.targetContentChecksum,
      activeVersionIdAtCompute: getRegistryActiveVersion(change.registry, change.family),
      masterPriceVersion,
      projects,
      computedAt,
    });
  };

  const preview = computeChangePreview([input.project]);
  if (preview.status !== 'COMPUTED') {
    throw new Error(
      `Cannot preview adoption for project ${input.project.projectId}: the impact preview is ${preview.status} (${preview.notComputedReasons.join('; ') || preview.note})`,
    );
  }
  const projectImpact =
    preview.projects.projects.find((p) => p.projectId === input.project.projectId) ?? null;
  if (!projectImpact) {
    throw new Error(
      `Adoption preview did not return an impact for project ${input.project.projectId}`,
    );
  }

  // SNAPSHOT only: the as-if-LIVE preview is the per-item old-vs-new
  // diff (the locked preview lists no items — nothing changed there).
  // OVERRIDE projects are repriced directly by §9, so their own
  // impact already IS the diff.
  let livePreview: MasterPriceImpactPreview | null = null;
  let liveProjectImpact: ProjectImpact | null = null;
  if (mode === 'SNAPSHOT_PRICE') {
    const liveProject: ProjectImpactInput = { ...input.project, pricingMode: 'LIVE_MASTER_PRICE' };
    livePreview = computeChangePreview([liveProject]);
    if (livePreview.status !== 'COMPUTED') {
      throw new Error(
        `Cannot preview adoption for project ${input.project.projectId}: the as-if-LIVE preview is ${livePreview.status} (${livePreview.notComputedReasons.join('; ') || livePreview.note})`,
      );
    }
    liveProjectImpact =
      livePreview.projects.projects.find((p) => p.projectId === input.project.projectId) ?? null;
    if (!liveProjectImpact) {
      throw new Error(
        `Adoption preview did not return an as-if-LIVE impact for project ${input.project.projectId}`,
      );
    }
  }

  const repricing = repriceProjectItemsForAdoption(input.project, change, preview);
  const uncomputable = repricing.uncomputableReasons.length > 0;
  const oldSummary = recalculateCostSummary([...input.project.items], input.project.costSummary);
  let adoptedItems: RabItem[] | null = null;
  let adoptedNewGrandTotal: number | null = null;
  let adoptedNewDirectCost: number | null = null;
  let adoptedDeltaGrandTotal: number | null = null;
  let adoptedDeltaDirectCost: number | null = null;
  if (!uncomputable) {
    adoptedItems = repricing.items;
    const newSummary = recalculateCostSummary([...repricing.items], input.project.costSummary);
    adoptedNewGrandTotal = newSummary.grandTotal;
    adoptedNewDirectCost = newSummary.directCost;
    adoptedDeltaGrandTotal = SafeDecimalEngine.safeSubtract(newSummary.grandTotal, oldSummary.grandTotal);
    adoptedDeltaDirectCost = SafeDecimalEngine.safeSubtract(newSummary.directCost, oldSummary.directCost);
  }

  return {
    preview,
    livePreview,
    projectImpact,
    liveProjectImpact,
    adoptedItems,
    adoptedItemImpacts: repricing.impacts,
    adoptedNewGrandTotal,
    adoptedNewDirectCost,
    adoptedDeltaGrandTotal,
    adoptedDeltaDirectCost,
    uncomputableReasons: repricing.uncomputableReasons,
    targetAhspDatabaseVersion,
    targetMasterPriceVersion,
    changeKind: preview.kind,
  };
}

export interface AdoptionApprovalInput {
  adoption: AdoptionPreview;
  /** The project's CURRENT input (items as they are now — must fingerprint-match the preview). */
  currentProjectInput: ProjectImpactInput;
  /** The project record to update (its id must match the adoption's project). */
  project: Project;
  /** The project's current estimate-version list (never mutated — a new list is returned). */
  versions: readonly EstimateVersion[];
  /** Approval reason (≥10 characters, pola §4). Recorded verbatim on the new version's revisionNotes. */
  reason: string;
  actor?: string | null;
  now?: string;
  idGenerator?: () => string;
  /** Current state for freshness validation (recommended — pointer/baseline checks are skipped without it). */
  currentState?: CurrentImpactState;
  /** Registry state for re-validating the target version (recommended for version-kind adoption). */
  registry?: AhspVersionRegistryState;
  /**
   * Current effective prices per changed key (price kind only). When
   * absent, each key is re-resolved live via the resolver. Tests
   * inject the post-application prices here; production passes the
   * live resolutions (§9 `resolveCurrentBaselinePrices`).
   */
  currentPrices?: ReadonlyMap<string, number | null>;
  /**
   * §14 need #2 — the catalog the adopted items were priced against
   * (price kind: the live catalog; version kind: the ADOPTED catalog —
   * target items for the adopted family, live items for the rest).
   * When supplied, the created version carries
   * `componentPriceSnapshot` (a captured per-component price map —
   * §13 decision 11). When absent, no map is captured and QTO
   * SNAPSHOT keeps its honest live-fallback note.
   */
  catalogItems?: readonly NationalAHSPItem[];
}

export interface AdoptionResult {
  /** Full new version list: the old versions (untouched) + the created adoption version. */
  versions: EstimateVersion[];
  /** The created adoption version (pins the adopted versions; mode SNAPSHOT_PRICE). */
  created: EstimateVersion;
  /** The updated project record (active pointer moved; mode + overhead/profit unchanged). */
  project: Project;
  /** The repriced items frozen in the new version. */
  adoptedItems: RabItem[];
  oldGrandTotal: number;
  newGrandTotal: number;
  deltaGrandTotal: number;
}

/**
 * §14 need #2 — input for `buildAdoptionSnapshotMap`.
 */
export interface AdoptionSnapshotMapInput {
  /** The adopted (repriced) items whose component prices are frozen. */
  adoptedItems: readonly RabItem[];
  /** The catalog the adopted items were priced against. */
  catalogItems: readonly NationalAHSPItem[];
  /** The estimate version the map belongs to (the created adoption version). */
  estimateVersionId: string;
  /** Database versions the frozen values were taken against (§3 I-11). */
  masterPriceVersion: string | null;
  ahspDatabaseVersion: string | null;
  /** Post-application prices per changed key (price-kind adoption). */
  currentPrices?: ReadonlyMap<string, number | null>;
  /** The project's price overrides (OVERRIDE projects) — override prices win per component. */
  overrides?: readonly ProjectPriceOverride[];
  projectId?: string;
}

/**
 * §14 need #2 — CAPTURE the per-component price map for an adopted
 * version. Called at APPROVAL time (not preview time): the adopted
 * prices are only live now (step 8 of `approveAdoption` verified
 * them for price kind), so resolving the adopted items' components
 * live yields exactly the adopted prices.
 *
 * Price precedence per component key (mirrors the repricer):
 * project override > post-application master price (`currentPrices`)
 * > live composition price (which may itself be the baked AHSP
 * fallback — the adopted totals include baked subtotals, so freezing
 * the composition price keeps the map consistent with the frozen
 * totals).
 *
 * The map is built through `buildComponentPriceRef`, so its keys
 * match the resolver's context lookup exactly (code key, else
 * normalized-name key for codeless components; first write wins per
 * key — twin components sharing a key cannot be represented twice,
 * the same limitation the resolver's own context lookup has).
 *
 * Resolution uses an EXPLICIT LIVE pricing context (§10 (c)):
 * context-bearing queries never use the default cache, so a target
 * version's item sharing a code with a live item resolves its OWN
 * components, not a cached lookalike.
 */
export function buildAdoptionSnapshotMap(input: AdoptionSnapshotMapInput): ProjectPriceSnapshotMap {
  const maps = buildCatalogMaps(input.catalogItems);
  const liveContext = buildProjectPricingContext({ mode: 'LIVE_MASTER_PRICE' });
  const overridePrices =
    input.overrides !== undefined && input.overrides.length > 0
      ? buildProjectOverrideRef(input.overrides, input.projectId ?? '').overridePrices
      : null;
  const priced: Array<{
    code?: string | null;
    name?: string | null;
    unit?: string | null;
    unitPrice?: number | null;
  }> = [];
  for (const item of input.adoptedItems) {
    const catalogItem = resolveOldCatalogItem(maps, item);
    if (catalogItem === null) continue;
    const composition = priceResolver2026.resolveAhspUnitPrice(catalogItem, {
      pricingContext: liveContext,
    });
    const arrays: ReadonlyArray<{
      type: 'labor' | 'material' | 'equipment';
      raw: readonly { code: string; name: string; unit: string }[];
      pricedArr: readonly { unitPrice: number | null }[];
    }> = [
      { type: 'labor', raw: catalogItem.laborComponents, pricedArr: composition.labor.components },
      { type: 'material', raw: catalogItem.materialComponents, pricedArr: composition.material.components },
      { type: 'equipment', raw: catalogItem.equipmentComponents, pricedArr: composition.equipment.components },
    ];
    for (const arr of arrays) {
      arr.raw.forEach((rawComp, i) => {
        const pricedComp = arr.pricedArr[i];
        if (pricedComp === undefined) return;
        const key = componentLookupKey(rawComp, arr.type, catalogItem.domain);
        let price: number | null;
        if (overridePrices !== null && key !== '' && overridePrices.has(key)) {
          price = overridePrices.get(key) ?? null;
        } else if (key !== '' && input.currentPrices !== undefined && input.currentPrices.has(key)) {
          price = input.currentPrices.get(key) ?? null;
        } else {
          price = pricedComp.unitPrice;
        }
        priced.push({ code: rawComp.code, name: rawComp.name, unit: rawComp.unit, unitPrice: price });
      });
    }
  }
  const ref = buildComponentPriceRef(priced, {
    label: `adoption-snapshot:${input.estimateVersionId}`,
    masterPriceVersion: input.masterPriceVersion,
    ahspDatabaseVersion: input.ahspDatabaseVersion,
  });
  return {
    estimateVersionId: input.estimateVersionId,
    pricesByComponentKey: ref.pricesByComponentKey,
    masterPriceVersion: input.masterPriceVersion,
    ahspDatabaseVersion: input.ahspDatabaseVersion,
    capturedAt: new Date().toISOString(),
  };
}

/**
 * Approve an adoption and freeze it as a NEW estimate version
 * (§10 (d), step 3–4). The old versions are never touched; the old
 * items are never rewritten; the project's mode and overhead/profit
 * are unchanged — only the active-version pointer moves.
 *
 * Refuses (throws) when: the adoption has uncomputable items; the
 * reason is shorter than 10 characters; the preview is not COMPUTED;
 * the project id mismatches; the project inputs moved since the
 * preview (fingerprint); the preview is stale against the supplied
 * current state; the target version is no longer ACTIVE; the new
 * master prices are not live as previewed (price kind); or the
 * adopted items no longer total to the preview's numbers.
 */
export function approveAdoption(input: AdoptionApprovalInput): AdoptionResult {
  const { adoption } = input;

  // 1. The adoption must be computable.
  if (adoption.adoptedItems === null) {
    throw new Error(
      `Cannot adopt for project ${adoption.projectImpact.projectId}: ${adoption.uncomputableReasons.length} item(s) cannot be repriced (${adoption.uncomputableReasons.join('; ')}) — resolve them first`,
    );
  }
  const adoptedItems: RabItem[] = adoption.adoptedItems;
  // 2. Explicit approval with a reason (pola §4).
  const reason = (input.reason ?? '').trim();
  if (reason.length < ADOPTION_REASON_MIN_LENGTH) {
    throw new Error(
      `Adoption requires an explicit reason of at least ${ADOPTION_REASON_MIN_LENGTH} characters (got ${reason.length})`,
    );
  }
  // 3. The preview must be COMPUTED.
  if (adoption.preview.status !== 'COMPUTED') {
    throw new Error(
      `Cannot adopt from a ${adoption.preview.status} preview (${adoption.preview.notComputedReasons.join('; ') || adoption.preview.note})`,
    );
  }
  // 4. Identity: the approval is for THIS project.
  if (
    input.currentProjectInput.projectId !== input.project.id ||
    input.currentProjectInput.projectId !== adoption.projectImpact.projectId
  ) {
    throw new Error(
      `Adoption project mismatch: preview is for ${adoption.projectImpact.projectId}, approval supplied ${input.currentProjectInput.projectId} / ${input.project.id}`,
    );
  }
  // 5. The project must be unchanged since the preview (fingerprint).
  const currentFingerprint = computeProjectsFingerprint([input.currentProjectInput]);
  if (
    adoption.preview.fingerprint.projectsFingerprint !== '' &&
    currentFingerprint !== adoption.preview.fingerprint.projectsFingerprint
  ) {
    throw new Error(
      'Project inputs changed since the adoption preview was computed (a project, item, mode, or override moved) — re-run the preview before approving',
    );
  }
  // 6. Freshness against the current world (when the caller supplies it).
  //    Price-kind adoption happens AFTER the change is applied, so the
  //    §9 baseline/master-version checks (which expect the PRE-change
  //    world) do not apply — the applied-prices check (step 8) replaces
  //    them. Only the catalog + project-input checks still apply.
  if (input.currentState) {
    let stateForValidation: CurrentImpactState = input.currentState;
    if (adoption.changeKind === 'MASTER_PRICE_CHANGE') {
      const reduced: CurrentImpactState = {};
      if (input.currentState.catalogChecksum !== undefined) {
        reduced.catalogChecksum = input.currentState.catalogChecksum;
      }
      if (input.currentState.projectsFingerprint !== undefined) {
        reduced.projectsFingerprint = input.currentState.projectsFingerprint;
      }
      stateForValidation = reduced;
    }
    const freshness = validateImpactPreviewFreshness(adoption.preview, stateForValidation);
    if (!freshness.fresh) {
      throw new Error(
        `Adoption preview is stale: ${freshness.reasons.join('; ')} — re-run the preview before approving`,
      );
    }
  }
  // 7. Version kind: the target must STILL be the active version.
  if (adoption.changeKind !== 'MASTER_PRICE_CHANGE' && input.registry) {
    const family = adoption.preview.change.family;
    if (family !== null) {
      const targetRecord = getVersionRecord(input.registry, family, adoption.targetAhspDatabaseVersion);
      if (!targetRecord || targetRecord.status !== 'ACTIVE') {
        throw new Error(
          `Cannot adopt ${family} ${adoption.targetAhspDatabaseVersion}: it is no longer the ACTIVE version`,
        );
      }
    }
  }
  // 8. Price kind: the new prices must actually be live now.
  if (adoption.changeKind === 'MASTER_PRICE_CHANGE') {
    const notApplied: string[] = [];
    const refusedKeys = new Set(adoption.preview.change.nonBindingChanges.map((n) => n.key));
    for (const change of adoption.preview.change.priceChanges) {
      const key = priceChangeKey(change);
      if (refusedKeys.has(key)) continue;
      if (change.oldPrice === change.newPrice) continue;
      const current = input.currentPrices
        ? (input.currentPrices.get(key) ?? null)
        : verifyChangeBaseline(change).resolvedPrice;
      if (current !== change.newPrice) {
        notApplied.push(
          `${key}: expected live price ${change.newPrice === null ? 'unpriced' : `Rp${change.newPrice.toLocaleString('id-ID')}`}, ` +
            `currently ${current === null ? 'unpriced' : `Rp${current.toLocaleString('id-ID')}`}`,
        );
      }
    }
    if (notApplied.length > 0) {
      throw new Error(
        `Cannot adopt the master price change: the new prices are not live as previewed (${notApplied.join('; ')}) — apply the price change first, then adopt`,
      );
    }
  }
  // 9. Totals guard: the adopted items must total to the preview's numbers.
  const newSummary = recalculateCostSummary([...adoptedItems], input.currentProjectInput.costSummary);
  if (adoption.adoptedNewGrandTotal !== null && newSummary.grandTotal !== adoption.adoptedNewGrandTotal) {
    throw new Error(
      `Adoption totals do not match the preview (recomputed Rp${newSummary.grandTotal.toLocaleString('id-ID')} vs preview Rp${adoption.adoptedNewGrandTotal.toLocaleString('id-ID')}) — refusing to freeze inconsistent values`,
    );
  }
  const oldSummary = recalculateCostSummary(
    [...input.currentProjectInput.items],
    input.currentProjectInput.costSummary,
  );

  // 10. Freeze the adopted values as a NEW estimate version. The old
  //     versions are never touched; the old items are never rewritten.
  const now = input.now ?? new Date().toISOString();
  let baseVersions: EstimateVersion[] = [...input.versions];
  if (baseVersions.length === 0) {
    // No history yet: materialise the baseline from the PRE-adoption
    // items first, so the baseline records what the project was — the
    // adoption revision then records what it became.
    baseVersions = [
      buildBaselineVersion(input.project.id, input.currentProjectInput.items, {
        now,
        author: input.actor ?? undefined,
        baselineTimestamp: input.project.createdAt,
      }),
    ];
  }
  const isVersionKind = adoption.changeKind !== 'MASTER_PRICE_CHANGE';
  const label = isVersionKind
    ? `Adopsi AHSP ${adoption.targetAhspDatabaseVersion}`
    : `Adopsi harga master ${adoption.targetMasterPriceVersion}`;
  const description = isVersionKind
    ? `Adopsi eksplisit versi AHSP ${adoption.preview.change.sourceVersionId ?? '?'} → ${adoption.targetAhspDatabaseVersion} (total RAB Rp${oldSummary.grandTotal.toLocaleString('id-ID')} → Rp${newSummary.grandTotal.toLocaleString('id-ID')})`
    : `Adopsi eksplisit harga master ${adoption.targetMasterPriceVersion} (total RAB Rp${oldSummary.grandTotal.toLocaleString('id-ID')} → Rp${newSummary.grandTotal.toLocaleString('id-ID')})`;
  const result = createRevision(
    baseVersions,
    input.project.id,
    adoptedItems,
    {
      label,
      description,
      revisionNotes: reason,
      versionStamps: {
        ahspDatabaseVersion: adoption.targetAhspDatabaseVersion,
        masterPriceVersion: adoption.targetMasterPriceVersion,
        pricingMode: 'SNAPSHOT_PRICE',
      },
    },
    { now, author: input.actor ?? undefined, idGenerator: input.idGenerator },
  );

  // 11. §14 need #2 — capture the per-component price map on the new
  //     version, so QTO SNAPSHOT (and any later reader) resolves the
  //     ADOPTED prices, never live prices. Capture happens here (not
  //     at preview time) because the adopted prices are only live NOW
  //     (step 8 verified them for price kind). Without catalog items
  //     the caller cannot enumerate components — the map stays absent
  //     and QTO keeps its honest live-fallback note (§13 decision 11).
  let created: EstimateVersion = result.created;
  if (input.catalogItems !== undefined && input.catalogItems.length > 0) {
    const snapshotMap = buildAdoptionSnapshotMap({
      adoptedItems,
      catalogItems: input.catalogItems,
      estimateVersionId: result.created.id,
      masterPriceVersion: adoption.targetMasterPriceVersion,
      ahspDatabaseVersion: adoption.targetAhspDatabaseVersion,
      currentPrices: input.currentPrices,
      overrides: input.currentProjectInput.overrides,
      projectId: input.project.id,
    });
    created = { ...result.created, componentPriceSnapshot: snapshotMap };
  }
  const updatedProject: Project = {
    ...input.project,
    activeEstimateVersionId: created.id,
    updatedAt: now,
  };
  return {
    versions: result.versions.map((v) => (v.id === created.id ? created : v)),
    created,
    project: updatedProject,
    adoptedItems: [...adoptedItems],
    oldGrandTotal: oldSummary.grandTotal,
    newGrandTotal: newSummary.grandTotal,
    deltaGrandTotal: SafeDecimalEngine.safeSubtract(newSummary.grandTotal, oldSummary.grandTotal),
  };
}
