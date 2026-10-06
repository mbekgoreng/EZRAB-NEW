/**
 * PRICE RESOLUTION WARNINGS — Phase 1 (unit guard, warning-only)
 * -------------------------------------------------------------
 * The Phase 0 audit proved two defects in `priceResolver`:
 *
 *   C-06  Matching ignores units. A cement price expressed per `kg` can be
 *         applied to a coefficient expressed per `zak`, underpricing by ~42×.
 *   C-05  Matching is substring-based, so `includes('Air')` prices any material
 *         whose name merely contains "air".
 *
 * Phase 1 adds the guard in WARNING-ONLY mode. Nothing is rejected, no score is
 * changed, and no price is altered. The resolver simply records that a
 * unit-mismatched or substring-only match occurred, so Phase 2 can flip the
 * guard to enforcement with real evidence of its blast radius.
 */

export type PriceWarningKind = 'UNIT_MISMATCH' | 'SUBSTRING_ONLY_MATCH' | 'REGION_DEFAULTED';

export interface PriceWarningEvent {
  readonly kind: PriceWarningKind;
  readonly queryName: string;
  readonly queryUnit?: string;
  readonly candidateName: string;
  readonly candidateUnit?: string;
  readonly price?: number;
  readonly sourceName?: string;
  readonly region?: string;
  readonly notes?: string;
  readonly at: number;
}

const MAX_WARNINGS = 5000;
const warnings: PriceWarningEvent[] = [];

export interface RecordPriceWarningInput {
  readonly kind: PriceWarningKind;
  readonly queryName: string;
  readonly candidateName: string;
  readonly queryUnit?: string;
  readonly candidateUnit?: string;
  readonly price?: number;
  readonly sourceName?: string;
  readonly region?: string;
  readonly notes?: string;
}

/** Record a price-resolution warning. Never throws, never returns a value. */
export function recordPriceWarning(input: RecordPriceWarningInput): void {
  if (warnings.length >= MAX_WARNINGS) return;
  warnings.push({ ...input, at: Date.now() });
}

export function getPriceWarnings(): readonly PriceWarningEvent[] {
  return warnings;
}

export function resetPriceWarnings(): void {
  warnings.length = 0;
}

/**
 * Normalise a unit string for comparison.
 * `m3`, `m³`, `M3` and `m3 ` must collapse to the same key.
 */
export function normalizeUnitKey(unit: string | undefined | null): string {
  if (!unit) return '';
  return unit
    .toString()
    .trim()
    .toLowerCase()
    .replace(/\u00b3/g, '3')   // m³ → m3
    .replace(/\u00b2/g, '2')   // m² → m2
    .replace(/[\s._]/g, '');
}

export interface PriceWarningSummary {
  readonly total: number;
  readonly byKind: Readonly<Record<PriceWarningKind, number>>;
  readonly unitMismatchPairs: readonly { pair: string; hits: number }[];
  readonly sampleEvents: readonly PriceWarningEvent[];
}

export function summarizePriceWarnings(): PriceWarningSummary {
  const byKind: Record<PriceWarningKind, number> = {
    UNIT_MISMATCH: 0,
    SUBSTRING_ONLY_MATCH: 0,
    REGION_DEFAULTED: 0,
  };
  const pairCounts = new Map<string, number>();

  for (const warning of warnings) {
    byKind[warning.kind] += 1;
    if (warning.kind === 'UNIT_MISMATCH') {
      const pair = `${normalizeUnitKey(warning.queryUnit)} → ${normalizeUnitKey(warning.candidateUnit)}`;
      pairCounts.set(pair, (pairCounts.get(pair) ?? 0) + 1);
    }
  }

  return {
    total: warnings.length,
    byKind,
    unitMismatchPairs: [...pairCounts.entries()]
      .map(([pair, hits]) => ({ pair, hits }))
      .sort((a, b) => b.hits - a.hits),
    sampleEvents: warnings.slice(0, 50),
  };
}

const GLOBAL_KEY = '__EZRAB_PRICE_RESOLUTION_WARNINGS__';

/** Attach to `globalThis` for interactive inspection. Idempotent. */
export function exposePriceWarnings(): void {
  try {
    const holder = globalThis as unknown as Record<string, unknown>;
    if (!holder[GLOBAL_KEY]) {
      holder[GLOBAL_KEY] = {
        warnings: getPriceWarnings,
        summarize: summarizePriceWarnings,
        reset: resetPriceWarnings,
      };
    }
  } catch {
    // Never let diagnostics break the application.
  }
}
