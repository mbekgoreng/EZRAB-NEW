/**
 * D-43 (P1) + NEW-10 — revision creation must NEVER overwrite the baseline.
 * Pure-engine tests for src/engine/estimateVersioning.ts (no React, no I/O).
 * Run: npx tsx src/test/d43EstimateVersioning.test.ts
 *
 * Regression: the first revision used to become v1.0 (numbered from the
 * stored-list length) and destroy the virtual baseline's description +
 * timestamp. These tests pin the fixed architecture: persisted immutable
 * baseline, max-based numbering, atomic + idempotent activation, stale
 * rejection, and a diff that shows real changes.
 */
import {
  BASELINE_DESCRIPTION,
  BASELINE_VERSION_NUMBER,
  parseVersionNumber,
  nextVersionNumber,
  ensureBaselineVersion,
  createRevision,
  activateVersion,
  validateVersionSnapshot,
  resolveEffectiveActiveVersionId,
  getLatestVersion,
  baselineVersionId,
} from '../engine/estimateVersioning';
import { VersionAndScenarioEngine } from '../engine/versionAndScenarioEngine';
import type { EstimateVersion, RabItem } from '../types';

let failures = 0;
let passes = 0;
const test = (name: string, fn: () => void) => {
  try { fn(); passes++; console.log(`✓ ${name}`); }
  catch (e: any) { failures++; console.error(`✗ ${name}: ${e.message}`); }
};
const eq = (a: unknown, b: unknown, m: string) => { if (a !== b) throw new Error(`${m}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
const ok = (c: boolean, m: string) => { if (!c) throw new Error(m); };
const deepEq = (a: unknown, b: unknown, m: string) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m}: differs.\n  expected: ${JSON.stringify(b)}\n  got:      ${JSON.stringify(a)}`);
};

// --- fixtures ---------------------------------------------------------------

let idSeq = 0;
const deterministicId = () => `ver-test-${++idSeq}`;
const NOW = '2026-11-14T09:30:00.000Z';
const PROJECT_CREATED = '2026-11-14T07:00:00.000Z';
const PID = 'PRJ-TEST-D43';

const rabItem = (over: Partial<RabItem> & { id: string }): RabItem => ({
  no: 1,
  code: 'A.1.01.a.1',
  category: 'Pekerjaan Persiapan',
  description: 'Pembersihan lapangan',
  volume: 10,
  unit: 'm2',
  unitPrice: 6000,
  amount: 60000,
  priceStatus: 'PRICE_RESOLVED',
  ...over,
});

const itemA = () => rabItem({ id: 'rab-a', description: 'Pembersihan lapangan', volume: 10, unitPrice: 6000, amount: 60000 });
const itemB = () => rabItem({ id: 'rab-b', no: 2, code: 'B.2', description: 'Galian tanah', volume: 5, unit: 'm3', unitPrice: 100000, amount: 500000 });

function deepFreeze<T>(v: T): T {
  if (v && typeof v === 'object') {
    Object.freeze(v);
    for (const k of Object.keys(v as any)) deepFreeze((v as any)[k]);
  }
  return v;
}

// --- numbering --------------------------------------------------------------

test('parseVersionNumber: v1.0/v2/v10.3 parse, garbage does not', () => {
  eq(parseVersionNumber('v1.0'), 1, 'v1.0');
  eq(parseVersionNumber('v2.0'), 2, 'v2.0');
  eq(parseVersionNumber('v10.3'), 10, 'v10.3');
  eq(parseVersionNumber('v2'), 2, 'v2');
  eq(parseVersionNumber('V7.0'), 7, 'V7.0');
  eq(parseVersionNumber('garbage'), null, 'garbage');
  eq(parseVersionNumber(''), null, 'empty');
  eq(parseVersionNumber(undefined), null, 'undefined');
  eq(parseVersionNumber('v1.0 - Baseline'), null, 'label with suffix');
});

test('nextVersionNumber comes from MAX, never list length', () => {
  eq(nextVersionNumber([]), 'v1.0', 'empty -> v1.0');
  const v1 = { versionNumber: 'v1.0' } as EstimateVersion;
  const v5 = { versionNumber: 'v5.0' } as EstimateVersion;
  const junk = { versionNumber: 'draft' } as EstimateVersion;
  eq(nextVersionNumber([v1]), 'v2.0', '[v1.0] -> v2.0');
  eq(nextVersionNumber([v1, v5]), 'v6.0', '[v1.0, v5.0] -> v6.0 (max, not length 3)');
  eq(nextVersionNumber([v1, junk]), 'v2.0', 'unparseable numbers ignored');
});

// --- baseline + first revision (the D-43 regression) ------------------------

test('first revision on an empty list persists baseline v1.0 AND creates v2.0', () => {
  const items = [itemA(), itemB()];
  const r = createRevision(
    [], PID, items,
    { label: 'v2.0', description: 'AUDIT-TEST revisi snapshot v2.0', revisionNotes: '' },
    { now: NOW, baselineTimestamp: PROJECT_CREATED, idGenerator: deterministicId }
  );
  eq(r.versions.length, 2, 'two versions stored');
  const [baseline, rev] = r.versions;
  eq(baseline.versionNumber, BASELINE_VERSION_NUMBER, 'baseline is v1.0');
  eq(baseline.isBaseline, true, 'baseline flagged');
  eq(baseline.id, baselineVersionId(PID), 'baseline has the deterministic id');
  eq(baseline.description, BASELINE_DESCRIPTION, 'baseline description is the canonical one');
  eq(baseline.timestamp, PROJECT_CREATED, 'baseline timestamp is the project creation time (D-41), not 2026-09-01');
  ok(baseline.timestamp !== '2026-09-01T08:30:00.000Z', 'hardcoded 2026-09-01 stamp is gone');
  eq(rev.versionNumber, 'v2.0', 'revision is v2.0, not v1.0');
  eq(rev.isBaseline, false, 'revision is never the baseline');
  ok(rev.id !== baseline.id, 'v2 has a distinct identity from v1');
  eq(rev.description, 'AUDIT-TEST revisi snapshot v2.0', 'revision description stored');
  eq(rev.label, 'v2.0', 'typed label kept verbatim when it equals the assigned number');
  eq(r.created, rev, 'created is the revision');
  eq(r.baselineCreated, baseline, 'baselineCreated returned');
  eq(rev.costBefore, baseline.costAfter, 'revision costBefore = baseline costAfter');
  eq(rev.itemsCount, 2, 'revision snapshots both items');
});

test('v1 description + snapshot survive creating v2 (no overwrite)', () => {
  const items = [itemA()];
  const first = createRevision(
    [], PID, items,
    { label: 'v2.0', description: 'Revisi pertama' },
    { now: NOW, baselineTimestamp: PROJECT_CREATED, idGenerator: deterministicId }
  );
  const v1Before = JSON.parse(JSON.stringify(first.versions[0]));
  const v2Before = JSON.parse(JSON.stringify(first.versions[1]));
  // Live items change, then a second revision is created.
  const changed = [rabItem({ id: 'rab-a', volume: 20, unitPrice: 6000, amount: 120000 })];
  const second = createRevision(
    first.versions, PID, changed,
    { label: 'v3.0', description: 'Revisi kedua' },
    { now: NOW, idGenerator: deterministicId }
  );
  eq(second.versions.length, 3, 'three versions stored');
  deepEq(second.versions[0], v1Before, 'v1 byte-identical after creating v3');
  deepEq(second.versions[1], v2Before, 'v2 byte-identical after creating v3');
  eq(second.versions[0].description, BASELINE_DESCRIPTION, 'v1 description intact');
  eq(second.versions[2].versionNumber, 'v3.0', 'third version is v3.0');
  eq(second.baselineCreated, null, 'no second baseline is created');
});

test('engine never mutates its inputs (frozen inputs do not throw)', () => {
  const items = deepFreeze([itemA(), itemB()]);
  const frozen = deepFreeze(
    createRevision([], PID, [itemA()], { label: 'v2.0', description: 'x' }, { now: NOW, idGenerator: deterministicId }).versions
  );
  const before = JSON.stringify(frozen);
  const r = createRevision(frozen, PID, items, { label: 'v3.0', description: 'y' }, { now: NOW, idGenerator: deterministicId });
  eq(JSON.stringify(frozen), before, 'input versions untouched');
  eq(r.versions.length, 3, 'new list built');
});

test('snapshots are deep copies: later live edits do not leak into versions', () => {
  const items = [itemA()];
  const r = createRevision([], PID, items, { label: 'v2.0', description: 'x' }, { now: NOW, idGenerator: deterministicId });
  items[0].unitPrice = 999999;
  items[0].amount = 9999990;
  eq(r.versions[0].rabItemsSnapshot[0].unitPrice, 6000, 'baseline snapshot unaffected by live edits');
  eq(r.versions[1].rabItemsSnapshot[0].unitPrice, 6000, 'revision snapshot unaffected by live edits');
});

test('user-typed label never masquerades as the version identity', () => {
  const r = createRevision(
    [], PID, [itemA()],
    { label: 'v9.0', description: 'user typed a wrong number' },
    { now: NOW, idGenerator: deterministicId }
  );
  eq(r.created.versionNumber, 'v2.0', 'assigned number wins');
  eq(r.created.label, 'v2.0 - v9.0', 'typed input preserved but prefixed with the real number');
  const r2 = createRevision(
    r.versions, PID, [itemA()],
    { label: 'Revisi harga baja', description: 'plain label' },
    { now: NOW, idGenerator: deterministicId }
  );
  eq(r2.created.label, 'v3.0 - Revisi harga baja', 'plain labels keep the vN.0 - label shape');
});

test('ensureBaselineVersion leaves a non-empty (legacy) list exactly alone', () => {
  const legacy = [
    { id: 'ver-old-1', projectId: PID, versionNumber: 'v1.0', isBaseline: true, description: 'legacy first entry', rabItemsSnapshot: [], costAfter: 100 } as unknown as EstimateVersion,
  ];
  const r = ensureBaselineVersion(legacy, PID, [itemA()], { now: NOW });
  eq(r.baseline, null, 'no baseline created for a non-empty list');
  deepEq(r.versions, legacy, 'legacy history untouched');
});

// --- diff -------------------------------------------------------------------

test('diff displays real changes between v1 and v2 snapshots', () => {
  const v1Items = [itemA(), itemB()];
  const v2Items = [
    rabItem({ id: 'rab-a', volume: 10, unitPrice: 7000, amount: 70000 }), // price changed
    rabItem({ id: 'rab-c', no: 3, code: 'C.3', description: 'Pondasi batu kali', volume: 2, unit: 'm3', unitPrice: 250000, amount: 500000 }), // added
    // rab-b removed
  ];
  const diff = VersionAndScenarioEngine.compareVersions(v1Items, v2Items);
  eq(diff.priceChangedCount, 1, 'one price change');
  eq(diff.addedCount, 1, 'one added item');
  eq(diff.removedCount, 1, 'one removed item');
  eq(diff.baseTotal, 560000, 'base total');
  eq(diff.targetTotal, 570000, 'target total');
  eq(diff.totalDelta, 10000, 'delta');
  const changed = diff.diffItems.find((d) => d.id === 'rab-a');
  eq(changed?.status, 'PRICE_CHANGED', 'changed item status');
  eq(diff.diffItems.find((d) => d.id === 'rab-c')?.status, 'ADDED', 'added item status');
  eq(diff.diffItems.find((d) => d.id === 'rab-b')?.status, 'REMOVED', 'removed item status');
});

// --- activation -------------------------------------------------------------

function twoVersionState() {
  const v1Items = [itemA()];
  const v2Items = [rabItem({ id: 'rab-a', volume: 20, unitPrice: 6000, amount: 120000 })];
  const first = createRevision([], PID, v1Items, { label: 'v2.0', description: 'Revisi harga' }, { now: NOW, baselineTimestamp: PROJECT_CREATED, idGenerator: deterministicId });
  // Manually advance: createRevision snapshots CURRENT items, so build v2 from v2Items.
  const second = createRevision(first.versions, PID, v2Items, { label: 'v3.0', description: 'Revisi volume' }, { now: NOW, idGenerator: deterministicId });
  return { versions: second.versions, v1Items, v2Items };
}

test('successful activation moves the pointer, backs up, and preserves history', () => {
  const { versions, v1Items, v2Items } = twoVersionState();
  const v1 = versions[0];
  const activeBefore = versions[2].id; // latest (v3.0) is active
  const v1Before = JSON.parse(JSON.stringify(v1));
  const v2Before = JSON.parse(JSON.stringify(versions[1]));
  const r = activateVersion(
    { versions, currentItems: v2Items, activeVersionId: activeBefore },
    v1.id,
    { now: NOW, idGenerator: deterministicId }
  );
  ok(r.success, 'activation succeeds');
  if (!r.success) return;
  eq(r.alreadyActive, false, 'not already active');
  eq(r.activeVersionId, v1.id, 'active pointer moved to v1');
  eq(r.versions.length, 4, 'backup appended — history grows, nothing removed');
  deepEq(r.versions[0], v1Before, 'v1 untouched by activation');
  deepEq(r.versions[1], v2Before, 'v2 untouched by activation');
  // Restored items are the v1 snapshot with projectId forced to the
  // version's project (same as the old restore behaviour).
  deepEq(r.items, v1Items.map((i) => ({ ...i, projectId: PID })), 'live items became the v1 snapshot');
  ok(r.backup !== null, 'backup version created');
  eq(r.backup?.versionNumber, 'v4.0', 'backup numbered from max');
  eq(r.backup?.isBaseline, false, 'backup is never the baseline');
  deepEq(r.backup?.rabItemsSnapshot, v2Items, 'backup snapshots the pre-restore state');
});

test('duplicate activation is a safe no-op (no second backup, no change)', () => {
  const { versions, v2Items } = twoVersionState();
  const v1 = versions[0];
  const first = activateVersion(
    { versions, currentItems: v2Items, activeVersionId: versions[2].id },
    v1.id,
    { now: NOW, idGenerator: deterministicId }
  );
  ok(first.success, 'first activation succeeds');
  if (!first.success) return;
  const before = JSON.stringify({ v: first.versions, i: first.items, a: first.activeVersionId });
  const second = activateVersion(
    { versions: first.versions, currentItems: first.items, activeVersionId: first.activeVersionId },
    v1.id,
    { now: NOW, idGenerator: deterministicId }
  );
  ok(second.success, 'duplicate activation succeeds');
  if (!second.success) return;
  eq(second.alreadyActive, true, 'reported as already active');
  eq(second.backup, null, 'no duplicate backup created');
  eq(JSON.stringify({ v: second.versions, i: second.items, a: second.activeVersionId }), before, 'state byte-identical after duplicate activation');
});

test('failed activation (unknown id) preserves the previous active version', () => {
  const { versions, v2Items } = twoVersionState();
  const activeBefore = versions[2].id;
  const r = activateVersion(
    { versions, currentItems: v2Items, activeVersionId: activeBefore },
    'ver-does-not-exist',
    { now: NOW, idGenerator: deterministicId }
  );
  eq(r.success, false, 'activation fails');
  if (r.success) return;
  eq(r.reason, 'NOT_FOUND', 'reason NOT_FOUND');
  eq(r.activeVersionId, activeBefore, 'active pointer unchanged');
  deepEq(r.versions, versions, 'versions unchanged');
  deepEq(r.items, v2Items, 'items unchanged');
});

// D-43 step 7 (directive 9-step test): the literal v1.0-active case — the
// other failed-activation tests prove pointer preservation with v3.0 active;
// the preservation code is version-agnostic, but the v1.0-active scenario
// itself must be instantiated, not assumed.
test('failed activation with v1.0 active preserves v1.0 as the active version', () => {
  const { versions, v1Items } = twoVersionState();
  const v1 = versions[0];
  const r = activateVersion(
    { versions, currentItems: v1Items, activeVersionId: v1.id },
    'ver-does-not-exist',
    { now: NOW, idGenerator: deterministicId }
  );
  eq(r.success, false, 'activation fails');
  if (r.success) return;
  eq(r.reason, 'NOT_FOUND', 'reason NOT_FOUND');
  eq(r.activeVersionId, v1.id, 'v1.0 remains the active version');
  deepEq(r.versions, versions, 'versions unchanged');
  deepEq(r.items, v1Items, 'items unchanged');
});

test('stale activation is rejected and preserves state', () => {
  const { versions, v2Items } = twoVersionState();
  const v1 = versions[0];
  const r = activateVersion(
    { versions, currentItems: v2Items, activeVersionId: versions[1].id },
    v1.id,
    { now: NOW, idGenerator: deterministicId, expectedActiveVersionId: versions[2].id }
  );
  eq(r.success, false, 'stale activation fails');
  if (r.success) return;
  eq(r.reason, 'STALE', 'reason STALE');
  eq(r.activeVersionId, versions[1].id, 'active pointer unchanged');
  deepEq(r.versions, versions, 'versions unchanged');
  deepEq(r.items, v2Items, 'items unchanged');
  // Matching expectation passes the stale guard.
  const okRun = activateVersion(
    { versions, currentItems: v2Items, activeVersionId: versions[1].id },
    v1.id,
    { now: NOW, idGenerator: deterministicId, expectedActiveVersionId: versions[1].id }
  );
  ok(okRun.success, 'activation with a matching expectation succeeds');
});

test('activation with a corrupt snapshot fails closed and preserves state', () => {
  const { versions, v2Items } = twoVersionState();
  const corrupt = JSON.parse(JSON.stringify(versions)) as EstimateVersion[];
  (corrupt[0] as any).rabItemsSnapshot = [{ description: 'no id here' }];
  const r = activateVersion(
    { versions: corrupt, currentItems: v2Items, activeVersionId: corrupt[2].id },
    corrupt[0].id,
    { now: NOW, idGenerator: deterministicId }
  );
  eq(r.success, false, 'corrupt snapshot activation fails');
  if (r.success) return;
  eq(r.reason, 'INVALID_SNAPSHOT', 'reason INVALID_SNAPSHOT');
  eq(r.activeVersionId, corrupt[2].id, 'active pointer unchanged');
  deepEq(r.items, v2Items, 'items unchanged');
  const badShape = validateVersionSnapshot({ rabItemsSnapshot: 'not-an-array' } as unknown as EstimateVersion);
  eq(badShape.ok, false, 'non-array snapshot invalid');
  const goodShape = validateVersionSnapshot(versions[0]);
  eq(goodShape.ok, true, 'well-formed snapshot valid');
});

test('resolveEffectiveActiveVersionId: stored pointer wins, else latest, else fallback', () => {
  const { versions } = twoVersionState();
  eq(resolveEffectiveActiveVersionId(versions, versions[0].id), versions[0].id, 'stored pointer wins');
  eq(resolveEffectiveActiveVersionId(versions, 'ver-gone'), versions[2].id, 'dangling pointer falls back to latest');
  eq(resolveEffectiveActiveVersionId(versions, null), versions[2].id, 'no pointer -> latest');
  eq(resolveEffectiveActiveVersionId([], null, baselineVersionId(PID)), baselineVersionId(PID), 'empty list -> virtual baseline fallback');
  eq(resolveEffectiveActiveVersionId([], null), null, 'empty list, no fallback -> null');
  eq(getLatestVersion(versions)?.versionNumber, 'v3.0', 'latest = last (single rule)');
  eq(getLatestVersion([]), null, 'latest of empty is null');
});

console.log(failures === 0 ? `\nALL D-43 ESTIMATE VERSIONING TESTS PASSED (${passes}/${passes + failures})` : `\n${failures} TEST(S) FAILED (${passes} passed)`);
process.exit(failures === 0 ? 0 : 1);
