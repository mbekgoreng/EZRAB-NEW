/**
 * MASTER PRICING §4 — MULTI-CANDIDATE PRICE SELECTION.
 * ====================================================
 *
 * §3 finding (fase3-canonical-model.md §M-3): the 5-tuple price
 * identity (resourceId+unit+location+period+sourceKey) is an identity
 * FORM, not a uniqueness key — only 209 distinct 5-tuples among 452
 * records, and 50 groups carry >1 distinct price. Those 50 groups are
 * disclosed in data/price2026/validated/conflicts.json, each with
 * resolution SOURCE_PRIORITY and a named `preferred` source. This
 * module implements §4 selection ON TOP of that disclosure — it does
 * NOT invent a new rule that could contradict it.
 *
 * SELECTION RULE (the resolver's own ordering, restricted to the
 * candidate set — resolver.ts sorts by domainTier → locTier → perTier
 * → sourcePriority → matchConfidence desc → id asc; with no query
 * context all three tiers are 0, leaving sourcePriority →
 * matchConfidence desc → id asc):
 *   1. ACTIVE records only (status null counts as ACTIVE — legacy rows
 *      predate the §3 stamp; SUPERSEDED/EXPIRED never participate).
 *   2. Lowest sourcePriority wins (== conflicts.json `preferred`).
 *   3. Tie-break: highest matchConfidence, then lowest record id
 *      (deterministic — same input, same selection, every time).
 *
 * AMBIGUITY IS FLAGGED, NOT HIDDEN: in 48 of the 50 conflict groups
 * (measured 2026-11-16), the preferred source ITSELF carries >1
 * distinct price — SOURCE_PRIORITY alone cannot pick a unique price
 * there. The selection is still deterministic (rule 3), but
 * `ambiguousWithinPreferredSource` is true and every alternative is
 * returned, so an admin review can see the spread. Silently picking
 * one price and discarding the rest would violate master-prompt rule
 * 14 (never silently use last-write-wins for price conflicts).
 *
 * 6-TUPLE DISAMBIGUATION (§3 §M-3): the two "duplicate 6-tuple" groups
 * (MAT-ROD-AGG-0001, MAT-BLD-SND-0001) appear ONLY when location is
 * collapsed to level+province. With the FULL location (level + province
 * + regency + city — exactly what `locationKey()` in
 * scripts/price2026/normalizePrices.ts already uses for the PRC id),
 * all 452 records have distinct 6-tuples (measured: 452 groups, 0
 * duplicates). The variant rows are distinct REGIONAL price variants
 * of one roster entry (Surabaya vs Probolinggo, different suppliers,
 * different price types) — legitimate separate records, not
 * duplicates. `buildFullPriceIdentityKey` is the disambiguated key.
 *
 * This module does NOT resolve prices for AHSP components (that is the
 * resolver's job, §6) — it selects among the candidate records of ONE
 * price identity, for admin review and for §5 reconciliation.
 */
import type { ResourcePriceRecord } from '../../../data/priceDatabase2026/types';

/**
 * The conflict-group identity EXACTLY as the matcher builds it
 * (scripts/price2026/matchPricesToResources.ts, byValueKey):
 * resourceId|unit|level|province|regency|periodLabel.
 * NOTE: no cityName, no sourceKey — cityName is NOT part of the
 * conflict identity (CITY rows carry the city in regencyName).
 */
export function buildConflictGroupIdentity(record: ResourcePriceRecord): string {
  return [
    record.resourceId,
    record.unit,
    record.location.level,
    record.location.provinceName || '',
    record.location.regencyName || '',
    record.period.label,
  ].join('|');
}

/**
 * The disambiguated 6-tuple price identity: the 5-tuple with the FULL
 * location (level + province + regency + city) plus the source record
 * id. Unique across all 452 current records (0 collisions). Two rows
 * share this key only if they are the same source record, same unit,
 * same full location, same period, same source — i.e. a true duplicate.
 */
export function buildFullPriceIdentityKey(record: ResourcePriceRecord): string {
  return [
    record.resourceId,
    record.unit,
    record.location.level,
    record.location.provinceName || '',
    record.location.regencyName || '',
    record.location.cityName || '',
    record.period.label,
    record.sourceKey,
    record.sourceRecordId ?? '',
  ].join('|');
}

/** Only ACTIVE records participate in selection (undefined status = legacy ACTIVE, pre-§3 stamp). */
export function isSelectablePriceRecord(record: ResourcePriceRecord): boolean {
  return record.status === undefined || record.status === 'ACTIVE';
}

/** The resolver's ordering, restricted to a candidate set (see header). */
export function comparePriceCandidates(a: ResourcePriceRecord, b: ResourcePriceRecord): number {
  return (
    a.sourcePriority - b.sourcePriority ||
    b.matchConfidence - a.matchConfidence ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}

export interface MasterPriceSelection {
  /** The selected record, or null when there are no (active) candidates. Never a fabricated price. */
  selected: ResourcePriceRecord | null;
  /** All non-selected active candidates, in selection order (best first). */
  alternatives: ResourcePriceRecord[];
  candidateCount: number;
  distinctPrices: number;
  /**
   * True when >1 DISTINCT price remains among the top-priority
   * (preferred-source) candidates. The selection is still
   * deterministic, but the group needs admin review.
   */
  ambiguousWithinPreferredSource: boolean;
  /**
   * True when the selection disagrees with the conflicts.json
   * `preferred` source — a data error that must never happen
   * (preferred is always the unique min-priority source).
   */
  preferredSourceMismatch: boolean;
  preferredSourceKey: string | null;
  reason: string;
}

export interface SelectMasterPriceCandidateOptions {
  /** The conflicts.json `preferred` source for this group, when known — used as a cross-check, not as the rule. */
  preferredSourceKey?: string | null;
}

/**
 * Select ONE record from a candidate set (all candidates must share
 * one conflict-group identity — the caller groups them; this function
 * does not verify the grouping, it only orders).
 */
export function selectMasterPriceCandidate(
  candidates: readonly ResourcePriceRecord[],
  opts: SelectMasterPriceCandidateOptions = {},
): MasterPriceSelection {
  const active = candidates.filter(isSelectablePriceRecord);
  const ordered = [...active].sort(comparePriceCandidates);
  const distinctPrices = new Set(ordered.map((r) => r.price)).size;

  if (ordered.length === 0) {
    return {
      selected: null,
      alternatives: [],
      candidateCount: 0,
      distinctPrices: 0,
      ambiguousWithinPreferredSource: false,
      preferredSourceMismatch: false,
      preferredSourceKey: opts.preferredSourceKey ?? null,
      reason: 'NO_CANDIDATES: no active price record for this identity — price stays null/unresolved.',
    };
  }

  const selected = ordered[0];
  const topPriority = selected.sourcePriority;
  const topPrices = new Set(
    ordered.filter((r) => r.sourcePriority === topPriority).map((r) => r.price),
  );
  const ambiguousWithinPreferredSource = topPrices.size > 1;
  const preferredSourceMismatch =
    opts.preferredSourceKey !== undefined &&
    opts.preferredSourceKey !== null &&
    selected.sourceKey !== opts.preferredSourceKey;

  return {
    selected,
    alternatives: ordered.slice(1),
    candidateCount: ordered.length,
    distinctPrices,
    ambiguousWithinPreferredSource,
    preferredSourceMismatch,
    preferredSourceKey: selected.sourceKey,
    reason: ambiguousWithinPreferredSource
      ? `SOURCE_PRIORITY selected ${selected.sourceKey} (priority ${topPriority}), but that source carries ${topPrices.size} distinct prices for this identity — admin review required.`
      : `SOURCE_PRIORITY selected ${selected.sourceKey} (priority ${topPriority}) with a unique price among top-priority candidates.`,
  };
}

/** Group records by conflict-group identity (matcher format). */
export function groupRecordsByConflictIdentity(
  records: readonly ResourcePriceRecord[],
): Map<string, ResourcePriceRecord[]> {
  const groups = new Map<string, ResourcePriceRecord[]>();
  for (const r of records) {
    const key = buildConflictGroupIdentity(r);
    const list = groups.get(key);
    if (list) list.push(r);
    else groups.set(key, [r]);
  }
  return groups;
}

/**
 * The conflict groups among a record set: groups with >1 record AND
 * >1 distinct price — the exact matcher rule (PHASE 25/26).
 */
export function findConflictGroups(
  records: readonly ResourcePriceRecord[],
): Map<string, ResourcePriceRecord[]> {
  const out = new Map<string, ResourcePriceRecord[]>();
  for (const [key, list] of groupRecordsByConflictIdentity(records)) {
    if (list.length > 1 && new Set(list.map((r) => r.price)).size > 1) {
      out.set(key, list);
    }
  }
  return out;
}
