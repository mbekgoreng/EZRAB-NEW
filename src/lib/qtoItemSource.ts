/**
 * D-66 (Batch B, 2026-11-14) — QTO item source labeling.
 *
 * Manual QTO items were labeled "Volume Calculator" because the label
 * checked `calculatorId === 'MANUAL'` while the factory never set
 * `calculatorId` (manual items had `calculatorId: undefined`).
 *
 * Fix, two layers:
 * 1. DATA: the factory (`createManualQtoItem`) and the seed manual item
 *    now set `calculatorId: 'MANUAL'` explicitly.
 * 2. LABEL: this module is the single source of truth for "is this item
 *    manual?", robust to legacy items stored before the factory fix
 *    (undefined calculatorId, no calculation run).
 *
 * Invariant: a calculator item ALWAYS carries a real calculatorId —
 * `executeCalculationAndSave` requires a registered calculator. So
 * "no calculatorId and no calculationRunId" ⟺ manual. (Same convention
 * as the RAB sync path: `volumeSource: w.calculatorId ? 'CALCULATOR' :
 * 'MANUAL'`.)
 *
 * NOTE (D-65, fixed Batch D 2026-11-14): the recap's distinct-calculator
 * count now uses `countDistinctCalculators` (below) — manual items are
 * excluded via `isManualQtoItem`, so legacy manual items (undefined
 * calculatorId) no longer count as a phantom calculator.
 */

/** Minimal shape needed to decide a QTO item's source. */
export interface QtoSourceLike {
  source?: string | null;
  calculatorId?: string | null;
  calculationRunId?: string | null;
}

/**
 * True iff the item was entered manually (not produced by a Volume
 * Calculator run). Covers three shapes:
 * - factory/seed items: `source === 'MANUAL'` and/or `calculatorId ===
 *   'MANUAL'` (explicit, post-fix);
 * - legacy manual items: no calculatorId and no calculation run.
 */
export function isManualQtoItem(item: QtoSourceLike | null | undefined): boolean {
  if (!item) return false;
  if (item.source === 'MANUAL') return true;
  if (item.calculatorId === 'MANUAL') return true;
  if (!item.calculatorId && !item.calculationRunId) return true;
  return false;
}

/** Detail-panel source label: 'Input Manual' or 'Volume Calculator'. */
export function qtoItemSourceLabel(item: QtoSourceLike | null | undefined): 'Input Manual' | 'Volume Calculator' {
  return isManualQtoItem(item) ? 'Input Manual' : 'Volume Calculator';
}

/**
 * D-65 (Batch D, 2026-11-14) — Count DISTINCT calculators in use.
 *
 * The recap KPI used to count `new Set(items.filter(i => i.calculatorId
 * !== 'MANUAL').map(i => i.calculatorId)).size` — but legacy manual items
 * carry `calculatorId === undefined`, which passes the `!== 'MANUAL'`
 * filter and enters the Set as a phantom 'undefined' calculator (2×
 * BOWPLANK + 1 manual → "2 calculator terpakai" with only one real
 * calculator in use).
 *
 * Fix: exclude manual items with `isManualQtoItem` (robust to legacy
 * shapes) and drop falsy ids, so only real calculator ids are counted.
 */
export function countDistinctCalculators(items: Array<QtoSourceLike | null | undefined>): number {
  const ids = new Set<string>();
  for (const item of items) {
    if (!item || isManualQtoItem(item)) continue;
    if (item.calculatorId) ids.add(item.calculatorId);
  }
  return ids.size;
}
