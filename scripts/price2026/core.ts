/**
 * EZRAB PRICE 2026 — SHARED CORE (build-time façade)
 * ==================================================
 *
 * The pure primitives now live in `src/data/priceDatabase2026/normalize.ts` so that
 * the runtime resolver and this build-time pipeline share ONE implementation and
 * cannot drift. This module re-exports them and adds the two build-only helpers
 * (canonical resource classification + match-method ranking).
 */

import type {
  ResourceClassification,
  ResourceRowQuality,
  PriceMatchMethod,
} from '../../src/data/priceDatabase2026/types';

export {
  normalizeCode,
  looseCode,
  typeFromCodePrefix,
  componentTypeFromCode,
  normalizeUnit,
  normalizeUnitForType,
  unitsCompatible,
  unitConversionFactor,
  normalizeName,
  nameTokens,
  editDistance,
  tokenEquivalent,
  nameSimilarity,
  nameBindingScore,
  NAME_COMPATIBLE_THRESHOLD,
  NAME_ONLY_THRESHOLD,
  stableStringify,
  sha1Like,
} from '../../src/data/priceDatabase2026/normalize';

import { looseCode, normalizeUnitForType, typeFromCodePrefix } from '../../src/data/priceDatabase2026/normalize';

// ============================================================================
// RESOURCE CLASSIFICATION (PHASE 2 / PHASE 5)
// ============================================================================

/** Patterns that prove a canonical resource row was mis-extracted. */
const DEFECT_PATTERNS: Array<{ re: RegExp; reason: string }> = [
  { re: /sub\s*total/i, reason: 'NAME_CONTAINS_SUMMARY_LINE' },
  { re: /^\s*\*/, reason: 'NAME_IS_A_CROSS_REFERENCE' },
  { re: /^\(jika ada\)/i, reason: 'NAME_IS_A_PLACEHOLDER' },
  { re: /^\(lengkap\)/i, reason: 'NAME_IS_A_PLACEHOLDER' },
  { re: /^\(t\s*=/, reason: 'NAME_IS_A_SPEC_FRAGMENT' },
  { re: /^\s*\d+[.)]\s*$/, reason: 'NAME_IS_A_NUMBER' },
  { re: /^[-\s]*jarak\s+\d/i, reason: 'NAME_IS_A_DISTANCE_FRAGMENT' },
  { re: /^\(.*\)$/, reason: 'NAME_IS_PARENTHETICAL_FRAGMENT' },
];

const SUSPECT_PATTERNS: Array<{ re: RegExp; reason: string }> = [
  { re: /\.\s*$/, reason: 'NAME_ENDS_WITH_DOT' },
  { re: /^[a-z]/, reason: 'NAME_STARTS_LOWERCASE' },
  { re: /^\d/, reason: 'NAME_STARTS_WITH_DIGIT' },
];

export interface ResourceAuditRow {
  resourceId: string;
  code: string;
  name: string;
  rawUnit: string;
  unit: string;
  declaredType: string;
  classification: ResourceClassification;
  quality: ResourceRowQuality;
  issues: string[];
  hasCode: boolean;
  sourceAhspCodes: string[];
  duplicateStatus?: string;
}

/**
 * Classify a canonical resource row.
 *
 * The canonical resource master's own `type` field is the authority (PHASE 5:
 * "Jangan menentukan kategori hanya dari nama jika resource master sudah memiliki
 * tipe resmi"). We only fall back to the name when the declared type is missing or
 * contradicts an unambiguous code prefix.
 */
export function classifyResource(row: {
  resource_id?: string;
  id?: string;
  code?: string;
  name?: string;
  type?: string;
  unit?: string;
  source_ahsp_codes?: string[];
  duplicate_status?: string;
}): ResourceAuditRow {
  const code = String(row.code || '').trim();
  const name = String(row.name || '').trim();
  const rawUnit = String(row.unit || '').trim();
  const declared = String(row.type || '').trim().toLowerCase();

  const issues: string[] = [];

  // --- declared type ---
  let classification: ResourceClassification = 'UNKNOWN';
  if (declared === 'material') classification = 'MATERIAL';
  else if (declared === 'labor') classification = 'LABOR';
  else if (declared === 'equipment') classification = 'EQUIPMENT';

  // --- code-prefix cross-check ---
  const loose = looseCode(code);
  const prefixType = typeFromCodePrefix(loose);

  if (classification === 'UNKNOWN' && prefixType !== 'UNKNOWN') {
    classification = prefixType;
    issues.push(`TYPE_INFERRED_FROM_CODE_PREFIX:${prefixType}`);
  } else if (
    classification !== 'UNKNOWN' &&
    prefixType !== 'UNKNOWN' &&
    classification !== prefixType
  ) {
    // Known defect class in the source (e.g. labor rows coded `M03`).
    issues.push(`TYPE_CONTRADICTS_CODE_PREFIX:declared=${classification},prefix=${prefixType}`);
  }

  if (!code) issues.push('NO_CODE');

  // --- quality ---
  let quality: ResourceRowQuality = 'CLEAN';
  if (!name) {
    quality = 'DEFECTIVE';
    issues.push('EMPTY_NAME');
  }
  for (const { re, reason } of DEFECT_PATTERNS) {
    if (re.test(name)) {
      quality = 'DEFECTIVE';
      issues.push(reason);
      break;
    }
  }
  if (quality === 'CLEAN') {
    for (const { re, reason } of SUSPECT_PATTERNS) {
      if (re.test(name)) {
        quality = 'SUSPECT';
        issues.push(reason);
        break;
      }
    }
  }
  if (quality !== 'DEFECTIVE' && name.length > 110) {
    quality = 'SUSPECT';
    issues.push('NAME_SUSPICIOUSLY_LONG');
  }
  if (!rawUnit) issues.push('NO_UNIT');

  return {
    resourceId: String(row.resource_id || row.id || ''),
    code,
    name,
    rawUnit,
    unit: normalizeUnitForType(rawUnit, declared),
    declaredType: declared || 'unknown',
    classification,
    quality,
    issues,
    hasCode: !!code,
    sourceAhspCodes: row.source_ahsp_codes || [],
    duplicateStatus: row.duplicate_status,
  };
}

// ============================================================================
// MATCH METHOD RANKING
// ============================================================================

export const MATCH_METHOD_RANK: Record<PriceMatchMethod, number> = {
  EXACT_CODE: 1,
  EXACT_SOURCE_ID: 2,
  NORMALIZED_CODE_UNIT: 3,
  ALIAS: 4,
  NAME_UNIT: 5,
  UNMATCHED: 99,
};
