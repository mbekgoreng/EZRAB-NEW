/**
 * DED drawing-vision — live integration helpers (increment I7b, spec §10).
 *
 * PURE logic: no React, no DOM. Bridges the live `DedAiItem[]` list in
 * `DedAiResultView` and the `ReviewState` from `reviewState.ts`.
 *
 * ONE finalize path (deliberate)
 * ------------------------------
 * The live `items` array is the ONLY list that is finalized, saved as
 * draft, or exported. Review actions NEVER create a second payload:
 * every review decision that changes a value is mirrored back into the
 * live item by the `mirrorReview*` functions below (which run the
 * canonical `DedAiCalculator.finalizeItems`, exactly like the existing
 * pencil edit), and the existing review gate (`dedReviewGate.ts`) —
 * which derives its list from the live items — sees the mirrored state
 * automatically. No gate change was needed: a corrected item becomes
 * USER_INPUT and drops out of the gate's quantity reason by the gate's
 * own rules; a rejected item becomes blocked (quantity null) and is
 * unsavable, so the gate and the finalize validator both exclude it.
 * Confirming an item is a review decision, not a value change: the
 * view marks the gate checkbox for that item (the user did review it).
 *
 * Review-state sync (fingerprint + reconcile)
 * -------------------------------------------
 * `ReviewState` lives in the view and survives re-renders, but the
 * live items can also change OUTSIDE the review panel (pencil edit,
 * bulk fill, AHSP pick, AI completion). When that happens, the
 * reviewed thing no longer exists, so the affected review item is
 * reset to its adapter baseline and the other items keep their
 * decisions. `liveItemFingerprint` captures exactly the fields the
 * adapter reads; `reconcileReviewState` applies the rule. Review
 * actions update the fingerprint store themselves (via the view) so a
 * fresh decision is never wiped by its own mirror.
 *
 * ID mapping
 * ----------
 * Live review items are `live-<dedAiId>` (see
 * `reviewItemFromDedAiItem`). Vision-only items (`dim-…`,
 * `opening-…`, …) have no live row; `dedAiIdFromReviewId` returns
 * null for them and reconcile leaves them untouched.
 */

import { DedAiCalculator } from '../ded-ai-estimate/calculator';
import type { DedAiItem } from '../ded-ai-estimate/types';
import {
  createReviewState,
  reviewItemFromDedAiItem,
  reviewItemFromDimension,
  reviewItemFromGeometry,
  reviewItemFromOpening,
} from './reviewState';
import type { ReviewItem, ReviewState } from './reviewState';
// I8 — type-only (erased at compile): vision-only review items built from
// pipeline page results. No runtime import (no cycle: visionPipeline never
// imports this module).
import type { VisionPageResult } from './visionPipeline';

/** Prefix the live adapter (`reviewItemFromDedAiItem`) puts on ids. */
export const LIVE_REVIEW_ID_PREFIX = 'live-';

/** ReviewItem id for a live result item (inverse of `dedAiIdFromReviewId`). */
export function reviewIdForDedAiItem(dedAiId: string): string {
  return `${LIVE_REVIEW_ID_PREFIX}${dedAiId}`;
}

/**
 * Live item id behind a review id, or null when the review item is
 * vision-only (no live row exists for it).
 */
export function dedAiIdFromReviewId(reviewId: string): string | null {
  if (!reviewId.startsWith(LIVE_REVIEW_ID_PREFIX)) return null;
  const rest = reviewId.slice(LIVE_REVIEW_ID_PREFIX.length);
  return rest === '' ? null : rest;
}

/** Build the review list for a live result (adapter per item, in order). */
export function buildReviewItems(items: DedAiItem[]): ReviewItem[] {
  return items.map((it) => applyVisionEvidenceToReviewItem(reviewItemFromDedAiItem(it), it));
}

/**
 * I8 — attach vision evidence to a live review item. `reviewItemFromDedAiItem`
 * (reviewState.ts) always yields bbox null — live items carry no position.
 * When the item carries vision evidence (service-attached, see
 * matchVisionEvidenceToItem), the HIGHEST-confidence entry becomes the
 * item's bbox + page, so the I7 viewer can draw a marker and jumpTarget
 * returns page+bbox instead of a page-only jump. Returns the input item
 * UNCHANGED (same reference) when there is no vision evidence — items
 * without vision data behave exactly as before.
 */
export function applyVisionEvidenceToReviewItem(
  review: ReviewItem,
  live: DedAiItem,
): ReviewItem {
  const evidence = live.visionEvidence;
  if (!evidence || evidence.length === 0) return review;
  let best = evidence[0];
  for (const ev of evidence) {
    if (ev.confidence > best.confidence) best = ev;
  }
  const sourcePages = [...new Set([...review.sourcePages, best.page])]
    .filter((p) => Number.isFinite(p) && p >= 1)
    .sort((a, b) => a - b);
  return {
    ...review,
    page: best.page,
    sourcePages,
    bbox: { ...best.bbox },
    notes: [
      ...review.notes,
      `Bukti visual: ${best.label} (hal. ${best.page})` +
        (evidence.length > 1 ? ` +${evidence.length - 1} bukti visual lainnya` : ''),
    ],
  };
}

/**
 * I8 — build vision-only review items (no live row) from pipeline page
 * results: one item per validated dimension / opening / quantity, with
 * bboxes from the vision evidence. The live DedAiResultView does not
 * mount these yet (it builds its list from output.items only) — this
 * helper is the seam a follow-up uses to append them; reconcile leaves
 * vision-only items untouched by design.
 */
export function buildVisionReviewItems(pages: VisionPageResult[]): ReviewItem[] {
  const items: ReviewItem[] = [];
  for (const page of pages) {
    for (const dim of page.dimensions) items.push(reviewItemFromDimension(dim));
    for (const opening of page.openings) items.push(reviewItemFromOpening(opening));
    for (const quantity of page.quantities) {
      items.push(reviewItemFromGeometry(quantity));
    }
  }
  return items;
}

/**
 * Fingerprint of exactly the fields `reviewItemFromDedAiItem` reads.
 * Deliberately EXCLUDES `provenance` (a confirm-mirror only appends a
 * provenance marker, which must not reset the review decision) and
 * price fields (review state does not track price).
 */
export function liveItemFingerprint(item: DedAiItem): string {
  return JSON.stringify({
    id: item.id,
    name: item.name,
    category: item.category,
    units: item.units,
    quantity: item.quantity,
    quantitySource: item.quantitySource,
    quantityFormula: item.quantityFormula ?? null,
    rawDimensions: item.rawDimensions ?? null,
    sourcePages: [...item.sourcePages].sort((a, b) => a - b),
    quantityNote: item.quantityNote ?? null,
    sourceEvidence: item.sourceEvidence ?? null,
    // I8: vision evidence feeds the review item's bbox/page (see
    // applyVisionEvidenceToReviewItem) — a change must re-derive it.
    visionEvidence: item.visionEvidence ?? null,
    derivationInputs: (item.derivation?.inputs ?? []).map((inp) => [inp.name, inp.value]),
  });
}

export interface ReconcileResult {
  state: ReviewState;
  /** Fresh fingerprint map for the CURRENT live list (always new). */
  fingerprints: Map<string, string>;
  /** True when any review item was added, dropped, or re-derived. */
  changed: boolean;
}

/**
 * Sync review state with the live list:
 * - live item unchanged (fingerprint match) → keep its review item
 *   WITH its decisions (confirm/correct/reject/assumptions);
 * - live item changed outside the review panel → re-derive that review
 *   item from the adapter (decisions for the old value are dropped —
 *   the reviewed thing no longer exists);
 * - live item added → fresh review item appended;
 * - live item removed → its review item is dropped;
 * - vision-only review items (`dim-…`, `opening-…`, …) → untouched.
 * Returns the previous state object unchanged when nothing changed.
 */
export function reconcileReviewState(
  prev: ReviewState,
  items: DedAiItem[],
  fingerprints: ReadonlyMap<string, string>,
): ReconcileResult {
  const byDedAiId = new Map(items.map((it) => [it.id, it]));
  const nextFingerprints = new Map<string, string>();
  for (const it of items) nextFingerprints.set(it.id, liveItemFingerprint(it));

  let changed = false;
  const nextItems: ReviewItem[] = [];
  const seenLiveIds = new Set<string>();
  for (const existing of prev.items) {
    const dedAiId = dedAiIdFromReviewId(existing.id);
    if (dedAiId === null) {
      // Vision-only item: not managed by this reconcile.
      nextItems.push(existing);
      continue;
    }
    const live = byDedAiId.get(dedAiId);
    if (!live) {
      // Live item removed → drop its review item.
      changed = true;
      continue;
    }
    seenLiveIds.add(dedAiId);
    if (fingerprints.get(dedAiId) === liveItemFingerprint(live)) {
      nextItems.push(existing);
    } else {
      nextItems.push(applyVisionEvidenceToReviewItem(reviewItemFromDedAiItem(live), live));
      changed = true;
    }
  }
  for (const live of items) {
    if (!seenLiveIds.has(live.id)) {
      nextItems.push(applyVisionEvidenceToReviewItem(reviewItemFromDedAiItem(live), live));
      changed = true;
    }
  }
  if (!changed) return { state: prev, fingerprints: nextFingerprints, changed: false };
  return { state: createReviewState(nextItems), fingerprints: nextFingerprints, changed: true };
}

/* ------------------------------------------------------------------ */
/* Mirrors: review decision -> live item (the finalized list)          */
/* ------------------------------------------------------------------ */

function appendProvenance(item: DedAiItem, marker: string): string[] {
  return item.provenance.includes(marker) ? item.provenance : [...item.provenance, marker];
}

function fmtReviewNumber(value: number): string {
  return value.toLocaleString('id-ID', { maximumFractionDigits: 4 });
}

/**
 * Mirror a review value correction into the live list. Semantics
 * mirror the existing pencil edit (`commitEdit`): a user-supplied
 * quantity becomes USER_INPUT, the stale AI proposal is cleared, the
 * quantity-audit block is dropped, and subtotals/stage are recomputed
 * by the canonical calculator. The old formula is kept in the new
 * formula string as "rumus asal" — the new value no longer follows it.
 * A null corrected value (only reachable from an inconsistent
 * recompute — live items have no recompute, so this is defensive)
 * mirrors as an unresolved item needing manual input.
 * The live item's unit is kept: review corrections never change units
 * (the view offers no unit control for them).
 */
export function mirrorReviewCorrection(
  items: DedAiItem[],
  dedAiId: string,
  corrected: ReviewItem,
): DedAiItem[] {
  const value = corrected.interpretation.value;
  const updated = items.map((it) => {
    if (it.id !== dedAiId) return it;
    if (value === null) {
      return {
        ...it,
        quantity: null,
        quantitySource: 'UNRESOLVED' as const,
        quantityNote: 'Koreksi tinjau menghasilkan kuantitas kosong — perlu input manual.',
        quantityAudit: undefined,
        aiProposedSubtotal: undefined,
        provenance: appendProvenance(it, 'review-correction'),
      };
    }
    return {
      ...it,
      quantity: value,
      quantitySource: 'USER_INPUT' as const,
      quantityAudit: undefined,
      quantityFormula: it.quantityFormula
        ? `Koreksi tinjau: ${fmtReviewNumber(value)} ${it.units} (rumus asal: ${it.quantityFormula})`
        : `Koreksi tinjau: ${fmtReviewNumber(value)} ${it.units}`,
      aiProposedSubtotal: undefined,
      provenance: appendProvenance(it, 'review-correction'),
    };
  });
  return DedAiCalculator.finalizeItems(updated);
}

/**
 * Mirror a review rejection into the live list: the rejected value
 * must not stand, so the quantity becomes null (blocked — excluded
 * from totals, the review gate, and the finalize validator, which all
 * key off the live list). The reason is recorded in `quantityNote`
 * and the audit marker in `provenance`; `finalizeItems` keeps the
 * note (it only fills a note when none is set).
 */
export function mirrorReviewRejection(
  items: DedAiItem[],
  dedAiId: string,
  reason: string,
): DedAiItem[] {
  const updated = items.map((it) => {
    if (it.id !== dedAiId) return it;
    return {
      ...it,
      quantity: null,
      quantitySource: 'UNRESOLVED' as const,
      quantityNote: `Ditolak saat tinjau visual: ${reason}`,
      quantityAudit: undefined,
      aiProposedSubtotal: undefined,
      provenance: appendProvenance(it, 'review-rejected'),
    };
  });
  return DedAiCalculator.finalizeItems(updated);
}

/**
 * Mirror a review confirmation into the live list: a confirmation
 * changes no value, so only an audit marker is added (no recalculation
 * needed). The gate effect (checking the item) lives in the view.
 */
export function mirrorReviewConfirmation(items: DedAiItem[], dedAiId: string): DedAiItem[] {
  return items.map((it) =>
    it.id === dedAiId ? { ...it, provenance: appendProvenance(it, 'review-verified') } : it,
  );
}
