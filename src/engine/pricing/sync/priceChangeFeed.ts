/**
 * MASTER PRICING §13 — PRICE-CHANGE FEED (pure writer + reader).
 * ============================================================
 *
 * The feed is the recorded list of master price changes SINCE A PIN —
 * the input §10 adoption (kind harga) needs (`previewAdoption` takes
 * `priceChanges: readonly MasterPriceChangeInput[]`) and §11 could
 * only show as an honest empty state ("tidak ada daftar perubahan
 * tercatat; riwayat §4.4 hanya memegang marker BASELINE").
 *
 * FORMAT — one entry is a §10 change PLUS feed metadata:
 *   - the change itself: resourceCode + unit + oldPrice + newPrice
 *     (+ resourceId / resourceName / category / region / source when
 *     known) — exactly `MasterPriceChangeInput`, so
 *     `feedEntriesToChangeInputs` is a lossless projection;
 *   - the record: id (`PCF-<16 hex>` content hash), changedAt,
 *     changedBy (admin id or NULL — honest no-auth), reason,
 *     masterPriceVersion (the version AFTER the change),
 *     historyEntryId (the §4.4 entry this change was recorded in,
 *     when one exists), sourceKind.
 *
 * APPEND-ONLY (the §4.4 pattern): entries are frozen; the only write
 * is `appendPriceChangeFeedEntry` (new array, duplicate id refused).
 * Interim trail: `data/price2026/reports/price_change_feed.jsonl`
 * (HEADER + one entry per line). The durable server form is a VIEW
 * over `master_price_history` in
 * supabase/migrations/20261116_master_price_governance.sql (NOT
 * APPLIED) — the feed is a projection of history, not a second
 * write surface.
 *
 * SEEDING — `seedFeedFromHistory` converts §4.4 history into feed
 * entries. The §4.4 entry carries NO resource code (it records
 * resourceId + amounts + units only), so a pre-§13 history entry
 * CANNOT become a feed entry — the code would have to be invented,
 * and §13 never invents identity. The seed therefore produces the
 * BASELINE marker plus a `skipped` list naming every history entry
 * that could not convert and why. Today the §4.4 trail holds only
 * BASELINE + REGENERATION markers (no price change was ever
 * recorded), so the seeded feed is exactly the BASELINE marker —
 * the honest starting state, not fabricated changes.
 *
 * PIN READING — `readPriceChangesSince(entries, pin)` returns the
 * changes after a pin: by master price version (numeric `YYYY.minor`
 * comparison — lexicographic comparison would order 2026.10 before
 * 2026.9) or by timestamp. The BASELINE marker is never returned as
 * a change.
 */
import type { MasterPriceHistoryEntry } from '../admin/masterPriceHistory';
import type { MasterPriceChangeInput } from '../impact/masterPriceImpactPreview';
import { MASTER_PRICE_VERSION } from '../../../data/priceDatabase2026/types';

/** Schema version of one feed entry (bumped only with a migration). */
export const PRICE_CHANGE_FEED_SCHEMA_VERSION = 1 as const;

/** Interim JSONL trail location (repo-relative). */
export const PRICE_CHANGE_FEED_JSONL_PATH = 'data/price2026/reports/price_change_feed.jsonl';

/** Where a feed entry came from. */
export type PriceChangeFeedSourceKind =
  | 'BASELINE' // marker: the feed's starting state (no price change)
  | 'MASTER_PRICE_HISTORY' // seeded from a §4.4 history entry
  | 'SYNC'; // recorded by a §13 sync operation (global price propagation)

/** One price-change feed entry. Amounts are `number | null` — a missing price stays null. */
export interface PriceChangeFeedEntry {
  /** Deterministic content-hash id: `PCF-<16 hex>` — same input, same id. */
  id: string;
  schemaVersion: typeof PRICE_CHANGE_FEED_SCHEMA_VERSION;
  /** Resource code as printed (M01, L.05, E07, …). Required: without a code the entry cannot drive §10 adoption. */
  resourceCode: string;
  /** Canonical entity id (RES-xxx) when known. */
  resourceId: string | null;
  /** Resource name as printed, when known. */
  resourceName: string | null;
  category: 'MATERIAL' | 'LABOR' | 'EQUIPMENT' | null;
  /** Unit the price applies to (the price record's unit, e.g. kg, m3, OJ). */
  unit: string;
  /** Effective price before the change (null = was unpriced). */
  oldPrice: number | null;
  /** Effective price after the change (null = removal — §9 refuses to preview removals). */
  newPrice: number | null;
  region: string | null;
  source: string | null;
  /** ISO timestamp of the change. */
  changedAt: string;
  /** Authenticated admin id, or NULL (honest no-auth). Never fabricated. */
  changedBy: string | null;
  /** Required reason for the change (>= 10 chars, mirrors §4.4). */
  reason: string;
  /** Master price DB version AFTER this change (e.g. '2026.1'). */
  masterPriceVersion: string;
  /** The §4.4 history entry this change was recorded in, when one exists. */
  historyEntryId: string | null;
  sourceKind: PriceChangeFeedSourceKind;
}

export type PriceChangeFeedInput = Omit<PriceChangeFeedEntry, 'id' | 'schemaVersion'>;

// ---------------------------------------------------------------------------
// Deterministic id (FNV-1a 64-bit, hex) — pure, no dependency
// ---------------------------------------------------------------------------

function fnv1aHex(input: string): string {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  for (let i = 0; i < input.length; i++) {
    hash ^= BigInt(input.charCodeAt(i));
    hash = (hash * prime) & mask;
  }
  return hash.toString(16).padStart(16, '0');
}

function entryIdFor(input: PriceChangeFeedInput): string {
  const canonical = JSON.stringify([
    input.resourceCode,
    input.resourceId,
    input.unit,
    input.oldPrice,
    input.newPrice,
    input.changedAt,
    input.changedBy,
    input.reason,
    input.masterPriceVersion,
    input.sourceKind,
  ]);
  return `PCF-${fnv1aHex(canonical)}`;
}

// ---------------------------------------------------------------------------
// Builder (validates; freezes the entry)
// ---------------------------------------------------------------------------

export function buildPriceChangeFeedEntry(input: PriceChangeFeedInput): PriceChangeFeedEntry {
  if (typeof input.resourceCode !== 'string' || input.resourceCode.trim() === '') {
    throw new Error('resourceCode is required (a feed entry without a code cannot drive §10 adoption)');
  }
  if (typeof input.unit !== 'string' || input.unit.trim() === '') {
    throw new Error('unit is required');
  }
  if (typeof input.reason !== 'string' || input.reason.trim().length < 10) {
    throw new Error('reason is required (at least 10 characters)');
  }
  if (typeof input.changedAt !== 'string' || Number.isNaN(Date.parse(input.changedAt))) {
    throw new Error(`changedAt must be a valid ISO timestamp, got ${JSON.stringify(input.changedAt)}`);
  }
  for (const [field, value] of [
    ['oldPrice', input.oldPrice],
    ['newPrice', input.newPrice],
  ] as const) {
    if (value !== null && (typeof value !== 'number' || !Number.isFinite(value) || value < 0)) {
      throw new Error(`${field} must be null (unresolved) or a finite number >= 0`);
    }
  }
  if (input.sourceKind === 'BASELINE' && (input.oldPrice !== null || input.newPrice !== null)) {
    throw new Error('A BASELINE marker carries no prices (oldPrice and newPrice must both be null)');
  }
  const entry: PriceChangeFeedEntry = Object.freeze({
    ...input,
    id: entryIdFor(input),
    schemaVersion: PRICE_CHANGE_FEED_SCHEMA_VERSION,
  });
  return entry;
}

/** The BASELINE marker: the feed's starting state (no price change). */
export function buildBaselineFeedEntry(
  changedAt: string,
  masterPriceVersion: string = MASTER_PRICE_VERSION,
): PriceChangeFeedEntry {
  return buildPriceChangeFeedEntry({
    resourceCode: 'BASELINE',
    resourceId: null,
    resourceName: null,
    category: null,
    unit: '-',
    oldPrice: null,
    newPrice: null,
    region: null,
    source: null,
    changedAt,
    changedBy: null,
    reason: 'Master Pricing §13 feed baseline: no master price change recorded yet (riwayat §4.4 hanya memegang marker BASELINE).',
    masterPriceVersion,
    historyEntryId: null,
    sourceKind: 'BASELINE',
  });
}

/**
 * Append-only write: returns a NEW (frozen) array with the entry
 * appended. Refuses a duplicate id (idempotency). Never mutates the
 * input array. There is intentionally no update or delete operation.
 */
export function appendPriceChangeFeedEntry(
  entries: readonly PriceChangeFeedEntry[],
  entry: PriceChangeFeedEntry,
): readonly PriceChangeFeedEntry[] {
  if (entries.some((e) => e.id === entry.id)) {
    throw new Error(`Duplicate price-change feed entry id ${entry.id} — feed is append-only, re-append refused`);
  }
  return Object.freeze([...entries, entry]);
}

/** Validate a feed chain: unique ids, required fields, sane amounts. */
export function validatePriceChangeFeedEntries(
  entries: readonly PriceChangeFeedEntry[],
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const seen = new Set<string>();
  entries.forEach((e, i) => {
    const where = `entry[${i}]${e.id ? ` ${e.id}` : ''}`;
    if (!e.id) errors.push(`${where}: missing id`);
    else if (seen.has(e.id)) errors.push(`${where}: duplicate id`);
    else seen.add(e.id);
    if (e.schemaVersion !== PRICE_CHANGE_FEED_SCHEMA_VERSION) {
      errors.push(`${where}: unexpected schemaVersion ${String(e.schemaVersion)}`);
    }
    if (typeof e.resourceCode !== 'string' || e.resourceCode.trim() === '') {
      errors.push(`${where}: missing resourceCode`);
    }
    if (typeof e.changedAt !== 'string' || Number.isNaN(Date.parse(e.changedAt))) {
      errors.push(`${where}: changedAt is not a valid ISO timestamp`);
    }
    for (const [field, value] of [
      ['oldPrice', e.oldPrice],
      ['newPrice', e.newPrice],
    ] as const) {
      if (value !== null && (typeof value !== 'number' || !Number.isFinite(value) || value < 0)) {
        errors.push(`${where}: ${field} must be null or a finite number >= 0`);
      }
    }
  });
  return { valid: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// Version comparison (numeric YYYY.minor — lexicographic fails at .10)
// ---------------------------------------------------------------------------

function parseMasterPriceVersion(version: string): [number, number] | null {
  const m = /^(\d{4})\.(\d+)$/.exec(version.trim());
  if (!m) return null;
  return [Number(m[1]), Number(m[2])];
}

/** -1 when a < b, 0 when equal, +1 when a > b. Unparseable versions throw (fail-closed). */
export function compareMasterPriceVersions(a: string, b: string): number {
  const pa = parseMasterPriceVersion(a);
  const pb = parseMasterPriceVersion(b);
  if (!pa) throw new Error(`Cannot compare master price version ${JSON.stringify(a)} — expected YYYY.minor`);
  if (!pb) throw new Error(`Cannot compare master price version ${JSON.stringify(b)} — expected YYYY.minor`);
  if (pa[0] !== pb[0]) return pa[0] < pb[0] ? -1 : 1;
  if (pa[1] !== pb[1]) return pa[1] < pb[1] ? -1 : 1;
  return 0;
}

// ---------------------------------------------------------------------------
// Reader — changes since a pin
// ---------------------------------------------------------------------------

export type PriceChangePin =
  | { kind: 'MASTER_PRICE_VERSION'; masterPriceVersion: string }
  | { kind: 'SINCE'; since: string };

/**
 * Changes after a pin, in feed order. The BASELINE marker is never
 * returned as a change. A version pin returns changes whose
 * masterPriceVersion is STRICTLY NEWER than the pin; a timestamp pin
 * returns changes with changedAt strictly after `since`.
 */
export function readPriceChangesSince(
  entries: readonly PriceChangeFeedEntry[],
  pin: PriceChangePin,
): PriceChangeFeedEntry[] {
  if (pin.kind === 'SINCE' && Number.isNaN(Date.parse(pin.since))) {
    throw new Error(`since must be a valid ISO timestamp, got ${JSON.stringify(pin.since)}`);
  }
  return entries.filter((e) => {
    if (e.sourceKind === 'BASELINE') return false;
    if (pin.kind === 'MASTER_PRICE_VERSION') {
      return compareMasterPriceVersions(e.masterPriceVersion, pin.masterPriceVersion) > 0;
    }
    return Date.parse(e.changedAt) > Date.parse(pin.since);
  });
}

/**
 * Project the feed entries into §10 adoption inputs (lossless — the
 * feed entry IS a change plus metadata). Removals (newPrice null)
 * are passed through: §9 refuses them at preview time with its own
 * reason, and this function never hides them.
 */
export function feedEntriesToChangeInputs(
  entries: readonly PriceChangeFeedEntry[],
): MasterPriceChangeInput[] {
  return entries
    .filter((e) => e.sourceKind !== 'BASELINE')
    .map((e) => ({
      resourceCode: e.resourceCode,
      resourceId: e.resourceId,
      resourceName: e.resourceName,
      category: e.category,
      unit: e.unit,
      oldPrice: e.oldPrice,
      newPrice: e.newPrice,
      region: e.region,
      source: e.source,
    }));
}

// ---------------------------------------------------------------------------
// Seeding from §4.4 history
// ---------------------------------------------------------------------------

export interface SeedFeedFromHistoryResult {
  entries: readonly PriceChangeFeedEntry[];
  /** History entries that could not convert, each with its reason. Never silently dropped. */
  skipped: Array<{ historyEntryId: string; operation: string; reason: string }>;
}

/**
 * Seed the feed from §4.4 history. A history entry becomes a feed
 * entry ONLY when it carries a resource code — §4.4 entries do not
 * (they record resourceId + amounts + units), so in practice every
 * pre-§13 history entry is SKIPPED with its reason, and the seed is
 * exactly the BASELINE marker. That is the honest starting state:
 * the feed starts recording from §13 on; earlier changes (none were
 * ever recorded — the trail holds only markers) are not reconstructed
 * by guessing codes.
 */
export function seedFeedFromHistory(
  history: readonly MasterPriceHistoryEntry[],
  baselineChangedAt: string,
  masterPriceVersion: string = MASTER_PRICE_VERSION,
): SeedFeedFromHistoryResult {
  const skipped: Array<{ historyEntryId: string; operation: string; reason: string }> = [];
  for (const h of history) {
    if (h.operation === 'BASELINE' || h.operation === 'REGENERATION') {
      skipped.push({
        historyEntryId: h.id,
        operation: h.operation,
        reason: 'marker entry (no price change) — represented by the feed BASELINE marker',
      });
    } else {
      skipped.push({
        historyEntryId: h.id,
        operation: h.operation,
        reason: '§4.4 history entry carries no resourceCode — a feed entry cannot be built without inventing identity',
      });
    }
  }
  return {
    entries: Object.freeze([buildBaselineFeedEntry(baselineChangedAt, masterPriceVersion)]),
    skipped,
  };
}

// ---------------------------------------------------------------------------
// Interim JSONL trail (data/price2026/reports/price_change_feed.jsonl)
// ---------------------------------------------------------------------------

export interface PriceChangeFeedJsonlHeader {
  kind: 'HEADER';
  schemaVersion: typeof PRICE_CHANGE_FEED_SCHEMA_VERSION;
  generatedAt: string;
  masterPriceVersion: string;
  /** Honest scope statement — this file is an interim trail, not the server feed. */
  note: string;
}

export const PRICE_CHANGE_FEED_JSONL_NOTE =
  'INTERIM AUDIT TRAIL (Master Pricing §13 price-change feed): append-only JSONL written per sync run. ' +
  'This is a temporary, honest audit trail — NOT a replacement for the server-side ' +
  'price_change_feed view over master_price_history (supabase/migrations/20261116_master_price_governance.sql, NOT APPLIED). ' +
  'Entries are never edited or deleted; corrections are new entries.';

/** Build the header line for a fresh trail file. */
export function buildPriceChangeFeedJsonlHeader(
  generatedAt: string,
  masterPriceVersion: string = MASTER_PRICE_VERSION,
): PriceChangeFeedJsonlHeader {
  return {
    kind: 'HEADER',
    schemaVersion: PRICE_CHANGE_FEED_SCHEMA_VERSION,
    generatedAt,
    masterPriceVersion,
    note: PRICE_CHANGE_FEED_JSONL_NOTE,
  };
}

/** Serialize one entry as a single JSONL line. */
export function serializePriceChangeFeedEntryJsonl(entry: PriceChangeFeedEntry): string {
  return JSON.stringify(entry);
}

/** Serialize the header as a single JSONL line. */
export function serializePriceChangeFeedHeaderJsonl(header: PriceChangeFeedJsonlHeader): string {
  return JSON.stringify(header);
}

export interface ParsedPriceChangeFeedJsonl {
  header: PriceChangeFeedJsonlHeader | null;
  entries: PriceChangeFeedEntry[];
  /** Line-level parse errors (line numbers are 1-based). Never silently skipped. */
  errors: string[];
}

/** Parse a JSONL trail file. Malformed lines are reported, never silently dropped. */
export function parsePriceChangeFeedJsonl(text: string): ParsedPriceChangeFeedJsonl {
  let parsedHeader: PriceChangeFeedJsonlHeader | null = null;
  const entries: PriceChangeFeedEntry[] = [];
  const errors: string[] = [];
  const lines = text.split('\n').filter((l) => l.trim() !== '');
  lines.forEach((line, idx) => {
    const lineNo = idx + 1;
    let obj: unknown;
    try {
      obj = JSON.parse(line);
    } catch {
      errors.push(`line ${lineNo}: invalid JSON`);
      return;
    }
    if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
      errors.push(`line ${lineNo}: not a JSON object`);
      return;
    }
    const rec = obj as Record<string, unknown>;
    if (rec.kind === 'HEADER') {
      if (parsedHeader !== null) errors.push(`line ${lineNo}: duplicate HEADER`);
      else parsedHeader = obj as PriceChangeFeedJsonlHeader;
      return;
    }
    if (typeof rec.id !== 'string' || typeof rec.resourceCode !== 'string') {
      errors.push(`line ${lineNo}: feed entry without id/resourceCode`);
      return;
    }
    entries.push(obj as PriceChangeFeedEntry);
  });
  return { header: parsedHeader, entries, errors };
}
