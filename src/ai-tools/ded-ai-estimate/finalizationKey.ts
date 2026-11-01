/**
 * G4 (Sprint 3) — deterministic finalization identity for DED-AI finalize.
 *
 * The ded-ai view computes a finalizationKey from (target projectId +
 * canonicalized finalized item set) and passes it to
 * ProjectContext.bulkAddRabItems. The store records applied keys per
 * project; re-submitting the same key for the same project is a no-op
 * duplicate (double click, retry after UI reset, reopened analysis with
 * identical content). A different project or a changed item set produces
 * a different key and is a genuinely new finalization.
 *
 * Pure functions, no imports — unit-tested in
 * src/test/sprint3Finalization.src.ts.
 *
 * G2 (Opsi A) counting helpers live here too so the view and the tests
 * share exactly one definition of "assumption item with a calculable
 * subtotal".
 */

/** Minimal item shape the finalization key reads (mapped RAB inputs). */
export interface FinalizationKeyItem {
  description?: string | null;
  unit?: string | null;
  volume?: number | null;
  unitPrice?: number | null;
  priceSourceKind?: string | null;
}

/** FNV-1a 32-bit — tiny stable hash, no dependency. */
export function fnv1aHash(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

function stableNumber(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '';
  // Round to 6 decimals so float noise from re-serialization cannot
  // change the identity of an otherwise identical item set.
  return String(Math.round(value * 1e6) / 1e6);
}

/**
 * Canonical string for one finalized item set:
 * `description|unit|volume|unitPrice|priceSourceKind` per item, sorted,
 * so item ORDER never changes the identity.
 */
export function canonicalizeFinalizationItems(items: readonly FinalizationKeyItem[]): string {
  return items
    .map((it) =>
      [
        String(it.description || '').trim().toLowerCase(),
        String(it.unit || '').trim().toLowerCase(),
        stableNumber(it.volume),
        stableNumber(it.unitPrice),
        String(it.priceSourceKind || '').trim().toUpperCase(),
      ].join('|')
    )
    .sort()
    .join(';;');
}

export function buildFinalizationKey(
  projectId: string,
  items: readonly FinalizationKeyItem[]
): string {
  const canonical = canonicalizeFinalizationItems(items);
  return `fin_${fnv1aHash(`${projectId}::${canonical}`)}_${items.length}`;
}

/** Minimal item shape for the G2 assumption count. */
export interface AssumptionCountItem {
  quantitySource?: string | null;
  subtotal?: number | null;
}

/**
 * G2 (Opsi A): items whose quantity is an ASSUMPTION and whose subtotal
 * is calculable — exactly the assumptions that enter the Estimated Total.
 */
export function countAssumptionItems(items: readonly AssumptionCountItem[]): number {
  return items.filter((it) => it.quantitySource === 'ASSUMPTION' && it.subtotal != null).length;
}

/**
 * Prefer the calculator coverage counter when the pipeline provided it;
 * otherwise count directly from the items. Defensive by design: a stale
 * draft or an older output shape without the coverage field still yields
 * the correct count.
 */
export function resolveAssumptionCount(
  coverage: { itemsWithAssumption?: number } | null | undefined,
  items: readonly AssumptionCountItem[]
): number {
  const fromCoverage = coverage?.itemsWithAssumption;
  if (typeof fromCoverage === 'number' && Number.isFinite(fromCoverage) && fromCoverage >= 0) {
    return fromCoverage;
  }
  return countAssumptionItems(items);
}
