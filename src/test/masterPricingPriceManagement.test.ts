/**
 * MASTER PRICING §4 — GLOBAL MASTER PRICE MANAGEMENT (§4.1–§4.4).
 *
 * Run: npx vitest run src/test/masterPricingPriceManagement.test.ts
 *
 * What is pinned here (and why each pin exists):
 * - §4.1 authorization: deterministic + fail-closed WITHOUT Supabase
 *   (S7 pattern). Admin allowed; anonymous / demo / ordinary users
 *   DENIED for all 9 global writes; malformed identities denied; the
 *   write path never widens access (AHSP edit / import / API / sync);
 *   the project-override channel can never write global, for anyone;
 *   anti-self-approval on reconciliation + alias approval; the global
 *   admin model decision (SEPARATE_TABLE) is pinned with its rationale.
 *   Server-side / RLS / API enforcement is BLOCKED — the last describe
 *   block pins the BLOCKER EVIDENCE (migration NOT APPLIED, AUTH_ENABLED
 *   false, no price endpoint) and holds the real RLS/API tests as
 *   it.skip cases. Nothing here fakes enforcement.
 * - §4.2 record model: the §4.2 mapping (region/effective date/
 *   recorded date/source document) reads from the existing fields; the
 *   new fields (priceType / specContext / createdBy / updatedBy /
 *   originalAhspSourcePrice) are honest nulls where the data or the
 *   environment does not supply them; priceType is stamped directly by
 *   the pipeline (§5) and recovered from the `priceType=` notes as a
 *   fallback on 310 real records (distribution pinned); specContext is
 *   stamped from the source `specification` on 401/899 records (§5)
 *   and null only where the source carries no spec (labor/equipment);
 *   a missing price stays null (never Rp0) through write validation.
 * - §4.3 provenance: all 7 labels map to the existing enums (D2);
 *   market never official; assumption never master; the reverse
 *   mapping is total over the 899 real records (13 OFFICIAL_VERIFIED /
 *   131 MARKET_REFERENCE / 422 NEEDS_VERIFICATION); the original AHSP
 *   source price is preserved independently from the master price.
 * - §4.4 history: every §4.4 field on the entry; reason required;
 *   deterministic ids; append-only (frozen entries, duplicate refused,
 *   NO update/delete function in the module — API surface pinned);
 *   the interim JSONL trail parses cleanly (HEADER + BASELINE).
 * - Multi-candidate selection: all 53 conflicts.json groups resolve
 *   to their named preferred source; 51/53 remain ambiguous WITHIN
 *   the preferred source (flagged, not hidden); the 2 unambiguous
 *   groups are pinned; the two §3 6-tuple groups are disambiguated
 *   by full location (899 distinct keys, 0 collisions) with the
 *   regional variants pinned by price + supplier.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ResourcePriceRecord } from '../data/priceDatabase2026/types';
import {
  SERVER_ENFORCEMENT_STATUS,
  GLOBAL_ADMIN_MODEL,
  GLOBAL_ADMIN_MODEL_RATIONALE,
  MASTER_PRICE_WRITE_OPERATIONS,
  currentLocalIdentity,
  authorizeMasterPriceOperation,
  authorizeMasterPriceWriteVia,
  authorizeReconciliationApproval,
  authorizeAliasApproval,
  isMasterPriceWriteOperation,
  type MasterPriceIdentity,
  type MasterPriceOperation,
} from '../engine/pricing/admin/masterPriceAuthorization';
import {
  MASTER_PRICE_TYPE_VALUES,
  getPriceRegion,
  getEffectiveDate,
  getEffectiveTo,
  getRecordedDate,
  getSourceReference,
  getCreatedBy,
  getUpdatedBy,
  getOriginalAhspSourcePrice,
  getMasterMinusSourcePriceDifference,
  getSpecContext,
  derivePriceType,
  validateMasterPriceWrite,
  isExplicitlyUnresolvedPrice,
  type MasterPriceWriteInput,
} from '../engine/pricing/admin/masterPriceRecord';
import {
  MASTER_PROVENANCE_LABELS,
  PROVENANCE_LABEL_MAPPING,
  mapProvenanceLabel,
  validateProvenanceMappings,
  labelForRecord,
  labelForMissingPrice,
} from '../engine/pricing/admin/provenanceLabels';
import {
  buildHistoryEntry,
  appendHistoryEntry,
  validateHistoryEntries,
  parseHistoryJsonl,
  serializeHistoryEntryJsonl,
  MASTER_PRICE_HISTORY_JSONL_NOTE,
  type MasterPriceHistoryEntry,
} from '../engine/pricing/admin/masterPriceHistory';
import * as historyModule from '../engine/pricing/admin/masterPriceHistory';
import {
  buildConflictGroupIdentity,
  buildFullPriceIdentityKey,
  selectMasterPriceCandidate,
  findConflictGroups,
  isSelectablePriceRecord,
} from '../engine/pricing/admin/masterPriceSelection';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(HERE, '..', '..');

function readJson<T>(rel: string): T {
  return JSON.parse(fs.readFileSync(path.join(REPO, rel), 'utf8')) as T;
}

interface PriceMasterFile {
  generatedAt: string;
  count: number;
  records: ResourcePriceRecord[];
}
interface ConflictsFile {
  generatedAt: string;
  count: number;
  conflicts: Array<{
    identity: string;
    resourceId: string;
    resourceCode: string;
    resourceName: string;
    unit: string;
    period: string;
    candidates: Array<{
      price: number;
      sourceKey: string;
      sourceName: string;
      priority: number;
      tier: string;
    }>;
    resolution: string;
    preferred: string;
  }>;
}

const PRICE_MASTER = readJson<PriceMasterFile>('data/price2026/validated/price_master.json');
const CONFLICTS = readJson<ConflictsFile>('data/price2026/validated/conflicts.json');
const RECORDS = PRICE_MASTER.records;

/* Identities used across the §4.1 tests. */
const ADMIN: MasterPriceIdentity = { kind: 'authenticated', userId: 'admin-uuid-1', isGlobalAdmin: true };
const ADMIN_2: MasterPriceIdentity = { kind: 'authenticated', userId: 'admin-uuid-2', isGlobalAdmin: true };
const ORDINARY: MasterPriceIdentity = { kind: 'authenticated', userId: 'user-uuid-1', isGlobalAdmin: false };
const ANON: MasterPriceIdentity = { kind: 'anonymous' };
const DEMO_QS: MasterPriceIdentity = { kind: 'demo', role: 'qs' };

/** Minimal valid record for constructed cases (values are test fixtures, not prices). */
function makeRecord(over: Partial<ResourcePriceRecord> = {}): ResourcePriceRecord {
  return {
    id: 'PRC-TEST-1',
    resourceId: 'RES-TEST-001',
    resourceCode: 'M99',
    resourceName: 'Test Material',
    resourceType: 'material',
    unit: 'kg',
    unitRaw: 'kg',
    price: 10000,
    currency: 'IDR',
    location: { level: 'NATIONAL' },
    period: { year: 2026, month: null, label: '2026-Q1', effectiveFrom: '2026-01-01', effectiveTo: null },
    sourceKey: 'HSD_2026',
    sourceTier: 'OFFICIAL_GOVERNMENT',
    sourcePriority: 1,
    sourceName: 'Test Source',
    sourceType: 'GOVERNMENT_REFERENCE',
    retrievedAt: '2026-01-15',
    verificationStatus: 'VERIFIED',
    matchMethod: 'EXACT_CODE',
    matchConfidence: 0.95,
    notes: [],
    version: 1,
    status: 'ACTIVE',
    ...over,
  };
}

function makeWriteInput(over: Partial<MasterPriceWriteInput> = {}): MasterPriceWriteInput {
  return {
    resourceId: 'RES-TEST-001',
    price: 10000,
    unit: 'kg',
    location: { level: 'NATIONAL' },
    period: { year: 2026, month: null, label: '2026-Q1', effectiveFrom: '2026-01-01', effectiveTo: null },
    sourceKey: 'HSD_2026',
    reason: 'test change reason',
    ...over,
  };
}

/* ====================================================================== */
describe('§4.1 — authorization is deterministic + fail-closed (no Supabase)', () => {
  it('server-side enforcement is recorded BLOCKED (not faked)', () => {
    expect(SERVER_ENFORCEMENT_STATUS).toBe('BLOCKED');
  });

  it('the honest local identity today is anonymous (no auth exists)', () => {
    expect(currentLocalIdentity()).toEqual({ kind: 'anonymous' });
  });

  it('the local identity is denied for ALL 9 global writes', () => {
    const local = currentLocalIdentity();
    expect(MASTER_PRICE_WRITE_OPERATIONS).toHaveLength(9);
    for (const op of MASTER_PRICE_WRITE_OPERATIONS) {
      const d = authorizeMasterPriceOperation(local, op);
      expect(d.allowed).toBe(false);
      expect(d.code).toBe('DENIED_NOT_AUTHENTICATED');
    }
  });

  it('a global admin is allowed all 9 global writes', () => {
    for (const op of MASTER_PRICE_WRITE_OPERATIONS) {
      const d = authorizeMasterPriceOperation(ADMIN, op);
      expect(d).toMatchObject({ allowed: true, code: 'ALLOWED', operation: op });
    }
  });

  it('an anonymous identity is denied all 9 writes', () => {
    for (const op of MASTER_PRICE_WRITE_OPERATIONS) {
      expect(authorizeMasterPriceOperation(ANON, op)).toMatchObject({
        allowed: false,
        code: 'DENIED_NOT_AUTHENTICATED',
      });
    }
  });

  it('a demo PIN role is denied all 9 writes (demo is UX, not authorization)', () => {
    for (const role of ['qs', 'estimator', 'kontraktor', 'konsultan', 'team']) {
      const demo: MasterPriceIdentity = { kind: 'demo', role };
      for (const op of MASTER_PRICE_WRITE_OPERATIONS) {
        expect(authorizeMasterPriceOperation(demo, op)).toMatchObject({
          allowed: false,
          code: 'DENIED_DEMO_ROLE',
        });
      }
    }
  });

  it('an authenticated ordinary user is denied all 9 writes', () => {
    for (const op of MASTER_PRICE_WRITE_OPERATIONS) {
      expect(authorizeMasterPriceOperation(ORDINARY, op)).toMatchObject({
        allowed: false,
        code: 'DENIED_NOT_GLOBAL_ADMIN',
      });
    }
  });

  it('malformed identities are denied (fail-closed, never coerced into admin)', () => {
    const malformed: unknown[] = [
      null,
      undefined,
      0,
      'admin',
      true,
      [],
      {},
      { kind: 'admin' },
      { kind: 'SUPER_ADMIN' },
      { kind: 'authenticated' },
      { kind: 'authenticated', userId: '' },
    ];
    for (const id of malformed) {
      const d = authorizeMasterPriceOperation(id, 'EDIT_MASTER_PRICE');
      expect(d.allowed).toBe(false);
      expect(d.code).toBe('DENIED_MALFORMED_IDENTITY');
    }
    // A non-`true` admin flag is not malformed — it is simply "not a
    // global admin". Either way the write is denied (fail-closed).
    const notAdmin: unknown[] = [
      { kind: 'authenticated', userId: 'x' },
      { kind: 'authenticated', userId: 'x', isGlobalAdmin: false },
      { kind: 'authenticated', userId: 'x', isGlobalAdmin: 'yes' },
      { kind: 'authenticated', userId: 'x', isGlobalAdmin: 1 },
    ];
    for (const id of notAdmin) {
      const d = authorizeMasterPriceOperation(id, 'EDIT_MASTER_PRICE');
      expect(d.allowed).toBe(false);
      expect(d.code).toBe('DENIED_NOT_GLOBAL_ADMIN');
    }
  });

  it('reads are open for everyone (master prices are public reference data)', () => {
    for (const id of [ANON, DEMO_QS, ORDINARY, ADMIN]) {
      expect(authorizeMasterPriceOperation(id, 'READ_MASTER_PRICE').allowed).toBe(true);
      expect(authorizeMasterPriceOperation(id, 'READ_MASTER_HISTORY').allowed).toBe(true);
    }
  });

  it('decisions are deterministic: same input, same decision', () => {
    const a = authorizeMasterPriceOperation(ORDINARY, 'EDIT_MASTER_PRICE');
    const b = authorizeMasterPriceOperation(ORDINARY, 'EDIT_MASTER_PRICE');
    expect(a).toEqual(b);
    const c = authorizeMasterPriceOperation(ADMIN, 'PUBLISH_PRICE_UPDATE');
    const d = authorizeMasterPriceOperation(ADMIN, 'PUBLISH_PRICE_UPDATE');
    expect(c).toEqual(d);
  });

  it('isMasterPriceWriteOperation classifies the 9 writes (and only them)', () => {
    for (const op of MASTER_PRICE_WRITE_OPERATIONS) expect(isMasterPriceWriteOperation(op)).toBe(true);
    expect(isMasterPriceWriteOperation('READ_MASTER_PRICE')).toBe(false);
    expect(isMasterPriceWriteOperation('DELETE_EVERYTHING')).toBe(false);
    expect(isMasterPriceWriteOperation('')).toBe(false);
  });
});

/* ====================================================================== */
describe('§4.1 — the write path never widens access (Decision A)', () => {
  const op: MasterPriceOperation = 'EDIT_MASTER_PRICE';

  it.each(['AHSP_EDIT', 'IMPORT', 'API', 'SYNC'] as const)(
    'ordinary user denied via %s (no indirect global write)',
    (via) => {
      expect(authorizeMasterPriceWriteVia(ORDINARY, op, via).allowed).toBe(false);
      expect(authorizeMasterPriceWriteVia(ANON, op, via).allowed).toBe(false);
      expect(authorizeMasterPriceWriteVia(DEMO_QS, op, via).allowed).toBe(false);
    },
  );

  it.each(['AHSP_EDIT', 'IMPORT', 'API', 'SYNC'] as const)(
    'global admin allowed via %s (the path does not narrow an admin either)',
    (via) => {
      expect(authorizeMasterPriceWriteVia(ADMIN, op, via)).toMatchObject({
        allowed: true,
        code: 'ALLOWED',
      });
    },
  );

  it('DIRECT is the admin path: admin allowed, everyone else denied', () => {
    expect(authorizeMasterPriceWriteVia(ADMIN, op, 'DIRECT').allowed).toBe(true);
    expect(authorizeMasterPriceWriteVia(ORDINARY, op, 'DIRECT').allowed).toBe(false);
  });

  it('PROJECT_OVERRIDE can never write global — denied even for a global admin', () => {
    for (const id of [ADMIN, ADMIN_2, ORDINARY, ANON, DEMO_QS]) {
      expect(authorizeMasterPriceWriteVia(id, op, 'PROJECT_OVERRIDE')).toMatchObject({
        allowed: false,
        code: 'DENIED_WRONG_CHANNEL',
      });
    }
  });

  it('an AHSP edit by an ordinary user cannot change the global price (all ops)', () => {
    for (const operation of MASTER_PRICE_WRITE_OPERATIONS) {
      expect(authorizeMasterPriceWriteVia(ORDINARY, operation, 'AHSP_EDIT').allowed).toBe(false);
      expect(authorizeMasterPriceWriteVia(ORDINARY, operation, 'IMPORT').allowed).toBe(false);
    }
  });
});

/* ====================================================================== */
describe('§4.1 — anti-self-approval + global admin model decision', () => {
  it('an admin cannot approve a reconciliation they created', () => {
    expect(authorizeReconciliationApproval(ADMIN, 'admin-uuid-1')).toMatchObject({
      allowed: false,
      code: 'DENIED_SELF_APPROVAL',
    });
  });

  it('a different admin may approve the reconciliation', () => {
    expect(authorizeReconciliationApproval(ADMIN_2, 'admin-uuid-1')).toMatchObject({
      allowed: true,
      code: 'ALLOWED',
    });
  });

  it('a null creator (legacy/system) has no self-approval conflict', () => {
    expect(authorizeReconciliationApproval(ADMIN, null).allowed).toBe(true);
  });

  it('a non-admin cannot approve a reconciliation at all', () => {
    expect(authorizeReconciliationApproval(ORDINARY, 'someone-else').allowed).toBe(false);
    expect(authorizeReconciliationApproval(ANON, null).allowed).toBe(false);
  });

  it('an admin cannot approve an alias they proposed', () => {
    expect(authorizeAliasApproval(ADMIN, 'admin-uuid-1')).toMatchObject({
      allowed: false,
      code: 'DENIED_SELF_APPROVAL',
    });
    expect(authorizeAliasApproval(ADMIN_2, 'admin-uuid-1').allowed).toBe(true);
    expect(authorizeAliasApproval(ORDINARY, 'someone-else').allowed).toBe(false);
  });

  it('global admin model decision: SEPARATE_TABLE (not a workspace role)', () => {
    expect(GLOBAL_ADMIN_MODEL).toBe('SEPARATE_TABLE');
    expect(GLOBAL_ADMIN_MODEL_RATIONALE.length).toBeGreaterThanOrEqual(3);
    const joined = GLOBAL_ADMIN_MODEL_RATIONALE.join(' ');
    expect(joined).toMatch(/per-workspace/i);
    expect(joined).toMatch(/global/i);
    expect(joined).toMatch(/SUPER_ADMIN/);
  });
});

/* ====================================================================== */
describe('§4.2 — price record model (mapping + honest nulls)', () => {
  it('priceMaster still has 899 records, all priced > 0 (§4 changed no price)', () => {
    expect(PRICE_MASTER.count).toBe(899);
    expect(RECORDS).toHaveLength(899);
    for (const r of RECORDS) {
      expect(typeof r.price).toBe('number');
      expect(Number.isFinite(r.price)).toBe(true);
      expect(r.price).toBeGreaterThan(0);
    }
  });

  it('§4.2 mapped fields read from the existing fields (no parallel schema)', () => {
    for (const r of RECORDS) {
      expect(getPriceRegion(r)).toBe(r.location);
      expect(getEffectiveDate(r)).toBe(r.period.effectiveFrom);
      expect(getEffectiveTo(r)).toBe(r.period.effectiveTo ?? null);
      expect(getRecordedDate(r)).toBe(r.retrievedAt);
      expect(getSourceReference(r)).toEqual({
        document: r.sourceDocument ?? null,
        url: r.sourceUrl ?? null,
      });
    }
  });

  it('priceType is recovered from the notes on 757 records (distribution pinned)', () => {
    const counts = new Map<string, number>();
    let nulls = 0;
    for (const r of RECORDS) {
      const t = derivePriceType(r);
      if (t === null) nulls += 1;
      else counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    expect(nulls).toBe(142);
    // MARKET_REFERENCE 378 → 711: all 447 adopted MARKET_2026 records
    // carry MARKET_REFERENCE in their notes (provenance), so
    // derivePriceType recovers it for each. Other buckets unchanged.
    expect(Object.fromEntries(counts)).toEqual({
      MARKET_REFERENCE: 711,
      GOVERNMENT_REFERENCE: 41,
      PROJECT: 1,
      SUPPLIER: 2,
      DISTRIBUTOR: 2,
    });
    // Master Pricing §6 decision (j): RETAIL joined the vocabulary
    // (verified-retailer rows from the material service — a genuine
    // acquisition channel, distinct from wholesale MARKET_REFERENCE).
    // The distribution above is UNCHANGED (0/899 records carry RETAIL
    // — the 3 RETAIL price rows are unmatched); only the vocabulary
    // list grows from 5 to 6.
    expect([...MASTER_PRICE_TYPE_VALUES].sort()).toEqual(
      ['DISTRIBUTOR', 'GOVERNMENT_REFERENCE', 'MARKET_REFERENCE', 'PROJECT', 'RETAIL', 'SUPPLIER'].sort(),
    );
  });

  it('priceType: the AGG/SND regional variants carry their real types', () => {
    const byPrice = new Map<number, ResourcePriceRecord>();
    for (const r of RECORDS) {
      if (r.sourceRecordId === 'MAT-ROD-AGG-0001' || r.sourceRecordId === 'MAT-BLD-SND-0001') {
        byPrice.set(r.price, r);
      }
    }
    // MAT-ROD-AGG-0001 (Lapis Pondasi Agregat Kelas A, RES-001593)
    expect(derivePriceType(byPrice.get(285000)!)).toBe('PROJECT');
    expect(derivePriceType(byPrice.get(270000)!)).toBe('SUPPLIER');
    expect(derivePriceType(byPrice.get(310000)!)).toBe('GOVERNMENT_REFERENCE');
    // MAT-BLD-SND-0001 (Pasir Pasang Extra Bersih, RES-003733) — note the
    // 340000 row: priceType=MARKET_REFERENCE in the notes even though its
    // sourceType is GOVERNMENT_REFERENCE (type vs sourceType are distinct).
    expect(derivePriceType(byPrice.get(340000)!)).toBe('MARKET_REFERENCE');
    expect(derivePriceType(byPrice.get(295000)!)).toBe('MARKET_REFERENCE');
    expect(derivePriceType(byPrice.get(240000)!)).toBe('SUPPLIER');
  });

  it('derivePriceType prefers the stamped field and rejects unknown vocabulary', () => {
    expect(derivePriceType(makeRecord({ priceType: 'SUPPLIER', notes: ['priceType=PROJECT'] }))).toBe('SUPPLIER');
    expect(derivePriceType(makeRecord({ notes: ['priceType=BLACK_MARKET'] }))).toBe(null);
    expect(derivePriceType(makeRecord({ priceType: 'BLACK_MARKET' as never }))).toBe(null);
    expect(derivePriceType(makeRecord({ notes: [] }))).toBe(null);
  });

  it('createdBy/updatedBy are null on all 899 records (honest no-auth — never fabricated)', () => {
    for (const r of RECORDS) {
      expect(getCreatedBy(r)).toBe(null);
      expect(getUpdatedBy(r)).toBe(null);
    }
  });

  // MASTER PRICING §5 — UPDATED (task-ordered): the pipeline now stamps
  // specContext directly from the source material's `specification` field
  // (normalizePrices.ts, §4 open item #2). The §4 pin ("null on all 899")
  // described the pre-§5 state and is replaced by a STRONGER pin of the
  // measured §5 state: filled exactly where the source carries a spec,
  // null exactly where it does not. Nothing here is weakened — the old
  // test asserted an absence; this one asserts the exact per-source
  // presence AND the real spec values.
  it('specContext is stamped from the source specification (§5): filled 401/899, null only where the source has no spec', () => {
    const filledBySource = new Map<string, number>();
    const nullBySource = new Map<string, number>();
    for (const r of RECORDS) {
      const m = getSpecContext(r) === null ? nullBySource : filledBySource;
      m.set(r.sourceKey, (m.get(r.sourceKey) ?? 0) + 1);
      // A stamped spec is never an empty string and never the resource name.
      if (getSpecContext(r) !== null) {
        expect(getSpecContext(r)!.trim().length).toBeGreaterThan(0);
        expect(getSpecContext(r)).not.toBe(r.resourceName);
      }
    }
    expect(Object.fromEntries(filledBySource)).toEqual({
      COMMERCIAL_2026: 17,
      HSD_2026: 74,
      MATERIAL_MASTER_2026: 310,
    });
    // Labor + equipment carry no `specification` field in their sources
    // (skillLevel/capacity live in notes, not in a spec field) — null is
    // the honest value there, never a guess from the name.
    expect(Object.fromEntries(nullBySource)).toEqual({
      EQUIPMENT_2026: 22,
      LABOR_2026: 29,
      // MARKET_2026 rows carry no `specification` (the audit dataset has
      // no per-item spec; inventing specContext from names is forbidden) —
      // null is the honest value for all 447 adopted records.
      MARKET_2026: 447,
    });
    // Real spec values, verbatim from the source materials.
    const agg = RECORDS.find((r) => r.sourceRecordId === 'MAT-ROD-AGG-0001')!;
    expect(getSpecContext(agg)).toBe('CBR >= 90%, Gradasi Rapat Sesuai Bina Marga Divisi 5');
    const hsd = RECORDS.find((r) => r.sourceKey === 'HSD_2026' && r.resourceCode === 'M57a')!;
    expect(getSpecContext(hsd)).toBe('Standar Acuan 2026 (SE 12/SE/Db/2026)');
    // ...and a record CAN carry one synthetically (the §4 check, kept).
    const synthetic = makeRecord({
      specContext: 'CBR >= 90%, Gradasi Rapat Sesuai Bina Marga Divisi 5',
    });
    expect(getSpecContext(synthetic)).toBe('CBR >= 90%, Gradasi Rapat Sesuai Bina Marga Divisi 5');
  });

  it('originalAhspSourcePrice is preserved independently from the master price', () => {
    for (const r of RECORDS) {
      expect(getOriginalAhspSourcePrice(r)).toBe(null);
      expect(getMasterMinusSourcePriceDifference(r)).toBe(null);
    }
    const withSource = makeRecord({ price: 15000, originalAhspSourcePrice: 14500 });
    expect(withSource.price).toBe(15000);
    expect(getOriginalAhspSourcePrice(withSource)).toBe(14500);
    expect(getMasterMinusSourcePriceDifference(withSource)).toBe(500);
    // Changing the master price never touches the preserved source price.
    const updated = { ...withSource, price: 16000 };
    expect(getOriginalAhspSourcePrice(updated)).toBe(14500);
    expect(getMasterMinusSourcePriceDifference(updated)).toBe(1500);
  });
});

/* ====================================================================== */
describe('§4.2 — admin write validation (missing price stays null)', () => {
  it('a valid write passes', () => {
    expect(validateMasterPriceWrite(makeWriteInput())).toEqual({ valid: true });
  });

  it('an explicit null price is valid and stays null (never coerced to 0)', () => {
    const input = makeWriteInput({ price: null });
    expect(validateMasterPriceWrite(input)).toEqual({ valid: true });
    expect(isExplicitlyUnresolvedPrice(input)).toBe(true);
    expect(input.price).toBe(null);
    expect(input.price).not.toBe(0);
  });

  it('an explicit 0 is a resolved zero (different from null)', () => {
    const input = makeWriteInput({ price: 0 });
    expect(validateMasterPriceWrite(input)).toEqual({ valid: true });
    expect(isExplicitlyUnresolvedPrice(input)).toBe(false);
  });

  it('negative / NaN / infinite prices are rejected', () => {
    expect(validateMasterPriceWrite(makeWriteInput({ price: -1 }))).toMatchObject({ valid: false });
    expect(validateMasterPriceWrite(makeWriteInput({ price: NaN }))).toMatchObject({ valid: false });
    expect(validateMasterPriceWrite(makeWriteInput({ price: Infinity }))).toMatchObject({ valid: false });
    const v = validateMasterPriceWrite(makeWriteInput({ price: -100 }));
    expect(v.valid).toBe(false);
    if (!v.valid) expect(v.errors.join(' ')).toMatch(/negative/);
  });

  it('a reason is required (>= 10 chars) and identity fields are required', () => {
    expect(validateMasterPriceWrite(makeWriteInput({ reason: '' }))).toMatchObject({ valid: false });
    expect(validateMasterPriceWrite(makeWriteInput({ reason: 'short' }))).toMatchObject({ valid: false });
    expect(validateMasterPriceWrite(makeWriteInput({ resourceId: '' }))).toMatchObject({ valid: false });
    expect(validateMasterPriceWrite(makeWriteInput({ unit: '' }))).toMatchObject({ valid: false });
    expect(validateMasterPriceWrite(makeWriteInput({ sourceKey: '' }))).toMatchObject({ valid: false });
    expect(validateMasterPriceWrite(makeWriteInput({ priceType: 'NOPE' as never }))).toMatchObject({
      valid: false,
    });
  });
});

/* ====================================================================== */
describe('§4.3 — provenance labels map to the existing enums (D2)', () => {
  it('the mapping table validates (market never official, assumption never master, …)', () => {
    expect(validateProvenanceMappings()).toEqual([]);
    expect(MASTER_PROVENANCE_LABELS).toHaveLength(7);
  });

  it('all 7 labels map to the D2 enum values', () => {
    expect(mapProvenanceLabel('OFFICIAL_AHSP')).toMatchObject({
      verificationStatus: 'VERIFIED',
      sourceTier: 'OFFICIAL_GOVERNMENT',
      priceStatus: 'PRICE_RESOLVED',
      mayBecomeMasterPrice: true,
    });
    expect(mapProvenanceLabel('OFFICIAL_VERIFIED')).toMatchObject({
      verificationStatus: 'VERIFIED',
      sourceTier: 'OFFICIAL_GOVERNMENT',
      priceStatus: 'PRICE_RESOLVED',
      mayBecomeMasterPrice: true,
    });
    expect(mapProvenanceLabel('MARKET_REFERENCE')).toMatchObject({
      verificationStatus: 'SOURCE_REPORTED',
      sourceTier: 'COMMERCIAL_REFERENCE',
      priceStatus: 'PRICE_RESOLVED',
      mayBecomeMasterPrice: true,
    });
    expect(mapProvenanceLabel('MANUAL')).toMatchObject({
      priceStatus: 'PRICE_MANUAL',
      mayBecomeMasterPrice: false,
    });
    expect(mapProvenanceLabel('ASSUMPTION')).toMatchObject({
      priceStatus: 'PRICE_ESTIMATED',
      mayBecomeMasterPrice: false,
    });
    expect(mapProvenanceLabel('PRICE_UNAVAILABLE')).toMatchObject({
      verificationStatus: null,
      sourceTier: null,
      priceStatus: 'PRICE_UNRESOLVED',
      mayBecomeMasterPrice: false,
    });
    expect(mapProvenanceLabel('NEEDS_VERIFICATION')).toMatchObject({
      verificationStatus: 'NEEDS_REVIEW',
      priceStatus: null,
      mayBecomeMasterPrice: false,
    });
  });

  it('a market reference is never labeled official (exhaustive over the table)', () => {
    const m = PROVENANCE_LABEL_MAPPING.MARKET_REFERENCE;
    expect(m.verificationStatus).not.toBe('VERIFIED');
    expect(m.sourceTier).not.toBe('OFFICIAL_GOVERNMENT');
    expect(m.sourceTier).toBe('COMMERCIAL_REFERENCE');
  });

  it('an unknown label throws (fail-closed)', () => {
    expect(() => mapProvenanceLabel('OFFICIAL_LOL')).toThrow(/Unknown §4.3 provenance label/);
    expect(() => mapProvenanceLabel('')).toThrow();
  });

  it('labelForRecord on real records: HSD VERIFIED → OFFICIAL_VERIFIED', () => {
    const hsdVerified = RECORDS.find(
      (r) => r.sourceKey === 'HSD_2026' && r.verificationStatus === 'VERIFIED',
    );
    expect(hsdVerified).toBeDefined();
    expect(labelForRecord(hsdVerified!)).toBe('OFFICIAL_VERIFIED');
  });

  it('labelForRecord on real records: VERIFIED labor (SE DJBK + Permen PUPR) → OFFICIAL_VERIFIED', () => {
    const laborVerified = RECORDS.find(
      (r) => r.sourceKey === 'LABOR_2026' && r.verificationStatus === 'VERIFIED',
    );
    expect(laborVerified).toBeDefined();
    expect(laborVerified!.sourceDocument).toContain('Permen PUPR 1/2022');
    expect(labelForRecord(laborVerified!)).toBe('OFFICIAL_VERIFIED');
  });

  it('labelForRecord on real records: COMMERCIAL → MARKET_REFERENCE, NEEDS_REVIEW → NEEDS_VERIFICATION', () => {
    const commercial = RECORDS.find((r) => r.sourceKey === 'COMMERCIAL_2026');
    expect(commercial).toBeDefined();
    expect(labelForRecord(commercial!)).toBe('MARKET_REFERENCE');
    const needsReview = RECORDS.find(
      (r) => r.verificationStatus === 'NEEDS_REVIEW' && r.sourceTier !== 'COMMERCIAL_REFERENCE',
    );
    expect(needsReview).toBeDefined();
    expect(labelForRecord(needsReview!)).toBe('NEEDS_VERIFICATION');
  });

  it('labelForRecord: VERIFIED CK/BM direct sources → OFFICIAL_AHSP', () => {
    expect(
      labelForRecord(makeRecord({ sourceKey: 'CK_HSD_2026', verificationStatus: 'VERIFIED' })),
    ).toBe('OFFICIAL_AHSP');
    expect(
      labelForRecord(makeRecord({ sourceKey: 'BM_HSD_2026', verificationStatus: 'VERIFIED' })),
    ).toBe('OFFICIAL_AHSP');
  });

  it('labelForRecord: the market guard wins over VERIFIED (market never official)', () => {
    expect(
      labelForRecord(
        makeRecord({ verificationStatus: 'VERIFIED', sourceTier: 'COMMERCIAL_REFERENCE' }),
      ),
    ).toBe('MARKET_REFERENCE');
  });

  it('labelForRecord: MANUAL / ASSUMPTION are caller-supplied context', () => {
    expect(labelForRecord(makeRecord(), { priceStatus: 'PRICE_MANUAL' })).toBe('MANUAL');
    expect(labelForRecord(makeRecord(), { isAssumption: true })).toBe('ASSUMPTION');
    expect(labelForRecord(makeRecord(), { priceStatus: 'PRICE_RESOLVED' })).toBe('OFFICIAL_VERIFIED');
  });

  it('a missing price labels PRICE_UNAVAILABLE (the null case has no record)', () => {
    expect(labelForMissingPrice()).toBe('PRICE_UNAVAILABLE');
  });

  it('the reverse mapping is total over all 899 records (distribution pinned)', () => {
    const counts = new Map<string, number>();
    for (const r of RECORDS) {
      const label = labelForRecord(r);
      expect(MASTER_PROVENANCE_LABELS).toContain(label);
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
    // MARKET_REFERENCE 17 → 464: labelForRecord keys on sourceType, so
    // all 447 MARKET_2026 records (sourceType MARKET_REFERENCE) map
    // here — including the 440 NEEDS_REVIEW ones. NEEDS_VERIFICATION
    // stays 422; OFFICIAL_VERIFIED stays 13. Total 899.
    expect(Object.fromEntries(counts)).toEqual({
      OFFICIAL_VERIFIED: 13,
      MARKET_REFERENCE: 464,
      NEEDS_VERIFICATION: 422,
    });
    // No record maps to a contextual label without context.
    expect(counts.get('MANUAL')).toBeUndefined();
    expect(counts.get('ASSUMPTION')).toBeUndefined();
    expect(counts.get('PRICE_UNAVAILABLE')).toBeUndefined();
    expect(counts.get('OFFICIAL_AHSP')).toBeUndefined(); // no CK/BM direct records in priceMaster
  });
});

/* ====================================================================== */
describe('§4.4 — price history (append-only writer)', () => {
  const FIXED_AT = '2026-11-16T01:55:00.000Z';

  function fullUpdateInput(over: Partial<Omit<MasterPriceHistoryEntry, 'id' | 'schemaVersion'>> = {}) {
    return {
      priceRecordId: 'PRC-TEST-1',
      resourceId: 'RES-TEST-001',
      operation: 'UPDATE' as const,
      previousAmount: 14500,
      newAmount: 15000,
      previousUnit: 'kg',
      newUnit: 'kg',
      previousRegion: { level: 'NATIONAL' as const },
      newRegion: { level: 'NATIONAL' as const },
      sourceKey: 'HSD_2026',
      sourceTier: 'OFFICIAL_GOVERNMENT' as const,
      sourceDocument: 'SE 12/SE/Db/2026',
      verificationStatus: 'VERIFIED' as const,
      adminIdentity: null,
      changedAt: FIXED_AT,
      reason: 'harga HSD 2026 diperbarui',
      affectedAhspReferences: ['A.1.1.1', 'B.2.2.2'],
      affectedLivePriceProjects: ['PRJ-1'],
      publicationStatus: 'PUBLISHED' as const,
      previousVersion: 1,
      newVersion: 2,
      masterPriceVersion: '2026.1',
      ...over,
    };
  }

  it('a history entry carries every §4.4 field', () => {
    const e = buildHistoryEntry(fullUpdateInput());
    expect(e.priceRecordId).toBe('PRC-TEST-1');
    expect(e.resourceId).toBe('RES-TEST-001');
    expect(e.operation).toBe('UPDATE');
    expect(e.previousAmount).toBe(14500);
    expect(e.newAmount).toBe(15000);
    expect(e.previousUnit).toBe('kg');
    expect(e.newUnit).toBe('kg');
    expect(e.previousRegion).toEqual({ level: 'NATIONAL' });
    expect(e.newRegion).toEqual({ level: 'NATIONAL' });
    expect(e.sourceKey).toBe('HSD_2026');
    expect(e.sourceTier).toBe('OFFICIAL_GOVERNMENT');
    expect(e.sourceDocument).toBe('SE 12/SE/Db/2026');
    expect(e.verificationStatus).toBe('VERIFIED');
    expect(e.adminIdentity).toBe(null);
    expect(e.changedAt).toBe(FIXED_AT);
    expect(e.reason).toBe('harga HSD 2026 diperbarui');
    expect(e.affectedAhspReferences).toEqual(['A.1.1.1', 'B.2.2.2']);
    expect(e.affectedLivePriceProjects).toEqual(['PRJ-1']);
    expect(e.publicationStatus).toBe('PUBLISHED');
    expect(e.previousVersion).toBe(1);
    expect(e.newVersion).toBe(2);
    expect(e.masterPriceVersion).toBe('2026.1');
    expect(e.schemaVersion).toBe(1);
    expect(e.id).toMatch(/^MPH-[0-9a-f]{16}$/);
  });

  it('a missing price stays null in history (previous/new amount may be null)', () => {
    const e = buildHistoryEntry(
      fullUpdateInput({ operation: 'CREATE', previousAmount: null, newAmount: null, previousVersion: null, newVersion: 1 }),
    );
    expect(e.previousAmount).toBe(null);
    expect(e.newAmount).toBe(null);
  });

  it('a reason is required; bad timestamps and negative amounts throw', () => {
    expect(() => buildHistoryEntry(fullUpdateInput({ reason: '' }))).toThrow(/reason is required/);
    expect(() => buildHistoryEntry(fullUpdateInput({ reason: 'short' }))).toThrow(/reason is required/);
    expect(() => buildHistoryEntry(fullUpdateInput({ changedAt: 'not-a-date' }))).toThrow(/changedAt/);
    expect(() => buildHistoryEntry(fullUpdateInput({ newAmount: -5 }))).toThrow(/newAmount/);
    expect(() => buildHistoryEntry(fullUpdateInput({ previousAmount: NaN }))).toThrow(/previousAmount/);
  });

  it('entry ids are deterministic: same input → same id; different input → different id', () => {
    const a = buildHistoryEntry(fullUpdateInput());
    const b = buildHistoryEntry(fullUpdateInput());
    expect(a.id).toBe(b.id);
    const c = buildHistoryEntry(fullUpdateInput({ newAmount: 15500 }));
    expect(c.id).not.toBe(a.id);
  });

  it('append is append-only: new array, input untouched, entries frozen, duplicates refused', () => {
    const a = buildHistoryEntry(fullUpdateInput());
    const b = buildHistoryEntry(fullUpdateInput({ newAmount: 15500, changedAt: '2026-11-16T02:00:00.000Z' }));
    expect(Object.isFrozen(a)).toBe(true);
    expect(Object.isFrozen(a.affectedAhspReferences)).toBe(true);
    const chain: MasterPriceHistoryEntry[] = [];
    const chain1 = appendHistoryEntry(chain, a);
    expect(chain).toHaveLength(0);
    expect(chain1).toHaveLength(1);
    const chain2 = appendHistoryEntry(chain1, b);
    expect(chain1).toHaveLength(1);
    expect(chain2).toHaveLength(2);
    expect(() => appendHistoryEntry(chain2, a)).toThrow(/Duplicate history entry id/);
    expect(() => appendHistoryEntry(chain2, buildHistoryEntry(fullUpdateInput()))).toThrow(
      /Duplicate history entry id/,
    );
  });

  it('validateHistoryEntries accepts a good chain and rejects bad ones', () => {
    const a = buildHistoryEntry(fullUpdateInput());
    const b = buildHistoryEntry(fullUpdateInput({ newAmount: 15500, changedAt: '2026-11-16T02:00:00.000Z' }));
    expect(validateHistoryEntries([a, b])).toEqual({ valid: true, errors: [] });
    expect(validateHistoryEntries([a, a]).valid).toBe(false);
    const badReason = { ...a, id: 'MPH-0000000000000001', reason: 'x' };
    expect(validateHistoryEntries([badReason]).valid).toBe(false);
    const badAmount = { ...a, id: 'MPH-0000000000000002', newAmount: -1 };
    expect(validateHistoryEntries([badAmount]).valid).toBe(false);
  });

  it('the history module exposes NO update/delete function (API surface pinned)', () => {
    const keys = Object.keys(historyModule);
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      expect(key).not.toMatch(/^(update|delete|remove|rewrite|edit|mutate)/i);
    }
    // The only write operation is append.
    expect(keys).toContain('appendHistoryEntry');
    expect(keys).toContain('buildHistoryEntry');
  });

  it('JSONL serialize/parse round-trips; malformed lines are reported, never silently dropped', () => {
    const e = buildHistoryEntry(fullUpdateInput());
    const line = serializeHistoryEntryJsonl(e);
    expect(line).not.toContain('\n');
    const parsed = parseHistoryJsonl(`${line}\n{"not json\n${line}\n`);
    expect(parsed.entries).toHaveLength(2);
    expect(parsed.entries[0].id).toBe(e.id);
    expect(parsed.errors).toHaveLength(1);
    expect(parsed.errors[0]).toMatch(/line 2: invalid JSON/);
  });

  it('the interim JSONL trail on disk parses cleanly (HEADER + BASELINE)', () => {
    const text = fs.readFileSync(
      path.join(REPO, 'data/price2026/reports/master_price_history.jsonl'),
      'utf8',
    );
    const parsed = parseHistoryJsonl(text);
    expect(parsed.errors).toEqual([]);
    expect(parsed.header).toMatchObject({
      kind: 'HEADER',
      schemaVersion: 1,
      masterPriceVersion: '2026.1',
      recordCount: 452,
    });
    expect(parsed.header!.note).toContain('INTERIM');
    expect(parsed.header!.note).toContain('NOT APPLIED');
    expect(parsed.header!.note).toBe(MASTER_PRICE_HISTORY_JSONL_NOTE);
    expect(parsed.entries.length).toBeGreaterThanOrEqual(1);
    expect(parsed.entries[0].operation).toBe('BASELINE');
    expect(parsed.entries[0].adminIdentity).toBe(null);
    expect(parsed.entries[0].previousAmount).toBe(null);
    expect(parsed.entries[0].newAmount).toBe(null);
    expect(validateHistoryEntries(parsed.entries)).toEqual({ valid: true, errors: [] });
  });
});

/* ====================================================================== */
describe('multi-candidate selection (§3 finding: 55 conflict groups)', () => {
  it('the conflict-group identity matches the matcher format exactly', () => {
    const motorGrader = RECORDS.find((r) => r.resourceId === 'RES-000751' && r.unit === 'jam');
    expect(motorGrader).toBeDefined();
    expect(buildConflictGroupIdentity(motorGrader!)).toBe('RES-000751|jam|NATIONAL|||2026-Q1');
  });

  it('the 55 conflict groups recomputed from priceMaster == conflicts.json (set equality)', () => {
    expect(CONFLICTS.count).toBe(55);
    expect(CONFLICTS.conflicts).toHaveLength(55);
    const groups = findConflictGroups(RECORDS);
    expect(groups.size).toBe(55);
    const fromData = new Set(groups.keys());
    const fromFile = new Set(CONFLICTS.conflicts.map((g) => g.identity));
    expect(fromData).toEqual(fromFile);
    for (const g of CONFLICTS.conflicts) {
      expect(g.resolution).toBe('SOURCE_PRIORITY');
      expect(g.preferred).toBeTruthy();
    }
  });

  it('selection picks the named preferred source for ALL 55 groups (no mismatch)', () => {
    const groups = findConflictGroups(RECORDS);
    for (const g of CONFLICTS.conflicts) {
      const candidates = groups.get(g.identity)!;
      expect(candidates.length).toBeGreaterThan(1);
      const sel = selectMasterPriceCandidate(candidates, { preferredSourceKey: g.preferred });
      expect(sel.selected).not.toBe(null);
      expect(sel.selected!.sourceKey).toBe(g.preferred);
      expect(sel.preferredSourceMismatch).toBe(false);
      expect(sel.preferredSourceKey).toBe(g.preferred);
    }
  });

  it('53/55 groups stay ambiguous WITHIN the preferred source (flagged, not hidden)', () => {
    const groups = findConflictGroups(RECORDS);
    let ambiguous = 0;
    const unambiguous: string[] = [];
    for (const g of CONFLICTS.conflicts) {
      const sel = selectMasterPriceCandidate(groups.get(g.identity)!, { preferredSourceKey: g.preferred });
      if (sel.ambiguousWithinPreferredSource) ambiguous += 1;
      else unambiguous.push(g.identity);
    }
    expect(ambiguous).toBe(53);
    expect(unambiguous.sort()).toEqual([
      'RES-000112|jam|NATIONAL|||2026-Q1',
      'RES-000751|jam|NATIONAL|||2026-Q1',
    ]);
  });

  it('the Besi Beton group shows the ambiguity honestly (HSD 14500 vs 15000)', () => {
    const groups = findConflictGroups(RECORDS);
    const g = CONFLICTS.conflicts.find((x) => x.identity === 'RES-001241|kg|NATIONAL|||2026-Q1')!;
    const sel = selectMasterPriceCandidate(groups.get(g.identity)!, { preferredSourceKey: g.preferred });
    expect(sel.selected!.sourceKey).toBe('HSD_2026');
    expect(sel.ambiguousWithinPreferredSource).toBe(true);
    expect(sel.distinctPrices).toBeGreaterThan(1);
    // The selection is deterministic AND the alternatives are all returned.
    const again = selectMasterPriceCandidate(groups.get(g.identity)!, { preferredSourceKey: g.preferred });
    expect(again.selected!.id).toBe(sel.selected!.id);
    expect(sel.alternatives.length).toBe(sel.candidateCount - 1);
    expect(sel.reason).toMatch(/admin review required/);
  });

  it('selection ordering mirrors the resolver: priority → confidence desc → id asc', () => {
    const low = makeRecord({ id: 'PRC-ZZZ', sourcePriority: 6, matchConfidence: 0.9 });
    const midConf = makeRecord({ id: 'PRC-AAA', sourcePriority: 1, matchConfidence: 0.5 });
    const highConf = makeRecord({ id: 'PRC-MMM', sourcePriority: 1, matchConfidence: 0.9 });
    const sel = selectMasterPriceCandidate([low, midConf, highConf]);
    expect(sel.selected!.id).toBe('PRC-MMM');
    expect(sel.alternatives.map((r) => r.id)).toEqual(['PRC-AAA', 'PRC-ZZZ']);
    // Exact tie on priority+confidence → lowest id wins.
    const tieA = makeRecord({ id: 'PRC-AAA', sourcePriority: 1, matchConfidence: 0.9 });
    const tieB = makeRecord({ id: 'PRC-BBB', sourcePriority: 1, matchConfidence: 0.9 });
    expect(selectMasterPriceCandidate([tieB, tieA]).selected!.id).toBe('PRC-AAA');
  });

  it('no candidates → null selection (missing price stays null, never 0)', () => {
    const sel = selectMasterPriceCandidate([]);
    expect(sel.selected).toBe(null);
    expect(sel.candidateCount).toBe(0);
    expect(sel.distinctPrices).toBe(0);
    expect(sel.reason).toMatch(/NO_CANDIDATES/);
  });

  it('SUPERSEDED/EXPIRED records never participate in selection', () => {
    const superseded = makeRecord({ id: 'PRC-OLD', sourcePriority: 1, status: 'SUPERSEDED' });
    const active = makeRecord({ id: 'PRC-NEW', sourcePriority: 6, status: 'ACTIVE' });
    const sel = selectMasterPriceCandidate([superseded, active]);
    expect(sel.selected!.id).toBe('PRC-NEW');
    expect(isSelectablePriceRecord(superseded)).toBe(false);
    expect(isSelectablePriceRecord(makeRecord({ status: undefined }))).toBe(true);
    const expired = makeRecord({ id: 'PRC-EXP', status: 'EXPIRED' });
    expect(selectMasterPriceCandidate([expired]).selected).toBe(null);
  });
});

/* ====================================================================== */
describe('6-tuple disambiguation (§3 §M-3: MAT-ROD-AGG-0001, MAT-BLD-SND-0001)', () => {
  it('with the FULL location, all 899 records have distinct 6-tuples (0 collisions)', () => {
    const keys = RECORDS.map(buildFullPriceIdentityKey);
    expect(new Set(keys).size).toBe(899);
  });

  it('MAT-ROD-AGG-0001: 3 distinct regional variants (Surabaya / Probolinggo / DKI Jakarta)', () => {
    const rows = RECORDS.filter((r) => r.sourceRecordId === 'MAT-ROD-AGG-0001');
    expect(rows).toHaveLength(3);
    expect(new Set(rows.map(buildFullPriceIdentityKey)).size).toBe(3);
    const byCity = new Map(rows.map((r) => [r.location.cityName ?? r.location.provinceName, r]));
    expect(byCity.get('Surabaya')).toMatchObject({ price: 285000, supplier: 'Crusher Plant Waskita Beton' });
    expect(byCity.get('Probolinggo')).toMatchObject({ price: 270000, supplier: 'Quarry Stone Crusher Grati' });
    expect(byCity.get('DKI Jakarta')).toMatchObject({
      price: 310000,
      supplier: 'Harga Satuan Pokok Kegiatan DKI 2026',
    });
  });

  it('MAT-BLD-SND-0001: 3 distinct regional variants (Surabaya / Probolinggo / Jakarta Pusat)', () => {
    const rows = RECORDS.filter((r) => r.sourceRecordId === 'MAT-BLD-SND-0001');
    expect(rows).toHaveLength(3);
    expect(new Set(rows.map(buildFullPriceIdentityKey)).size).toBe(3);
    const byCity = new Map(rows.map((r) => [r.location.cityName ?? r.location.provinceName, r]));
    expect(byCity.get('Surabaya')).toMatchObject({ price: 295000, supplier: 'Depo Pasir Lumajang Surabaya' });
    expect(byCity.get('Probolinggo')).toMatchObject({
      price: 240000,
      supplier: 'TB Sumber Bangunan Makmur Probolinggo',
    });
    expect(byCity.get('Jakarta Pusat')).toMatchObject({ price: 340000, supplier: 'SHST DKI Jakarta 2026' });
  });

  it('collapsing location to level+province reproduces EXACTLY the 2 §3 groups (cause pinned)', () => {
    const coarse = new Map<string, ResourcePriceRecord[]>();
    for (const r of RECORDS) {
      const key = [
        r.resourceId,
        r.unit,
        r.location.level,
        r.location.provinceName || '',
        r.period.label,
        r.sourceKey,
        r.sourceRecordId ?? '',
      ].join('|');
      const list = coarse.get(key) ?? [];
      list.push(r);
      coarse.set(key, list);
    }
    const dups = [...coarse.entries()].filter(([, l]) => l.length > 1);
    expect(dups).toHaveLength(2);
    const dupSources = dups.map(([, l]) => l[0].sourceRecordId).sort();
    expect(dupSources).toEqual(['MAT-BLD-SND-0001', 'MAT-ROD-AGG-0001']);
    // ...and the full-location key separates every one of those rows.
    for (const [, list] of dups) {
      expect(new Set(list.map(buildFullPriceIdentityKey)).size).toBe(list.length);
    }
  });
});

/* ====================================================================== */
describe('§14.1 — server-side / RLS / API enforcement: BLOCKED (evidence pinned)', () => {
  function readText(rel: string): string {
    return fs.readFileSync(path.join(REPO, rel), 'utf8');
  }

  function listFilesRecursive(dir: string): string[] {
    const out: string[] = [];
    const walk = (d: string): void => {
      for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
        const full = path.join(d, entry.name);
        if (entry.isDirectory()) walk(full);
        else out.push(full);
      }
    };
    if (fs.existsSync(dir)) walk(dir);
    return out;
  }

  it('the §4 migration file is headed NOT APPLIED and carries the apply order + supersede note', () => {
    const sql = readText('supabase/migrations/20261116_master_price_governance.sql');
    expect(sql).toContain('NOT APPLIED');
    expect(sql).toContain('APPLY ORDER');
    expect(sql).toContain('SUPERSEDES');
    expect(sql).toContain('20260913');
    expect(sql).toContain('BLOCKED');
    expect(sql).toContain('AUTH_ENABLED=false');
  });

  it('the migration defines the 6 tables + the global-admin helper + the history trigger', () => {
    const sql = readText('supabase/migrations/20261116_master_price_governance.sql');
    for (const table of [
      'global_admins',
      'master_price_entities',
      'master_price_records',
      'master_price_history',
      'master_price_aliases',
      'ahsp_database_versions',
    ]) {
      expect(sql).toContain(`create table if not exists public.${table}`);
    }
    expect(sql).toContain('ezrab_is_global_admin');
    expect(sql).toContain('master_price_record_history_guard');
    expect(sql).toContain('trg_master_price_record_history');
    expect(sql).toContain('master_price_alias_transition_guard');
    expect(sql).toContain('Self-approval blocked');
  });

  it('the migration gives master_price_history NO client write policy (append-only)', () => {
    const sql = readText('supabase/migrations/20261116_master_price_governance.sql');
    const historyPolicies = [...sql.matchAll(/create policy "[^"]+" on public\.master_price_history for (\w+)/g)].map(
      (m) => m[1],
    );
    expect(historyPolicies).toEqual(['select']);
    expect(sql).not.toMatch(/create policy "[^"]+" on public\.master_price_\w+ for delete/i);
  });

  it('the migrations README documents the apply order and the 20260913 supersede (I-15)', () => {
    const readme = readText('supabase/migrations/README.md');
    expect(readme).toContain('20261008_phase3_canonical_schema_rls.sql');
    expect(readme).toContain('20261116_master_price_governance.sql');
    expect(readme).toContain('SUPERSEDED');
    expect(readme).toContain('20260913_auth_membership_foundation.sql');
    expect(readme).toContain('DO NOT APPLY');
  });

  it('AUTH_ENABLED is still hardcoded false in src/App.tsx (blocker evidence)', () => {
    const app = readText('src/App.tsx');
    expect(app).toContain('const AUTH_ENABLED = false');
  });

  it('no master-price API endpoint exists (api/ and server/api/)', () => {
    const apiFiles = [
      ...listFilesRecursive(path.join(REPO, 'api')),
      ...listFilesRecursive(path.join(REPO, 'server', 'api')),
    ];
    expect(apiFiles.length).toBeGreaterThan(0);
    const masterPriceFiles = apiFiles.filter((f) => /master.?price/i.test(f));
    expect(masterPriceFiles).toEqual([]);
  });

  it('the SQL test file exists and is self-guarding (BLOCKED until the migration applies)', () => {
    const sqlTest = readText('supabase/migrations/20261116_master_price_governance.test.sql');
    expect(sqlTest).toContain('BLOCKED');
    expect(sqlTest).toContain('not applied; SQL tests skipped');
    expect(sqlTest).toContain('rollback;');
    expect(sqlTest).toContain('T1');
    expect(sqlTest).toContain('T11');
  });

  // The real server-side tests — DOCUMENTED, not runnable without
  // Supabase infrastructure. They stay skipped until the §2.4.7
  // blockers clear; the SQL file above is their runnable form.
  it.skip('RLS: anonymous INSERT into master_price_records is rejected (BLOCKED — needs Supabase)', () => {});
  it.skip('RLS: authenticated non-admin UPDATE of a master price is rejected (BLOCKED — needs Supabase)', () => {});
  it.skip('RLS: ordinary user cannot UPDATE/DELETE master_price_history (BLOCKED — needs Supabase)', () => {});
  it.skip('RLS: workspace SUPER_ADMIN without a global_admins grant cannot write master prices (BLOCKED — needs Supabase)', () => {});
  it.skip('API: non-admin price update via the admin endpoint returns 403 (BLOCKED — needs the admin endpoint)', () => {});
  it.skip('API: import without admin identity cannot write the global master (BLOCKED — needs the admin endpoint)', () => {});
  it.skip('TRIGGER: price change without change_reason is rejected server-side (BLOCKED — needs Supabase)', () => {});
});
