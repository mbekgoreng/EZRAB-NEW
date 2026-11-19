/**
 * MASTER PRICING §12/§13 (P10) — ADMIN MASTER PRICE APPLY.
 *
 * Run: npx vitest run src/test/masterPriceApplyP10.test.ts
 *
 * What is pinned here (and why each pin exists):
 * - GATE: the §4 authorization module is the ONLY gate. Anonymous
 *   (today's honest local identity), demo PIN, and non-admin identities
 *   are DENIED and NOTHING is written — no overlay, no history, no feed,
 *   no resolver change. The apply service re-checks the gate itself; a
 *   disabled dialog button is never the only enforcement.
 * - REAL APPLY: a verified global admin's apply writes the overlay AND
 *   the resolver answers the new price for the key (by name+unit AND by
 *   resourceId), with the explanation naming the admin apply + audit id.
 *   The AHSP cache generation bumps so compositions recompute.
 * - AUDIT: every apply records a §4.4 history entry (operation UPDATE,
 *   previousAmount = the EFFECTIVE resolver price — not the record's own
 *   price — newAmount, reason, adminIdentity, publicationStatus DRAFT:
 *   live in this browser, NOT published to the global master). The
 *   history is append-only: a duplicate apply (same inputs + same
 *   changedAt) is REFUSED with no writes.
 * - UNIT: the overlay NEVER applies to another unit (no silent
 *   conversion, no silent multiply) and never overrides a DIFFERENT
 *   canonical entity; a §15 (#8) exclusion of the overlaid record is
 *   honored.
 * - PROVENANCE: the resolution carries the overlaid record's own
 *   sourceKey / tier / priority / name / document / verificationStatus
 *   — an admin edit never promotes MARKET to OFFICIAL.
 * - NO SILENT HISTORICAL WRITES: SNAPSHOT / OVERRIDE context prices
 *   still win over the overlay (snapshot projects never change).
 * - FEED: a coded record publishes a §13 feed entry (sourceKind
 *   MASTER_PRICE_HISTORY, linked to the history entry) consumable via
 *   `readPriceChangesSince`; a codeless record (Paku asbes) skips the
 *   feed honestly with its reason, while the §4.4 history is still
 *   recorded.
 * - REVERSIBILITY: clearing the local stores restores the generated
 *   master price exactly (the overlay leaves no trace in resolution).
 * - VIEW HELPER: `applyAdminOverlayToRecords` replaces prices on copies
 *   only — the generated records are never mutated.
 *
 * Fixture: the REAL Paku asbes record (`PRC-MARKET_2026-0axhp81x-NK`,
 * Rp34.500/kg, codeless, MARKET_2026) from the audit's owner example,
 * plus the first coded record (E13 Motor Grader — whose EFFECTIVE price
 * is the BM winner Rp597.583,41, not the record's own Rp360.000: the
 * tests assert against the live effective price, never the record
 * price, per the §9 model).
 *
 * This suite runs in the vitest node env (no localStorage): applies
 * hold in memory for the session, which is exactly the documented
 * frontend-only behavior. `clearLocalMasterPriceApplyStores` in
 * `beforeEach` isolates every test.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { RESOURCE_PRICE_RECORDS } from '../data/priceDatabase2026/priceMaster.generated';
import { priceResolver2026 } from '../data/priceDatabase2026/resolver';
import { buildComponentPriceRef } from '../data/priceDatabase2026/centralResolution';
import {
  applyAdminOverlayToRecords,
  clearAdminMasterPriceOverlay,
  getAdminMasterPriceOverlayEntry,
  listAdminMasterPriceOverlayEntries,
} from '../data/priceDatabase2026/adminMasterPriceOverlay';
import {
  currentLocalIdentity,
  type MasterPriceIdentity,
} from '../engine/pricing/admin/masterPriceAuthorization';
import {
  applyMasterPriceChange,
  clearLocalMasterPriceApplyStores,
  loadLocalMasterPriceHistory,
  loadLocalPriceChangeFeed,
} from '../engine/pricing/admin/masterPriceApply';
import { readPriceChangesSince } from '../engine/pricing/sync/priceChangeFeed';

const ADMIN: MasterPriceIdentity = { kind: 'authenticated', userId: 'admin-1', isGlobalAdmin: true };
const NON_ADMIN: MasterPriceIdentity = { kind: 'authenticated', userId: 'user-1', isGlobalAdmin: false };
const DEMO: MasterPriceIdentity = { kind: 'demo', role: 'OWNER' };

const PAKU = RESOURCE_PRICE_RECORDS.find((r) => r.id === 'PRC-MARKET_2026-0axhp81x-NK');
if (!PAKU) throw new Error('Fixture missing: Paku asbes record PRC-MARKET_2026-0axhp81x-NK');
const CODED = RESOURCE_PRICE_RECORDS.find((r) => r.resourceCode && r.resourceCode.trim() !== '');
if (!CODED) throw new Error('Fixture missing: no coded priceMaster record found');

const REASON = 'Penyesuaian harga pasar November 2026';
const T1 = '2026-11-19T06:00:00.000Z';
const T2 = '2026-11-19T07:00:00.000Z';

function resolvePaku(unit = 'kg') {
  return priceResolver2026.resolveResourcePrice({
    resourceName: 'Paku asbes',
    resourceType: 'material',
    unit,
  });
}

beforeEach(() => {
  clearLocalMasterPriceApplyStores();
  priceResolver2026.invalidateAhspCache();
});

describe('P10 gate — §4 is the only gate, fail-closed', () => {
  const GATE_CASES: Array<[label: string, identity: unknown, denialCode: string]> = [
    ["anonymous (today's honest local identity)", currentLocalIdentity(), 'DENIED_NOT_AUTHENTICATED'],
    ['demo PIN role', DEMO, 'DENIED_DEMO_ROLE'],
    ['authenticated non-admin', NON_ADMIN, 'DENIED_NOT_GLOBAL_ADMIN'],
    ['malformed identity', { kind: 'nonsense' }, 'DENIED_MALFORMED_IDENTITY'],
  ];
  it.each(GATE_CASES)('%s is denied and nothing is written', (_label, identity, denialCode) => {
    const result = applyMasterPriceChange({
      identity,
      record: PAKU,
      newPrice: 36000,
      reason: REASON,
      changedAt: T1,
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.code).toBe('DENIED');
    expect(result.denialCode).toBe(denialCode);
    expect(listAdminMasterPriceOverlayEntries()).toEqual([]);
    expect(loadLocalMasterPriceHistory()).toEqual([]);
    expect(loadLocalPriceChangeFeed()).toEqual([]);
    expect(resolvePaku().price).toBe(34500);
  });
});

describe('P10 apply — overlay, resolver, audit', () => {
  it('admin apply: resolver answers the new price, history recorded, cache bumped', () => {
    const cacheBefore = priceResolver2026.getCacheVersion();
    expect(resolvePaku().price).toBe(34500);

    const result = applyMasterPriceChange({
      identity: ADMIN,
      record: PAKU,
      newPrice: 36000,
      reason: REASON,
      changedAt: T1,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(`apply failed: ${result.reason}`);

    // Overlay entry: verbatim price, provenance from the record, local scope.
    expect(result.overlayEntry.price).toBe(36000);
    expect(result.overlayEntry.previousPrice).toBe(34500);
    expect(result.overlayEntry.scope).toBe('LOCAL_BROWSER');
    expect(result.overlayEntry.sourceKey).toBe(PAKU.sourceKey);
    expect(result.overlayEntry.sourceTier).toBe(PAKU.sourceTier);
    expect(result.overlayEntry.historyEntryId).toBe(result.historyEntry.id);
    expect(getAdminMasterPriceOverlayEntry(PAKU.id)).toEqual(result.overlayEntry);

    // Resolver: new price by name+unit AND by resourceId, with the audit trail named.
    const byName = resolvePaku();
    expect(byName.status).toBe('RESOLVED');
    expect(byName.price).toBe(36000);
    expect(byName.recordId).toBe(PAKU.id);
    expect(byName.explanation).toContain('ADMIN-APPLIED');
    expect(byName.explanation).toContain(result.historyEntry.id);
    const byId = priceResolver2026.resolveResourcePrice({
      resourceId: PAKU.resourceId,
      resourceName: 'Paku asbes',
      resourceType: 'material',
      unit: 'kg',
    });
    expect(byId.price).toBe(36000);

    // §4.4 audit entry: effective baseline, DRAFT (local-only, not published).
    expect(result.historyEntry.operation).toBe('UPDATE');
    expect(result.historyEntry.priceRecordId).toBe(PAKU.id);
    expect(result.historyEntry.resourceId).toBe(PAKU.resourceId);
    expect(result.historyEntry.previousAmount).toBe(34500);
    expect(result.historyEntry.newAmount).toBe(36000);
    expect(result.historyEntry.previousUnit).toBe('kg');
    expect(result.historyEntry.newUnit).toBe('kg');
    expect(result.historyEntry.reason).toBe(REASON);
    expect(result.historyEntry.adminIdentity).toBe('admin-1');
    expect(result.historyEntry.publicationStatus).toBe('DRAFT');
    expect(result.historyEntry.previousVersion).toBe(1);
    expect(result.historyEntry.newVersion).toBe(2);
    expect(loadLocalMasterPriceHistory()).toHaveLength(1);

    // Codeless record: feed skipped honestly, history still recorded.
    expect(result.feedEntry).toBeNull();
    expect(result.feedSkippedReason).toContain('tanpa kode');
    expect(loadLocalPriceChangeFeed()).toEqual([]);

    // AHSP cache invalidated so compositions recompute.
    expect(priceResolver2026.getCacheVersion()).toBe(cacheBefore + 1);
    expect(Array.isArray(result.persistenceWarnings)).toBe(true);
  });

  it('provenance is preserved: MARKET stays MARKET, never promoted', () => {
    const result = applyMasterPriceChange({
      identity: ADMIN,
      record: PAKU,
      newPrice: 36000,
      reason: REASON,
      changedAt: T1,
    });
    expect(result.ok).toBe(true);
    const res = resolvePaku();
    expect(res.source?.key).toBe(PAKU.sourceKey);
    expect(res.source?.tier).toBe(PAKU.sourceTier);
    expect(res.source?.tier).toBe('COMMERCIAL_REFERENCE');
    expect(res.source?.priority).toBe(PAKU.sourcePriority);
    expect(res.source?.name).toBe(PAKU.sourceName);
    expect(res.verificationStatus).toBe(PAKU.verificationStatus);
  });

  it('second apply chains previousAmount and latest wins', () => {
    const first = applyMasterPriceChange({
      identity: ADMIN,
      record: PAKU,
      newPrice: 36000,
      reason: REASON,
      changedAt: T1,
    });
    expect(first.ok).toBe(true);
    const second = applyMasterPriceChange({
      identity: ADMIN,
      record: PAKU,
      newPrice: 37000,
      reason: 'Koreksi survei harga pasar November 2026',
      changedAt: T2,
    });
    expect(second.ok).toBe(true);
    if (!second.ok) throw new Error('unreachable');
    expect(second.previousAmount).toBe(36000);
    expect(second.historyEntry.previousAmount).toBe(36000);
    expect(resolvePaku().price).toBe(37000);
    expect(loadLocalMasterPriceHistory()).toHaveLength(2);
    expect(getAdminMasterPriceOverlayEntry(PAKU.id)?.price).toBe(37000);
  });

  it('duplicate apply (same inputs + changedAt) is refused with no writes', () => {
    const first = applyMasterPriceChange({
      identity: ADMIN,
      record: PAKU,
      newPrice: 36000,
      reason: REASON,
      changedAt: T1,
    });
    expect(first.ok).toBe(true);
    // Clear ONLY the overlay (history stays): the live price is 34500
    // again, so the re-apply passes validation but hits the duplicate
    // history id — the append-only rule, not the validator, refuses it.
    clearAdminMasterPriceOverlay();
    priceResolver2026.invalidateAhspCache();
    expect(resolvePaku().price).toBe(34500);

    const dup = applyMasterPriceChange({
      identity: ADMIN,
      record: PAKU,
      newPrice: 36000,
      reason: REASON,
      changedAt: T1,
    });
    expect(dup.ok).toBe(false);
    if (dup.ok) throw new Error('unreachable');
    expect(dup.code).toBe('DUPLICATE_HISTORY');
    expect(loadLocalMasterPriceHistory()).toHaveLength(1);
    expect(getAdminMasterPriceOverlayEntry(PAKU.id)).toBeNull();
    expect(resolvePaku().price).toBe(34500);
  });

  it('invalid inputs are rejected with no writes', () => {
    const cases = [
      { label: 'reason too short', input: { newPrice: 36000, reason: 'naik', changedAt: T1 }, code: 'INVALID_REASON' },
      { label: 'same as current effective', input: { newPrice: 34500, reason: REASON, changedAt: T1 }, code: 'INVALID_PRICE' },
      { label: 'negative price', input: { newPrice: -1, reason: REASON, changedAt: T1 }, code: 'INVALID_PRICE' },
      { label: 'NaN price', input: { newPrice: Number.NaN, reason: REASON, changedAt: T1 }, code: 'INVALID_PRICE' },
      { label: 'bad timestamp', input: { newPrice: 36000, reason: REASON, changedAt: 'bukan-tanggal' }, code: 'INVALID_TIMESTAMP' },
    ] as const;
    for (const c of cases) {
      const result = applyMasterPriceChange({ identity: ADMIN, record: PAKU, ...c.input });
      expect(result.ok, c.label).toBe(false);
      if (result.ok) throw new Error('unreachable');
      expect(result.code, c.label).toBe(c.code);
    }
    expect(listAdminMasterPriceOverlayEntries()).toEqual([]);
    expect(loadLocalMasterPriceHistory()).toEqual([]);
    expect(resolvePaku().price).toBe(34500);
  });
});

describe('P10 unit + identity guards', () => {
  it('overlay never applies to another unit (no silent conversion)', () => {
    const result = applyMasterPriceChange({
      identity: ADMIN,
      record: PAKU,
      newPrice: 36000,
      reason: REASON,
      changedAt: T1,
    });
    expect(result.ok).toBe(true);
    const otherUnit = resolvePaku('m3');
    expect(otherUnit.price).not.toBe(36000);
    expect(otherUnit.explanation).not.toContain('ADMIN-APPLIED');
    expect(resolvePaku('kg').price).toBe(36000);
  });

  it('overlay never overrides a different canonical entity', () => {
    const result = applyMasterPriceChange({
      identity: ADMIN,
      record: PAKU,
      newPrice: 36000,
      reason: REASON,
      changedAt: T1,
    });
    expect(result.ok).toBe(true);
    const res = priceResolver2026.resolveResourcePrice({
      resourceId: CODED.resourceId,
      resourceName: 'Paku asbes',
      resourceType: 'material',
      unit: 'kg',
    });
    expect(res.price).not.toBe(36000);
    expect(res.explanation).not.toContain('ADMIN-APPLIED');
  });

  it('a §15 (#8) exclusion of the overlaid record is honored', () => {
    const result = applyMasterPriceChange({
      identity: ADMIN,
      record: PAKU,
      newPrice: 36000,
      reason: REASON,
      changedAt: T1,
    });
    expect(result.ok).toBe(true);
    const res = priceResolver2026.resolveResourcePrice({
      resourceName: 'Paku asbes',
      resourceType: 'material',
      unit: 'kg',
      excludeRecordIds: new Set([PAKU.id]),
    });
    expect(res.price).not.toBe(36000);
    expect(res.explanation).not.toContain('ADMIN-APPLIED');
  });

  it('SNAPSHOT / OVERRIDE context prices still win over the overlay', () => {
    const result = applyMasterPriceChange({
      identity: ADMIN,
      record: PAKU,
      newPrice: 36000,
      reason: REASON,
      changedAt: T1,
    });
    expect(result.ok).toBe(true);
    const snapshot = priceResolver2026.resolveResourcePrice({
      resourceName: 'Paku asbes',
      resourceType: 'material',
      unit: 'kg',
      pricingContext: {
        pricingMode: 'SNAPSHOT_PRICE',
        snapshotRef: buildComponentPriceRef([{ name: 'Paku asbes', unit: 'kg', unitPrice: 30000 }]),
      },
    });
    expect(snapshot.price).toBe(30000);
    expect(snapshot.source?.key).toBe('SNAPSHOT_PRICE');
    const override = priceResolver2026.resolveResourcePrice({
      resourceName: 'Paku asbes',
      resourceType: 'material',
      unit: 'kg',
      pricingContext: {
        pricingMode: 'PROJECT_OVERRIDE',
        overrideRef: buildComponentPriceRef([{ name: 'Paku asbes', unit: 'kg', unitPrice: 31000 }]),
      },
    });
    expect(override.price).toBe(31000);
    expect(override.source?.key).toBe('PROJECT_OVERRIDE');
    // And LIVE still sees the applied price.
    expect(resolvePaku().price).toBe(36000);
  });
});

describe('P10 feed + reversibility + view helper', () => {
  it('coded record publishes a §13 feed entry consumable by adoption', () => {
    const before = priceResolver2026.resolveResourcePrice({
      resourceCode: CODED.resourceCode,
      resourceName: CODED.resourceName,
      resourceType: CODED.resourceType,
      unit: CODED.unit,
    });
    expect(before.status).toBe('RESOLVED');
    const effective = before.price as number;
    const result = applyMasterPriceChange({
      identity: ADMIN,
      record: CODED,
      newPrice: effective + 1000,
      reason: REASON,
      changedAt: T1,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(`apply failed: ${result.reason}`);
    // The audit baseline is the EFFECTIVE price (BM winner), not the record's own price.
    expect(result.previousAmount).toBe(effective);
    expect(result.historyEntry.previousAmount).toBe(effective);
    expect(result.feedEntry).not.toBeNull();
    expect(result.feedEntry?.resourceCode).toBe(CODED.resourceCode);
    expect(result.feedEntry?.sourceKind).toBe('MASTER_PRICE_HISTORY');
    expect(result.feedEntry?.historyEntryId).toBe(result.historyEntry.id);
    expect(result.feedEntry?.oldPrice).toBe(effective);
    expect(result.feedEntry?.newPrice).toBe(effective + 1000);
    expect(result.feedSkippedReason).toBeNull();
    const feed = loadLocalPriceChangeFeed();
    expect(feed).toHaveLength(1);
    expect(readPriceChangesSince(feed, { kind: 'SINCE', since: '2026-01-01T00:00:00.000Z' })).toHaveLength(1);
    expect(readPriceChangesSince(feed, { kind: 'SINCE', since: T2 })).toHaveLength(0);
  });

  it('clearing the local stores restores the generated master price exactly', () => {
    const result = applyMasterPriceChange({
      identity: ADMIN,
      record: PAKU,
      newPrice: 36000,
      reason: REASON,
      changedAt: T1,
    });
    expect(result.ok).toBe(true);
    expect(resolvePaku().price).toBe(36000);
    clearLocalMasterPriceApplyStores();
    priceResolver2026.invalidateAhspCache();
    expect(resolvePaku().price).toBe(34500);
    expect(listAdminMasterPriceOverlayEntries()).toEqual([]);
    expect(loadLocalMasterPriceHistory()).toEqual([]);
    expect(loadLocalPriceChangeFeed()).toEqual([]);
  });

  it('applyAdminOverlayToRecords replaces prices on copies only', () => {
    const result = applyMasterPriceChange({
      identity: ADMIN,
      record: PAKU,
      newPrice: 36000,
      reason: REASON,
      changedAt: T1,
    });
    expect(result.ok).toBe(true);
    const overlaid = applyAdminOverlayToRecords([PAKU, CODED]);
    expect(overlaid[0]?.price).toBe(36000);
    expect(overlaid[1]?.price).toBe(CODED.price);
    expect(overlaid[0]).not.toBe(PAKU);
    expect(PAKU.price).toBe(34500);
  });
});
