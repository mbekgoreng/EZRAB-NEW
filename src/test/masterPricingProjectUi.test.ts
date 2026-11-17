/**
 * MASTER PRICING §11 — PROJECT UI LOGIC (admin workflows, D7).
 *
 * Tests the PURE logic layer behind the §11 admin UI
 * (`src/engine/pricing/admin/masterPricingUiLogic.ts`): the §11.3 sync
 * status derivation (incl. the hard rule "never SYNCED when
 * unresolved"), the 12-field component detail, master-record
 * search/filters/rows, linked AHSP references, the §11.4 dialog
 * content (real §9 numbers, never a generic "Are you sure?"), the §11.2
 * registry view-model + sync check + version compare, the §4 admin-gate
 * view-model, and the §10 mode/adoption wiring helpers.
 *
 * React rendering is NOT tested here: this repo's vitest environment
 * has no jsdom/testing-library, so component trees cannot mount. The
 * components are thin renders over this tested logic (see the §11
 * report) — every number, status, and gate decision they show comes
 * from a function pinned below.
 *
 * Fixtures mirror §9/§10 (same live-catalog items, same computed
 * numbers — the §9/§10 calibration, re-used, not re-invented):
 *  - 1.1.1.1 "Pagar kayu" (CK): FULL composition Rp715.816 = L.01 Pekerja
 *    OH ×0,6 @100.000 + L.02 ×0,2 + ×0,2 @145.000 + material.
 *    1.1.1.2 Rp577.752, 1.1.1.3 Rp343.854 (all codeless).
 *  - L.01 change OH 100.000 → 110.000 (+Rp6.000/unit on 1.1.1.1).
 *  - Project AB (A vol 10 + B vol 2): old Rp8.313.664.
 *    Price adoption: +Rp60.000 → Rp8.373.664.
 *    Version adoption (coef 0,6 → 0,7): +Rp100.000 → Rp8.413.664.
 *  - priceMaster counts (fase2 audit, re-pinned + adopsi pasar ronde 2 2026-11-17): 899 records —
 *    material 360 / labor 49 / equipment 43; VERIFIED 13.
 */

import { describe, expect, it } from 'vitest';

import { ALL_OFFICIAL_AHSP_ITEMS } from '../data/nationalCostDatabase/masterRegistry';
import {
  AHSP_BASELINE_VERSION_ID,
  buildRegistryState,
  compareAhspSnapshots,
  computeAhspContentChecksum,
  snapshotPathFor,
  type AhspFamily,
  type AhspVersionRecord,
  type AhspVersionRegistryState,
} from '../data/nationalCostDatabase/ahspVersioning';
import { AHSP_VERSION_RECORDS } from '../data/nationalCostDatabase/ahspVersionPointer.generated';
import type { NationalAHSPItem } from '../data/nationalCostDatabase/types';
import { RESOURCE_PRICE_RECORDS } from '../data/priceDatabase2026/priceMaster.generated';
import { priceResolver2026 } from '../data/priceDatabase2026/resolver';
import type {
  AhspComponentPricing,
  ProjectPricingMode,
  ResourcePriceRecord,
} from '../data/priceDatabase2026/types';
import {
  adminGateForOperation,
  ahspVersionWriteGate,
  AHSP_COMPONENT_SYNC_STATUSES,
  AHSP_FAMILY_LABELS_ID,
  buildAhspComponentDetail,
  buildAhspItemComponentDetails,
  buildAhspRegistryViewModel,
  buildHistoryRow,
  buildMasterRecordRow,
  buildPriceUpdateDialogContent,
  buildProjectImpactInput,
  buildVersionCompareViewModel,
  checkAhspFamilySync,
  deriveAhspComponentSyncStatus,
  familyAdoptionAvailability,
  filterMasterRecords,
  formatCoefficient,
  formatDateId,
  formatPercentChange,
  formatPriceLocation,
  formatRupiah,
  formatRupiahDelta,
  isUnresolvedSyncStatus,
  linkedAhspReferencesForKey,
  masterRecordRegions,
  PRICING_MODE_LABELS_ID,
  summarizeAdoptionPreview,
  summarizeLinkedReferences,
  toMasterPriceChangeInput,
  validateAdoptionReason,
  validateProposedPrice,
  type AhspComponentSyncInput,
} from '../engine/pricing/admin/masterPricingUiLogic';
import type { MasterPriceHistoryEntry } from '../engine/pricing/admin/masterPriceHistory';
import {
  buildResourceComponentIndex,
  computeMasterPriceImpact,
  markPreviewStale,
  type MasterPriceChangeInput,
  type ProjectImpactInput,
} from '../engine/pricing/impact/masterPriceImpactPreview';
import { previewAdoption } from '../engine/pricing/projectPriceModes';
import type { AHSPComponent, EstimateVersion, Project, RabItem } from '../types';

// ---------------------------------------------------------------------------
// Fixtures (§9/§10 calibration, mirrored)
// ---------------------------------------------------------------------------

const T0 = '2026-11-16T00:00:00.000Z';
const REASON = 'Adopsi harga AHSP 2026.2';

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function realItem(code: string): NationalAHSPItem {
  const found = ALL_OFFICIAL_AHSP_ITEMS.find((i) => i.code === code);
  if (!found) throw new Error(`Fixture item ${code} not in live catalog`);
  return clone(found);
}

function smallCatalog(): NationalAHSPItem[] {
  return [realItem('1.1.1.1'), realItem('1.1.1.2'), realItem('1.1.1.3')];
}

function versionTargetItems(): NationalAHSPItem[] {
  const [a, b, c] = smallCatalog();
  const aPrime = clone(a);
  aPrime.laborComponents[0].coefficient = 0.7;
  aPrime.laborComponents[0].total = 70000;
  aPrime.totalLabor = 137600;
  aPrime.unitPrice = 725816;
  const d = clone(c);
  d.id = 'AHSP-FIXTURE-D';
  d.code = '1.1.1.99';
  d.codeNormalized = '111199';
  d.name = 'Fixture added item (not a real AHSP item)';
  return [aPrime, b, d];
}

function makeRabItem(partial: Partial<RabItem> & { id: string }): RabItem {
  return {
    id: partial.id,
    no: partial.no ?? 1,
    code: partial.code ?? '1.1.1.1',
    ahspCode: partial.ahspCode ?? '1.1.1.1',
    description: partial.description ?? 'Pembuatan 1 m’ pagar sementara dari kayu tinggi 2 meter',
    volume: partial.volume ?? 10,
    unit: partial.unit ?? 'm',
    unitPrice: partial.unitPrice ?? 715816,
    amount: partial.amount ?? 7158160,
    category: partial.category ?? 'PEKERJAAN_PERSIAPAN',
    ...partial,
  };
}

function projectABItems(): RabItem[] {
  return [
    makeRabItem({ id: 'FIXTURE-RAB-A' }),
    makeRabItem({
      id: 'FIXTURE-RAB-B',
      no: 2,
      code: '1.1.1.2',
      ahspCode: '1.1.1.2',
      description: 'Pembuatan 1 m’ pagar sementara dari seng gelombang',
      volume: 2,
      unit: 'm',
      unitPrice: 577752,
      amount: 1155504,
    }),
  ];
}

function makeProjectInput(partial: Partial<ProjectImpactInput> & { projectId: string }): ProjectImpactInput {
  return {
    projectId: partial.projectId,
    projectName: partial.projectName ?? 'Fixture Project',
    isDemo: partial.isDemo ?? false,
    pricingMode: partial.pricingMode ?? 'SNAPSHOT_PRICE',
    pinnedAhspDatabaseVersion: partial.pinnedAhspDatabaseVersion ?? '2026.1',
    pinnedMasterPriceVersion: partial.pinnedMasterPriceVersion ?? '2026.1',
    items: partial.items ?? [],
    costSummary: partial.costSummary ?? {},
    overrides: partial.overrides,
  };
}

function liveProjectAB(): ProjectImpactInput {
  return makeProjectInput({
    projectId: 'FIXTURE-P-LIVE',
    projectName: 'Fixture Project (LIVE)',
    pricingMode: 'LIVE_MASTER_PRICE',
    items: projectABItems(),
  });
}

function snapshotProjectAB(): ProjectImpactInput {
  return makeProjectInput({
    projectId: 'FIXTURE-P-SNAP',
    projectName: 'Fixture Project (SNAPSHOT)',
    pricingMode: 'SNAPSHOT_PRICE',
    items: projectABItems(),
  });
}

function l01Change(): MasterPriceChangeInput {
  return {
    resourceCode: 'L.01',
    resourceName: 'Pekerja',
    category: 'LABOR',
    unit: 'OH',
    oldPrice: 100000,
    newPrice: 110000,
  };
}

function fixtureRecord(
  family: AhspFamily,
  versionId: string,
  checksum: string,
  status: AhspVersionRecord['status'] = 'ACTIVE',
): AhspVersionRecord {
  return {
    family,
    versionId,
    status,
    createdFrom: versionId === '2026.1' ? null : '2026.1',
    createdBy: null,
    createdAt: T0,
    reason: REASON,
    contentChecksum: checksum,
    contentProvenance: 'CANONICAL_BASELINE',
    snapshotPath: snapshotPathFor(family, versionId),
    itemCount: 3,
    publishedAt: status === 'ACTIVE' ? T0 : null,
    publishedBy: null,
  };
}

function publishedRegistry(): AhspVersionRegistryState {
  return buildRegistryState([
    fixtureRecord('CIPTA_KARYA', '2026.1', computeAhspContentChecksum(smallCatalog()), 'SUPERSEDED'),
    fixtureRecord('CIPTA_KARYA', '2026.2', computeAhspContentChecksum(versionTargetItems()), 'ACTIVE'),
    fixtureRecord('BINA_MARGA', '2026.1', 'bbbbbbbbbbbbbbbb'),
    fixtureRecord('SUMBER_DAYA_AIR', '2026.1', 'cccccccccccccccc'),
    fixtureRecord('SMKK', '2026.1', 'dddddddddddddddd'),
  ]);
}

function versionChange(registry: AhspVersionRegistryState) {
  return {
    kind: 'AHSP_VERSION_CHANGE' as const,
    family: 'CIPTA_KARYA' as AhspFamily,
    sourceVersionId: '2026.1',
    targetVersionId: '2026.2',
    registry,
    sourceItems: smallCatalog(),
    targetItems: versionTargetItems(),
    diff: compareAhspSnapshots(
      { versionId: '2026.1', items: smallCatalog() },
      { versionId: '2026.2', items: versionTargetItems() },
      'CIPTA_KARYA',
    ),
    sourceContentChecksum: computeAhspContentChecksum(smallCatalog()),
    targetContentChecksum: computeAhspContentChecksum(versionTargetItems()),
  };
}

function priceChange() {
  return {
    kind: 'MASTER_PRICE_CHANGE' as const,
    targetMasterPriceVersion: '2026.2',
    priceChanges: [l01Change()],
    catalogItems: smallCatalog(),
  };
}

function baseSyncInput(partial: Partial<AhspComponentSyncInput> = {}): AhspComponentSyncInput {
  return {
    resolved: true,
    unitPrice: 100000,
    canonicalEntityId: 'RES-000001',
    hasCode: true,
    originalAhspSourcePrice: 100000,
    priceDifference: 0,
    unitMismatch: false,
    needsReview: false,
    underspecified: false,
    unitMissing: false,
    hasConflict: false,
    verificationStatus: 'VERIFIED',
    isSnapshotLocked: false,
    isProjectOverride: false,
    masterPriceUpdated: false,
    ...partial,
  };
}

function makePricing(partial: Partial<AhspComponentPricing> = {}): AhspComponentPricing {
  return {
    componentId: 'FIXTURE::labor::0',
    type: 'labor',
    itemCode: '1.1.1.1',
    itemName: 'Fixture item',
    unit: 'OH',
    coefficient: 0.6,
    unitPrice: 100000,
    subtotalPerUnit: 60000,
    resolved: true,
    sourceName: 'Standar Upah Cipta Karya SE 47/2026',
    verificationStatus: 'VERIFIED',
    matchMethod: 'EXACT_CODE',
    ...partial,
  };
}

function makeComponent(partial: Partial<AHSPComponent> = {}): AHSPComponent {
  return {
    id: 'COMP-FIXTURE-1',
    code: 'L.01',
    name: 'Pekerja',
    unit: 'OH',
    coefficient: 0.6,
    unitPrice: 100000,
    total: 60000,
    resourceType: 'LABOR',
    ...partial,
  };
}

// Pinned ACTIVE content checksums (§8/§9 — re-pinned here for the sync check).
// Ronde 2 (17 Nov 2026): CK + SDA moved to v2026.2 (CK re-pinned again after
// the sub-header coefficient revert); BM + SMKK still v2026.1.
const PINNED_CHECKSUMS: Record<AhspFamily, string> = {
  CIPTA_KARYA: '0281ba316496e839',
  BINA_MARGA: '08082e878d4f0e90',
  SUMBER_DAYA_AIR: 'b43fd8a665fbdb54',
  SMKK: 'e77bbc73b1fea331',
};

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

describe('§11 formatting — missing is never Rp0', () => {
  it('formatRupiah formats whole rupiah with id-ID grouping', () => {
    expect(formatRupiah(1089879733)).toBe('Rp 1.089.879.733');
    expect(formatRupiah(0)).toBe('Rp 0');
  });

  it('formatRupiah renders null/undefined as —, never Rp0', () => {
    expect(formatRupiah(null)).toBe('—');
    expect(formatRupiah(undefined)).toBe('—');
  });

  it('formatRupiahDelta signs deltas and renders null as —', () => {
    expect(formatRupiahDelta(60000)).toBe('+Rp 60.000');
    expect(formatRupiahDelta(-60000)).toBe('−Rp 60.000');
    expect(formatRupiahDelta(0)).toBe('Rp 0');
    expect(formatRupiahDelta(null)).toBe('—');
  });

  it('formatPercentChange renders 2 decimals, signed, null as —', () => {
    expect(formatPercentChange(0.84)).toBe('+0.84%');
    expect(formatPercentChange(-1.38)).toBe('-1.38%');
    expect(formatPercentChange(null)).toBe('—');
  });

  it('formatCoefficient uses id-ID decimals', () => {
    expect(formatCoefficient(0.6)).toBe('0,6');
    expect(formatCoefficient(0.0387)).toBe('0,0387');
  });

  it('formatDateId renders ISO dates id-ID, null as —, invalid verbatim', () => {
    expect(formatDateId('2026-11-16T00:00:00.000Z')).toContain('2026');
    expect(formatDateId(null)).toBe('—');
    expect(formatDateId('not-a-date')).toBe('not-a-date');
  });
});

// ---------------------------------------------------------------------------
// Admin gate view-model (§4 is the ONLY gate)
// ---------------------------------------------------------------------------

describe('§11 admin gate — §4 decision, localized, enforcement BLOCKED', () => {
  it('default (anonymous) identity denies every global write', () => {
    const gate = adminGateForOperation('EDIT_MASTER_PRICE');
    expect(gate.allowed).toBe(false);
    expect(gate.code).toBe('DENIED_NOT_AUTHENTICATED');
    expect(gate.enforcementBlocked).toBe(true);
    expect(gate.reason).toContain('global admin');
    expect(gate.operationLabel).toBe('Ubah harga master');
  });

  it('a demo PIN identity is denied as demo (UX only, never authorization)', () => {
    const gate = adminGateForOperation('PUBLISH_PRICE_UPDATE', { kind: 'demo', role: 'estimator' });
    expect(gate.allowed).toBe(false);
    expect(gate.code).toBe('DENIED_DEMO_ROLE');
    expect(gate.reason).toContain('demo');
  });

  it('an authenticated non-admin is denied', () => {
    const gate = adminGateForOperation('EDIT_MASTER_PRICE', {
      kind: 'authenticated',
      userId: 'user-1',
      isGlobalAdmin: false,
    });
    expect(gate.allowed).toBe(false);
    expect(gate.code).toBe('DENIED_NOT_GLOBAL_ADMIN');
  });

  it('an authenticated GLOBAL ADMIN is allowed (the gate delegates to §4, it does not invent denial)', () => {
    const gate = adminGateForOperation('EDIT_MASTER_PRICE', {
      kind: 'authenticated',
      userId: 'admin-1',
      isGlobalAdmin: true,
    });
    expect(gate.allowed).toBe(true);
    expect(gate.code).toBe('ALLOWED');
    // The enforcement note stays honest even when the logic allows:
    // no server exists yet to verify such an identity.
    expect(gate.enforcementBlocked).toBe(true);
  });

  it('a malformed identity is denied fail-closed', () => {
    const gate = adminGateForOperation('EDIT_MASTER_PRICE', { kind: 'nonsense' } as never);
    expect(gate.allowed).toBe(false);
    expect(gate.code).toBe('DENIED_MALFORMED_IDENTITY');
  });

  it('AHSP version writes gate their own §4 operation (no second gate invented)', () => {
    // MASTER PRICING §12 (§11 BLOCKED #2 closed): the gate now takes the
    // NAMED AHSP-version operation and returns the full view model —
    // the old no-arg call reused EDIT_MASTER_PRICE. The denial itself
    // is unchanged (same §4 rule, same identity).
    const gate = ahspVersionWriteGate('PUBLISH_AHSP_VERSION');
    expect(gate.operation).toBe('PUBLISH_AHSP_VERSION');
    expect(gate.operationLabel).toBe('Terbitkan versi AHSP');
    expect(gate.allowed).toBe(false);
    expect(gate.code).toBe('DENIED_NOT_AUTHENTICATED');
    expect(gate.enforcementBlocked).toBe(true);
    expect(gate.reason).toContain('global admin');
  });

  it('every §4 write operation has an Indonesian label', () => {
    for (const op of [
      'CREATE_MASTER_ITEM',
      'EDIT_MASTER_ITEM',
      'EDIT_MASTER_PRICE',
      'DEACTIVATE_MASTER_ITEM',
      'PUBLISH_PRICE_UPDATE',
      'ROLLBACK_PRICE_CHANGE',
      'APPROVE_ALIAS',
      'APPROVE_RECONCILIATION',
      'CHANGE_CLASSIFICATION',
    ] as const) {
      expect(adminGateForOperation(op).operationLabel.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// §11.3 sync status derivation — the hard rule
// ---------------------------------------------------------------------------

describe('§11.3 sync status — never SYNCED when unresolved', () => {
  it('resolved + priced + clean → SYNCED', () => {
    const { status } = deriveAhspComponentSyncStatus(baseSyncInput());
    expect(status).toBe('SYNCED');
  });

  it('unresolved (resolved=false) → PRICE_UNAVAILABLE, never SYNCED', () => {
    const { status } = deriveAhspComponentSyncStatus(baseSyncInput({ resolved: false, unitPrice: null }));
    expect(status).toBe('PRICE_UNAVAILABLE');
    expect(isUnresolvedSyncStatus(status)).toBe(true);
  });

  it('resolved=true but price null → still unresolved (the price is the fact, not the flag)', () => {
    const { status } = deriveAhspComponentSyncStatus(baseSyncInput({ resolved: true, unitPrice: null }));
    expect(status).toBe('PRICE_UNAVAILABLE');
    expect(status).not.toBe('SYNCED');
  });

  it('unit mismatch beats plain unavailability', () => {
    const { status } = deriveAhspComponentSyncStatus(
      baseSyncInput({ resolved: false, unitPrice: null, unitMismatch: true }),
    );
    expect(status).toBe('UNIT_MISMATCH');
  });

  it('codeless + unbound + unresolved → ITEM_NOT_MAPPED', () => {
    const { status } = deriveAhspComponentSyncStatus(
      baseSyncInput({ resolved: false, unitPrice: null, hasCode: false, canonicalEntityId: null }),
    );
    expect(status).toBe('ITEM_NOT_MAPPED');
  });

  it('coded + unresolved → PRICE_UNAVAILABLE (mapped, but no price)', () => {
    const { status } = deriveAhspComponentSyncStatus(
      baseSyncInput({ resolved: false, unitPrice: null, hasCode: true, canonicalEntityId: null }),
    );
    expect(status).toBe('PRICE_UNAVAILABLE');
  });

  it('override wins over snapshot lock when both apply', () => {
    const { status } = deriveAhspComponentSyncStatus(
      baseSyncInput({ isProjectOverride: true, isSnapshotLocked: true }),
    );
    expect(status).toBe('PROJECT_OVERRIDE');
  });

  it('snapshot lock → SNAPSHOT_LOCKED', () => {
    const { status } = deriveAhspComponentSyncStatus(baseSyncInput({ isSnapshotLocked: true }));
    expect(status).toBe('SNAPSHOT_LOCKED');
  });

  it('conflict → PRICE_CONFLICT', () => {
    const { status } = deriveAhspComponentSyncStatus(baseSyncInput({ hasConflict: true }));
    expect(status).toBe('PRICE_CONFLICT');
  });

  it('needs-review flag / NEEDS_REVIEW status / missing unit → NEEDS_VERIFICATION', () => {
    expect(deriveAhspComponentSyncStatus(baseSyncInput({ needsReview: true })).status).toBe('NEEDS_VERIFICATION');
    expect(deriveAhspComponentSyncStatus(baseSyncInput({ underspecified: true })).status).toBe('NEEDS_VERIFICATION');
    expect(deriveAhspComponentSyncStatus(baseSyncInput({ unitMissing: true })).status).toBe('NEEDS_VERIFICATION');
    expect(
      deriveAhspComponentSyncStatus(baseSyncInput({ verificationStatus: 'NEEDS_REVIEW' })).status,
    ).toBe('NEEDS_VERIFICATION');
  });

  it('nonzero price difference → MASTER_PRICE_UPDATED; zero difference → SYNCED', () => {
    expect(
      deriveAhspComponentSyncStatus(baseSyncInput({ priceDifference: 10000 })).status,
    ).toBe('MASTER_PRICE_UPDATED');
    expect(
      deriveAhspComponentSyncStatus(baseSyncInput({ priceDifference: -5000 })).status,
    ).toBe('MASTER_PRICE_UPDATED');
    expect(deriveAhspComponentSyncStatus(baseSyncInput({ priceDifference: 0 })).status).toBe('SYNCED');
    expect(
      deriveAhspComponentSyncStatus(baseSyncInput({ priceDifference: null })).status,
    ).toBe('SYNCED');
  });

  it('exhaustive: no unresolved combination ever yields SYNCED', () => {
    const flags = [true, false];
    for (const resolved of flags) {
      for (const unitMismatch of flags) {
        for (const hasCode of flags) {
          for (const isOverride of flags) {
            for (const isLocked of flags) {
              const { status } = deriveAhspComponentSyncStatus(
                baseSyncInput({
                  resolved,
                  unitPrice: null,
                  unitMismatch,
                  hasCode,
                  canonicalEntityId: hasCode ? 'RES-000001' : null,
                  isProjectOverride: isOverride,
                  isSnapshotLocked: isLocked,
                }),
              );
              expect(status).not.toBe('SYNCED');
              expect(isUnresolvedSyncStatus(status)).toBe(true);
            }
          }
        }
      }
    }
  });

  it('the vocabulary is exactly the nine §11.3 statuses', () => {
    expect([...AHSP_COMPONENT_SYNC_STATUSES].sort()).toEqual(
      [
        'ITEM_NOT_MAPPED',
        'MASTER_PRICE_UPDATED',
        'NEEDS_VERIFICATION',
        'PRICE_CONFLICT',
        'PRICE_UNAVAILABLE',
        'PROJECT_OVERRIDE',
        'SNAPSHOT_LOCKED',
        'SYNCED',
        'UNIT_MISMATCH',
      ].sort(),
    );
  });
});

// ---------------------------------------------------------------------------
// §11.3 component detail (12 fields)
// ---------------------------------------------------------------------------

describe('§11.3 component detail — 12 fields from real composition', () => {
  it('first labor component of 1.1.1.1: exact fields, SYNCED (probe-verified)', () => {
    const item = realItem('1.1.1.1');
    const composition = priceResolver2026.resolveAhspUnitPrice(item);
    const details = buildAhspItemComponentDetails(item, composition);
    expect(details.length).toBe(13);
    const first = details[0];
    expect(first.name).toBe('Pekerja');
    expect(first.category).toBe('labor');
    expect(first.categoryLabel).toBe('Tenaga Kerja');
    expect(first.coefficient).toBe(0.6);
    expect(first.ahspUnit).toBe('OH');
    expect(first.canonicalMasterItem).toBe(null);
    expect(first.masterUnit).toBe('OH');
    expect(first.resolvedMasterPrice).toBe(100000);
    expect(first.originalAhspSourcePrice).toBe(100000);
    expect(first.priceDifference).toBe(0);
    expect(first.provenance).toBe('Standar Upah Cipta Karya SE 47/2026');
    expect(first.verificationStatus).toBe('VERIFIED');
    expect(first.lastUpdated).toBe(item.lastUpdated);
    expect(first.syncStatus).toBe('SYNCED');
    expect(first.subtotalPerUnit).toBe(60000);
  });

  it('a FULL item has no unresolved detail rows', () => {
    const item = realItem('1.1.1.1');
    const composition = priceResolver2026.resolveAhspUnitPrice(item);
    const details = buildAhspItemComponentDetails(item, composition);
    for (const d of details) {
      expect(isUnresolvedSyncStatus(d.syncStatus)).toBe(false);
    }
  });

  it('null composition → every detail unresolved, none SYNCED (never a guessed price)', () => {
    const item = realItem('1.1.1.1');
    const details = buildAhspItemComponentDetails(item, null);
    expect(details.length).toBe(13);
    for (const d of details) {
      expect(d.resolvedMasterPrice).toBe(null);
      expect(isUnresolvedSyncStatus(d.syncStatus)).toBe(true);
      expect(d.syncStatus).not.toBe('SYNCED');
    }
    // The coded L.01 row is mapped-but-unpriced; a codeless row is unmapped.
    expect(details[0].syncStatus).toBe('PRICE_UNAVAILABLE');
  });

  it('override context → PROJECT_OVERRIDE on a resolved row', () => {
    const detail = buildAhspComponentDetail({
      component: makeComponent(),
      category: 'labor',
      pricing: makePricing(),
      lastUpdated: '2026-11-16',
      context: { isProjectOverride: true },
    });
    expect(detail.syncStatus).toBe('PROJECT_OVERRIDE');
    expect(detail.resolvedMasterPrice).toBe(100000);
  });

  it('UNIT_MISMATCH in the unresolved reason maps to UNIT_MISMATCH', () => {
    const detail = buildAhspComponentDetail({
      component: makeComponent(),
      category: 'labor',
      pricing: makePricing({
        resolved: false,
        unitPrice: null,
        subtotalPerUnit: null,
        unresolvedReason: 'UNIT_MISMATCH: candidate unit kg does not match OH',
      }),
      lastUpdated: '2026-11-16',
    });
    expect(detail.syncStatus).toBe('UNIT_MISMATCH');
    expect(detail.resolvedMasterPrice).toBe(null);
  });

  it('price difference falls back to master − source when the resolver did not carry it', () => {
    const detail = buildAhspComponentDetail({
      component: makeComponent({ unitPrice: 90000 }),
      category: 'labor',
      pricing: makePricing({ priceDifference: undefined, originalAhspSourcePrice: undefined }),
      lastUpdated: '2026-11-16',
    });
    expect(detail.originalAhspSourcePrice).toBe(90000);
    expect(detail.priceDifference).toBe(10000);
    expect(detail.syncStatus).toBe('MASTER_PRICE_UPDATED');
  });
});

// ---------------------------------------------------------------------------
// §11.1 master records — search, filters, rows, linked references
// ---------------------------------------------------------------------------

describe('§11.1 master records — real priceMaster data, no invented numbers', () => {
  it('priceMaster counts are pinned (899: material 807 / labor 49 / equipment 43)', () => {
    expect(RESOURCE_PRICE_RECORDS.length).toBe(899);
    const byType = (t: string): number =>
      RESOURCE_PRICE_RECORDS.filter((r) => r.resourceType === t).length;
    expect(byType('material')).toBe(807);
    expect(byType('labor')).toBe(49);
    expect(byType('equipment')).toBe(43);
  });

  it('category filter matches the pinned counts', () => {
    const base = { query: '', verificationStatus: 'ALL', provenance: 'ALL', region: 'ALL' } as const;
    expect(filterMasterRecords(RESOURCE_PRICE_RECORDS, { ...base, category: 'material' }).length).toBe(807);
    expect(filterMasterRecords(RESOURCE_PRICE_RECORDS, { ...base, category: 'labor' }).length).toBe(49);
    expect(filterMasterRecords(RESOURCE_PRICE_RECORDS, { ...base, category: 'equipment' }).length).toBe(43);
    expect(filterMasterRecords(RESOURCE_PRICE_RECORDS, { ...base, category: 'ALL' }).length).toBe(899);
  });

  it('verification filter: VERIFIED is exactly 13 records', () => {
    const rows = filterMasterRecords(RESOURCE_PRICE_RECORDS, {
      query: '',
      category: 'ALL',
      verificationStatus: 'VERIFIED',
      provenance: 'ALL',
      region: 'ALL',
    });
    expect(rows.length).toBe(13);
    expect(rows.every((r) => r.verificationStatus === 'VERIFIED')).toBe(true);
  });

  it('query search matches name, code, and resource id (all words)', () => {
    const base = { category: 'ALL', verificationStatus: 'ALL', provenance: 'ALL', region: 'ALL' } as const;
    const byName = filterMasterRecords(RESOURCE_PRICE_RECORDS, { ...base, query: 'Besi Beton' });
    expect(byName.length).toBeGreaterThan(0);
    expect(byName.every((r) => `${r.resourceName} ${r.resourceCode}`.toLowerCase().includes('besi'))).toBe(true);
    const byCode = filterMasterRecords(RESOURCE_PRICE_RECORDS, { ...base, query: 'M170' });
    expect(byCode.length).toBeGreaterThan(0);
    expect(byCode.every((r) => r.resourceCode.includes('M170'))).toBe(true);
    const noMatch = filterMasterRecords(RESOURCE_PRICE_RECORDS, { ...base, query: 'zzz-tidak-ada-zzz' });
    expect(noMatch.length).toBe(0);
  });

  it('provenance filter uses the §4.3 label (market references are never official)', () => {
    const rows = filterMasterRecords(RESOURCE_PRICE_RECORDS, {
      query: '',
      category: 'ALL',
      verificationStatus: 'ALL',
      provenance: 'MARKET_REFERENCE',
      region: 'ALL',
    });
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(buildMasterRecordRow(r).provenanceLabel).toBe('MARKET_REFERENCE');
    }
  });

  it('region filter + region list come from the records themselves', () => {
    const regions = masterRecordRegions(RESOURCE_PRICE_RECORDS);
    expect(regions).toContain('DKI Jakarta');
    expect(regions).toContain('Nasional');
    const jakarta = filterMasterRecords(RESOURCE_PRICE_RECORDS, {
      query: '',
      category: 'ALL',
      verificationStatus: 'ALL',
      provenance: 'ALL',
      region: 'DKI Jakarta',
    });
    expect(jakarta.length).toBeGreaterThan(0);
    expect(jakarta.every((r) => r.location.provinceName === 'DKI Jakarta')).toBe(true);
  });

  it('formatPriceLocation renders regency/province, else Nasional', () => {
    expect(formatPriceLocation({ level: 'NATIONAL', provinceName: 'Nasional' })).toBe('Nasional');
    expect(formatPriceLocation({ level: 'PROVINCE', provinceName: 'DKI Jakarta' })).toBe('DKI Jakarta');
    expect(
      formatPriceLocation({ level: 'REGENCY', provinceName: 'Jawa Timur', regencyName: 'Probolinggo' }),
    ).toBe('Probolinggo, Jawa Timur');
  });

  it('row builder round-trips a record and carries its §4.3 provenance', () => {
    const record = RESOURCE_PRICE_RECORDS.find((r) => r.resourceCode === 'M170') as ResourcePriceRecord;
    expect(record).toBeDefined();
    const row = buildMasterRecordRow(record);
    expect(row.resourceCode).toBe('M170');
    expect(row.resourceName).toBe(record.resourceName);
    expect(row.price).toBe(record.price);
    expect(row.unit).toBe(record.unit);
    expect(row.regionLabel).toBe(formatPriceLocation(record.location));
    expect(row.periodLabel).toBe(record.period.label);
    expect(row.provenanceExplanation.length).toBeGreaterThan(0);
    expect(row.version).toBe(record.version ?? null);
  });
});

describe('§11.1 linked AHSP references — the §9 index, reused', () => {
  it('L.01|OH links to exactly one component of 1.1.1.1 (coef 0,6)', () => {
    const index = buildResourceComponentIndex(smallCatalog());
    const refs = linkedAhspReferencesForKey(index, 'L.01', 'OH');
    expect(refs.length).toBe(1);
    expect(refs[0].itemCode).toBe('1.1.1.1');
    expect(refs[0].coefficient).toBe(0.6);
    expect(refs[0].family).toBe('CIPTA_KARYA');
  });

  it('an unknown key links to nothing (empty, not an error)', () => {
    const index = buildResourceComponentIndex(smallCatalog());
    expect(linkedAhspReferencesForKey(index, 'M999', 'kg').length).toBe(0);
  });

  it('summary counts references, distinct items, and per-family roll-up', () => {
    const index = buildResourceComponentIndex(smallCatalog());
    const summary = summarizeLinkedReferences(linkedAhspReferencesForKey(index, 'L.01', 'OH'));
    expect(summary.referenceCount).toBe(1);
    expect(summary.itemCount).toBe(1);
    expect(summary.byFamily).toEqual([{ family: 'CIPTA_KARYA', count: 1 }]);
  });
});

describe('§11.1 price history rows', () => {
  it('history rows carry the Indonesian operation label + amounts verbatim', () => {
    const entry: MasterPriceHistoryEntry = {
      id: 'MPH-test0000000001',
      schemaVersion: 1,
      priceRecordId: 'PRC-1',
      resourceId: 'RES-000001',
      operation: 'UPDATE',
      previousAmount: 100000,
      newAmount: 110000,
      previousUnit: 'OH',
      newUnit: 'OH',
      previousRegion: null,
      newRegion: null,
      sourceKey: 'CK_HSD_2026',
      sourceTier: 'OFFICIAL_GOVERNMENT',
      sourceDocument: 'SE DJBK 47/2026',
      verificationStatus: 'VERIFIED',
      adminIdentity: null,
      changedAt: T0,
      reason: 'Penyesuaian harga upah Pekerja',
      affectedAhspReferences: ['1.1.1.1'],
      affectedLivePriceProjects: ['P-1'],
      publicationStatus: 'PUBLISHED',
      previousVersion: 1,
      newVersion: 2,
      masterPriceVersion: '2026.1',
    };
    const row = buildHistoryRow(entry);
    expect(row.operationLabel).toBe('Perubahan harga');
    expect(row.previousAmount).toBe(100000);
    expect(row.newAmount).toBe(110000);
    expect(row.affectedAhspReferences).toEqual(['1.1.1.1']);
    expect(row.adminIdentity).toBe(null);
  });
});

describe('§11.1 simulation change input — the §9 effective-price model', () => {
  it('maps a labor record to a change input (category LABOR, record unit, live old price)', () => {
    const record = RESOURCE_PRICE_RECORDS.find((r) => r.resourceType === 'labor') as ResourcePriceRecord;
    const change = toMasterPriceChangeInput({ record, oldPrice: 100000, newPrice: 110000 });
    expect(change.resourceCode).toBe(record.resourceCode);
    expect(change.category).toBe('LABOR');
    expect(change.unit).toBe(record.unit);
    expect(change.oldPrice).toBe(100000);
    expect(change.newPrice).toBe(110000);
  });

  it('validateProposedPrice refuses negative, non-numeric, and no-op prices', () => {
    expect(validateProposedPrice(-1, 100000).valid).toBe(false);
    expect(validateProposedPrice(null, 100000).valid).toBe(false);
    expect(validateProposedPrice(Number.NaN, 100000).valid).toBe(false);
    expect(validateProposedPrice(100000, 100000).valid).toBe(false);
    expect(validateProposedPrice(110000, 100000)).toEqual({ valid: true, error: null });
    expect(validateProposedPrice(50000, null).valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// §11.4 dialog content — real §9 numbers
// ---------------------------------------------------------------------------

describe('§11.4 dialog content — real impact, never "Are you sure?"', () => {
  it('L.01 change: computed dialog with exact per-item, per-project, aggregate numbers', () => {
    const preview = computeMasterPriceImpact({
      priceChanges: [l01Change()],
      catalogItems: smallCatalog(),
      projects: [liveProjectAB()],
      computedAt: T0,
    });
    expect(preview.status).toBe('COMPUTED');
    const content = buildPriceUpdateDialogContent(preview);
    expect(content.computable).toBe(true);
    expect(content.blockedNote).toBe(null);
    expect(content.kindLabel).toBe('Update harga master');
    // The change, stated plainly.
    expect(content.changeLines).toEqual(['L.01 (OH): Rp 100.000 → Rp 110.000']);
    // Per-item: only 1.1.1.1 moves (+Rp6.000/unit).
    expect(content.itemSummary.totalAffected).toBe(1);
    expect(content.itemSummary.priceChanged).toBe(1);
    expect(content.itemRows.length).toBe(1);
    expect(content.itemRows[0].code).toBe('1.1.1.1');
    expect(content.itemRows[0].oldUnitPrice).toBe(715816);
    expect(content.itemRows[0].newUnitPrice).toBe(721816);
    expect(content.itemRows[0].delta).toBe(6000);
    // Per-family: one CK reference.
    expect(content.familyRows).toEqual([
      expect.objectContaining({ family: 'CIPTA_KARYA', affectedItemCount: 1 }),
    ]);
    // Per-project: AB 8.313.664 → 8.373.664 (+60.000).
    expect(content.projectRows.length).toBe(1);
    expect(content.projectRows[0].oldGrandTotal).toBe(8313664);
    expect(content.projectRows[0].newGrandTotal).toBe(8373664);
    expect(content.projectRows[0].deltaGrandTotal).toBe(60000);
    // Aggregate: the same +60.000 (never a partial sum).
    expect(content.aggregates.totalDeltaGrandTotal).toBe(60000);
    // Scope statement names the real counts — no generic confirmation text.
    expect(content.scopeStatement).toContain('1 item AHSP');
    expect(content.scopeStatement).toContain('1 referensi komponen');
    expect(content.scopeStatement).toContain('1 proyek harga-live');
    expect(content.scopeStatement).not.toContain('Are you sure');
    expect(content.fingerprintHash).toBe(preview.fingerprint.fingerprintHash);
    expect(content.computedAt).toBe(T0);
  });

  it('a price REMOVAL preview is NOT_COMPUTED and blocks confirm with reasons', () => {
    const preview = computeMasterPriceImpact({
      priceChanges: [{ ...l01Change(), newPrice: null }],
      catalogItems: smallCatalog(),
      projects: [liveProjectAB()],
      computedAt: T0,
    });
    expect(preview.status).toBe('NOT_COMPUTED');
    const content = buildPriceUpdateDialogContent(preview);
    expect(content.computable).toBe(false);
    expect(content.blockedNote).not.toBe(null);
    expect(content.blockedNote as string).toContain('tidak terhitung');
    expect(content.scopeStatement).toContain('TIDAK DAPAT dihitung');
    expect(content.notComputedReasons.length).toBeGreaterThan(0);
  });

  it('a STALE preview blocks confirm and says to recompute', () => {
    const preview = computeMasterPriceImpact({
      priceChanges: [l01Change()],
      catalogItems: smallCatalog(),
      projects: [liveProjectAB()],
      computedAt: T0,
    });
    const stale = markPreviewStale(preview, ['state bergerak sesudah preview dihitung']);
    expect(stale.status).toBe('STALE');
    const content = buildPriceUpdateDialogContent(stale);
    expect(content.computable).toBe(false);
    expect(content.blockedNote).not.toBe(null);
    expect(content.blockedNote as string).toContain('basi');
  });

  it('version-kind dialog states the family + version move', () => {
    const preview = computeMasterPriceImpact({
      priceChanges: [l01Change()],
      catalogItems: smallCatalog(),
      projects: [liveProjectAB()],
      computedAt: T0,
    });
    const versioned = { ...preview, kind: 'AHSP_VERSION_CHANGE' as const };
    const content = buildPriceUpdateDialogContent(versioned);
    expect(content.kindLabel).toBe('Perubahan versi AHSP');
  });
});

// ---------------------------------------------------------------------------
// §11.2 registry view-model, sync check, version compare
// ---------------------------------------------------------------------------

describe('§11.2 registry view-model — the real §8 pointer', () => {
  it('the live registry has 4 families, CK+SDA ACTIVE on 2026.2, BM+SMKK on 2026.1, no drafts', () => {
    const state = buildRegistryState(AHSP_VERSION_RECORDS);
    const views = buildAhspRegistryViewModel(state);
    expect(views.length).toBe(4);
    for (const v of views) {
      const isR2 = v.family === 'CIPTA_KARYA' || v.family === 'SUMBER_DAYA_AIR';
      expect(v.activeVersionId).toBe(isR2 ? '2026.2' : '2026.1');
      expect(v.versionCount).toBe(isR2 ? 2 : 1);
      expect(v.draftCount).toBe(0);
      expect(v.activeRecord?.status).toBe('ACTIVE');
      expect(v.familyLabel).toBe(AHSP_FAMILY_LABELS_ID[v.family]);
    }
    expect(views.map((v) => v.family).sort()).toEqual(
      ['BINA_MARGA', 'CIPTA_KARYA', 'SMKK', 'SUMBER_DAYA_AIR'].sort(),
    );
  });

  it('baseline constant is 2026.1', () => {
    expect(AHSP_BASELINE_VERSION_ID).toBe('2026.1');
  });
});

describe('§11.2 sync check — live checksum vs snapshot checksum', () => {
  it('all four live families are SYNCED against their ACTIVE snapshots (pinned checksums)', () => {
    const state = buildRegistryState(AHSP_VERSION_RECORDS);
    const views = buildAhspRegistryViewModel(state);
    for (const v of views) {
      const result = checkAhspFamilySync({
        family: v.family,
        record: v.activeRecord as AhspVersionRecord,
        liveItems: ALL_OFFICIAL_AHSP_ITEMS,
      });
      expect(result.status).toBe('SYNCED');
      expect(result.liveChecksum).toBe(PINNED_CHECKSUMS[v.family]);
      expect(result.recordChecksum).toBe(PINNED_CHECKSUMS[v.family]);
      expect(result.liveItemCount).toBe(v.activeRecord?.itemCount);
    }
  });

  it('a drifted record checksum yields MISMATCH with both checksums named', () => {
    const state = buildRegistryState(AHSP_VERSION_RECORDS);
    const ck = buildAhspRegistryViewModel(state).find((v) => v.family === 'CIPTA_KARYA') as {
      activeRecord: AhspVersionRecord;
    };
    const drifted: AhspVersionRecord = { ...ck.activeRecord, contentChecksum: 'ffffffffffffffff' };
    const result = checkAhspFamilySync({
      family: 'CIPTA_KARYA',
      record: drifted,
      liveItems: ALL_OFFICIAL_AHSP_ITEMS,
    });
    expect(result.status).toBe('MISMATCH');
    expect(result.detail).toContain('ffffffffffffffff');
    expect(result.detail).toContain(PINNED_CHECKSUMS.CIPTA_KARYA);
  });

  it('no live items → UNKNOWN, never SYNCED', () => {
    const state = buildRegistryState(AHSP_VERSION_RECORDS);
    const ck = buildAhspRegistryViewModel(state).find((v) => v.family === 'CIPTA_KARYA') as {
      activeRecord: AhspVersionRecord;
    };
    const result = checkAhspFamilySync({ family: 'CIPTA_KARYA', record: ck.activeRecord, liveItems: [] });
    expect(result.status).toBe('UNKNOWN');
    expect(result.liveChecksum).toBe(null);
  });
});

describe('§11.2 version compare — the real §8 diff', () => {
  it('2026.1 → 2026.2 target: +1 / −1 / 1 revised / 1 unchanged', () => {
    const diff = compareAhspSnapshots(
      { versionId: '2026.1', items: smallCatalog() },
      { versionId: '2026.2', items: versionTargetItems() },
      'CIPTA_KARYA',
    );
    const vm = buildVersionCompareViewModel(diff);
    expect(vm.sourceVersion).toBe('2026.1');
    expect(vm.targetVersion).toBe('2026.2');
    expect(vm.added).toBe(1);
    expect(vm.removed).toBe(1);
    expect(vm.revised).toBe(1);
    expect(vm.unchanged).toBe(1);
    expect(vm.totalSource).toBe(3);
    expect(vm.totalTarget).toBe(3);
    expect(vm.fieldChanges).toBeGreaterThan(0);
    expect(vm.addedItems[0].code).toBe('1.1.1.99');
    expect(vm.removedItems[0].code).toBe('1.1.1.3');
    expect(vm.revisedItems[0].code).toBe('1.1.1.1');
    expect(vm.fieldDiffs[0].code).toBe('1.1.1.1');
  });

  it('same content vs itself: zero diff, all unchanged', () => {
    const diff = compareAhspSnapshots(
      { versionId: '2026.1', items: smallCatalog() },
      { versionId: '2026.1', items: smallCatalog() },
      'CIPTA_KARYA',
    );
    const vm = buildVersionCompareViewModel(diff);
    expect(vm.added).toBe(0);
    expect(vm.removed).toBe(0);
    expect(vm.revised).toBe(0);
    expect(vm.unchanged).toBe(3);
    expect(vm.fieldChanges).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// §10 UI — mode labels, adoption availability, reason, summary
// ---------------------------------------------------------------------------

describe('§10 UI wiring — mode labels + adoption availability', () => {
  it('all three modes have Indonesian labels + descriptions', () => {
    const modes: ProjectPricingMode[] = ['LIVE_MASTER_PRICE', 'SNAPSHOT_PRICE', 'PROJECT_OVERRIDE'];
    for (const mode of modes) {
      expect(PRICING_MODE_LABELS_ID[mode].label.length).toBeGreaterThan(0);
      expect(PRICING_MODE_LABELS_ID[mode].description.length).toBeGreaterThan(0);
    }
    expect(PRICING_MODE_LABELS_ID.LIVE_MASTER_PRICE.label).toContain('Live');
    expect(PRICING_MODE_LABELS_ID.SNAPSHOT_PRICE.label).toContain('Snapshot');
    expect(PRICING_MODE_LABELS_ID.PROJECT_OVERRIDE.label).toContain('Override');
  });

  it('LIVE projects adopt nothing', () => {
    const avail = familyAdoptionAvailability({
      family: 'CIPTA_KARYA',
      mode: 'LIVE_MASTER_PRICE',
      pinnedAhspDatabaseVersion: '2026.1',
      activeVersionId: '2026.2',
      pinnedMasterPriceVersion: '2026.1',
      masterPriceVersion: '2026.2',
    });
    expect(avail.canAdoptVersion).toBe(false);
    expect(avail.canAdoptPrices).toBe(false);
    expect(avail.targetAhspVersion).toBe(null);
    expect(avail.targetMasterPriceVersion).toBe(null);
  });

  it('SNAPSHOT pinned 2026.1 vs active 2026.2 can adopt the version', () => {
    const avail = familyAdoptionAvailability({
      family: 'CIPTA_KARYA',
      mode: 'SNAPSHOT_PRICE',
      pinnedAhspDatabaseVersion: '2026.1',
      activeVersionId: '2026.2',
      pinnedMasterPriceVersion: '2026.1',
      masterPriceVersion: '2026.1',
    });
    expect(avail.canAdoptVersion).toBe(true);
    expect(avail.targetAhspVersion).toBe('2026.2');
    expect(avail.canAdoptPrices).toBe(false);
  });

  it('SNAPSHOT already current adopts nothing', () => {
    const avail = familyAdoptionAvailability({
      family: 'CIPTA_KARYA',
      mode: 'SNAPSHOT_PRICE',
      pinnedAhspDatabaseVersion: '2026.2',
      activeVersionId: '2026.2',
      pinnedMasterPriceVersion: '2026.1',
      masterPriceVersion: '2026.1',
    });
    expect(avail.canAdoptVersion).toBe(false);
    expect(avail.canAdoptPrices).toBe(false);
  });

  it('a null (legacy) pin reads as 2026.1 — adoptable when active moved', () => {
    const avail = familyAdoptionAvailability({
      family: 'CIPTA_KARYA',
      mode: 'SNAPSHOT_PRICE',
      pinnedAhspDatabaseVersion: null,
      activeVersionId: '2026.2',
      pinnedMasterPriceVersion: null,
      masterPriceVersion: '2026.2',
    });
    expect(avail.canAdoptVersion).toBe(true);
    expect(avail.canAdoptPrices).toBe(true);
    expect(avail.targetMasterPriceVersion).toBe('2026.2');
  });

  it('adoption reason: <10 invalid (trimmed), exactly 10 valid', () => {
    const short = validateAdoptionReason('oke');
    expect(short.valid).toBe(false);
    expect(short.length).toBe(3);
    expect(short.minLength).toBe(10);
    expect(short.error).toContain('10 karakter');
    const padded = validateAdoptionReason('   oke   ');
    expect(padded.length).toBe(3);
    expect(padded.valid).toBe(false);
    expect(validateAdoptionReason('0123456789').valid).toBe(true);
    expect(validateAdoptionReason(REASON).valid).toBe(true);
  });
});

describe('§10 UI wiring — project impact input from live context data', () => {
  function makeProjectRecord(partial: Partial<Project> = {}): Project {
    return {
      id: 'FIXTURE-P-1',
      name: 'Fixture Project',
      location: '',
      status: 'draft',
      sections: [],
      costSummary: {
        directCost: 0,
        overheadAmount: 0,
        overheadPercent: 0,
        subtotalBeforeProfit: 0,
        profitAmount: 0,
        profitPercent: 0,
        subtotalBeforeTax: 0,
        taxAmount: 0,
        grandTotal: 0,
      },
      createdAt: T0,
      updatedAt: T0,
      ...partial,
    };
  }

  function makeVersion(partial: Partial<EstimateVersion> = {}): EstimateVersion {
    return {
      id: 'FIXTURE-V-1',
      projectId: 'FIXTURE-P-1',
      versionNumber: 'v1.0',
      label: 'Baseline',
      timestamp: T0,
      author: 'Fixture',
      description: 'Fixture version',
      costBefore: 0,
      costAfter: 8313664,
      difference: 0,
      percentageDiff: 0,
      rabItemsSnapshot: [],
      itemsCount: 2,
      ...partial,
    };
  }

  it('mode: project record wins over the active version', () => {
    const input = buildProjectImpactInput({
      project: makeProjectRecord({ pricingMode: 'LIVE_MASTER_PRICE' }),
      items: projectABItems(),
      overrides: [],
      activeVersion: makeVersion({ pricingMode: 'SNAPSHOT_PRICE' }),
    });
    expect(input.pricingMode).toBe('LIVE_MASTER_PRICE');
    expect(input.projectId).toBe('FIXTURE-P-1');
    expect(input.items.length).toBe(2);
  });

  it('mode: active version wins when the record has none; absent when neither has one', () => {
    const fromVersion = buildProjectImpactInput({
      project: makeProjectRecord({}),
      items: [],
      overrides: [],
      activeVersion: makeVersion({ pricingMode: 'SNAPSHOT_PRICE' }),
    });
    expect(fromVersion.pricingMode).toBe('SNAPSHOT_PRICE');
    const absent = buildProjectImpactInput({
      project: makeProjectRecord({}),
      items: [],
      overrides: [],
      activeVersion: makeVersion({}),
    });
    expect(absent.pricingMode).toBe(null);
    const noVersion = buildProjectImpactInput({
      project: makeProjectRecord({}),
      items: [],
      overrides: [],
      activeVersion: null,
    });
    expect(noVersion.pricingMode).toBe(null);
    expect(noVersion.pinnedAhspDatabaseVersion).toBe(null);
    expect(noVersion.pinnedMasterPriceVersion).toBe(null);
  });

  it('an invalid recorded mode falls back to the version (never throws)', () => {
    const input = buildProjectImpactInput({
      project: makeProjectRecord({ pricingMode: 'BOGUS_MODE' as never }),
      items: [],
      overrides: [],
      activeVersion: makeVersion({ pricingMode: 'PROJECT_OVERRIDE' }),
    });
    expect(input.pricingMode).toBe('PROJECT_OVERRIDE');
  });

  it('pins come from the active version; demo flag passes through', () => {
    const input = buildProjectImpactInput({
      project: makeProjectRecord({ isDemo: true } as Partial<Project>),
      items: [],
      overrides: [],
      activeVersion: makeVersion({ ahspDatabaseVersion: '2026.1', masterPriceVersion: '2026.1' }),
    });
    expect(input.pinnedAhspDatabaseVersion).toBe('2026.1');
    expect(input.pinnedMasterPriceVersion).toBe('2026.1');
    expect(input.isDemo).toBe(true);
  });
});

describe('§10 UI wiring — adoption summary from a real previewAdoption', () => {
  it('version adoption: 8.313.664 → 8.413.664 (+100.000), targets 2026.2 / 2026.1', () => {
    const adoption = previewAdoption({
      project: snapshotProjectAB(),
      change: versionChange(publishedRegistry()),
      computedAt: T0,
    });
    const summary = summarizeAdoptionPreview(adoption);
    expect(summary.computable).toBe(true);
    expect(summary.changeKind).toBe('AHSP_VERSION_CHANGE');
    expect(summary.oldGrandTotal).toBe(8313664);
    expect(summary.newGrandTotal).toBe(8413664);
    expect(summary.deltaGrandTotal).toBe(100000);
    expect(summary.adoptedItemCount).toBe(2);
    expect(summary.uncomputableCount).toBe(0);
    expect(summary.targetAhspDatabaseVersion).toBe('2026.2');
    // A version change does not move prices: the master pin stays 2026.1.
    expect(summary.targetMasterPriceVersion).toBe('2026.1');
    // The per-item diff exists (not just the aggregate): A repriced +100.000.
    const a = adoption.adoptedItemImpacts.find((i) => i.code === '1.1.1.1');
    expect(a).toBeDefined();
    expect(a?.deltaAmount).toBe(100000);
    expect(a?.status).toBe('REPRICED');
  });

  it('price adoption: 8.313.664 → 8.373.664 (+60.000), targets 2026.1 / 2026.2', () => {
    const adoption = previewAdoption({
      project: snapshotProjectAB(),
      change: priceChange(),
      computedAt: T0,
    });
    const summary = summarizeAdoptionPreview(adoption);
    expect(summary.computable).toBe(true);
    expect(summary.changeKind).toBe('MASTER_PRICE_CHANGE');
    expect(summary.oldGrandTotal).toBe(8313664);
    expect(summary.newGrandTotal).toBe(8373664);
    expect(summary.deltaGrandTotal).toBe(60000);
    expect(summary.targetAhspDatabaseVersion).toBe('2026.1');
    expect(summary.targetMasterPriceVersion).toBe('2026.2');
  });
});
