/**
 * EZRAB AHSP 2026 — CODE ALIAS REGISTRY (Phase 2E)
 * =================================================
 * Non-destructive alias mechanism. The canonical database is NEVER modified.
 * Aliases map a non-canonical code to exactly ONE canonical code whose identity
 * has been proven (Phase 2C/2D audit).
 *
 * RULES (enforced by tests):
 * - An alias maps to exactly one canonical code.
 * - Aliases are only created when identity is PROVEN (byte-identical signature
 *   or direct PDF evidence), never from similar names/codes alone.
 * - Known collisions (5.1.1.1.21 vs 5.1.1.1..21, 8.3.1.6 vs 8.3.1. 6,
 *   8.3.1.8 vs 8.3.1. 8) are NEVER aliased — they are different items.
 * - 2.2.1.1.6d is NOT aliased without direct source evidence.
 */

export interface CodeAlias {
  /** The non-canonical code as found in the wild (workbook typo, dotted variant, etc.) */
  alias: string;
  /** The canonical code this alias resolves to. Must exist in the canonical DB. */
  canonical: string;
  /** Why this alias exists. */
  reason: 'VARIANT_FORMAT' | 'WORKBOOK_TYPO' | 'PDF_NAMING';
  /** Where the proof lives (Phase 2C/2D report section, PDF page, etc.) */
  provenance: string;
  /** Confidence in the identity proof. */
  confidence: 'HIGH' | 'MEDIUM';
}

/**
 * Variant-format pairs (Phase 2C §C, Phase 2D §3.2).
 * All pairs proven byte-identical (description, unit, division, all components,
 * coefficients, price). Only sourcePage differs.
 * Canonical = attached format (matches workbook). Dotted = alias.
 */
const VARIANT_ALIASES: CodeAlias[] = [
  { alias: '2.2.1.1.1.a', canonical: '2.2.1.1.1a', reason: 'VARIANT_FORMAT', provenance: 'Phase 2D §3.2 — byte-identical; workbook uses attached (DHSP baris 229)', confidence: 'HIGH' },
  { alias: '2.2.1.1.2.a', canonical: '2.2.1.1.2a', reason: 'VARIANT_FORMAT', provenance: 'Phase 2D §3.2 — byte-identical', confidence: 'HIGH' },
  { alias: '2.2.1.1.3.a', canonical: '2.2.1.1.3a', reason: 'VARIANT_FORMAT', provenance: 'Phase 2D §3.2 — byte-identical', confidence: 'HIGH' },
  { alias: '2.2.1.1.4a', canonical: '2.2.1.1.4.a', reason: 'VARIANT_FORMAT', provenance: 'Phase 2D §3.3 — orphan: workbook baris 235 punya 4a (attached), kanonis hanya punya 4.a (dotted); identitas terbukti dari uraian+komponen', confidence: 'HIGH' },
  { alias: '2.2.1.1.5.a', canonical: '2.2.1.1.5a', reason: 'VARIANT_FORMAT', provenance: 'Phase 2D §3.2 — byte-identical', confidence: 'HIGH' },
  { alias: '2.2.1.1.5.b', canonical: '2.2.1.1.5b', reason: 'VARIANT_FORMAT', provenance: 'Phase 2D §3.2 — byte-identical', confidence: 'HIGH' },
  { alias: '2.2.1.1.5.c', canonical: '2.2.1.1.5c', reason: 'VARIANT_FORMAT', provenance: 'Phase 2D §3.2 — byte-identical', confidence: 'HIGH' },
  { alias: '2.2.1.1.5.d', canonical: '2.2.1.1.5d', reason: 'VARIANT_FORMAT', provenance: 'Phase 2D §3.2 — byte-identical', confidence: 'HIGH' },
  { alias: '2.2.1.1.6.a', canonical: '2.2.1.1.6a', reason: 'VARIANT_FORMAT', provenance: 'Phase 2D §3.2 — byte-identical', confidence: 'HIGH' },
  { alias: '2.2.1.1.6.b', canonical: '2.2.1.1.6b', reason: 'VARIANT_FORMAT', provenance: 'Phase 2D §3.2 — byte-identical', confidence: 'HIGH' },
  { alias: '2.2.1.1.6.c', canonical: '2.2.1.1.6c', reason: 'VARIANT_FORMAT', provenance: 'Phase 2D §3.2 — byte-identical', confidence: 'HIGH' },
];

/**
 * Workbook typo pairs (Phase 2D §3.4). All proven equivalent via
 * row-by-row component comparison (5–7/7 components match).
 * Canonical = correct code. Typo = alias.
 */
const TYPO_ALIASES: CodeAlias[] = [
  { alias: '2.2.2.2.11', canonical: '2.2.2.1.11', reason: 'WORKBOOK_TYPO', provenance: 'Phase 2D §3.4 — 7/7 komponen cocok', confidence: 'HIGH' },
  { alias: '3.2.1.1', canonical: '3.5.1.1', reason: 'WORKBOOK_TYPO', provenance: 'Phase 2D §3.4 — 5/5 komponen cocok', confidence: 'HIGH' },
  { alias: '3.9.1', canonical: '3.9.1.1', reason: 'WORKBOOK_TYPO', provenance: 'Phase 2D §3.4 — 7/7 komponen cocok', confidence: 'HIGH' },
  { alias: '9.9.9.5', canonical: '3.9.9.5', reason: 'WORKBOOK_TYPO', provenance: 'Phase 2D §3.4 — 6/6 komponen cocok', confidence: 'HIGH' },
  { alias: '51.1.12.7', canonical: '5.1.1.12.7', reason: 'WORKBOOK_TYPO', provenance: 'Phase 2D §3.4 — 5/5 komponen cocok; typo sumber (51 bukan 5.1)', confidence: 'HIGH' },
  // 3.5.2.2 -> 3.5.2.2.1 is a parent-to-first-child redundancy, NOT a typo.
  // Deliberately NOT aliased: parent/child relationship needs owner decision.
];

/**
 * EXPLICITLY FORBIDDEN aliases (Phase 2D §3.6 — proven DIFFERENT items).
 * These codes look similar but are different work items. They must NEVER
 * be merged by any normalization. Listed here as a guard.
 */
export const FORBIDDEN_MERGES: Array<{ a: string; b: string; reason: string }> = [
  { a: '5.1.1.1.21', b: '5.1.1.1..21', reason: 'NYY 1x6 (Rp 22.900) vs NYY 2x6 (Rp 54.285) — different specs' },
  { a: '8.3.1.6', b: '8.3.1. 6', reason: 'Tube Settler (Rp 36.910) vs Box Culvert 150 (Rp 5.209.175) — different items' },
  { a: '8.3.1.8', b: '8.3.1. 8', reason: 'BC 40 fc 7,5 vs BC 300 fc 10 — different sizes' },
];

export const CODE_ALIASES: CodeAlias[] = [...VARIANT_ALIASES, ...TYPO_ALIASES];

/** alias -> canonical lookup */
const aliasMap = new Map<string, CodeAlias>(CODE_ALIASES.map(a => [a.alias, a]));

/**
 * Resolve a code through the alias registry.
 * Returns the canonical code, or the input unchanged if no alias exists.
 * Never throws; never merges forbidden pairs.
 */
export function resolveCodeAlias(code: string): string {
  const hit = aliasMap.get(code.trim());
  return hit ? hit.canonical : code;
}

/** Get the alias record for a code, if it is a known alias. */
export function getAliasRecord(code: string): CodeAlias | undefined {
  return aliasMap.get(code.trim());
}

/** True if the code is a known alias (not a canonical code). */
export function isKnownAlias(code: string): boolean {
  return aliasMap.has(code.trim());
}
