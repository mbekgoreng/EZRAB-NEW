/**
 * MASTER PRICING §8 — AHSP DATABASE VERSIONING (D4).
 *
 * Run: npx vitest run src/test/masterPricingAhspVersioning.test.ts
 * Prerequisite: run AFTER `npm run ahsp:versions` (§8) — the suite reads
 * the versioned snapshot files (data/ahsp2026/versions/...) and the
 * canonical AHSP catalog.
 *
 * What is pinned here (and why each pin exists):
 * - (a) Snapshot format + v2026.1 as-is: the four family snapshots are
 *   byte-equivalent to the live runtime catalog, proven by content
 *   checksum (re-derived from ALL_OFFICIAL_AHSP_ITEMS, not by claim).
 *   Counts: CK 2,859 / SDA 1,556 / BM 1,137 / SMKK 190 = 5,742.
 *   Checksums are pinned EXACTLY — a moved checksum means the catalog
 *   or a snapshot file changed, and re-audit is required before
 *   updating the pin.
 * - Pointer: ACTIVE_AHSP_VERSIONS == '2026.1' everywhere ==
 *   AHSP_DATABASE_VERSION; the pointer moves ONLY via publish (Mode B)
 *   or a validated direct-edit apply (Mode A) — there is no setter.
 * - (b) compareVersions is REAL: added/removed/revised + per-item
 *   field-level diffs + deterministic summary. The L.05/L.06 fixture
 *   uses the REAL item 1.1.4.1 (codes restored per workbook truth,
 *   §5 §7.6); the 5.3.1.41 fixture uses the REAL item + the 2 labor
 *   rows the workbook carries (§5 §7.6).
 * - (c) Mode A: checkpoint → impact → confirm → apply. The impact seam
 *   is HONEST: the default provider returns NOT_COMPUTED, never a
 *   fabricated number. Failed validation leaves the state (and the
 *   pointer) untouched. Stale checkpoints are rejected.
 * - (d) Mode B: clone is DRAFT-only, never touches the source or the
 *   pointer; publish is explicit and idempotent.
 * - (e) Project pin: SNAPSHOT/OVERRIDE use the pinned version (legacy
 *   snapshots read as the pre-§3 baseline 2026.1); LIVE follows the
 *   pointer. A publish never moves a SNAPSHOT project's version (§14.4).
 * - (f) Integrity: versions are immutable (no update/delete API, frozen
 *   state/records/snapshots); rollback is a NEW version holding old
 *   content; history is append-only with deterministic ids.
 * - BM/SMKK frozen: regeneration is refused (R-2); only OVERLAY
 *   provenance is accepted for them.
 * - §14.3: clone/edit/publish/rollback/cancel/failure/concurrent-edit
 *   are all covered by name.
 *
 * Pinned values are OBSERVED values on the current data (measured
 * 2026-11-16 during the §8 extraction), never invented.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  AHSP_BASELINE_VERSION_ID,
  AHSP_FAMILIES,
  AHSP_VERSIONS_DIR,
  applyDirectEdit,
  assertRegenerable,
  buildRegistryState,
  buildVersionSnapshot,
  cloneVersion,
  compareAhspSnapshots,
  computeAhspContentChecksum,
  confirmDirectEdit,
  createCheckpoint,
  getActiveVersion,
  getSnapshotAhspVersion,
  getVersionRecord,
  isValidVersionId,
  listVersions,
  notComputedImpactProvider,
  publishVersion,
  resolveProjectAhspVersion,
  reviseDraftContent,
  rollbackVersion,
  snapshotPathFor,
  validateContentProvenance,
  validateSnapshotContent,
  type AhspFamily,
  type AhspVersionRecord,
  type AhspVersionRegistryState,
  type AhspVersionSnapshot,
  type AhspVersionImpact,
} from '../data/nationalCostDatabase/ahspVersioning';
import * as versioningModule from '../data/nationalCostDatabase/ahspVersioning';
import {
  appendVersionHistoryEntry,
  buildVersionHistoryEntry,
  buildVersionHistoryJsonlHeader,
  parseVersionHistoryJsonl,
  serializeVersionHistoryEntryJsonl,
  serializeVersionHistoryHeaderJsonl,
  validateVersionHistoryEntries,
  type AhspVersionHistoryEntry,
} from '../data/nationalCostDatabase/ahspVersionHistory';
import * as historyModule from '../data/nationalCostDatabase/ahspVersionHistory';
import {
  ACTIVE_AHSP_VERSIONS,
  AHSP_VERSION_RECORDS,
} from '../data/nationalCostDatabase/ahspVersionPointer.generated';
import { AHSP_DATABASE_VERSION } from '../data/nationalCostDatabase/types';
import type { NationalAHSPItem } from '../data/nationalCostDatabase/types';
import { CostDatabaseEngine, ALL_OFFICIAL_AHSP_ITEMS } from '../data/nationalCostDatabase/masterRegistry';
import { AHSP_2026_CANONICAL } from '../data/nationalCostDatabase/ahsp2026Canonical.generated';
import type { AHSPComponent } from '../types';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const VERSIONS_DIR = path.join(ROOT, AHSP_VERSIONS_DIR);

function readJson<T>(rel: string): T {
  return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8')) as T;
}

function readSnapshot(family: AhspFamily, versionId = '2026.1'): AhspVersionSnapshot {
  return readJson<AhspVersionSnapshot>(`${AHSP_VERSIONS_DIR}/${family}/${versionId}.json`);
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const T0 = '2026-11-16T00:00:00.000Z';
const T1 = '2026-11-16T01:00:00.000Z';
const T2 = '2026-11-16T02:00:00.000Z';
const T3 = '2026-11-16T03:00:00.000Z';
const REASON = 'Fixture reason for testing (long enough)';

function makeComponent(overrides: Partial<AHSPComponent> = {}): AHSPComponent {
  return {
    id: 'COMP-1',
    code: 'L.01',
    name: 'Pekerja',
    unit: 'OH',
    coefficient: 1,
    unitPrice: 100000,
    total: 100000,
    resourceType: 'LABOR',
    ...overrides,
  };
}

function makeItem(overrides: Partial<NationalAHSPItem>): NationalAHSPItem {
  return {
    id: 'AHSP-TEST-000001',
    code: '1.1.1.1',
    codeNormalized: '1111',
    name: 'Test item',
    unit: 'm3',
    domain: 'CIPTA_KARYA',
    category: 'TEST',
    version: '2026',
    year: 2026,
    normativeStatus: 'Normatif',
    method: 'Manual',
    sourceId: 'TEST',
    sourceDocument: 'Test fixture (not a real source document)',
    status: 'VERIFIED',
    laborComponents: [],
    materialComponents: [],
    equipmentComponents: [],
    totalLabor: null,
    totalMaterial: null,
    totalEquipment: null,
    unitPrice: null,
    lastUpdated: '2026-11-16',
    dataQualityScore: 90,
    ...overrides,
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
    itemCount: 10,
    publishedAt: status === 'ACTIVE' ? T0 : null,
    publishedBy: null,
  };
}

/** Minimal registry state: all four families ACTIVE at 2026.1, distinct checksums. */
function fixtureState(): AhspVersionRegistryState {
  return buildRegistryState([
    fixtureRecord('CIPTA_KARYA', '2026.1', 'aaaaaaaaaaaaaaaa'),
    fixtureRecord('BINA_MARGA', '2026.1', 'bbbbbbbbbbbbbbbb'),
    fixtureRecord('SUMBER_DAYA_AIR', '2026.1', 'cccccccccccccccc'),
    fixtureRecord('SMKK', '2026.1', 'dddddddddddddddd'),
  ]);
}

function cloneItems<T>(items: readonly T[]): T[] {
  return JSON.parse(JSON.stringify(items)) as T[];
}

// Pinned v2026.1 content checksums (measured 2026-11-16, extraction run).
const PINNED_CHECKSUMS: Record<AhspFamily, string> = {
  CIPTA_KARYA: 'e0b539f134f8d64c',
  BINA_MARGA: '08082e878d4f0e90',
  SUMBER_DAYA_AIR: '1c4794f9ec5dc3e1',
  SMKK: 'e77bbc73b1fea331',
};
const PINNED_COUNTS: Record<AhspFamily, number> = {
  CIPTA_KARYA: 2859,
  BINA_MARGA: 1137,
  SUMBER_DAYA_AIR: 1556,
  SMKK: 190,
};

// ---------------------------------------------------------------------------
// (a) Snapshot format + v2026.1 as-is
// ---------------------------------------------------------------------------

describe('§8 (a) versioned snapshots + v2026.1 as-is', () => {
  it('all four family snapshots exist with the required metadata', () => {
    for (const family of AHSP_FAMILIES) {
      const snap = readSnapshot(family);
      expect(snap.schemaVersion).toBe(1);
      expect(snap.meta.family).toBe(family);
      expect(snap.meta.versionId).toBe('2026.1');
      expect(snap.meta.createdFrom).toBeNull();
      expect(snap.meta.createdBy).toBeNull();
      expect(typeof snap.meta.createdAt).toBe('string');
      expect(Number.isNaN(Date.parse(snap.meta.createdAt))).toBe(false);
      expect(snap.meta.reason.length).toBeGreaterThanOrEqual(10);
      expect(snap.meta.contentChecksum).toMatch(/^[0-9a-f]{16}$/);
      expect(snap.meta.contentProvenance).toBe('CANONICAL_BASELINE');
      expect(snap.meta.itemCount).toBe(snap.items.length);
      expect(snap.meta.sourceDescription.length).toBeGreaterThan(0);
    }
  });

  it('item counts per family match the audited catalog (5,742 total)', () => {
    let total = 0;
    for (const family of AHSP_FAMILIES) {
      const snap = readSnapshot(family);
      expect(snap.items.length).toBe(PINNED_COUNTS[family]);
      total += snap.items.length;
    }
    expect(total).toBe(5742);
    expect(ALL_OFFICIAL_AHSP_ITEMS.length).toBe(5742);
  });

  it('stored checksums recompute from the stored items (internal consistency)', { timeout: 30000 }, () => {
    for (const family of AHSP_FAMILIES) {
      const snap = readSnapshot(family);
      expect(computeAhspContentChecksum(snap.items)).toBe(snap.meta.contentChecksum);
      expect(snap.meta.contentChecksum).toBe(PINNED_CHECKSUMS[family]);
    }
  });

  it('v2026.1 is byte-equivalent to the live runtime catalog (as-is proof)', { timeout: 30000 }, () => {
    for (const family of AHSP_FAMILIES) {
      const snap = readSnapshot(family);
      const live = ALL_OFFICIAL_AHSP_ITEMS.filter((i) => i.domain === family);
      expect(live.length).toBe(snap.items.length);
      expect(computeAhspContentChecksum(live)).toBe(snap.meta.contentChecksum);
      // And the diff of live-vs-snapshot is empty.
      const diff = compareAhspSnapshots(
        { versionId: '2026.1', items: live },
        { versionId: '2026.1', items: snap.items },
        family,
      );
      expect(diff.summary).toEqual({
        added: 0,
        removed: 0,
        revised: 0,
        unchanged: snap.items.length,
        totalSource: snap.items.length,
        totalTarget: snap.items.length,
        fieldChanges: 0,
        componentChanges: 0,
      });
    }
  });

  it('spot-check: real items are deep-equal between snapshot and runtime catalog', () => {
    const ck = readSnapshot('CIPTA_KARYA');
    const item1141 = ck.items.find((i) => i.code === '1.1.4.1');
    expect(item1141).toBeDefined();
    const live1141 = ALL_OFFICIAL_AHSP_ITEMS.find((i) => i.code === '1.1.4.1');
    expect(JSON.parse(JSON.stringify(item1141))).toEqual(JSON.parse(JSON.stringify(live1141)));
    // One BM item (mapped shape, incl. unitDisplay) and one SMKK item.
    const bm = readSnapshot('BINA_MARGA');
    const bmFirst = bm.items[0];
    const liveBm = ALL_OFFICIAL_AHSP_ITEMS.find((i) => i.id === bmFirst.id);
    expect(JSON.parse(JSON.stringify(bmFirst))).toEqual(JSON.parse(JSON.stringify(liveBm)));
    const smkk = readSnapshot('SMKK');
    const smkkFirst = smkk.items.find((i) => i.code === 'SMKK.0001');
    expect(smkkFirst).toBeDefined();
    const liveSmkk = ALL_OFFICIAL_AHSP_ITEMS.find((i) => i.id === smkkFirst!.id);
    expect(JSON.parse(JSON.stringify(smkkFirst))).toEqual(JSON.parse(JSON.stringify(liveSmkk)));
  });

  it('stored snapshot content validates structurally (all four families)', () => {
    for (const family of AHSP_FAMILIES) {
      const snap = readSnapshot(family);
      const result = validateSnapshotContent(family, snap.items);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    }
  });

  it('the active pointer is 2026.1 for every family (generated module + JSON agree)', () => {
    expect(AHSP_DATABASE_VERSION).toBe('2026.1');
    expect(AHSP_BASELINE_VERSION_ID).toBe('2026.1');
    for (const family of AHSP_FAMILIES) {
      expect(ACTIVE_AHSP_VERSIONS[family]).toBe('2026.1');
    }
    const pointer = readJson<{ active: Record<string, string>; records: AhspVersionRecord[] }>(
      `${AHSP_VERSIONS_DIR}/active-versions.json`,
    );
    expect(pointer.active).toEqual({ ...ACTIVE_AHSP_VERSIONS });
    expect(pointer.records).toHaveLength(4);
    for (const rec of pointer.records) {
      expect(rec.status).toBe('ACTIVE');
      expect(rec.contentChecksum).toBe(PINNED_CHECKSUMS[rec.family]);
      expect(rec.itemCount).toBe(PINNED_COUNTS[rec.family]);
      expect(rec.snapshotPath).toBe(snapshotPathFor(rec.family, '2026.1'));
    }
    expect(AHSP_VERSION_RECORDS).toHaveLength(4);
    for (const rec of AHSP_VERSION_RECORDS) {
      const snap = readSnapshot(rec.family);
      expect(rec.contentChecksum).toBe(snap.meta.contentChecksum);
      expect(rec.itemCount).toBe(snap.meta.itemCount);
    }
  });

  it('buildRegistryState from the generated pointer module yields the baseline state', () => {
    const history = parseVersionHistoryJsonl(
      fs.readFileSync(path.join(VERSIONS_DIR, 'ahsp_version_history.jsonl'), 'utf8'),
    );
    expect(history.errors).toEqual([]);
    const state = buildRegistryState([...AHSP_VERSION_RECORDS], history.entries);
    for (const family of AHSP_FAMILIES) {
      expect(getActiveVersion(state, family)).toBe('2026.1');
      expect(listVersions(state, family)).toHaveLength(1);
    }
    expect(state.history).toHaveLength(4);
  });

  it('the version history trail parses clean: HEADER + 4 BASELINE entries', () => {
    const text = fs.readFileSync(path.join(VERSIONS_DIR, 'ahsp_version_history.jsonl'), 'utf8');
    const parsed = parseVersionHistoryJsonl(text);
    expect(parsed.errors).toEqual([]);
    expect(parsed.header).not.toBeNull();
    expect(parsed.header!.schemaVersion).toBe(1);
    expect(parsed.header!.activeVersions).toEqual({
      CIPTA_KARYA: '2026.1',
      BINA_MARGA: '2026.1',
      SUMBER_DAYA_AIR: '2026.1',
      SMKK: '2026.1',
    });
    expect(parsed.entries).toHaveLength(4);
    for (const entry of parsed.entries) {
      expect(entry.operation).toBe('BASELINE');
      expect(entry.versionId).toBe('2026.1');
      expect(entry.previousVersionId).toBeNull();
      expect(entry.publicationStatus).toBe('BASELINE');
      expect(entry.contentChecksum).toBe(PINNED_CHECKSUMS[entry.family as AhspFamily]);
    }
    expect(validateVersionHistoryEntries(parsed.entries).valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Pointer rules + registry state integrity
// ---------------------------------------------------------------------------

describe('pointer rules + registry state integrity', () => {
  it('getActiveVersion reads the pointer; there is no setter export', () => {
    const state = fixtureState();
    expect(getActiveVersion(state, 'CIPTA_KARYA')).toBe('2026.1');
    const keys = Object.keys(versioningModule);
    for (const key of keys) {
      expect(key).not.toMatch(/^(setActiveVersion|movePointer|setPointer|forceActive)/i);
    }
  });

  it('state, records, and the active map are frozen', () => {
    const state = fixtureState();
    expect(Object.isFrozen(state)).toBe(true);
    expect(Object.isFrozen(state.versions)).toBe(true);
    expect(Object.isFrozen(state.active)).toBe(true);
    expect(Object.isFrozen(state.history)).toBe(true);
    for (const family of AHSP_FAMILIES) {
      expect(Object.isFrozen(state.versions[family])).toBe(true);
      expect(Object.isFrozen(getVersionRecord(state, family, '2026.1')!)).toBe(true);
    }
  });

  it('buildRegistryState rejects a family without exactly one ACTIVE version', () => {
    const records = [
      fixtureRecord('CIPTA_KARYA', '2026.1', 'aaaaaaaaaaaaaaaa', 'DRAFT'),
      fixtureRecord('BINA_MARGA', '2026.1', 'bbbbbbbbbbbbbbbb'),
      fixtureRecord('SUMBER_DAYA_AIR', '2026.1', 'cccccccccccccccc'),
      fixtureRecord('SMKK', '2026.1', 'dddddddddddddddd'),
    ];
    expect(() => buildRegistryState(records)).toThrow(/exactly one ACTIVE/);
    const twoActive = [
      fixtureRecord('CIPTA_KARYA', '2026.1', 'aaaaaaaaaaaaaaaa'),
      fixtureRecord('CIPTA_KARYA', '2026.2', 'eeeeeeeeeeeeeeee'),
      fixtureRecord('BINA_MARGA', '2026.1', 'bbbbbbbbbbbbbbbb'),
      fixtureRecord('SUMBER_DAYA_AIR', '2026.1', 'cccccccccccccccc'),
      fixtureRecord('SMKK', '2026.1', 'dddddddddddddddd'),
    ];
    expect(() => buildRegistryState(twoActive)).toThrow(/exactly one ACTIVE/);
  });

  it('buildRegistryState rejects duplicate versions and invalid ids', () => {
    const dup = [
      fixtureRecord('CIPTA_KARYA', '2026.1', 'aaaaaaaaaaaaaaaa'),
      fixtureRecord('CIPTA_KARYA', '2026.1', 'eeeeeeeeeeeeeeee'),
      fixtureRecord('BINA_MARGA', '2026.1', 'bbbbbbbbbbbbbbbb'),
      fixtureRecord('SUMBER_DAYA_AIR', '2026.1', 'cccccccccccccccc'),
      fixtureRecord('SMKK', '2026.1', 'dddddddddddddddd'),
    ];
    expect(() => buildRegistryState(dup)).toThrow(/Duplicate version record/);
    expect(isValidVersionId('2026.1')).toBe(true);
    expect(isValidVersionId('2026.10')).toBe(true);
    expect(isValidVersionId('2026')).toBe(false);
    expect(isValidVersionId('v2026.1')).toBe(false);
    expect(isValidVersionId('2026.1-draft')).toBe(false);
    expect(isValidVersionId('')).toBe(false);
    expect(isValidVersionId(null)).toBe(false);
  });

  it('snapshotPathFor follows the D4 layout', () => {
    expect(snapshotPathFor('CIPTA_KARYA', '2026.1')).toBe('data/ahsp2026/versions/CIPTA_KARYA/2026.1.json');
    expect(snapshotPathFor('SMKK', '2026.2')).toBe('data/ahsp2026/versions/SMKK/2026.2.json');
  });
});

// ---------------------------------------------------------------------------
// (b) compareVersions — real diff
// ---------------------------------------------------------------------------

describe('§8 (b) compareVersions is a real diff', () => {
  function diffFixture() {
    const kept = makeItem({
      id: 'AHSP-TEST-KEEP',
      code: '1.1.1.1',
      name: 'Kept item',
      unit: 'm3',
      unitPrice: 100000,
      laborComponents: [
        makeComponent({ id: 'KEEP-L001', code: 'L.01', name: 'Pekerja', coefficient: 1, unitPrice: 100000, total: 100000 }),
      ],
      materialComponents: [
        makeComponent({ id: 'KEEP-M001', code: 'M01', name: 'Pasir', unit: 'm3', coefficient: 0.5, unitPrice: 200000, total: 100000, resourceType: 'MATERIAL' }),
      ],
    });
    const removed = makeItem({ id: 'AHSP-TEST-GONE', code: '1.1.1.2', name: 'Removed item' });
    const source = [kept, removed];
    const keptRevised = cloneItems([kept])[0];
    keptRevised.name = 'Kept item (renamed)';
    keptRevised.unit = 'm2';
    keptRevised.unitPrice = 120000;
    keptRevised.laborComponents[0].coefficient = 1.5;
    keptRevised.laborComponents[0].code = 'L.02';
    keptRevised.materialComponents = [];
    keptRevised.equipmentComponents = [
      makeComponent({ id: 'KEEP-E001', code: 'E01', name: 'Excavator', unit: 'jam', coefficient: 0.1, unitPrice: 500000, total: 50000, resourceType: 'EQUIPMENT' }),
    ];
    const added = makeItem({ id: 'AHSP-TEST-NEW', code: '1.1.1.3', name: 'Added item' });
    const target = [keptRevised, added];
    return { source, target };
  }

  it('reports added/removed/revised + field-level diffs + summary', () => {
    const { source, target } = diffFixture();
    const diff = compareAhspSnapshots(
      { versionId: '2026.1', items: source },
      { versionId: '2026.2', items: target },
      'CIPTA_KARYA',
    );
    expect(diff.sourceVersion).toBe('2026.1');
    expect(diff.targetVersion).toBe('2026.2');
    expect(diff.domain).toBe('CIPTA_KARYA');
    expect(diff.addedCodes.map((i) => i.code)).toEqual(['1.1.1.3']);
    expect(diff.removedCodes).toEqual([
      { code: '1.1.1.2', name: 'Removed item', reason: 'Removed in 2026.2 (was present in 2026.1)' },
    ]);
    expect(diff.revisedCodes).toHaveLength(1);
    expect(diff.revisedCodes[0].code).toBe('1.1.1.1');
    expect(diff.revisedCodes[0].oldPrice).toBe(100000);
    expect(diff.revisedCodes[0].newPrice).toBe(120000);
    expect(diff.revisedCodes[0].diffNote).toMatch(/field change/);
    // Field-level detail: name, unit, unitPrice, coefficient, code, removed material, added equipment.
    const fields = diff.fieldDiffs[0];
    expect(fields.id).toBe('AHSP-TEST-KEEP');
    const byPath = new Map(fields.changes.map((c) => [c.path, c]));
    expect(byPath.get('name')).toEqual({ path: 'name', field: 'name', oldValue: 'Kept item', newValue: 'Kept item (renamed)' });
    expect(byPath.get('unit')!.newValue).toBe('m2');
    expect(byPath.get('unitPrice')!.newValue).toBe(120000);
    expect(byPath.get('laborComponents[0].coefficient')).toEqual({
      path: 'laborComponents[0].coefficient',
      field: 'coefficient',
      oldValue: 1,
      newValue: 1.5,
    });
    expect(byPath.get('laborComponents[0].code')!.newValue).toBe('L.02');
    expect(byPath.get('materialComponents[0]')!.field).toBe('component');
    expect(byPath.get('materialComponents[0]')!.newValue).toBeNull();
    expect(byPath.get('equipmentComponents[0]')!.field).toBe('component');
    expect(byPath.get('equipmentComponents[0]')!.oldValue).toBeNull();
    expect(diff.summary).toEqual({
      added: 1,
      removed: 1,
      revised: 1,
      unchanged: 0,
      totalSource: 2,
      totalTarget: 2,
      fieldChanges: fields.changes.length,
      componentChanges: 4, // coefficient + code + removed material + added equipment
    });
  });

  it('is deterministic: same inputs twice, and shuffled input order, give identical output', () => {
    const { source, target } = diffFixture();
    const a = compareAhspSnapshots({ versionId: '2026.1', items: source }, { versionId: '2026.2', items: target }, 'CIPTA_KARYA');
    const b = compareAhspSnapshots({ versionId: '2026.1', items: source }, { versionId: '2026.2', items: target }, 'CIPTA_KARYA');
    expect(b).toEqual(a);
    const shuffled = compareAhspSnapshots(
      { versionId: '2026.1', items: [...source].reverse() },
      { versionId: '2026.2', items: [...target].reverse() },
      'CIPTA_KARYA',
    );
    expect(shuffled).toEqual(a);
  });

  it('identical snapshots diff to zero (nothing revised)', () => {
    const { source } = diffFixture();
    const diff = compareAhspSnapshots(
      { versionId: '2026.1', items: source },
      { versionId: '2026.1', items: cloneItems(source) },
      'CIPTA_KARYA',
    );
    expect(diff.summary).toEqual({
      added: 0,
      removed: 0,
      revised: 0,
      unchanged: 2,
      totalSource: 2,
      totalTarget: 2,
      fieldChanges: 0,
      componentChanges: 0,
    });
    expect(diff.fieldDiffs).toEqual([]);
  });

  it('object key order is not content (snapshot files store sorted keys, live objects do not)', () => {
    const item = makeItem({
      id: 'AHSP-TEST-KEYORDER',
      provenance: {
        regulation: 'SE DJBK No. 47/SE/Dk/2026',
        attachment: 'VI',
        page: 158,
        sourceFile: 'Lampiran-VI.pdf',
      },
      validationFlags: {
        code: true,
        description: true,
        unit: true,
        components: true,
        coefficients: true,
        source: true,
      },
    });
    // Same values, different key order (as a canonicalized snapshot file would store them).
    const reordered = cloneItems([item])[0];
    reordered.provenance = {
      attachment: 'VI',
      page: 158,
      regulation: 'SE DJBK No. 47/SE/Dk/2026',
      sourceFile: 'Lampiran-VI.pdf',
    };
    reordered.validationFlags = {
      code: true,
      coefficients: true,
      components: true,
      description: true,
      source: true,
      unit: true,
    };
    const diff = compareAhspSnapshots(
      { versionId: '2026.1', items: [item] },
      { versionId: '2026.2', items: [reordered] },
      'CIPTA_KARYA',
    );
    expect(diff.summary.revised).toBe(0);
    expect(diff.summary.unchanged).toBe(1);
    expect(diff.fieldDiffs).toEqual([]);
  });

  it('lastUpdated alone is not a revision (generation stamp, not content)', () => {
    const item = makeItem({ id: 'AHSP-TEST-STAMP', lastUpdated: '2026-10-20' });
    const restamped = { ...cloneItems([item])[0], lastUpdated: '2026-11-16' };
    const diff = compareAhspSnapshots(
      { versionId: '2026.1', items: [item] },
      { versionId: '2026.2', items: [restamped] },
      'CIPTA_KARYA',
    );
    expect(diff.summary.revised).toBe(0);
    expect(diff.summary.unchanged).toBe(1);
  });

  it('BM-shaped (id-less) components diff by position', () => {
    const bmComp = makeComponent({ code: 'M01', name: 'Pasir', unit: 'm3', coefficient: 1, resourceType: 'MATERIAL' });
    // No `id` — exactly the mapped-BM shape (mapBinaMargaToNational drops it).
    delete (bmComp as unknown as Record<string, unknown>).id;
    expect('id' in bmComp).toBe(false);
    const bmItem = makeItem({
      id: 'BM2026-A.2',
      code: 'A.2',
      domain: 'BINA_MARGA',
      materialComponents: [bmComp],
    });
    const revised = cloneItems([bmItem])[0];
    revised.materialComponents[0].coefficient = 2;
    const diff = compareAhspSnapshots(
      { versionId: '2026.1', items: [bmItem] },
      { versionId: '2026.2', items: [revised] },
      'BINA_MARGA',
    );
    expect(diff.summary.revised).toBe(1);
    expect(diff.fieldDiffs[0].changes).toEqual([
      { path: 'materialComponents[0].coefficient', field: 'coefficient', oldValue: 1, newValue: 2 },
    ]);
  });

  it('L.05/L.06 (§5 §7.6): restoring codes on the REAL item 1.1.4.1 diffs as 5 code changes', () => {
    const live = AHSP_2026_CANONICAL.find((i) => i.code === '1.1.4.1');
    expect(live).toBeDefined();
    expect(live!.name).toBe('Pengukuran ulang topografi seluas 1 Ha');
    // Current canonical state: all five labor rows carry an EMPTY code.
    expect(live!.laborComponents).toHaveLength(5);
    for (const c of live!.laborComponents) expect(c.code).toBe('');
    expect(live!.laborComponents.map((c) => c.name)).toEqual([
      'Pekerja',
      'Juru ukur',
      'Pembantu juru ukur',
      'Juru gambar',
      'Ahli topografi',
    ]);
    // Workbook truth (WB CK sheet Persiapan rows 563–567, §5 §7.6).
    const restored = cloneItems([live!])[0];
    const codes = ['L.01', 'L.05', 'L.06', 'L.14b', 'L.12d'];
    restored.laborComponents.forEach((c, i) => {
      c.code = codes[i];
    });
    const diff = compareAhspSnapshots(
      { versionId: '2026.1', items: [live!] },
      { versionId: '2026.2', items: [restored] },
      'CIPTA_KARYA',
    );
    expect(diff.summary).toEqual({
      added: 0,
      removed: 0,
      revised: 1,
      unchanged: 0,
      totalSource: 1,
      totalTarget: 1,
      fieldChanges: 5,
      componentChanges: 5,
    });
    expect(diff.revisedCodes).toHaveLength(1);
    expect(diff.revisedCodes[0].code).toBe('1.1.4.1');
    const changes = diff.fieldDiffs[0].changes;
    expect(changes).toHaveLength(5);
    changes.forEach((c, i) => {
      expect(c.path).toBe(`laborComponents[${i}].code`);
      expect(c.oldValue).toBe('');
      expect(c.newValue).toBe(codes[i]);
    });
  });

  it('5.3.1.41 (§5 §7.6): the 2 missing labor rows diff as added components', () => {
    const live = AHSP_2026_CANONICAL.find((i) => i.code === '5.3.1.41');
    expect(live).toBeDefined();
    expect(live!.laborComponents).toHaveLength(1); // only Pekerja 0.769 today
    const restored = cloneItems([live!])[0];
    // Workbook truth (WB CK Jaringan Listrik row 7056, §5 §7.6): two
    // rows are missing entirely from the current extraction. Codes are
    // NOT stated in §5, so the fixture carries empty codes honestly.
    restored.laborComponents.push(
      makeComponent({ id: 'AHSP-2026-CIPTA_KARYA-001487-L002', code: '', name: 'Tenaga Terampil Operator', unit: 'OH', coefficient: 0.231, unitPrice: null, total: null }),
      makeComponent({ id: 'AHSP-2026-CIPTA_KARYA-001487-L003', code: '', name: 'Tenaga Ahli Muda', unit: 'OH', coefficient: 0.115, unitPrice: null, total: null }),
    );
    const diff = compareAhspSnapshots(
      { versionId: '2026.1', items: [live!] },
      { versionId: '2026.2', items: [restored] },
      'CIPTA_KARYA',
    );
    expect(diff.summary.revised).toBe(1);
    expect(diff.summary.componentChanges).toBe(2);
    const changes = diff.fieldDiffs[0].changes;
    expect(changes).toHaveLength(2);
    expect(changes[0].path).toBe('laborComponents[1]');
    expect(changes[0].oldValue).toBeNull();
    expect(String(changes[0].newValue)).toContain('Tenaga Terampil Operator');
    expect(changes[1].path).toBe('laborComponents[2]');
    expect(String(changes[1].newValue)).toContain('Tenaga Ahli Muda');
  });

  it('masterRegistry.compareVersions delegates to the real diff (stub is gone)', () => {
    const { source, target } = diffFixture();
    const viaRegistry = CostDatabaseEngine.compareVersions(
      'CIPTA_KARYA',
      { versionId: '2026.1', items: source },
      { versionId: '2026.2', items: target },
    );
    const direct = compareAhspSnapshots(
      { versionId: '2026.1', items: source },
      { versionId: '2026.2', items: target },
      'CIPTA_KARYA',
    );
    expect(viaRegistry).toEqual(direct);
    // The old stub ALWAYS returned empty removed/revised arrays — the
    // real diff reports them.
    expect(viaRegistry.removedCodes.length).toBeGreaterThan(0);
    expect(viaRegistry.revisedCodes.length).toBeGreaterThan(0);
    expect(viaRegistry.fieldDiffs.length).toBeGreaterThan(0);
  });

  it('diff filters to the requested domain', () => {
    const ck = makeItem({ id: 'AHSP-TEST-CK', code: '9.9.9.9', domain: 'CIPTA_KARYA' });
    const sda = makeItem({ id: 'AHSP-TEST-SDA', code: '9.9.9.8', domain: 'SUMBER_DAYA_AIR' });
    const diff = compareAhspSnapshots(
      { versionId: '2026.1', items: [] },
      { versionId: '2026.2', items: [ck, sda] },
      'CIPTA_KARYA',
    );
    expect(diff.summary.added).toBe(1);
    expect(diff.addedCodes[0].id).toBe('AHSP-TEST-CK');
  });
});

// ---------------------------------------------------------------------------
// (c) Mode A — direct edit
// ---------------------------------------------------------------------------

describe('§8 (c) Mode A — direct edit (checkpoint → impact → confirm → apply)', () => {
  function ckItems(): NationalAHSPItem[] {
    return [
      makeItem({
        id: 'AHSP-TEST-001',
        code: '1.1.1.1',
        laborComponents: [makeComponent({ id: 'C1', code: 'L.01', coefficient: 1 })],
      }),
      makeItem({ id: 'AHSP-TEST-002', code: '1.1.1.2' }),
    ];
  }

  it('checkpoint pins the active version (frozen) and does not change state', () => {
    const state = fixtureState();
    const checkpoint = createCheckpoint(state, { family: 'CIPTA_KARYA', reason: REASON, now: T1 });
    expect(checkpoint.family).toBe('CIPTA_KARYA');
    expect(checkpoint.versionId).toBe('2026.1');
    expect(checkpoint.contentChecksum).toBe('aaaaaaaaaaaaaaaa');
    expect(checkpoint.snapshotPath).toBe('data/ahsp2026/versions/CIPTA_KARYA/2026.1.json');
    expect(checkpoint.createdAt).toBe(T1);
    expect(Object.isFrozen(checkpoint)).toBe(true);
    expect(state).toEqual(fixtureState());
  });

  it('checkpoint requires a reason (>= 10 chars)', () => {
    const state = fixtureState();
    expect(() => createCheckpoint(state, { family: 'CIPTA_KARYA', reason: 'short' })).toThrow(/at least 10/);
    expect(() => createCheckpoint(state, { family: 'CIPTA_KARYA', reason: '' })).toThrow(/at least 10/);
  });

  it('the impact seam is HONEST: the default provider returns NOT_COMPUTED, never numbers', () => {
    const impact = notComputedImpactProvider.computeImpact({
      family: 'CIPTA_KARYA',
      sourceVersionId: '2026.1',
      targetVersionId: '2026.2',
      diffSummary: { added: 0, removed: 0, revised: 1, unchanged: 1 },
    });
    expect(impact.status).toBe('NOT_COMPUTED');
    expect(impact.affectedAhspCodes).toBeUndefined();
    expect(impact.affectedComponentReferences).toBeUndefined();
    expect(impact.affectedLiveProjects).toBeUndefined();
    expect(impact.lockedSnapshotsUnchanged).toBeUndefined();
    expect(impact.note).toMatch(/NOT a claim of zero impact/);
  });

  it('confirm requires a fresh checkpoint + an impact assessment + a reason', () => {
    const state = fixtureState();
    const checkpoint = createCheckpoint(state, { family: 'CIPTA_KARYA', reason: REASON, now: T1 });
    const impact = notComputedImpactProvider.computeImpact({
      family: 'CIPTA_KARYA',
      sourceVersionId: '2026.1',
      targetVersionId: '2026.2',
      diffSummary: { added: 0, removed: 0, revised: 0, unchanged: 2 },
    });
    expect(() =>
      confirmDirectEdit(state, { checkpoint, impact, reason: 'too short' }),
    ).toThrow(/at least 10/);
    expect(() =>
      confirmDirectEdit(state, { checkpoint, impact: null as unknown as AhspVersionImpact, reason: REASON }),
    ).toThrow(/impact assessment is required/);
    const confirmation = confirmDirectEdit(state, { checkpoint, impact, reason: REASON, now: T2 });
    expect(confirmation.family).toBe('CIPTA_KARYA');
    expect(confirmation.impact.status).toBe('NOT_COMPUTED');
    expect(confirmation.confirmedAt).toBe(T2);
    expect(Object.isFrozen(confirmation)).toBe(true);
  });

  it('apply: new ACTIVE record, pointer moves, previous SUPERSEDED, history records NOT_COMPUTED', () => {
    const state = fixtureState();
    const checkpoint = createCheckpoint(state, { family: 'CIPTA_KARYA', reason: REASON, now: T1 });
    const impact = notComputedImpactProvider.computeImpact({
      family: 'CIPTA_KARYA',
      sourceVersionId: '2026.1',
      targetVersionId: '2026.2',
      diffSummary: { added: 0, removed: 0, revised: 1, unchanged: 1 },
    });
    const confirmation = confirmDirectEdit(state, { checkpoint, impact, reason: REASON, now: T2 });
    const items = ckItems();
    const { state: next, record, historyEntry } = applyDirectEdit(state, {
      confirmation,
      newVersionId: '2026.2',
      newItems: items,
      contentProvenance: 'PIPELINE_REGENERATED',
      diffSummary: { added: 0, removed: 0, revised: 1, unchanged: 1 },
      now: T3,
    });
    expect(record.versionId).toBe('2026.2');
    expect(record.status).toBe('ACTIVE');
    expect(record.createdFrom).toBe('2026.1');
    expect(record.contentChecksum).toBe(computeAhspContentChecksum(items));
    expect(record.contentProvenance).toBe('PIPELINE_REGENERATED');
    expect(record.itemCount).toBe(2);
    expect(record.publishedAt).toBe(T3);
    expect(getActiveVersion(next, 'CIPTA_KARYA')).toBe('2026.2');
    expect(getVersionRecord(next, 'CIPTA_KARYA', '2026.1')!.status).toBe('SUPERSEDED');
    // Other families untouched.
    expect(getActiveVersion(next, 'BINA_MARGA')).toBe('2026.1');
    expect(next.history).toHaveLength(1);
    expect(historyEntry.operation).toBe('DIRECT_EDIT');
    expect(historyEntry.versionId).toBe('2026.2');
    expect(historyEntry.previousVersionId).toBe('2026.1');
    expect(historyEntry.impactStatus).toBe('NOT_COMPUTED');
    expect(historyEntry.diffSummary).toEqual({ added: 0, removed: 0, revised: 1, unchanged: 1 });
    expect(historyEntry.publicationStatus).toBe('PUBLISHED');
    // The input state is untouched (purity).
    expect(getActiveVersion(state, 'CIPTA_KARYA')).toBe('2026.1');
  });

  it('apply failure leaves the state (and pointer) untouched — every validation', () => {
    const state = fixtureState();
    const checkpoint = createCheckpoint(state, { family: 'CIPTA_KARYA', reason: REASON, now: T1 });
    const impact = notComputedImpactProvider.computeImpact({
      family: 'CIPTA_KARYA',
      sourceVersionId: '2026.1',
      targetVersionId: '2026.2',
      diffSummary: { added: 0, removed: 0, revised: 0, unchanged: 0 },
    });
    const confirmation = confirmDirectEdit(state, { checkpoint, impact, reason: REASON, now: T2 });
    const badCases: { label: string; mutate: (input: Parameters<typeof applyDirectEdit>[1]) => void }[] = [
      {
        label: 'duplicate item id',
        mutate: (input) => {
          input.newItems = [makeItem({ id: 'DUP' }), makeItem({ id: 'DUP' })];
        },
      },
      {
        label: 'wrong-domain item',
        mutate: (input) => {
          input.newItems = [makeItem({ id: 'X1', domain: 'SUMBER_DAYA_AIR' })];
        },
      },
      {
        label: 'negative baked price',
        mutate: (input) => {
          input.newItems = [makeItem({ id: 'X1', unitPrice: -5 })];
        },
      },
      {
        label: 'duplicate version id',
        mutate: (input) => {
          input.newVersionId = '2026.1';
        },
      },
      {
        label: 'malformed version id',
        mutate: (input) => {
          input.newVersionId = 'v2';
        },
      },
      {
        label: 'OVERLAY provenance for CK',
        mutate: (input) => {
          input.contentProvenance = 'OVERLAY';
        },
      },
    ];
    for (const { label, mutate } of badCases) {
      const input: Parameters<typeof applyDirectEdit>[1] = {
        confirmation,
        newVersionId: '2026.2',
        newItems: ckItems(),
        contentProvenance: 'PIPELINE_REGENERATED',
        now: T3,
      };
      mutate(input);
      expect(() => applyDirectEdit(state, input), label).toThrow();
    }
    expect(state).toEqual(fixtureState());
    expect(getActiveVersion(state, 'CIPTA_KARYA')).toBe('2026.1');
  });

  it('§14.3 concurrent editing conflict: a stale checkpoint is rejected at confirm AND apply', () => {
    const state = fixtureState();
    const checkpointA = createCheckpoint(state, { family: 'CIPTA_KARYA', reason: REASON, now: T1 });
    const checkpointB = createCheckpoint(state, { family: 'CIPTA_KARYA', reason: REASON, now: T1 });
    const impact = notComputedImpactProvider.computeImpact({
      family: 'CIPTA_KARYA',
      sourceVersionId: '2026.1',
      targetVersionId: '2026.2',
      diffSummary: { added: 0, removed: 0, revised: 0, unchanged: 0 },
    });
    // Editor A confirms + applies → pointer moves to 2026.2.
    const confA = confirmDirectEdit(state, { checkpoint: checkpointA, impact, reason: REASON, now: T2 });
    const { state: moved } = applyDirectEdit(state, {
      confirmation: confA,
      newVersionId: '2026.2',
      newItems: ckItems(),
      contentProvenance: 'PIPELINE_REGENERATED',
      now: T3,
    });
    expect(getActiveVersion(moved, 'CIPTA_KARYA')).toBe('2026.2');
    // Editor B's checkpoint is now stale — confirm rejects it…
    expect(() =>
      confirmDirectEdit(moved, { checkpoint: checkpointB, impact, reason: REASON }),
    ).toThrow(/Stale checkpoint/);
    // …and an apply confirmed BEFORE the move is also rejected.
    const confB = confirmDirectEdit(state, { checkpoint: checkpointB, impact, reason: REASON, now: T2 });
    expect(() =>
      applyDirectEdit(moved, {
        confirmation: confB,
        newVersionId: '2026.3',
        newItems: ckItems(),
        contentProvenance: 'PIPELINE_REGENERATED',
        now: T3,
      }),
    ).toThrow(/Stale checkpoint/);
    expect(getActiveVersion(moved, 'CIPTA_KARYA')).toBe('2026.2');
  });

  it('§14.3 direct edit cancellation: a checkpoint without confirm/apply changes nothing', () => {
    const state = fixtureState();
    createCheckpoint(state, { family: 'CIPTA_KARYA', reason: REASON, now: T1 });
    expect(state).toEqual(fixtureState());
  });

  it('BM/SMKK cannot be regenerated (R-2) — assertRegenerable + apply refuse', () => {
    expect(() => assertRegenerable('BINA_MARGA')).toThrow(/cannot be regenerated/);
    expect(() => assertRegenerable('SMKK')).toThrow(/cannot be regenerated/);
    expect(() => assertRegenerable('CIPTA_KARYA')).not.toThrow();
    expect(() => assertRegenerable('SUMBER_DAYA_AIR')).not.toThrow();
    const state = fixtureState();
    const checkpoint = createCheckpoint(state, { family: 'BINA_MARGA', reason: REASON, now: T1 });
    const impact = notComputedImpactProvider.computeImpact({
      family: 'BINA_MARGA',
      sourceVersionId: '2026.1',
      targetVersionId: '2026.2',
      diffSummary: { added: 0, removed: 0, revised: 0, unchanged: 0 },
    });
    const confirmation = confirmDirectEdit(state, { checkpoint, impact, reason: REASON, now: T2 });
    const bmItem = makeItem({ id: 'BM2026-X', code: 'X.1', domain: 'BINA_MARGA' });
    expect(() =>
      applyDirectEdit(state, {
        confirmation,
        newVersionId: '2026.2',
        newItems: [bmItem],
        contentProvenance: 'PIPELINE_REGENERATED',
        now: T3,
      }),
    ).toThrow(/PIPELINE_REGENERATED is impossible/);
    // …but an OVERLAY-produced BM version applies.
    const { state: next } = applyDirectEdit(state, {
      confirmation,
      newVersionId: '2026.2',
      newItems: [bmItem],
      contentProvenance: 'OVERLAY',
      now: T3,
    });
    expect(getActiveVersion(next, 'BINA_MARGA')).toBe('2026.2');
  });
});

// ---------------------------------------------------------------------------
// (d) Mode B — clone + publish
// ---------------------------------------------------------------------------

describe('§8 (d) Mode B — clone + publish', () => {
  it('clone creates a DRAFT with identical content; pointer + source untouched', () => {
    const state = fixtureState();
    const { state: next, record, historyEntry } = cloneVersion(state, {
      family: 'CIPTA_KARYA',
      sourceVersionId: '2026.1',
      newVersionId: '2026.2',
      reason: REASON,
      now: T1,
    });
    expect(record.status).toBe('DRAFT');
    expect(record.createdFrom).toBe('2026.1');
    expect(record.contentChecksum).toBe('aaaaaaaaaaaaaaaa');
    expect(record.contentProvenance).toBe('CLONE_AS_IS');
    expect(record.itemCount).toBe(10);
    expect(record.snapshotPath).toBe('data/ahsp2026/versions/CIPTA_KARYA/2026.2.json');
    expect(record.publishedAt).toBeNull();
    expect(getActiveVersion(next, 'CIPTA_KARYA')).toBe('2026.1');
    expect(getVersionRecord(next, 'CIPTA_KARYA', '2026.1')).toEqual(
      getVersionRecord(state, 'CIPTA_KARYA', '2026.1'),
    );
    expect(historyEntry.operation).toBe('CLONE');
    expect(historyEntry.publicationStatus).toBe('DRAFT');
    expect(next.history).toHaveLength(1);
    // The input state is untouched.
    expect(listVersions(state, 'CIPTA_KARYA')).toHaveLength(1);
  });

  it('clone errors: unknown source, duplicate id, malformed id, short reason', () => {
    const state = fixtureState();
    expect(() =>
      cloneVersion(state, { family: 'CIPTA_KARYA', sourceVersionId: '2025.9', newVersionId: '2026.2', reason: REASON }),
    ).toThrow(/no version 2025.9/);
    expect(() =>
      cloneVersion(state, { family: 'CIPTA_KARYA', sourceVersionId: '2026.1', newVersionId: '2026.1', reason: REASON }),
    ).toThrow(/already exists/);
    expect(() =>
      cloneVersion(state, { family: 'CIPTA_KARYA', sourceVersionId: '2026.1', newVersionId: 'next', reason: REASON }),
    ).toThrow(/YYYY\.minor/);
    expect(() =>
      cloneVersion(state, { family: 'CIPTA_KARYA', sourceVersionId: '2026.1', newVersionId: '2026.2', reason: 'short' }),
    ).toThrow(/at least 10/);
  });

  it('clone independence: editing the draft never touches the source or resolution', () => {
    const state = fixtureState();
    const { state: cloned } = cloneVersion(state, {
      family: 'CIPTA_KARYA',
      sourceVersionId: '2026.1',
      newVersionId: '2026.2',
      reason: REASON,
      now: T1,
    });
    const draftItems = [makeItem({ id: 'AHSP-TEST-001', code: '1.1.1.1', name: 'Edited in draft' })];
    const { state: edited, record } = reviseDraftContent(cloned, {
      family: 'CIPTA_KARYA',
      versionId: '2026.2',
      items: draftItems,
      contentProvenance: 'PIPELINE_REGENERATED',
      reason: REASON,
      now: T2,
    });
    expect(record.contentChecksum).toBe(computeAhspContentChecksum(draftItems));
    expect(record.contentChecksum).not.toBe('aaaaaaaaaaaaaaaa');
    expect(record.itemCount).toBe(1);
    // Source record is byte-identical to before.
    expect(getVersionRecord(edited, 'CIPTA_KARYA', '2026.1')).toEqual(
      getVersionRecord(state, 'CIPTA_KARYA', '2026.1'),
    );
    // Pre-publish, LIVE resolution still follows the old active version.
    expect(
      resolveProjectAhspVersion({
        pricingMode: 'LIVE_MASTER_PRICE',
        family: 'CIPTA_KARYA',
        activeVersions: edited.active,
      }),
    ).toBe('2026.1');
    expect(getActiveVersion(edited, 'CIPTA_KARYA')).toBe('2026.1');
  });

  it('reviseDraftContent refuses published versions and invalid content', () => {
    const state = fixtureState();
    expect(() =>
      reviseDraftContent(state, {
        family: 'CIPTA_KARYA',
        versionId: '2026.1',
        items: [makeItem({ id: 'X' })],
        contentProvenance: 'PIPELINE_REGENERATED',
        reason: REASON,
      }),
    ).toThrow(/only DRAFT versions can be revised/);
    expect(() =>
      reviseDraftContent(state, {
        family: 'CIPTA_KARYA',
        versionId: '2026.9',
        items: [makeItem({ id: 'X' })],
        contentProvenance: 'PIPELINE_REGENERATED',
        reason: REASON,
      }),
    ).toThrow(/no version 2026.9/);
    const { state: cloned } = cloneVersion(state, {
      family: 'CIPTA_KARYA',
      sourceVersionId: '2026.1',
      newVersionId: '2026.2',
      reason: REASON,
      now: T1,
    });
    expect(() =>
      reviseDraftContent(cloned, {
        family: 'CIPTA_KARYA',
        versionId: '2026.2',
        items: [makeItem({ id: 'DUP' }), makeItem({ id: 'DUP' })],
        contentProvenance: 'PIPELINE_REGENERATED',
        reason: REASON,
      }),
    ).toThrow(/duplicate id/);
  });

  it('publish moves the pointer; previous ACTIVE becomes SUPERSEDED', () => {
    const state = fixtureState();
    const { state: cloned } = cloneVersion(state, {
      family: 'CIPTA_KARYA',
      sourceVersionId: '2026.1',
      newVersionId: '2026.2',
      reason: REASON,
      now: T1,
    });
    const { state: published, record, historyEntry, published: didPublish } = publishVersion(cloned, {
      family: 'CIPTA_KARYA',
      versionId: '2026.2',
      reason: REASON,
      now: T2,
    });
    expect(didPublish).toBe(true);
    expect(record.status).toBe('ACTIVE');
    expect(record.publishedAt).toBe(T2);
    expect(getActiveVersion(published, 'CIPTA_KARYA')).toBe('2026.2');
    expect(getVersionRecord(published, 'CIPTA_KARYA', '2026.1')!.status).toBe('SUPERSEDED');
    expect(historyEntry).not.toBeNull();
    expect(historyEntry!.operation).toBe('PUBLISH');
    expect(historyEntry!.previousVersionId).toBe('2026.1');
    expect(historyEntry!.publicationStatus).toBe('PUBLISHED');
    // Other families untouched.
    expect(getActiveVersion(published, 'SMKK')).toBe('2026.1');
  });

  it('publish errors: unknown version, SUPERSEDED version; re-publish is an idempotent no-op', () => {
    const state = fixtureState();
    expect(() =>
      publishVersion(state, { family: 'CIPTA_KARYA', versionId: '2026.9', reason: REASON }),
    ).toThrow(/no version 2026.9/);
    const { state: cloned } = cloneVersion(state, {
      family: 'CIPTA_KARYA',
      sourceVersionId: '2026.1',
      newVersionId: '2026.2',
      reason: REASON,
      now: T1,
    });
    const { state: published } = publishVersion(cloned, {
      family: 'CIPTA_KARYA',
      versionId: '2026.2',
      reason: REASON,
      now: T2,
    });
    // The SUPERSEDED 2026.1 can never be re-published (rollback = NEW version).
    expect(() =>
      publishVersion(published, { family: 'CIPTA_KARYA', versionId: '2026.1', reason: REASON }),
    ).toThrow(/only DRAFT versions can be published/);
    // Re-publishing the ACTIVE version is an idempotent no-op.
    const again = publishVersion(published, {
      family: 'CIPTA_KARYA',
      versionId: '2026.2',
      reason: REASON,
      now: T3,
    });
    expect(again.published).toBe(false);
    expect(again.historyEntry).toBeNull();
    expect(again.state).toEqual(published);
    expect(again.state.history).toHaveLength(published.history.length);
  });
});

// ---------------------------------------------------------------------------
// (f) Immutability + rollback
// ---------------------------------------------------------------------------

describe('§8 (f) version integrity: immutable versions, rollback = new version', () => {
  it('the versioning module exposes NO delete/update/rewrite API', () => {
    const keys = Object.keys(versioningModule);
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      expect(key).not.toMatch(/^(delete|remove|rewrite|update|mutate|edit)(Version|Record|Snapshot|State)/i);
      expect(key).not.toMatch(/^setActiveVersion$/i);
    }
    // The only content-revising operation is explicitly DRAFT-scoped.
    expect(keys).toContain('reviseDraftContent');
    expect(keys).toContain('cloneVersion');
    expect(keys).toContain('publishVersion');
    expect(keys).toContain('rollbackVersion');
  });

  it('buildVersionSnapshot freezes the snapshot but never the caller’s items', () => {
    const items = [makeItem({ id: 'AHSP-TEST-001' })];
    const snap = buildVersionSnapshot({
      family: 'CIPTA_KARYA',
      versionId: '2026.2',
      createdFrom: '2026.1',
      createdAt: T1,
      reason: REASON,
      contentProvenance: 'PIPELINE_REGENERATED',
      sourceDescription: 'fixture',
      items,
    });
    expect(Object.isFrozen(snap)).toBe(true);
    expect(Object.isFrozen(snap.meta)).toBe(true);
    expect(Object.isFrozen(snap.items)).toBe(true);
    expect(snap.meta.contentChecksum).toBe(computeAhspContentChecksum(items));
    expect(snap.meta.itemCount).toBe(1);
    expect(Object.isFrozen(items)).toBe(false);
    expect(Object.isFrozen(items[0])).toBe(false);
  });

  it('rollback creates a NEW DRAFT holding the old content; nothing is resurrected', () => {
    const state = fixtureState();
    // Move CK to 2026.2 first (Mode A), so 2026.1 is SUPERSEDED.
    const checkpoint = createCheckpoint(state, { family: 'CIPTA_KARYA', reason: REASON, now: T1 });
    const impact = notComputedImpactProvider.computeImpact({
      family: 'CIPTA_KARYA',
      sourceVersionId: '2026.1',
      targetVersionId: '2026.2',
      diffSummary: { added: 0, removed: 0, revised: 0, unchanged: 0 },
    });
    const confirmation = confirmDirectEdit(state, { checkpoint, impact, reason: REASON, now: T2 });
    const { state: moved } = applyDirectEdit(state, {
      confirmation,
      newVersionId: '2026.2',
      newItems: [makeItem({ id: 'AHSP-TEST-001', name: 'New content' })],
      contentProvenance: 'PIPELINE_REGENERATED',
      now: T3,
    });
    expect(getVersionRecord(moved, 'CIPTA_KARYA', '2026.1')!.status).toBe('SUPERSEDED');
    // Roll back to 2026.1's content as NEW version 2026.3 (DRAFT).
    const { state: rolled, record, historyEntry } = rollbackVersion(moved, {
      family: 'CIPTA_KARYA',
      targetVersionId: '2026.1',
      newVersionId: '2026.3',
      reason: 'Rolling back the bad 2026.2 edit to known-good content',
      now: T3,
    });
    expect(record.status).toBe('DRAFT');
    expect(record.createdFrom).toBe('2026.1');
    expect(record.contentChecksum).toBe('aaaaaaaaaaaaaaaa'); // == 2026.1's content
    expect(record.contentProvenance).toBe('ROLLBACK_COPY');
    expect(record.itemCount).toBe(10);
    expect(historyEntry.operation).toBe('ROLLBACK');
    // Pointer still on 2026.2 until the rollback is published explicitly.
    expect(getActiveVersion(rolled, 'CIPTA_KARYA')).toBe('2026.2');
    // The old versions are untouched (no resurrection).
    expect(getVersionRecord(rolled, 'CIPTA_KARYA', '2026.1')!.status).toBe('SUPERSEDED');
    expect(getVersionRecord(rolled, 'CIPTA_KARYA', '2026.2')!.status).toBe('ACTIVE');
    // Publish the rollback → pointer moves to 2026.3, whose content == 2026.1's.
    const { state: published } = publishVersion(rolled, {
      family: 'CIPTA_KARYA',
      versionId: '2026.3',
      reason: 'Publishing the rollback to known-good content',
      now: T3,
    });
    expect(getActiveVersion(published, 'CIPTA_KARYA')).toBe('2026.3');
    expect(getVersionRecord(published, 'CIPTA_KARYA', '2026.3')!.contentChecksum).toBe('aaaaaaaaaaaaaaaa');
    expect(getVersionRecord(published, 'CIPTA_KARYA', '2026.2')!.status).toBe('SUPERSEDED');
  });

  it('rollback errors: unknown target, duplicate id, short reason', () => {
    const state = fixtureState();
    expect(() =>
      rollbackVersion(state, { family: 'CIPTA_KARYA', targetVersionId: '2025.1', newVersionId: '2026.2', reason: REASON }),
    ).toThrow(/no version 2025.1/);
    expect(() =>
      rollbackVersion(state, { family: 'CIPTA_KARYA', targetVersionId: '2026.1', newVersionId: '2026.1', reason: REASON }),
    ).toThrow(/already exists/);
    expect(() =>
      rollbackVersion(state, { family: 'CIPTA_KARYA', targetVersionId: '2026.1', newVersionId: '2026.2', reason: 'short' }),
    ).toThrow(/at least 10/);
  });
});

// ---------------------------------------------------------------------------
// Version history (append-only)
// ---------------------------------------------------------------------------

describe('§8 version history (append-only, deterministic ids)', () => {
  function fullInput(): Omit<AhspVersionHistoryEntry, 'id' | 'schemaVersion'> {
    return {
      family: 'CIPTA_KARYA',
      versionId: '2026.2',
      operation: 'PUBLISH',
      previousVersionId: '2026.1',
      baseVersionId: '2026.1',
      contentChecksum: 'eeeeeeeeeeeeeeee',
      previousContentChecksum: 'aaaaaaaaaaaaaaaa',
      adminIdentity: null,
      changedAt: T1,
      reason: REASON,
      impactStatus: 'NOT_COMPUTED',
      impactNote: 'Impact not computed (test fixture).',
      diffSummary: { added: 1, removed: 0, revised: 2, unchanged: 10 },
      publicationStatus: 'PUBLISHED',
    };
  }

  it('ids are deterministic: same input → same id', () => {
    const a = buildVersionHistoryEntry(fullInput());
    const b = buildVersionHistoryEntry(fullInput());
    expect(a.id).toBe(b.id);
    expect(a.id).toMatch(/^AVH-[0-9a-f]{16}$/);
    expect(a.schemaVersion).toBe(1);
    expect(Object.isFrozen(a)).toBe(true);
    const changed = buildVersionHistoryEntry({ ...fullInput(), reason: 'A different reason entirely' });
    expect(changed.id).not.toBe(a.id);
  });

  it('builder validates reason, timestamp, family, versionId, impact note', () => {
    expect(() => buildVersionHistoryEntry({ ...fullInput(), reason: 'short' })).toThrow(/at least 10/);
    expect(() => buildVersionHistoryEntry({ ...fullInput(), changedAt: 'not-a-date' })).toThrow(/ISO timestamp/);
    expect(() => buildVersionHistoryEntry({ ...fullInput(), family: '' })).toThrow(/family is required/);
    expect(() => buildVersionHistoryEntry({ ...fullInput(), versionId: '' })).toThrow(/versionId is required/);
    expect(() =>
      buildVersionHistoryEntry({ ...fullInput(), impactStatus: 'COMPUTED', impactNote: null }),
    ).toThrow(/impactNote is required/);
  });

  it('append-only: new array, input unmutated, duplicate id refused', () => {
    const a = buildVersionHistoryEntry(fullInput());
    const b = buildVersionHistoryEntry({ ...fullInput(), versionId: '2026.3' });
    const list: AhspVersionHistoryEntry[] = [];
    const one = appendVersionHistoryEntry(list, a);
    expect(one).toHaveLength(1);
    expect(list).toHaveLength(0);
    expect(Object.isFrozen(one)).toBe(true);
    const two = appendVersionHistoryEntry(one, b);
    expect(two).toHaveLength(2);
    expect(one).toHaveLength(1);
    expect(() => appendVersionHistoryEntry(two, a)).toThrow(/Duplicate version history entry id/);
  });

  it('validateVersionHistoryEntries catches duplicates, short reasons, bad timestamps', () => {
    const a = buildVersionHistoryEntry(fullInput());
    expect(validateVersionHistoryEntries([a]).valid).toBe(true);
    expect(validateVersionHistoryEntries([a, a]).valid).toBe(false);
    const badReason = { ...a, id: 'AVH-0000000000000001', reason: 'x' };
    expect(validateVersionHistoryEntries([badReason]).valid).toBe(false);
    const badTs = { ...a, id: 'AVH-0000000000000002', changedAt: 'junk' };
    expect(validateVersionHistoryEntries([badTs]).valid).toBe(false);
  });

  it('the history module exposes NO update/delete function (API surface pinned)', () => {
    const keys = Object.keys(historyModule);
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      expect(key).not.toMatch(/^(update|delete|remove|rewrite|edit|mutate)/i);
    }
    expect(keys).toContain('appendVersionHistoryEntry');
    expect(keys).toContain('buildVersionHistoryEntry');
  });

  it('JSONL serialize/parse round-trips; malformed lines are reported, never silently dropped', () => {
    const header = buildVersionHistoryJsonlHeader(T0, { CIPTA_KARYA: '2026.1' });
    const entry = buildVersionHistoryEntry(fullInput());
    const text = `${serializeVersionHistoryHeaderJsonl(header)}\n${serializeVersionHistoryEntryJsonl(entry)}\n{"not json\n${serializeVersionHistoryEntryJsonl(entry)}\n`;
    const parsed = parseVersionHistoryJsonl(text);
    expect(parsed.header).not.toBeNull();
    expect(parsed.header!.activeVersions).toEqual({ CIPTA_KARYA: '2026.1' });
    expect(parsed.entries).toHaveLength(2);
    expect(parsed.entries[0].id).toBe(entry.id);
    expect(parsed.errors).toHaveLength(1);
    expect(parsed.errors[0]).toMatch(/line 3: invalid JSON/);
  });
});

// ---------------------------------------------------------------------------
// (e) Project version pin (§14.4)
// ---------------------------------------------------------------------------

describe('§8 (e) project version pin', () => {
  it('LIVE follows the active pointer; SNAPSHOT/OVERRIDE use the pin', () => {
    const state = fixtureState();
    expect(
      resolveProjectAhspVersion({ pricingMode: 'LIVE_MASTER_PRICE', family: 'CIPTA_KARYA', activeVersions: state.active }),
    ).toBe('2026.1');
    expect(
      resolveProjectAhspVersion({
        pricingMode: 'SNAPSHOT_PRICE',
        pinnedAhspDatabaseVersion: '2026.1',
        family: 'CIPTA_KARYA',
        activeVersions: state.active,
      }),
    ).toBe('2026.1');
    expect(
      resolveProjectAhspVersion({
        pricingMode: 'PROJECT_OVERRIDE',
        pinnedAhspDatabaseVersion: '2026.1',
        family: 'CIPTA_KARYA',
        activeVersions: state.active,
      }),
    ).toBe('2026.1');
  });

  it('§14.4: a publish moves LIVE projects but NEVER a SNAPSHOT project’s version', () => {
    const state = fixtureState();
    const { state: cloned } = cloneVersion(state, {
      family: 'CIPTA_KARYA',
      sourceVersionId: '2026.1',
      newVersionId: '2026.2',
      reason: REASON,
      now: T1,
    });
    const { state: published } = publishVersion(cloned, {
      family: 'CIPTA_KARYA',
      versionId: '2026.2',
      reason: REASON,
      now: T2,
    });
    // LIVE follows the new pointer.
    expect(
      resolveProjectAhspVersion({ pricingMode: 'LIVE_MASTER_PRICE', family: 'CIPTA_KARYA', activeVersions: published.active }),
    ).toBe('2026.2');
    // SNAPSHOT stays on its pin (Decision D — historical projects are never silently rewritten).
    expect(
      resolveProjectAhspVersion({
        pricingMode: 'SNAPSHOT_PRICE',
        pinnedAhspDatabaseVersion: '2026.1',
        family: 'CIPTA_KARYA',
        activeVersions: published.active,
      }),
    ).toBe('2026.1');
    expect(
      resolveProjectAhspVersion({
        pricingMode: 'PROJECT_OVERRIDE',
        pinnedAhspDatabaseVersion: '2026.1',
        family: 'CIPTA_KARYA',
        activeVersions: published.active,
      }),
    ).toBe('2026.1');
  });

  it('legacy snapshots without a pin read as the pre-§3 baseline 2026.1', () => {
    const state = fixtureState();
    expect(getSnapshotAhspVersion({})).toBe('2026.1');
    expect(getSnapshotAhspVersion({ ahspDatabaseVersion: null })).toBe('2026.1');
    expect(getSnapshotAhspVersion({ ahspDatabaseVersion: '2026.2' })).toBe('2026.2');
    // Legacy project without a pricing mode → SNAPSHOT semantics (Decision D).
    expect(
      resolveProjectAhspVersion({ pricingMode: null, family: 'CIPTA_KARYA', activeVersions: state.active }),
    ).toBe('2026.1');
    expect(
      resolveProjectAhspVersion({ family: 'CIPTA_KARYA', activeVersions: state.active }),
    ).toBe('2026.1');
  });

  it('an explicitly invalid mode string throws (fail-closed)', () => {
    const state = fixtureState();
    expect(() =>
      resolveProjectAhspVersion({
        pricingMode: 'AUTO' as unknown as 'LIVE_MASTER_PRICE',
        family: 'CIPTA_KARYA',
        activeVersions: state.active,
      }),
    ).toThrow(/Unknown project pricing mode/);
  });

  it('real project snapshots carry the 2026.1 pin + SNAPSHOT mode (§3 I-11)', () => {
    const item = ALL_OFFICIAL_AHSP_ITEMS[0];
    const snapshot = CostDatabaseEngine.createProjectSnapshot(item);
    expect(snapshot.ahspDatabaseVersion).toBe('2026.1');
    expect(snapshot.pricingMode).toBe('SNAPSHOT_PRICE');
    expect(getSnapshotAhspVersion(snapshot)).toBe('2026.1');
  });
});

// ---------------------------------------------------------------------------
// Validation + checksum properties
// ---------------------------------------------------------------------------

describe('snapshot validation + checksum properties', () => {
  it('validateSnapshotContent accepts valid content and rejects each defect class', () => {
    const good = [makeItem({ id: 'A1' }), makeItem({ id: 'A2', code: '1.1.1.2' })];
    expect(validateSnapshotContent('CIPTA_KARYA', good).valid).toBe(true);
    expect(validateSnapshotContent('CIPTA_KARYA', []).valid).toBe(false);
    expect(validateSnapshotContent('CIPTA_KARYA', [makeItem({ id: 'D' }), makeItem({ id: 'D' })]).valid).toBe(false);
    expect(validateSnapshotContent('CIPTA_KARYA', [makeItem({ id: '' })]).valid).toBe(false);
    expect(validateSnapshotContent('CIPTA_KARYA', [makeItem({ id: 'X', domain: 'SMKK' })]).valid).toBe(false);
    expect(validateSnapshotContent('CIPTA_KARYA', [makeItem({ id: 'X', unitPrice: -1 })]).valid).toBe(false);
    expect(
      validateSnapshotContent('CIPTA_KARYA', [
        makeItem({ id: 'X', laborComponents: [makeComponent({ coefficient: Number.NaN })] }),
      ]).valid,
    ).toBe(false);
    expect(
      validateSnapshotContent('CIPTA_KARYA', [
        makeItem({ id: 'X', laborComponents: [makeComponent({ unitPrice: -1 })] }),
      ]).valid,
    ).toBe(false);
    // Empty names/codes are source defects, not versioning rejections.
    expect(
      validateSnapshotContent('CIPTA_KARYA', [
        makeItem({ id: 'X', name: '', code: '', laborComponents: [makeComponent({ code: '', name: '' })] }),
      ]).valid,
    ).toBe(true);
  });

  it('validateContentProvenance encodes R-2 (frozen families) exactly', () => {
    expect(validateContentProvenance('CIPTA_KARYA', 'PIPELINE_REGENERATED').valid).toBe(true);
    expect(validateContentProvenance('SUMBER_DAYA_AIR', 'PIPELINE_REGENERATED').valid).toBe(true);
    expect(validateContentProvenance('CIPTA_KARYA', 'OVERLAY').valid).toBe(false);
    expect(validateContentProvenance('SUMBER_DAYA_AIR', 'OVERLAY').valid).toBe(false);
    expect(validateContentProvenance('BINA_MARGA', 'OVERLAY').valid).toBe(true);
    expect(validateContentProvenance('SMKK', 'OVERLAY').valid).toBe(true);
    expect(validateContentProvenance('BINA_MARGA', 'PIPELINE_REGENERATED').valid).toBe(false);
    expect(validateContentProvenance('SMKK', 'PIPELINE_REGENERATED').valid).toBe(false);
    for (const family of AHSP_FAMILIES) {
      expect(validateContentProvenance(family, 'CLONE_AS_IS').valid).toBe(true);
      expect(validateContentProvenance(family, 'ROLLBACK_COPY').valid).toBe(true);
      expect(validateContentProvenance(family, 'CANONICAL_BASELINE').valid).toBe(true);
    }
  });

  it('buildVersionSnapshot rejects bad ids, reasons, timestamps, content, provenance', () => {
    const base = {
      family: 'CIPTA_KARYA' as AhspFamily,
      versionId: '2026.2',
      createdFrom: '2026.1',
      createdAt: T1,
      reason: REASON,
      contentProvenance: 'PIPELINE_REGENERATED' as const,
      sourceDescription: 'fixture',
      items: [makeItem({ id: 'A1' })],
    };
    expect(() => buildVersionSnapshot({ ...base, versionId: 'v2' })).toThrow(/YYYY\.minor/);
    expect(() => buildVersionSnapshot({ ...base, reason: 'short' })).toThrow(/at least 10/);
    expect(() => buildVersionSnapshot({ ...base, createdAt: 'junk' })).toThrow(/ISO timestamp/);
    expect(() => buildVersionSnapshot({ ...base, items: [] })).toThrow(/at least one item/);
    expect(() =>
      buildVersionSnapshot({ ...base, family: 'BINA_MARGA', items: [makeItem({ id: 'B1', domain: 'BINA_MARGA' })] }),
    ).toThrow(/PIPELINE_REGENERATED is impossible/);
  });

  it('checksum is deterministic, order-insensitive, and content-sensitive', () => {
    const a = makeItem({ id: 'A1' });
    const b = makeItem({ id: 'B2', code: '1.1.1.2' });
    const ab = computeAhspContentChecksum([a, b]);
    const ba = computeAhspContentChecksum([b, a]);
    expect(ba).toBe(ab);
    expect(computeAhspContentChecksum([a, b])).toBe(ab);
    const changed = { ...cloneItems([b])[0], name: 'Changed name' };
    expect(computeAhspContentChecksum([a, changed])).not.toBe(ab);
    expect(ab).toMatch(/^[0-9a-f]{16}$/);
  });

  it('BM/SMKK v2026.1 records are CANONICAL_BASELINE (frozen, not regenerable)', () => {
    for (const family of ['BINA_MARGA', 'SMKK'] as const) {
      const rec = AHSP_VERSION_RECORDS.find((r) => r.family === family)!;
      expect(rec.contentProvenance).toBe('CANONICAL_BASELINE');
      expect(rec.status).toBe('ACTIVE');
      expect(() => assertRegenerable(family)).toThrow(/cannot be regenerated/);
    }
  });
});

// ---------------------------------------------------------------------------
// Operator CLI end-to-end (temp dir — never touches the real registry)
// ---------------------------------------------------------------------------

describe('operator CLI end-to-end (temp dir)', () => {
  it('clone → publish moves the pointer in a temp copy; --new-version refuses unchanged content', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fase8-versions-'));
    try {
      fs.cpSync(VERSIONS_DIR, tmp, { recursive: true });
      const tsOut = path.join(tmp, 'pointer.generated.ts');
      const script = path.join(ROOT, 'scripts/ahsp2026/buildAhspVersionSnapshots.ts');
      const run = (args: string[]) =>
        execFileSync('npx', ['--yes', 'tsx', script, '--dir', tmp, '--ts-out', tsOut, ...args], {
          cwd: ROOT,
          encoding: 'utf8',
          env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=2048' },
        });
      const out1 = run(['--clone', 'CIPTA_KARYA', '2026.1', '2026.2', '--reason', 'CLI test clone of CK baseline']);
      expect(out1).toMatch(/cloned CIPTA_KARYA 2026.1 → 2026.2 \(DRAFT/);
      const pointerAfterClone = JSON.parse(fs.readFileSync(path.join(tmp, 'active-versions.json'), 'utf8')) as {
        active: Record<string, string>;
        records: AhspVersionRecord[];
      };
      expect(pointerAfterClone.active.CIPTA_KARYA).toBe('2026.1');
      const draft = pointerAfterClone.records.find((r) => r.family === 'CIPTA_KARYA' && r.versionId === '2026.2');
      expect(draft).toBeDefined();
      expect(draft!.status).toBe('DRAFT');
      expect(draft!.contentChecksum).toBe(PINNED_CHECKSUMS.CIPTA_KARYA);
      const cloneFile = JSON.parse(
        fs.readFileSync(path.join(tmp, 'CIPTA_KARYA', '2026.2.json'), 'utf8'),
      ) as AhspVersionSnapshot;
      expect(cloneFile.meta.contentChecksum).toBe(PINNED_CHECKSUMS.CIPTA_KARYA);
      expect(cloneFile.meta.contentProvenance).toBe('CLONE_AS_IS');
      const out2 = run(['--publish', 'CIPTA_KARYA', '2026.2', '--reason', 'CLI test publish of the CK clone']);
      expect(out2).toMatch(/published CIPTA_KARYA 2026.2/);
      const pointerAfterPublish = JSON.parse(fs.readFileSync(path.join(tmp, 'active-versions.json'), 'utf8')) as {
        active: Record<string, string>;
        records: AhspVersionRecord[];
      };
      expect(pointerAfterPublish.active.CIPTA_KARYA).toBe('2026.2');
      expect(
        pointerAfterPublish.records.find((r) => r.family === 'CIPTA_KARYA' && r.versionId === '2026.1')!.status,
      ).toBe('SUPERSEDED');
      const trail = parseVersionHistoryJsonl(
        fs.readFileSync(path.join(tmp, 'ahsp_version_history.jsonl'), 'utf8'),
      );
      expect(trail.errors).toEqual([]);
      expect(trail.entries.map((e) => e.operation)).toEqual([
        'BASELINE',
        'BASELINE',
        'BASELINE',
        'BASELINE',
        'CLONE',
        'PUBLISH',
      ]);
      // --new-version with an unchanged catalog is refused (no pointless version).
      expect(() =>
        run([
          '--new-version', 'CIPTA_KARYA', '2026.3', '--from', '2026.2',
          '--reason', 'CLI test new version with unchanged content',
          '--provenance', 'PIPELINE_REGENERATED',
        ]),
      ).toThrow(/IDENTICAL to base/);
      // --new-version with PIPELINE_REGENERATED for frozen BM is refused (R-2).
      expect(() =>
        run([
          '--new-version', 'BINA_MARGA', '2026.2', '--from', '2026.1',
          '--reason', 'CLI test pipeline regeneration for frozen BM',
          '--provenance', 'PIPELINE_REGENERATED',
        ]),
      ).toThrow(/PIPELINE_REGENERATED is impossible/);
      // The real registry is untouched by all of this.
      expect(ACTIVE_AHSP_VERSIONS.CIPTA_KARYA).toBe('2026.1');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }, 180000);
});
